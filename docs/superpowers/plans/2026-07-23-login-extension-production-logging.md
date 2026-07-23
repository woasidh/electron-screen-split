# Login Extension Production Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 연장 주기를 운영용 1시간으로 복구하고 selector 발견과 `click()` 호출 결과를 단순 로그로 남김.

**Architecture:** Rust 스케줄러 간격 상수를 3600초로 복구함. 기존 DOM 스크립트는 selector 후보가 하나일 때 발견 로그를 남기고 `click()`을 호출한 뒤 완료 또는 예외 로그를 남김. 시간 증가, 서버 응답, 재시도는 확인하지 않음.

**Tech Stack:** Rust 1.77.2, Tauri 2.11, JavaScript DOM API, TypeScript 7, Vitest/jsdom

## Global Constraints

- 첫 실행과 반복 주기는 1시간임.
- 후보가 정확히 하나일 때만 클릭함.
- selector 발견과 click 호출 결과만 기록함.
- 기존 5초 화면 알림을 유지함.
- 시간값 비교, 서버 응답 검증, 재시도, IPC, 파일 로그를 추가하지 않음.
- 계정정보 저장과 자동 로그인을 추가하지 않음.

---

### Task 1: 운영 주기 1시간 복구

**Files:**
- Modify: `src-tauri/src/login_extension.rs`

**Interfaces:**
- Produces: `LOGIN_EXTENSION_INTERVAL: Duration = Duration::from_secs(60 * 60)`
- Consumes: 기존 `WallController::start_login_extension` 상수 사용 경로

- [ ] **Step 1: 1시간 실패 테스트 작성**

기존 `test_mode_runs_every_minute` 테스트를 다음 테스트로 교체함.

```rust
#[test]
fn production_mode_runs_hourly() {
    assert_eq!(LOGIN_EXTENSION_INTERVAL, Duration::from_secs(60 * 60));
}
```

- [ ] **Step 2: 실패 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml login_extension::tests::production_mode_runs_hourly`

Expected: FAIL, 실제 값 60초와 기대값 3600초가 다름.

- [ ] **Step 3: 운영 간격 구현**

```rust
pub const LOGIN_EXTENSION_INTERVAL: Duration = Duration::from_secs(60 * 60);
```

- [ ] **Step 4: 관련 테스트 통과 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml login_extension`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src-tauri/src/login_extension.rs
git commit -m "feat: restore hourly login extension"
```

### Task 2: selector 발견과 click 결과 로그

**Files:**
- Modify: `src/renderer/login-extension.test.ts`
- Modify: `src-tauri/scripts/login-extension.js`

**Interfaces:**
- Consumes: 기존 `candidates` selector 결과와 `showResult(message, success)`
- Produces: console info `로그인 연장 버튼 발견`, `로그인 연장 버튼 클릭 완료`
- Produces: console error `로그인 연장 버튼 클릭 실패`

- [ ] **Step 1: 단순 로그 실패 테스트 작성**

```ts
test("logs selector match and completed click", () => {
  const button = addButton("23:35:32");
  const click = vi.spyOn(button, "click");
  runScript();
  expect(click).toHaveBeenCalledOnce();
  expect(console.info).toHaveBeenNthCalledWith(
    1,
    "[Screen Wall] 로그인 연장 버튼 발견",
    { text: "23:35:32" },
  );
  expect(console.info).toHaveBeenNthCalledWith(
    2,
    "[Screen Wall] 로그인 연장 버튼 클릭 완료",
    { text: "23:35:32" },
  );
  expect(resultNotice()?.textContent).toContain("로그인 연장 버튼 클릭 완료");
});

test("logs click exception without throwing from the script", () => {
  const button = addButton("23:35:32");
  const error = new Error("click failed");
  vi.spyOn(button, "click").mockImplementation(() => { throw error; });
  expect(() => runScript()).not.toThrow();
  expect(console.error).toHaveBeenCalledWith(
    "[Screen Wall] 로그인 연장 버튼 클릭 실패",
    { text: "23:35:32", error },
  );
  expect(resultNotice()?.textContent).toContain("로그인 연장 버튼 클릭 실패");
});
```

`beforeEach`에 `console.error` spy를 추가함.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run login-extension.test.ts`

Expected: FAIL, 발견·완료 로그와 click 예외 처리가 없음.

- [ ] **Step 3: 로그와 예외 처리 구현**

```js
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
}
```

후보 0개와 복수 후보의 기존 warn 경로는 변경하지 않음.

- [ ] **Step 4: DOM 테스트 통과 확인**

Run: `npm test -- --run login-extension.test.ts`

Expected: PASS.

- [ ] **Step 5: 변경 커밋**

```bash
git add src/renderer/login-extension.test.ts src-tauri/scripts/login-extension.js
git commit -m "feat: log login extension click result"
```

### Task 3: 전체 검증과 원격 반영

**Files:**
- Verify only

**Interfaces:**
- Consumes: Task 1–2 전체 변경
- Produces: 검증된 앱과 갱신된 `origin/feat/tauri-rewrite`

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

Expected: `target/debug/screen-wall-control` 실행 상태임.

- [ ] **Step 3: 원격 브랜치 푸시**

```bash
git push origin feat/tauri-rewrite
git ls-remote origin refs/heads/feat/tauri-rewrite
```

Expected: 원격 SHA가 로컬 `HEAD`와 일치함.
