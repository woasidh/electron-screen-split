# Remove ESC Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ESC 전역 단축키는 유지하면서 모든 플랫폼의 ESC 시각 overlay를 제거하고 로그인 selector·click 결과 알림만 우측 상단에 유지함.

**Architecture:** `wall-overlay` renderer entry와 command 권한을 먼저 제거함. 이후 `WallController`에서 overlay child webview와 pointer polling 상태·lifecycle을 삭제함. 로그인 결과 스크립트는 변경하지 않고 DOM 테스트로 success/fail 위치와 색상을 검증함.

**Tech Stack:** Rust 1.77.2, Tauri 2.11, TypeScript 7, Vite 8, Vitest/jsdom

## Global Constraints

- ESC 전역 단축키를 통한 관리 화면 복귀는 유지함.
- ESC 시각 overlay는 Windows, Ubuntu, macOS 모두 제거함.
- 출력 중 커서는 기본 표시 상태를 유지함.
- success는 selector 후보 1개와 예외 없는 `click()` 반환임.
- fail은 후보 0개·복수 또는 `click()` 예외임.
- 서버 응답이나 로그인 시간 증가는 확인하지 않음.

---

### Task 1: Overlay entry와 권한 제거

**Files:**
- Create: `src/renderer/esc-overlay-removal.test.ts`
- Modify: `vite.config.ts`
- Modify: `src-tauri/src/commands.rs`

**Interfaces:**
- Produces: Vite input에 `manager`, `blank`만 존재함.
- Produces: `wall-overlay` label은 모든 command에서 unauthorized임.
- Consumes: 기존 `authorize(label, command)` 함수와 Vite config object.

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { expect, test } from "vitest";
import viteConfig from "../../vite.config";

test("does not bundle an ESC overlay page", () => {
  const rollupOptions = viteConfig.build?.rollupOptions as
    | { input?: Record<string, string> }
    | undefined;
  expect(rollupOptions?.input).not.toHaveProperty("overlay");
});
```

Rust 기존 authorization 테스트에서 overlay 기대값을 다음과 같이 변경함.

```rust
#[test]
fn only_manager_label_is_authorized() {
    assert!(authorize("manager", CommandKind::Read));
    assert!(authorize("manager", CommandKind::Mutate));
    assert!(authorize("manager", CommandKind::Run));
    assert!(authorize("manager", CommandKind::Stop));
    assert!(!authorize("wall-overlay", CommandKind::Stop));
    assert!(!authorize("wall-slot-1", CommandKind::Mutate));
    assert!(!authorize("wall-slot-1", CommandKind::Stop));
}
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run esc-overlay-removal.test.ts`

Expected: FAIL, Vite input에 `overlay`가 존재함.

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::tests::only_manager_label_is_authorized`

Expected: FAIL, `wall-overlay` stop 권한이 아직 true임.

- [ ] **Step 3: entry와 권한 구현 제거**

`vite.config.ts` input을 다음처럼 변경함.

```ts
input: {
  manager: resolve("src/renderer/index.html"),
  blank: resolve("src/renderer/blank.html"),
},
```

`authorize`는 manager branch만 허용함.

```rust
matches!(
    (label, command),
    (
        "manager",
        CommandKind::Read | CommandKind::Mutate | CommandKind::Run | CommandKind::Stop
    )
)
```

- [ ] **Step 4: 관련 테스트 통과 확인**

Run: `npm test -- --run esc-overlay-removal.test.ts && cargo test --manifest-path src-tauri/Cargo.toml commands`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add vite.config.ts src/renderer/esc-overlay-removal.test.ts src-tauri/src/commands.rs
git commit -m "refactor: remove ESC overlay entry"
```

### Task 2: Overlay runtime과 renderer 제거

**Files:**
- Modify: `src-tauri/src/wall.rs`
- Delete: `src/renderer/overlay.html`
- Delete: `src/renderer/overlay.css`
- Delete: `src/renderer/overlay.ts`
- Delete: `src/renderer/overlay.test.ts`

**Interfaces:**
- Preserves: `escape_shortcut() -> Shortcut`, `restore_manager(&AppHandle)`, shortcut registration lifecycle.
- Removes: `OverlayState`, `overlay`, `pointer_cancel`, `ensure_overlay`, `start_pointer_monitor`.

- [ ] **Step 1: Runtime 제거**

`WallController`에서 다음 상태를 삭제함.

```rust
overlay: Option<Webview>,
pointer_cancel: Option<Arc<AtomicBool>>,
```

`run_once`에서 `ensure_overlay`와 `start_pointer_monitor` 호출을 삭제함. `stop`, `destroy`, `forget_destroyed_window`에서 overlay·pointer 취소 처리를 삭제함. `OverlayState`, `ensure_overlay`, `start_pointer_monitor`, `pointer_activity_shows_overlay_for_three_seconds` 테스트를 삭제함.

`std::time::Instant` import를 제거하고, `Duration`과 `AtomicBool`은 로그인 스케줄러와 relayout에서 계속 사용함. `WebviewBuilder`와 `WebviewUrl`은 슬롯 생성에서 계속 사용함.

- [ ] **Step 2: Renderer 파일 제거**

```text
src/renderer/overlay.html
src/renderer/overlay.css
src/renderer/overlay.ts
src/renderer/overlay.test.ts
```

위 네 파일을 삭제함.

- [ ] **Step 3: 잔여 참조 검사**

Run: `rg -n 'wall-overlay|ensure_overlay|start_pointer_monitor|OverlayState|pointer_cancel|overlay\\.html' src src-tauri vite.config.ts`

Expected: 출력 없음.

- [ ] **Step 4: 전체 Rust·renderer 테스트 통과 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npm test`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src-tauri/src/wall.rs src/renderer/overlay.html src/renderer/overlay.css src/renderer/overlay.ts src/renderer/overlay.test.ts
git commit -m "refactor: remove ESC visual overlay"
```

### Task 3: 로그인 success/fail 우측 상단 알림 검증

**Files:**
- Modify: `src/renderer/login-extension.test.ts`
- Verify: `src-tauri/scripts/login-extension.js`

**Interfaces:**
- Consumes: DOM id `screen-wall-login-extension-result`.
- Verifies: success green, fail red, `position: fixed`, `top: 16px`, `right: 16px`.

- [ ] **Step 1: success 스타일 검증 추가**

기존 success 테스트에 다음 assertion을 추가함.

```ts
const successNotice = resultNotice();
expect(successNotice?.style.position).toBe("fixed");
expect(successNotice?.style.top).toBe("16px");
expect(successNotice?.style.right).toBe("16px");
expect(successNotice?.style.background).toBe("rgba(21, 128, 61, 0.96)");
```

- [ ] **Step 2: fail 스타일 검증 추가**

기존 click exception 테스트에 다음 assertion을 추가함.

```ts
const failureNotice = resultNotice();
expect(failureNotice?.style.position).toBe("fixed");
expect(failureNotice?.style.top).toBe("16px");
expect(failureNotice?.style.right).toBe("16px");
expect(failureNotice?.style.background).toBe("rgba(185, 28, 28, 0.96)");
```

- [ ] **Step 3: DOM 테스트 실행**

Run: `npm test -- --run login-extension.test.ts`

Expected: PASS. 기존 구현이 승인된 위치·색상 요구사항을 이미 만족함.

- [ ] **Step 4: 검증 커밋**

```bash
git add src/renderer/login-extension.test.ts
git commit -m "test: verify login result alert styling"
```

### Task 4: 전체 검증·실행·원격 반영

**Files:**
- Verify only

**Interfaces:**
- Consumes: Task 1–3 전체 변경.
- Produces: ESC 시각 overlay가 없고 로그인 결과 알림만 유지된 앱.

- [ ] **Step 1: 전체 검증 실행**

```bash
npm test
npm run check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 2: 산출물·소스 확인**

Run: `find dist -maxdepth 2 -type f | sort && rg -n 'wall-overlay|overlay\\.html' src src-tauri vite.config.ts dist || true`

Expected: `dist/overlay.html`이 없고 source/runtime 참조가 없음.

- [ ] **Step 3: 최신 앱 재실행**

Run: 기존 `npm run tauri:dev` 세션을 종료하고 `/Users/mwchoi/IdeaProjects/electron-screen-split/.worktrees/tauri-rewrite`에서 `npm run tauri:dev` 실행.

Expected: `target/debug/screen-wall-control` 실행 상태임.

- [ ] **Step 4: 원격 브랜치 푸시**

```bash
git push origin feat/tauri-rewrite
git ls-remote origin refs/heads/feat/tauri-rewrite
```

Expected: 원격 SHA가 로컬 `HEAD`와 일치함.
