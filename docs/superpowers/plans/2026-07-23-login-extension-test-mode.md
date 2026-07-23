# Login Extension Test Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 연장 주기를 테스트용 60초로 줄이고 각 웹뷰에서 클릭 실행 여부를 5초 알림과 콘솔 기록으로 확인할 수 있게 함.

**Architecture:** 기존 Rust 스케줄러의 간격 상수만 60초로 변경함. 기존 DOM 클릭 스크립트가 후보 수에 따라 결과 메시지를 결정하고, 고정 id의 알림 요소를 갱신하며 같은 메시지를 콘솔에 기록함. selector와 단일 후보 클릭 원칙은 변경하지 않음.

**Tech Stack:** Rust 1.77.2, Tauri 2.11, JavaScript DOM API, TypeScript 7, Vitest/jsdom

## Global Constraints

- 첫 실행과 반복 주기는 테스트용 60초임.
- 알림은 우상단에 5초간 표시하고 `pointer-events: none`을 사용함.
- 후보 1개만 클릭하며 0개 또는 여러 개이면 클릭하지 않음.
- 계정정보 저장과 자동 로그인을 추가하지 않음.
- 실제 검증 완료 후 1시간 주기와 테스트 알림 제거를 권장함.

---

### Task 1: 테스트 주기 60초

**Files:**
- Modify: `src-tauri/src/login_extension.rs`

**Interfaces:**
- Produces: `LOGIN_EXTENSION_INTERVAL: Duration = Duration::from_secs(60)`
- Consumes: 기존 `WallController::start_login_extension`의 간격 상수 사용 경로

- [ ] **Step 1: 60초 상수 실패 테스트 작성**

```rust
#[test]
fn test_mode_runs_every_minute() {
    assert_eq!(LOGIN_EXTENSION_INTERVAL, Duration::from_secs(60));
}
```

- [ ] **Step 2: 실패 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml login_extension::tests::test_mode_runs_every_minute`

Expected: FAIL, 실제 값 3600초와 기대값 60초가 다름.

- [ ] **Step 3: 간격 상수 변경**

```rust
pub const LOGIN_EXTENSION_INTERVAL: Duration = Duration::from_secs(60);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml login_extension`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src-tauri/src/login_extension.rs
git commit -m "test: run login extension every minute"
```

### Task 2: 웹뷰 결과 알림과 콘솔 기록

**Files:**
- Modify: `src/renderer/login-extension.test.ts`
- Modify: `src-tauri/scripts/login-extension.js`

**Interfaces:**
- Produces: DOM id `screen-wall-login-extension-result`
- Produces: `showResult(message: string, success: boolean): void`
- Consumes: 기존 `candidates: HTMLButtonElement[]` selector 결과

- [ ] **Step 1: 결과별 DOM 실패 테스트 작성**

```ts
test("shows click result for one candidate and removes it after five seconds", () => {
  const button = addButton("23:35:32");
  const click = vi.spyOn(button, "click");
  runScript();
  expect(click).toHaveBeenCalledOnce();
  expect(resultNotice()?.textContent).toContain("로그인 연장 클릭 실행");
  vi.advanceTimersByTime(5_000);
  expect(resultNotice()).toBeNull();
});

test("shows missing result without clicking", () => {
  runScript();
  expect(resultNotice()?.textContent).toContain("로그인 연장 대상 버튼 없음");
});

test("shows multiple result without clicking", () => {
  const first = addButton("23:35:32");
  const second = addButton("00:35:32");
  const firstClick = vi.spyOn(first, "click");
  const secondClick = vi.spyOn(second, "click");
  runScript();
  expect(firstClick).not.toHaveBeenCalled();
  expect(secondClick).not.toHaveBeenCalled();
  expect(resultNotice()?.textContent).toContain("로그인 연장 대상 버튼 여러 개");
});
```

테스트 `beforeEach`에서 `vi.useFakeTimers()`와 console spy를 설정하고, `afterEach`에서 DOM·timer·mock을 복구함.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run login-extension.test.ts`

Expected: FAIL, 결과 알림 요소가 존재하지 않음.

- [ ] **Step 3: 알림과 console 처리 구현**

```js
const RESULT_ID = "screen-wall-login-extension-result";

function showResult(message, success) {
  try {
    let result = document.getElementById(RESULT_ID);
    if (!result) {
      result = document.createElement("div");
      result.id = RESULT_ID;
      document.documentElement.append(result);
    }
    result.textContent = `${message} · ${new Date().toLocaleTimeString("ko-KR", { hour12: false })}`;
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
}
```

후보 1개에서는 `click()` 후 `showResult("로그인 연장 클릭 실행", true)`와 `console.info`를 호출함. 0개와 복수 후보에서는 각각 실패 문구로 `showResult`와 `console.warn`을 호출함.

- [ ] **Step 4: DOM 테스트 통과 확인**

Run: `npm test -- --run login-extension.test.ts`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src/renderer/login-extension.test.ts src-tauri/scripts/login-extension.js
git commit -m "test: show login extension click result"
```

### Task 3: 전체 검증과 실행

**Files:**
- Verify only

**Interfaces:**
- Consumes: Task 1–2 전체 변경
- Produces: 검증된 테스트용 앱과 원격 `feat/tauri-rewrite` 브랜치

- [ ] **Step 1: 전체 검증 실행**

```bash
npm test
npm run check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 2: 최신 앱 재실행**

Run: 기존 `npm run tauri:dev` 세션을 종료하고 `/Users/mwchoi/IdeaProjects/electron-screen-split/.worktrees/tauri-rewrite`에서 `npm run tauri:dev` 실행.

Expected: `target/debug/screen-wall-control` 실행 상태이며 로그인 연장 옵션을 켠 화면에서 RUN 후 약 60초마다 결과 알림이 표시됨.

- [ ] **Step 3: 원격 브랜치 푸시**

```bash
git push origin feat/tauri-rewrite
git ls-remote origin refs/heads/feat/tauri-rewrite
```

Expected: 원격 SHA가 로컬 `HEAD`와 일치함.
