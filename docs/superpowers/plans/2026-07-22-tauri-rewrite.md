# Tauri Screen Wall Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron 런타임과 미리보기 기능을 제거하고 macOS 14+, Windows 10, Ubuntu 24.04에서 네 개의 원격 웹뷰를 주 모니터에 2×2로 출력하는 Tauri 앱을 완성한다.

**Architecture:** Vite가 빌드하는 관리·오버레이 웹 UI와 Rust 코어를 분리한다. Rust 코어는 설정, 물리 픽셀 레이아웃, child webview 네 개, 전체화면 출력, 슬롯 상태, 단축키와 복구를 소유하며 원격 웹뷰에는 Tauri capability를 부여하지 않는다.

**Tech Stack:** Tauri 2.11.x, Rust stable, `@tauri-apps/cli` 2.11.4, `@tauri-apps/api` 2.11.1, Vanilla TypeScript 7.0.2, Vite 8.1.5, Vitest 4.1.10, WebKitGTK 4.1, WebView2, WKWebView

## Global Constraints

- 지원 OS는 macOS 14+, Windows 10 x64, Ubuntu 24.04 x64로 제한한다.
- Ubuntu Wayland와 X11을 모두 지원한다.
- 출력 모니터는 주 모니터로 고정한다.
- 웹 미리보기와 스크린샷 캡처를 구현하지 않는다.
- 슬롯별 브라우징 데이터를 분리하고 원격 웹뷰에 Tauri capability를 부여하지 않는다.
- 한 슬롯 실패는 다른 슬롯 출력을 중단하지 않는다.
- 기존 Electron 설정 원본을 삭제하지 않고 최초 실행 시 복사한다.
- 모든 동작 코드는 실패 테스트를 먼저 확인한 뒤 구현한다.
- Tauri `unstable` API를 사용하므로 Rust crate minor 버전과 `Cargo.lock`을 고정한다.

---

### Task 1: Tauri 및 Vite 기반 구성

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/manager.json`
- Create: `src-tauri/icons/icon.svg`

**Interfaces:**
- Produces: `screen_wall_lib::run()` 진입점과 Vite `dist/` 정적 자산

- [ ] **Step 1: Rust와 Tauri 빌드 도구 설치**

Run:

```bash
xcode-select -p
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/screen-wall-rustup.sh
sh /tmp/screen-wall-rustup.sh -y --profile minimal
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

Expected: Xcode Command Line Tools 경로, `rustc`와 `cargo` 버전 출력

- [ ] **Step 2: 프런트엔드 의존성과 스크립트 전환**

`package.json`의 핵심 내용:

```json
{
  "name": "screen-wall-control",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "check": "tsc --noEmit && cargo fmt --manifest-path src-tauri/Cargo.toml -- --check && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "2.11.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "2.11.4",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 3: Vite 다중 페이지와 TypeScript 설정 작성**

`vite.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        manager: resolve("src/renderer/index.html"),
        overlay: resolve("src/renderer/overlay.html"),
        blank: resolve("src/renderer/blank.html")
      }
    }
  },
  test: { environment: "jsdom", include: ["src/renderer/**/*.test.ts"] }
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "types": ["vitest/globals"]
  },
  "include": ["src/renderer/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 4: Tauri crate와 설정 작성**

`src-tauri/Cargo.toml`의 의존성:

```toml
[package]
name = "screen-wall-control"
version = "2.0.0"
edition = "2021"

[lib]
name = "screen_wall_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "=2.11.5", features = ["unstable"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-single-instance = "2"
thiserror = "2"
url = "2"
```

`src-tauri/src/main.rs`:

```rust
fn main() {
    screen_wall_lib::run();
}
```

`src-tauri/src/lib.rs` 최초 내용:

```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Tauri application failed");
}
```

- [ ] **Step 5: 구성 검증**

Run:

```bash
npm install
npm run build
source "$HOME/.cargo/env" && cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Vite build와 Rust check 성공

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json src-tauri
git commit -m "build: scaffold Tauri application"
```

---

### Task 2: 설정 모델과 물리 픽셀 레이아웃

**Files:**
- Create: `src-tauri/src/model.rs`
- Create: `src-tauri/src/layout.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `AppConfig`, `SlotConfig`, `SlotStatus`, `Rect`, `calculate_quadrants`, `calculate_output_zoom`

- [ ] **Step 1: 설정 정규화 실패 테스트 작성**

`model.rs` 테스트:

```rust
#[test]
fn normalize_produces_four_slots_and_clamps_zoom() {
    let config = AppConfig::normalize(vec![SlotConfig {
        enabled: true,
        url: " https://example.com ".into(),
        zoom: 9.0,
    }]);
    assert_eq!(config.slots.len(), 4);
    assert_eq!(config.slots[0].url, "https://example.com");
    assert_eq!(config.slots[0].zoom, 1.5);
}

#[test]
fn enabled_slots_require_http_or_https() {
    let mut config = AppConfig::default();
    config.slots[0].url = "file:///etc/passwd".into();
    assert_eq!(config.issues(), vec!["화면 1의 URL을 확인해 주세요."]);
}
```

- [ ] **Step 2: 실패 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml model`

Expected: `AppConfig` 미정의로 FAIL

- [ ] **Step 3: 최소 설정 모델 구현**

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlotConfig {
    pub enabled: bool,
    pub url: String,
    pub zoom: f64,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct AppConfig {
    pub version: u8,
    pub slots: Vec<SlotConfig>,
}
```

정규화는 슬롯 네 개, URL 2048자, zoom 0.5~1.5를 보장한다.

- [ ] **Step 4: 2×2 레이아웃 실패 테스트 작성**

```rust
#[test]
fn quadrants_cover_odd_physical_size_without_gaps() {
    assert_eq!(calculate_quadrants(101, 51).unwrap(), [
        Rect::new(0, 0, 50, 25),
        Rect::new(50, 0, 51, 25),
        Rect::new(0, 25, 50, 26),
        Rect::new(50, 25, 51, 26),
    ]);
}

#[test]
fn output_zoom_cancels_os_scale() {
    assert_eq!(calculate_output_zoom(1.0, 2.0), 0.5);
    assert_eq!(calculate_output_zoom(1.25, 1.25), 1.0);
}
```

- [ ] **Step 5: 실패 확인 후 레이아웃 구현**

Run: `cargo test --manifest-path src-tauri/Cargo.toml layout`

Expected: 함수 미정의로 FAIL

Implementation:

```rust
pub fn calculate_quadrants(width: u32, height: u32) -> Result<[Rect; 4], LayoutError> {
    if width < 2 || height < 2 { return Err(LayoutError::TooSmall); }
    let left = width / 2;
    let top = height / 2;
    Ok([
        Rect::new(0, 0, left, top),
        Rect::new(left as i32, 0, width - left, top),
        Rect::new(0, top as i32, left, height - top),
        Rect::new(left as i32, top as i32, width - left, height - top),
    ])
}
```

- [ ] **Step 6: 전체 테스트 및 커밋**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/model.rs src-tauri/src/layout.rs src-tauri/src/lib.rs
git commit -m "feat: add configuration and physical layout domain"
```

---

### Task 3: 설정 저장과 Electron 설정 이전

**Files:**
- Create: `src-tauri/src/config_store.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `AppConfig`
- Produces: `ConfigStore::load`, `ConfigStore::save`, `ConfigStore::migrate_legacy`

- [ ] **Step 1: 원자 저장과 이전 실패 테스트 작성**

```rust
#[test]
fn saves_and_reloads_normalized_config() {
    let temp = tempfile::tempdir().unwrap();
    let store = ConfigStore::new(temp.path().join("new/config.json"), vec![]);
    let mut config = AppConfig::default();
    config.slots[2].zoom = 1.25;
    store.save(&config).unwrap();
    assert_eq!(store.load().config.slots[2].zoom, 1.25);
}

#[test]
fn migrates_legacy_once_without_deleting_source() {
    let temp = tempfile::tempdir().unwrap();
    let legacy = temp.path().join("legacy/config.json");
    write_config(&legacy, 1.4);
    let store = ConfigStore::new(temp.path().join("new/config.json"), vec![legacy.clone()]);
    assert_eq!(store.load().config.slots[0].zoom, 1.4);
    assert!(legacy.exists());
}
```

- [ ] **Step 2: 실패 확인**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config_store`

Expected: `ConfigStore` 미정의로 FAIL

- [ ] **Step 3: 저장·이전 구현**

- 새 경로가 존재하면 새 설정만 읽는다.
- 새 경로가 없으면 legacy 후보를 순서대로 읽는다.
- 저장 시 `config.json.tmp`에 쓰고 `sync_all` 후 대상 경로로 교체한다.
- 파싱 실패 시 `LoadResult { config: default, warning: Some(...) }`를 반환한다.
- 개발 의존성에 `tempfile = "3"`를 추가한다.

- [ ] **Step 4: 테스트와 커밋**

```bash
cargo test --manifest-path src-tauri/Cargo.toml config_store
cargo test --manifest-path src-tauri/Cargo.toml
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/config_store.rs src-tauri/src/lib.rs
git commit -m "feat: persist and migrate configuration"
```

---

### Task 4: 미리보기 없는 관리 UI

**Files:**
- Create: `src/renderer/types.ts`
- Create: `src/renderer/state.ts`
- Create: `src/renderer/state.test.ts`
- Create: `src/renderer/api.ts`
- Create: `src/renderer/app.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Delete: `src/renderer/app.js`

**Interfaces:**
- Produces: `swapSlots`, `validateSlot`, `createSaveQueue`, Tauri command adapter

- [ ] **Step 1: 프런트엔드 상태 실패 테스트 작성**

```ts
import { describe, expect, test } from "vitest";
import { swapSlots, validateSlot } from "./state";

test("swaps complete slot settings without previews", () => {
  const slots = [
    { enabled: true, url: "https://one.example", zoom: 1 },
    { enabled: false, url: "", zoom: 1.2 }
  ];
  expect(swapSlots(slots, 0, 1)).toEqual([slots[1], slots[0]]);
});

test("rejects non-http URL only when enabled", () => {
  expect(validateSlot({ enabled: true, url: "file:///tmp/a", zoom: 1 })).toBe(false);
  expect(validateSlot({ enabled: false, url: "", zoom: 1 })).toBe(true);
});
```

- [ ] **Step 2: 실패 확인 후 상태 함수 구현**

Run: `npm test -- src/renderer/state.test.ts`

Expected: `state.ts`가 없어 FAIL

Implementation:

```ts
export function swapSlots(slots: SlotConfig[], from: number, to: number): SlotConfig[] {
  const next = structuredClone(slots);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function validateSlot(slot: SlotConfig): boolean {
  if (!slot.enabled) return true;
  try { return ["http:", "https:"].includes(new URL(slot.url).protocol); }
  catch { return false; }
}
```

- [ ] **Step 3: DOM 테스트로 미리보기 제거 확인**

```ts
test("manager markup has four status cards and no preview controls", async () => {
  document.body.innerHTML = managerFixture();
  renderSlots(defaultConfig(), defaultStatuses());
  expect(document.querySelectorAll(".screen-tile")).toHaveLength(4);
  expect(document.body.textContent).not.toContain("5초 자동 갱신");
  expect(document.querySelectorAll(".preview-image")).toHaveLength(0);
});
```

- [ ] **Step 4: 관리 UI와 Tauri API 구현**

`api.ts`는 아래 command 이름만 사용한다.

```ts
invoke<InitialState>("get_initial_state");
invoke<AppConfig>("save_config", { config });
invoke<void>("run_wall");
invoke<void>("stop_wall");
listen<SlotStatus>("slot-status-changed", handler);
listen<OutputInfo>("output-changed", handler);
```

- [ ] **Step 5: 프런트엔드 검증과 커밋**

```bash
npm test
npm run build
git add src/renderer package.json package-lock.json vite.config.ts tsconfig.json
git commit -m "feat: rebuild manager UI without previews"
```

---

### Task 5: 관리 command와 앱 상태

**Files:**
- Create: `src-tauri/src/app_state.rs`
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `ConfigStore`, `AppConfig`, `SlotStatus`
- Produces: `get_initial_state`, `save_config`, `run_wall`, `stop_wall`

- [ ] **Step 1: 호출자 제한 실패 테스트 작성**

```rust
#[test]
fn only_manager_and_overlay_labels_are_authorized() {
    assert!(authorize("manager", CommandKind::Read));
    assert!(authorize("manager", CommandKind::Mutate));
    assert!(authorize("wall-overlay", CommandKind::Stop));
    assert!(!authorize("wall-slot-1", CommandKind::Mutate));
    assert!(!authorize("wall-slot-1", CommandKind::Stop));
}
```

- [ ] **Step 2: 실패 확인 후 authorization 구현**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands`

Expected: `authorize` 미정의로 FAIL

```rust
fn authorize(label: &str, command: CommandKind) -> bool {
    matches!((label, command),
        ("manager", CommandKind::Read | CommandKind::Mutate | CommandKind::Run | CommandKind::Stop)
        | ("wall-overlay", CommandKind::Stop))
}
```

- [ ] **Step 3: AppState와 command 구현**

- `AppState`는 `Mutex<AppConfig>`, `ConfigStore`, `Mutex<WallController>`를 소유한다.
- 모든 command는 `tauri::Webview` label을 먼저 검증한다.
- `save_config`는 Rust 정규화 결과를 저장하고 wall 설정에 반영한다.
- `get_initial_state`는 config, output, statuses, shortcut `ESC`, warning을 반환한다.

- [ ] **Step 4: 테스트·check·커밋**

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands
cargo check --manifest-path src-tauri/Cargo.toml
git add src-tauri/src
git commit -m "feat: add secured manager commands"
```

---

### Task 6: 출력 Window와 네 child Webview

**Files:**
- Create: `src-tauri/src/audio.rs`
- Create: `src-tauri/src/wall.rs`
- Create: `src/renderer/blank.html`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `AppConfig`, `calculate_quadrants`, `calculate_output_zoom`
- Produces: `WallController::apply_config`, `run`, `stop`, `destroy`, `statuses`, `output_info`

- [ ] **Step 1: 상태 전이 실패 테스트 작성**

```rust
#[test]
fn running_state_keeps_failed_slots_independent() {
    let mut model = WallModel::new(AppConfig::default());
    model.mark_loading(0);
    model.mark_ready(1);
    model.mark_error(0, "network");
    assert_eq!(model.statuses[0].state, SlotState::Error);
    assert_eq!(model.statuses[1].state, SlotState::Ready);
}
```

- [ ] **Step 2: 실패 확인 후 WallModel 구현**

Run: `cargo test --manifest-path src-tauri/Cargo.toml wall::tests`

Expected: `WallModel` 미정의로 FAIL

- [ ] **Step 3: 문서 시작 음소거 스크립트 테스트·구현**

```rust
#[test]
fn mute_script_covers_media_elements_and_audio_context() {
    assert!(MUTE_SCRIPT.contains("MutationObserver"));
    assert!(MUTE_SCRIPT.contains("AudioContext"));
    assert!(MUTE_SCRIPT.contains("muted = true"));
}
```

`MUTE_SCRIPT`는 `audio`·`video`를 `muted=true`, `volume=0`으로 만들고 새 DOM 노드를 MutationObserver로 처리하며 새 AudioContext를 즉시 suspend한다.

- [ ] **Step 4: Window와 child webview 구현**

핵심 생성 흐름:

```rust
let window = tauri::window::WindowBuilder::new(app, "wall")
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .background_color(tauri::window::Color(0, 0, 0, 255))
    .visible(false)
    .build()?;

for (index, rect) in quadrants.into_iter().enumerate() {
    let builder = tauri::webview::WebviewBuilder::new(
        format!("wall-slot-{}", index + 1),
        slot_url(&config.slots[index])?,
    )
    .initialization_script(MUTE_SCRIPT)
    .on_navigation(|url| matches!(url.scheme(), "http" | "https" | "tauri"))
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .on_download(|_, _| false);
    window.add_child(builder, rect.physical_position(), rect.physical_size())?;
}
```

- [ ] **Step 5: 플랫폼별 세션 키 적용**

- Windows/Ubuntu: `<app-data>/webviews/wall-slot-N`
- macOS: `[N; 16]` `dataStoreIdentifier`
- 같은 슬롯을 재생성할 때 동일 키 사용

- [ ] **Step 6: 확대율·전체화면·재배치 구현**

- monitor size를 물리 픽셀로 직접 사용한다.
- `set_zoom(config.zoom / monitor.scale_factor())`를 적용한다.
- macOS는 `set_simple_fullscreen(true)`, 그 외는 `set_fullscreen(true)`를 호출한다.
- 출력 Window show 후 always-on-top과 focus를 설정한다.

- [ ] **Step 7: Rust 테스트와 macOS 로컬 스모크**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

Expected: 관리 창에서 RUN 시 child webview 4개가 주 모니터를 채움

- [ ] **Step 8: 커밋**

```bash
git add src-tauri/src src/renderer/blank.html
git commit -m "feat: render four isolated wall webviews"
```

---

### Task 7: ESC 오버레이, 커서, 단일 실행

**Files:**
- Create: `src/renderer/overlay.ts`
- Modify: `src/renderer/overlay.html`
- Modify: `src/renderer/overlay.css`
- Delete: `src/renderer/overlay.js`
- Modify: `src-tauri/src/wall.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `stop_wall`, wall Window handle
- Produces: global Escape 복귀, clickable overlay, 3초 cursor hide, second-instance 복귀

- [ ] **Step 1: 오버레이 상태 실패 테스트 작성**

```rust
#[test]
fn pointer_activity_shows_overlay_for_three_seconds() {
    let mut overlay = OverlayState::default();
    overlay.record_activity(std::time::Duration::from_secs(10));
    assert!(overlay.visible_at(std::time::Duration::from_secs(12)));
    assert!(!overlay.visible_at(std::time::Duration::from_secs(13) + std::time::Duration::from_millis(1)));
}
```

- [ ] **Step 2: 실패 확인 후 상태 구현**

Run: `cargo test --manifest-path src-tauri/Cargo.toml overlay`

Expected: `OverlayState` 미정의로 FAIL

- [ ] **Step 3: clickable overlay 구현**

```ts
import { invoke } from "@tauri-apps/api/core";

document.querySelector("[data-action=manager]")?.addEventListener("click", () => {
  void invoke("stop_wall");
});
```

- [ ] **Step 4: Escape와 포인터 감시 구현**

- RUN 직전에 `Code::Escape`를 등록한다.
- stop/destroy에서 즉시 해제한다.
- 등록 실패도 RUN은 유지하고 clickable overlay를 계속 표시한다.
- Rust task가 100ms마다 cursor position을 비교한다.
- 이동 시 overlay show와 cursor visible, 3초 후 overlay hide와 cursor hidden을 적용한다.

- [ ] **Step 5: single-instance 구현**

두 번째 실행 callback에서 `WallController::stop()` 후 manager show/focus를 호출한다.

- [ ] **Step 6: 검증과 커밋**

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
git add src/renderer src-tauri/src package.json package-lock.json
git commit -m "feat: restore manager with escape and overlay"
```

---

### Task 8: Linux GTK 보정과 복구 정책

**Files:**
- Create: `src-tauri/src/platform.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/wall.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `apply_platform_bounds`, `apply_platform_audio`, 1회 재생성 제한

- [ ] **Step 1: 재생성 제한 실패 테스트 작성**

```rust
#[test]
fn recovery_stops_after_one_recreation() {
    let mut recovery = RecoveryState::default();
    assert!(recovery.claim_retry());
    assert!(!recovery.claim_retry());
    recovery.reset();
    assert!(recovery.claim_retry());
}
```

- [ ] **Step 2: 실패 확인 후 복구 상태 구현**

Run: `cargo test --manifest-path src-tauri/Cargo.toml recovery`

Expected: `RecoveryState` 미정의로 FAIL

- [ ] **Step 3: Linux 전용 GTK bounds 보정 구현**

`cfg(target_os = "linux")`에서 parent GTK `Fixed`를 얻어 각 child widget에 `move_`와 `set_size_request`를 적용한다. non-Linux 구현은 Tauri `set_bounds`만 사용한다.

- [ ] **Step 4: Window 이벤트 복구 구현**

- Resized/ScaleFactorChanged/Resumed: layout과 zoom 재적용
- child 배치 실패: 전체 wall 구성 한 번 재생성
- 두 번째 실패: manager에 error 이벤트, 자동 반복 중단

- [ ] **Step 5: Linux CI 스모크 명령 추가**

```bash
GDK_BACKEND=wayland npm run tauri:dev
GDK_BACKEND=x11 npm run tauri:dev
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
```

- [ ] **Step 6: 테스트와 커밋**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git add src-tauri
git commit -m "feat: harden Linux layout and wall recovery"
```

---

### Task 9: Electron 제거, 패키징, 문서

**Files:**
- Delete: `index.js`
- Delete: `src/main/index.js`
- Delete: `src/main/wall-controller.js`
- Delete: `src/main/layout.js`
- Delete: `src/main/config-store.js`
- Delete: `src/preload.js`
- Delete: `src/overlay-preload.js`
- Delete: `test/electron-ui-smoke.js`
- Delete: `test/electron-wall-smoke.js`
- Delete: `test/config-store.test.js`
- Delete: `test/layout.test.js`
- Modify: `readme.md`
- Modify: `.gitignore`
- Modify: `src-tauri/tauri.conf.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: DMG, NSIS, `.deb`용 설정과 세 OS CI

- [ ] **Step 1: Electron 참조 검출 테스트 작성**

Run:

```bash
rg -n 'electron|WebContentsView|capturePage' package.json src test --glob '!*.md'
```

Expected: 기존 Electron 파일과 의존성 검출

- [ ] **Step 2: Electron 파일과 의존성 제거**

- package에서 `electron`, `electron-builder` 제거
- 사용되지 않는 Electron 진입점·preload·smoke 삭제
- `release/`, `dist/`, `src-tauri/target/` ignore

- [ ] **Step 3: 패키징 설정 작성**

- identifier: `com.screenwall.control`
- productName: `Screen Wall Control`
- macOS minimumSystemVersion: `14.0`
- Windows bundle target: `nsis`
- Linux bundle target: `deb`
- manager 초기 크기: 1280×820, 최소 960×760

- [ ] **Step 4: CI 작성**

matrix: `macos-latest`, `windows-latest`, `ubuntu-24.04`

각 runner에서 `npm ci`, `npm test`, `npm run build`, `cargo test`, `npm run tauri:build`를 실행한다. Ubuntu에는 Tauri 공식 WebKitGTK 4.1 빌드 의존성을 설치한다.

- [ ] **Step 5: README 갱신**

- Rust와 OS별 prerequisite
- 개발·테스트·패키징 명령
- 미리보기 제거 설명
- 주 모니터 2×2 출력과 ESC 복귀 설명
- 기존 설정 자동 이전 설명

- [ ] **Step 6: 검출 재실행과 커밋**

```bash
rg -n 'electron|WebContentsView|capturePage' package.json src src-tauri --glob '!*.md' || true
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
git add -A
git commit -m "chore: complete Tauri migration"
```

Expected: Electron 코드 참조 0건, 전체 테스트 성공

---

### Task 10: 최종 검증

**Files:**
- Modify only when a verification failure requires a tested fix

**Interfaces:**
- Verifies all earlier deliverables

- [ ] **Step 1: 정적·단위 검증**

```bash
npm ci
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 실패 0건, warning 0건

- [ ] **Step 2: macOS 패키지와 수동 스모크**

```bash
npm run tauri:build -- --bundles app,dmg
```

검증: 4분할, 확대율, 슬롯 실패 독립성, ESC, overlay click, 설정 재시작 유지

- [ ] **Step 3: 반복 검증 자동화**

- 로컬 테스트 URL 네 개를 제공하는 fixture server를 실행한다.
- RUN/stop command를 100회 반복한다.
- 반복 전후 wall Window와 child webview 수가 각각 1개와 5개를 넘지 않는지 확인한다.

- [ ] **Step 4: 작업 트리 및 커밋 확인**

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean worktree, 기능별 커밋 기록 확인
