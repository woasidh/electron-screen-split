# Login Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면별 로그인 연장 옵션을 저장하고, RUN 1시간 후부터 선택된 활성 웹뷰의 단일 시간 버튼을 매시간 클릭함.

**Architecture:** JSON 설정과 관리 UI에 `loginExtension` 값을 추가함. Rust `WallController`가 대상 웹뷰와 취소 플래그를 소유하고, 별도 주기 실행기가 `Webview::eval`로 저장된 DOM 스크립트를 실행함. 버튼 스크립트는 `stamp stamp--normal` class를 가지며 표시·활성 상태인 `HH:mm:ss` 텍스트 버튼이 정확히 하나일 때만 클릭함.

**Tech Stack:** TypeScript 7, Vitest/jsdom, Rust 1.77.2, Tauri 2.11, Serde

## Global Constraints

- 기본값 `false`, 기존 설정에 필드가 없어도 경고 없이 로드함.
- 자동 로그인과 계정정보 저장을 수행하지 않음.
- 첫 실행은 RUN 1시간 후이며 이후 주기는 1시간임.
- 일치 버튼이 0개 또는 여러 개이면 아무 동작도 하지 않음.
- Ubuntu 24.04, Windows 10, macOS에서 공통 동작하는 Tauri API만 사용함.

---

### Task 1: 설정 모델과 마이그레이션

**Files:**
- Modify: `src-tauri/src/model.rs`
- Modify: `src-tauri/src/config_store.rs`
- Modify: `src/renderer/types.ts`
- Modify: `src/renderer/state.test.ts`
- Modify: `src/renderer/view.test.ts`

**Interfaces:**
- Produces: Rust `SlotConfig::login_extension: bool`, TypeScript `SlotConfig.loginExtension: boolean`
- Produces: 기존 JSON에서 누락된 `loginExtension`을 `false`로 역직렬화하는 호환성

- [ ] **Step 1: 기존 JSON 호환성 실패 테스트 작성**

```rust
#[test]
fn loads_config_without_login_extension_as_false() {
    let temp = tempfile::tempdir().unwrap();
    let target = temp.path().join("config.json");
    fs::write(&target, r#"{"version":1,"slots":[{"enabled":true,"url":"https://example.com","zoom":1.0}]}"#).unwrap();
    let result = ConfigStore::new(target, vec![]).load();
    assert!(result.warning.is_none());
    assert!(!result.config.slots[0].login_extension);
}
```

- [ ] **Step 2: 실패 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config_store::tests::loads_config_without_login_extension_as_false`

Expected: FAIL, `login_extension` 필드가 존재하지 않음.

- [ ] **Step 3: 모델 필드와 기본값 구현**

```rust
pub struct SlotConfig {
    pub enabled: bool,
    pub url: String,
    pub zoom: f64,
    #[serde(default)]
    pub login_extension: bool,
}
```

`AppConfig::default`와 `AppConfig::normalize`에서 각각 `false`, `source.login_extension`을 사용함. TypeScript `SlotConfig`에 `loginExtension: boolean`을 추가하고 모든 테스트 fixture에 값을 명시함.

- [ ] **Step 4: 모델 테스트 통과 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml model config_store`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src-tauri/src/model.rs src-tauri/src/config_store.rs src/renderer/types.ts src/renderer/state.test.ts src/renderer/view.test.ts
git commit -m "feat: persist login extension option"
```

### Task 2: 안전한 버튼 클릭 스크립트

**Files:**
- Create: `src-tauri/scripts/login-extension.js`
- Create: `src/renderer/login-extension.test.ts`
- Create: `src-tauri/src/login_extension.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `login_extension::LOGIN_EXTENSION_SCRIPT: &str`
- Script contract: `stamp`와 `stamp--normal` class를 가지며 표시·활성 상태인 시간 텍스트 버튼 후보가 정확히 하나이면 `click()` 호출

- [ ] **Step 1: DOM 실패 테스트 작성**

```ts
import script from "../../src-tauri/scripts/login-extension.js?raw";

test("clicks only one visible enabled time button", () => {
  const button = document.createElement("button");
  button.classList.add("stamp", "stamp--normal");
  button.textContent = "23:35:32";
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ width: 80, height: 30 } as DOMRect);
  const click = vi.spyOn(button, "click");
  document.body.append(button);
  window.eval(script);
  expect(click).toHaveBeenCalledOnce();
});
```

단일 후보, 복수 후보, 숨김·비활성 후보를 각각 테스트함.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run src/renderer/login-extension.test.ts`

Expected: FAIL, 스크립트 파일이 존재하지 않음.

- [ ] **Step 3: 클릭 스크립트와 Rust include 구현**

```js
(() => {
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
  if (candidates.length === 1) candidates[0].click();
})();
```

```rust
pub const LOGIN_EXTENSION_SCRIPT: &str = include_str!("../scripts/login-extension.js");
```

- [ ] **Step 4: DOM 테스트 통과 확인**

Run: `npm test -- --run src/renderer/login-extension.test.ts`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src-tauri/scripts/login-extension.js src-tauri/src/login_extension.rs src-tauri/src/lib.rs src/renderer/login-extension.test.ts
git commit -m "feat: add safe login extension click script"
```

### Task 3: 시간 스케줄러와 웹뷰 연결

**Files:**
- Modify: `src-tauri/src/login_extension.rs`
- Modify: `src-tauri/src/wall.rs`

**Interfaces:**
- Produces: `login_extension::spawn(cancel: Arc<AtomicBool>, interval: Duration, on_tick: impl FnMut() + Send + 'static)`
- Consumes: `LOGIN_EXTENSION_SCRIPT`, `SlotConfig::login_extension`, `tauri::Webview::eval`

- [ ] **Step 1: 주기 실행과 취소 실패 테스트 작성**

```rust
#[test]
fn waits_then_runs_until_cancelled() {
    let cancel = Arc::new(AtomicBool::new(false));
    let calls = Arc::new(AtomicUsize::new(0));
    let calls_for_tick = calls.clone();
    let cancel_for_tick = cancel.clone();
    let handle = spawn(cancel, Duration::from_millis(5), move || {
        calls_for_tick.fetch_add(1, Ordering::SeqCst);
        cancel_for_tick.store(true, Ordering::SeqCst);
    });
    handle.join().unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}
```

- [ ] **Step 2: 실패 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml login_extension::tests::waits_then_runs_until_cancelled`

Expected: FAIL, `spawn` 함수가 존재하지 않음.

- [ ] **Step 3: 취소 가능한 주기 실행기 구현**

```rust
pub fn spawn(
    cancel: Arc<AtomicBool>,
    interval: Duration,
    mut on_tick: impl FnMut() + Send + 'static,
) -> std::io::Result<JoinHandle<()>> {
    thread::Builder::new().name("login-extension".into()).spawn(move || {
        while wait(&cancel, interval) {
            on_tick();
        }
    })
}
```

`wait`는 최대 1초 단위로 취소 플래그를 확인함.

- [ ] **Step 4: WallController 연결 구현**

`login_extension_cancel: Option<Arc<AtomicBool>>` 필드를 추가함. RUN 완료 시 활성 상태이며 `login_extension`이 켜진 웹뷰만 복제해 1시간 간격 실행기를 시작하고, 각 tick에서 모든 웹뷰에 `LOGIN_EXTENSION_SCRIPT`를 `eval`함. `stop`, `destroy`, `forget_destroyed_window`에서 플래그를 취소함.

- [ ] **Step 5: Rust 테스트 통과 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 6: 변경 커밋**

```bash
git add src-tauri/src/login_extension.rs src-tauri/src/wall.rs
git commit -m "feat: schedule hourly login extension"
```

### Task 4: 관리 UI 옵션과 카드 표시

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.ts`
- Modify: `src/renderer/view.ts`
- Modify: `src/renderer/view.test.ts`

**Interfaces:**
- Consumes: `SlotConfig.loginExtension`
- Produces: `#slot-login-extension` 체크박스 저장 경로와 카드 요약 표시

- [ ] **Step 1: UI 실패 테스트 작성**

```ts
test("shows login extension control and enabled card metadata", () => {
  const parsed = new DOMParser().parseFromString(managerMarkup, "text/html");
  expect(parsed.querySelector("#slot-login-extension")).not.toBeNull();
  const config = defaultConfig();
  config.slots[0].loginExtension = true;
  const container = document.createElement("div");
  renderSlotCards(container, config, defaultStatuses(), 0);
  expect(container.querySelector(".tile-meta")?.textContent).toContain("로그인 연장");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run src/renderer/view.test.ts`

Expected: FAIL, 체크박스와 메타 텍스트가 없음.

- [ ] **Step 3: 설정 UI와 저장 이벤트 구현**

```html
<label class="option-row switch-control">
  <span>
    <strong>로그인 연장</strong>
    <small>RUN 1시간 후부터 매시간 실행</small>
  </span>
  <input id="slot-login-extension" type="checkbox">
  <span class="switch-track" aria-hidden="true"></span>
</label>
```

`app.ts`에서 checkbox를 필수 요소로 찾고 `renderEditor`에서 값을 반영함. `change` 이벤트에서 현재 슬롯의 `loginExtension`을 갱신하고 즉시 저장·재렌더링함. `view.ts`의 메타 문자열에 옵션이 켜진 경우 ` · 로그인 연장`을 붙임.

- [ ] **Step 4: UI 테스트와 타입 검사 통과 확인**

Run: `npm test -- --run src/renderer/view.test.ts src/renderer/state.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/app.ts src/renderer/view.ts src/renderer/view.test.ts
git commit -m "feat: expose login extension per screen"
```

### Task 5: 전체 검증과 원격 반영

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1–4 전체 변경
- Produces: 테스트·정적 검사·빌드 결과와 원격 브랜치

- [ ] **Step 1: 전체 검증 실행**

```bash
npm test
npm run check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 2: 앱 스모크 실행**

Run: `npm run tauri:dev`

Expected: 관리 화면에 옵션이 보이고 RUN 시 2×2 출력이 유지됨. 실제 staging 버튼 클릭은 내부 DNS/VPN 연결 후 확인함.

- [ ] **Step 3: 원격 브랜치 푸시**

```bash
git push origin feat/tauri-rewrite
```

Expected: `origin/feat/tauri-rewrite`가 현재 HEAD를 가리킴.
