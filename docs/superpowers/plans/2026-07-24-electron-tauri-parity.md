# Electron Tauri Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tauri 마이그레이션 완료 이후 추가된 공통 기능과 버그 수정을 Electron master에 동일한 사용자 동작으로 이식함.

**Architecture:** Electron의 `ConfigStore`, manager renderer, `WallController` 경계를 유지함. 로그인 연장 DOM 스크립트와 스케줄 정책은 별도 모듈로 분리하고, manager drag 상태는 DOM 교체를 지연하는 render gate로 보호함. Tauri 전용 플랫폼 코드는 이식하지 않음.

**Tech Stack:** Electron 43, Node.js CommonJS, HTML/CSS/JavaScript, Node test runner

## Global Constraints

- Electron 미리보기와 5초 자동 갱신 유지
- 로그인 연장 운영 주기 정확히 1시간
- 선택자 후보 정확히 한 개와 `click()` 무예외 완료만 성공
- 성공·실패 우측 상단 알림 5초, 재시도와 서버 응답 검증 없음
- 확대율 `10~200%`, 간격 `5%`, 기본값 `100%`
- ESC 시각 overlay 제거, ESC 복귀 유지
- `회의록.md` 변경 금지
- Tauri 전용 Ubuntu GTK와 `dragDropEnabled` 처리 제외

---

### Task 1: 설정 스키마와 확대율 범위

**Files:**
- Modify: `test/config-store.test.js`
- Modify: `src/main/config-store.js`
- Modify: `src/renderer/index.html`

**Interfaces:**
- Consumes: 저장된 `slots[*]`
- Produces: `{ enabled, url, zoom, loginExtension }`, zoom `0.1~2.0`

- [ ] **Step 1: 실패하는 설정 테스트 작성**

`test/config-store.test.js`의 기본값과 정규화 테스트를 다음 기대값으로 확장함.

```js
test("기본 설정은 로그인 연장을 끈 네 개의 슬롯을 제공한다", () => {
  const config = getDefaultConfig();
  assert.equal(config.slots.length, 4);
  assert.equal(config.slots.every((slot) => slot.enabled), true);
  assert.equal(config.slots.every((slot) => slot.loginExtension === false), true);
});

test("설정의 확대율과 로그인 연장 값을 정규화한다", () => {
  const config = normalizeConfig({
    slots: [
      { enabled: true, url: " https://example.com ", zoom: 8, loginExtension: true },
      { enabled: false, url: "", zoom: 0.01 },
    ],
  });

  assert.deepEqual(config.slots[0], {
    enabled: true,
    url: "https://example.com",
    zoom: 2,
    loginExtension: true,
  });
  assert.equal(config.slots[1].zoom, 0.1);
  assert.equal(config.slots[1].loginExtension, false);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- --test-name-pattern="기본 설정|정규화"`

Expected: `loginExtension` 누락과 기존 zoom `0.5~1.5` 때문에 실패

- [ ] **Step 3: 설정 정규화 구현**

`src/main/config-store.js`:

```js
function getDefaultConfig() {
  return {
    version: 1,
    slots: DEFAULT_URLS.map((url) => ({
      enabled: true,
      url,
      zoom: 1,
      loginExtension: false,
    })),
  };
}

function clampZoom(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.round(Math.min(2, Math.max(0.1, numericValue)) * 100) / 100;
}

function normalizeSlot(input, fallback) {
  const source = input && typeof input === "object" ? input : fallback;
  return {
    enabled: source.enabled !== false,
    url: typeof source.url === "string" ? source.url.trim().slice(0, 2048) : fallback.url,
    zoom: clampZoom(source.zoom),
    loginExtension: source.loginExtension === true,
  };
}
```

`src/renderer/index.html`:

```html
<input id="slot-zoom" class="range-input" type="range" min="10" max="200" step="5" value="100">
<div class="range-labels" aria-hidden="true"><span>10%</span><span>200%</span></div>
```

- [ ] **Step 4: 설정 테스트 통과 확인**

Run: `npm test`

Expected: 설정·레이아웃 테스트 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add test/config-store.test.js src/main/config-store.js src/renderer/index.html
git commit -m "feat: extend Electron slot settings"
```

---

### Task 2: 관리 UI와 카드 드래그 안정화

**Files:**
- Modify: `test/electron-ui-smoke.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.js`

**Interfaces:**
- Consumes: `SlotConfig.loginExtension`, preview/status events
- Produces: 슬롯별 로그인 연장 편집, 안정된 drag source, `180×72` drag canvas

- [ ] **Step 1: 실패하는 UI smoke 기대값 추가**

초기 UI 평가에 다음 값을 추가함.

```js
zoomRange: {
  min: document.querySelector("#slot-zoom")?.min,
  max: document.querySelector("#slot-zoom")?.max,
  step: document.querySelector("#slot-zoom")?.step,
},
hasLoginExtension: Boolean(document.querySelector("#slot-login-extension")),
```

다음 assertion을 추가함.

```js
assert.deepEqual(initial.zoomRange, { min: "10", max: "200", step: "5" });
assert.equal(initial.hasLoginExtension, true);
```

dragstart 뒤 main process가 `preview:updated`를 보낸 다음 기존 source DOM 표식이 유지되는지 확인함.

```js
await window.webContents.executeJavaScript(`(() => {
  const tile = document.querySelectorAll(".screen-tile")[0];
  tile.dataset.dragIdentity = "source-kept";
  const transfer = new DataTransfer();
  window.__dragTransfer = transfer;
  tile.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
})()`);
window.webContents.send("preview:updated", {
  index: 0,
  dataUrl: null,
  capturedAt: Date.now(),
});
await wait(50);
const sourceKept = await window.webContents.executeJavaScript(
  `document.querySelectorAll(".screen-tile")[0]?.dataset.dragIdentity === "source-kept"`,
);
assert.equal(sourceKept, true);
```

drag image는 `setDragImage`를 감싸 크기와 오프셋을 기록해 확인함.

```js
const dragImage = await window.webContents.executeJavaScript(`(() => {
  const original = DataTransfer.prototype.setDragImage;
  let observed = null;
  DataTransfer.prototype.setDragImage = function (element, x, y) {
    observed = { width: element.width, height: element.height, x, y };
    return original.call(this, element, x, y);
  };
  const tile = document.querySelectorAll(".screen-tile")[0];
  const transfer = new DataTransfer();
  tile.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
  tile.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
  DataTransfer.prototype.setDragImage = original;
  return observed;
})()`);
assert.deepEqual(dragImage, { width: 180, height: 72, x: 90, y: 36 });
```

- [ ] **Step 2: UI smoke 실패 확인**

Run: `npm run smoke`

Expected: 로그인 연장 control 부재 또는 drag 중 DOM 교체로 실패

- [ ] **Step 3: 로그인 연장 control 구현**

`src/renderer/index.html`에 확대율 위 옵션을 추가함.

```html
<label class="option-row switch-control">
  <span class="option-copy">
    <strong>로그인 연장</strong>
    <small>RUN 1시간 후부터 매시간 실행</small>
  </span>
  <input id="slot-login-extension" type="checkbox">
  <span class="switch-track" aria-hidden="true"></span>
</label>
```

`src/renderer/app.js`에서 element, editor, change handler를 연결함.

```js
slotLoginExtension: document.querySelector("#slot-login-extension"),
```

```js
elements.slotLoginExtension.checked = slot.loginExtension;
```

```js
elements.slotLoginExtension.addEventListener("change", () => {
  config.slots[selectedIndex].loginExtension = elements.slotLoginExtension.checked;
  renderAll();
  markChanged(0);
});
```

카드 metadata에 확대율·사용·로그인 연장을 표시함.

```js
const meta = document.createElement("span");
meta.className = "tile-meta";
meta.textContent = [
  `${Math.round(slot.zoom * 100)}%`,
  slot.enabled ? "사용" : "사용 안 함",
  ...(slot.loginExtension ? ["로그인 연장"] : []),
].join(" · ");
tile.append(top, url, meta);
```

- [ ] **Step 4: drag render gate와 canvas 구현**

`src/renderer/app.js`에 drag 상태를 컨테이너에 저장하고 grid 교체를 지연함.

```js
const DRAG_IMAGE_SELECTOR = "canvas[data-slot-drag-image]";
let gridRenderPending = false;

function requestGridRender() {
  if (elements.wallFrame.dataset.draggedIndex !== undefined) {
    gridRenderPending = true;
    return;
  }
  renderGrid();
}

function readDraggedIndex() {
  const value = Number(elements.wallFrame.dataset.draggedIndex);
  return Number.isInteger(value) ? value : null;
}

function finishDrag() {
  delete elements.wallFrame.dataset.draggedIndex;
  document.querySelector(DRAG_IMAGE_SELECTOR)?.remove();
  document.querySelectorAll(".screen-tile").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
  if (gridRenderPending) {
    gridRenderPending = false;
    renderGrid();
  }
}
```

`renderAll()`은 `renderGrid()` 대신 `requestGridRender()`를 호출함.

dragstart에서 다음 canvas를 설정함.

```js
function installDragImage(dataTransfer, index, url) {
  document.querySelector(DRAG_IMAGE_SELECTOR)?.remove();
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 72;
  canvas.dataset.slotDragImage = "";
  canvas.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:180px;height:72px;pointer-events:none";
  const context = canvas.getContext("2d");
  context.fillStyle = "#20242c";
  context.fillRect(0, 0, 180, 72);
  context.strokeStyle = "#6ea8fe";
  context.lineWidth = 2;
  context.strokeRect(1, 1, 178, 70);
  context.fillStyle = "#f5f7fa";
  context.font = "600 14px sans-serif";
  context.fillText(`화면 ${index + 1} · ${POSITIONS[index]}`, 12, 27, 156);
  context.fillStyle = "#9ba3af";
  context.font = "12px sans-serif";
  context.fillText(url || "URL 미설정", 12, 51, 156);
  document.body.append(canvas);
  dataTransfer.setDragImage(canvas, 90, 36);
}
```

- [ ] **Step 5: UI smoke 통과 확인**

Run: `npm run smoke`

Expected: 로그인 연장 control, 범위, drag 안정성, compact image, 슬롯 교환 모두 통과

- [ ] **Step 6: 커밋**

```bash
git add test/electron-ui-smoke.js src/renderer/index.html src/renderer/styles.css src/renderer/app.js
git commit -m "feat: sync Electron manager interactions"
```

---

### Task 3: 로그인 연장 스크립트와 1시간 스케줄

**Files:**
- Create: `src/renderer/login-extension.js`
- Create: `src/main/login-extension.js`
- Create: `test/login-extension.test.js`
- Modify: `src/main/wall-controller.js`
- Modify: `test/electron-wall-smoke.js`

**Interfaces:**
- Produces: `LOGIN_EXTENSION_INTERVAL`, `LOGIN_EXTENSION_SCRIPT`, `shouldExtendLogin(slot)`
- Consumes: `WebContentsView.webContents.executeJavaScript(script)`

- [ ] **Step 1: 실패하는 정책 테스트 작성**

`test/login-extension.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOGIN_EXTENSION_INTERVAL,
  LOGIN_EXTENSION_SCRIPT,
  shouldExtendLogin,
} = require("../src/main/login-extension");

test("로그인 연장 운영 주기는 1시간이다", () => {
  assert.equal(LOGIN_EXTENSION_INTERVAL, 60 * 60 * 1000);
});

test("사용 중이며 선택된 슬롯만 로그인 연장한다", () => {
  assert.equal(shouldExtendLogin({ enabled: true, loginExtension: true }), true);
  assert.equal(shouldExtendLogin({ enabled: false, loginExtension: true }), false);
  assert.equal(shouldExtendLogin({ enabled: true, loginExtension: false }), false);
});

test("스크립트는 stamp 시간 버튼 하나만 클릭하고 결과를 표시한다", () => {
  assert.match(LOGIN_EXTENSION_SCRIPT, /candidates\.length === 1/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /stamp--normal/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /로그인 연장 버튼 클릭 완료/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /로그인 연장 대상 버튼 없음/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /로그인 연장 대상 버튼 여러 개/);
});
```

- [ ] **Step 2: 정책 테스트 실패 확인**

Run: `npm test -- --test-name-pattern="로그인 연장|스크립트"`

Expected: `src/main/login-extension.js` 부재로 실패

- [ ] **Step 3: 브라우저 클릭 스크립트 추가**

`src/renderer/login-extension.js`는 Tauri 최종 스크립트와 동일하게 구현함.

```js
(() => {
  const resultId = "screen-wall-login-extension-result";
  const showResult = (message, success) => {
    try {
      let result = document.getElementById(resultId);
      if (!result) {
        result = document.createElement("div");
        result.id = resultId;
        result.setAttribute("role", "status");
        document.documentElement.append(result);
      }
      result.textContent = `${message} · ${new Date().toLocaleTimeString("ko-KR", {
        hour12: false,
      })}`;
      Object.assign(result.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647",
        padding: "10px 14px",
        borderRadius: "8px",
        background: success ? "rgba(21, 128, 61, .96)" : "rgba(185, 28, 28, .96)",
        color: "#fff",
        font: "600 13px sans-serif",
        boxShadow: "0 8px 24px rgba(0, 0, 0, .32)",
        pointerEvents: "none",
      });
      window.clearTimeout(Number(result.dataset.removeTimer || 0));
      result.dataset.removeTimer = String(window.setTimeout(() => result.remove(), 5_000));
    } catch (error) {
      console.warn("[Screen Wall] 로그인 연장 결과 표시 실패", error);
    }
  };

  const candidates = Array.from(document.querySelectorAll("button")).filter((button) => {
    const text = (button.textContent || "").replace(/\s+/g, " ").trim();
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const isLoginStamp = button.classList.contains("stamp")
      && (button.classList.contains("stamp--normal")
        || button.classList.contains("stamp—normal"));
    return isLoginStamp
      && /^\d{2}:\d{2}:\d{2}$/.test(text)
      && !button.disabled
      && button.getAttribute("aria-disabled") !== "true"
      && rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden";
  });

  if (candidates.length === 1) {
    const button = candidates[0];
    const text = (button.textContent || "").replace(/\s+/g, " ").trim();
    console.info("[Screen Wall] 로그인 연장 버튼 발견", { text });
    try {
      button.click();
      showResult("로그인 연장 버튼 클릭 완료", true);
      console.info("[Screen Wall] 로그인 연장 버튼 클릭 완료", { text });
    } catch (error) {
      showResult("로그인 연장 버튼 클릭 실패", false);
      console.error("[Screen Wall] 로그인 연장 버튼 클릭 실패", { text, error });
    }
  } else {
    const message = candidates.length === 0
      ? "로그인 연장 대상 버튼 없음"
      : "로그인 연장 대상 버튼 여러 개";
    showResult(message, false);
    console.warn(`[Screen Wall] ${message}`, { candidateCount: candidates.length });
  }
})();
```

- [ ] **Step 4: main 정책 모듈 추가**

`src/main/login-extension.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

const LOGIN_EXTENSION_INTERVAL = 60 * 60 * 1000;
const LOGIN_EXTENSION_SCRIPT = fs.readFileSync(
  path.join(__dirname, "../renderer/login-extension.js"),
  "utf8",
);

function shouldExtendLogin(slot) {
  return slot?.enabled === true && slot?.loginExtension === true;
}

module.exports = {
  LOGIN_EXTENSION_INTERVAL,
  LOGIN_EXTENSION_SCRIPT,
  shouldExtendLogin,
};
```

- [ ] **Step 5: WallController 스케줄 구현**

constructor에 테스트 가능한 interval을 추가함.

```js
constructor({
  onManagerShortcut,
  onPreview,
  onStatus,
  loginExtensionInterval = LOGIN_EXTENSION_INTERVAL,
}) {
  this.loginExtensionInterval = loginExtensionInterval;
  this.loginExtensionTimer = null;
}
```

다음 메서드를 추가함.

```js
startLoginExtension() {
  if (this.loginExtensionTimer) return;
  if (!this.config?.slots.some(shouldExtendLogin)) return;
  this.loginExtensionTimer = setInterval(
    () => this.executeLoginExtension(),
    this.loginExtensionInterval,
  );
}

stopLoginExtension() {
  clearInterval(this.loginExtensionTimer);
  this.loginExtensionTimer = null;
}

executeLoginExtension() {
  this.config?.slots.forEach((slot, index) => {
    const view = this.views[index];
    if (!shouldExtendLogin(slot) || !view || view.webContents.isDestroyed()) return;
    view.webContents.executeJavaScript(LOGIN_EXTENSION_SCRIPT, true).catch((error) => {
      console.error(`[Screen Wall] 화면 ${index + 1} 로그인 연장 실행 실패`, error);
    });
  });
}
```

`run()` 마지막에 `startLoginExtension()`, `stop()`과 `destroy()`에 `stopLoginExtension()`을 호출함.

- [ ] **Step 6: 출력 smoke에 실제 DOM 네 경우 추가**

fixture server의 화면별 body를 다음처럼 구성함.

```js
const cases = {
  "1": `<button class="stamp stamp--normal" onclick="window.loginClicks += 1">23:35:32</button>`,
  "2": "",
  "3": `<button class="stamp stamp--normal">23:35:32</button>
        <button class="stamp stamp--normal">00:35:32</button>`,
  "4": `<button class="stamp stamp--normal">23:35:32</button>
        <script>document.querySelector("button").click = () => { throw new Error("click failed"); };</script>`,
};
```

controller는 짧은 검증 interval로 생성함.

```js
const controller = new WallController({
  onManagerShortcut: () => { managerRequests += 1; },
  onPreview: () => {},
  onStatus: (status) => statuses.push(status),
  loginExtensionInterval: 50,
});
```

네 슬롯에 `loginExtension: true`를 설정하고 RUN 후 결과를 확인함.

```js
controller.run();
await wait(120);
const notices = await Promise.all(
  controller.views.map((view) =>
    view.webContents.executeJavaScript(
      `document.querySelector("#screen-wall-login-extension-result")?.textContent || ""`,
    ),
  ),
);
assert.match(notices[0], /클릭 완료/);
assert.match(notices[1], /대상 버튼 없음/);
assert.match(notices[2], /대상 버튼 여러 개/);
assert.match(notices[3], /클릭 실패/);
controller.stop();
assert.equal(controller.loginExtensionTimer, null);
```

- [ ] **Step 7: 로그인 테스트 통과 확인**

Run: `npm test && npm run smoke:wall`

Expected: 정책 테스트와 실제 성공·없음·중복·예외 알림 모두 통과

- [ ] **Step 8: 커밋**

```bash
git add src/renderer/login-extension.js src/main/login-extension.js test/login-extension.test.js src/main/wall-controller.js test/electron-wall-smoke.js
git commit -m "feat: add Electron login extension"
```

---

### Task 4: ESC overlay와 커서 숨김 제거

**Files:**
- Delete: `src/overlay-preload.js`
- Delete: `src/renderer/overlay.css`
- Delete: `src/renderer/overlay.html`
- Delete: `src/renderer/overlay.js`
- Modify: `src/main/wall-controller.js`
- Modify: `test/electron-wall-smoke.js`
- Modify: `package.json`
- Modify: `readme.md`

**Interfaces:**
- Keeps: `handleShortcutInput`, global shortcut, fullscreen exit recovery
- Removes: overlay WebContentsView and pointer-driven cursor hiding

- [ ] **Step 1: 실패하는 overlay 제거 smoke 작성**

`test/electron-wall-smoke.js`에서 overlay 로드·hover·visibility assertion을 제거하고 다음을 추가함.

```js
assert.equal(controller.overlayViews, undefined);
assert.equal(controller.window.contentView.children.length, 4);
```

ESC 입력 assertion은 기존대로 유지함.

- [ ] **Step 2: smoke 실패 확인**

Run: `npm run smoke:wall`

Expected: `controller.overlayViews`가 Map이고 child view가 5개라 실패

- [ ] **Step 3: WallController overlay 상태와 동작 제거**

constructor에서 다음 필드를 제거함.

```js
this.overlayViews
this.overlayReady
this.overlayHideTimer
this.overlayHoverPanels
this.overlayControlsVisible
this.lastPointerActivityAt
this.overlayPanelVisibility
this.cursorShouldBeHidden
this.cursorStyleGeneration
this.cursorCssKeys
```

`ensureWindow()`은 다음 생성 순서만 유지함.

```js
this.createViews();
this.layoutViews();
```

`createViews()`에서 `before-mouse-event`와 cursor 재적용 분기를 제거함.

`layoutViews()`에서 `layoutOverlayViews()` 호출을 제거함.

`run()` 마지막은 overlay 대신 로그인 연장만 시작함.

```js
this.startWallModeGuard();
this.startLoginExtension();
```

`stop()`은 overlay·cursor 정리 없이 로그인 연장과 wall 상태만 정리함.

```js
this.running = false;
this.stopLoginExtension();
clearInterval(this.wallModeGuardTimer);
this.wallModeGuardTimer = null;
this.leaveWallMode();
this.window.hide();
```

overlay·cursor 전용 메서드 전체를 삭제함.

- [ ] **Step 4: overlay 파일과 검사 경로 제거**

다음 파일을 삭제함.

```text
src/overlay-preload.js
src/renderer/overlay.css
src/renderer/overlay.html
src/renderer/overlay.js
```

`package.json`의 check script:

```json
"check": "node --check index.js && node --check src/main/index.js && node --check src/main/config-store.js && node --check src/main/login-extension.js && node --check src/main/wall-controller.js && node --check src/preload.js && node --check src/renderer/app.js && node --check src/renderer/login-extension.js"
```

- [ ] **Step 5: README 동기화**

기능 목록과 구조를 다음 정책으로 갱신함.

```text
- 슬롯별 로그인 연장: RUN 1시간 후부터 매시간 대상 버튼 클릭
- 로그인 연장 성공·실패를 출력 페이지 우측 상단과 콘솔에 표시
- 확대율 10~200%
- 드래그 중 자동 갱신에 영향받지 않는 카드 교환
- ESC 전역 단축키와 전체화면 상태 감지로 관리 화면 복귀
```

overlay 표시·3초 자동 숨김·overlay 파일 설명은 삭제함.

- [ ] **Step 6: overlay 제거와 ESC 유지 검증**

Run: `npm run check && npm run smoke:wall`

Expected: child view 4개, overlay 없음, ESC 복귀 assertion 통과

- [ ] **Step 7: 커밋**

```bash
git add package.json readme.md src/main/wall-controller.js test/electron-wall-smoke.js
git add -u src/overlay-preload.js src/renderer/overlay.css src/renderer/overlay.html src/renderer/overlay.js
git commit -m "refactor: remove Electron ESC overlay"
```

---

### Task 5: 전체 회귀 검증과 master 반영 준비

**Files:**
- Verify only

**Interfaces:**
- Produces: master에 fast-forward 가능한 검증 완료 브랜치

- [ ] **Step 1: 전체 자동 검증**

Run:

```bash
npm test
npm run check
npm run smoke
npm run smoke:wall
npm run pack
git diff --check master...HEAD
```

Expected: 모든 명령 exit 0

- [ ] **Step 2: 변경 범위 확인**

Run:

```bash
git status --short
git log --oneline master..HEAD
git diff --stat master...HEAD
```

Expected: worktree clean, `회의록.md` 변경 없음

- [ ] **Step 3: 원격 반영**

```bash
git push origin codex/electron-parity
git push origin codex/electron-parity:master
```

Expected: 원격 feature branch와 `master`가 같은 최종 SHA를 가리킴
