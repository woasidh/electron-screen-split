# Zoom Range Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면별 수동 확대율을 10~200% 범위에서 조절하고 저장할 수 있게 함.

**Architecture:** 관리 UI의 range input과 Rust 설정 정규화가 동일한 범위를 사용하게 변경함. 확대율 저장 형식, 5% 조절 간격, 기본값, 최종 WebView 줌 공식은 유지함.

**Tech Stack:** TypeScript, Vitest, Rust, Tauri 2.11

## Global Constraints

- UI 확대율 범위: 10~200%
- Rust 설정 범위: 0.1~2.0
- 조절 간격: 5%
- 기본 확대율: 100%
- OS 화면 배율을 반영하는 최종 WebView 줌 공식 변경 금지

---

### Task 1: UI 및 저장 범위 확장

**Files:**
- Modify: `src/renderer/view.test.ts`
- Modify: `src/renderer/index.html:93-94`
- Modify: `src-tauri/src/model.rs:84-90`
- Test: `src-tauri/src/model.rs`

**Interfaces:**
- Consumes: UI의 정수 퍼센트와 `SlotConfig.zoom` 비율값
- Produces: UI `10~200`, 설정 `0.1~2.0`

- [ ] **Step 1: 실패하는 UI 범위 테스트 작성**

```ts
test("offers zoom controls from 10 to 200 percent", () => {
  const parsed = new DOMParser().parseFromString(managerMarkup, "text/html");
  const input = parsed.querySelector<HTMLInputElement>("#slot-zoom");
  const labels = Array.from(parsed.querySelectorAll(".range-labels span")).map(
    (label) => label.textContent,
  );

  expect(input?.min).toBe("10");
  expect(input?.max).toBe("200");
  expect(input?.step).toBe("5");
  expect(labels).toEqual(["10%", "200%"]);
});
```

- [ ] **Step 2: 실패하는 Rust 범위 테스트 작성**

```rust
#[test]
fn normalize_clamps_zoom_to_supported_range() {
    let slots = [9.0, -9.0]
        .into_iter()
        .map(|zoom| SlotConfig {
            enabled: true,
            url: "https://example.com".into(),
            zoom,
            login_extension: false,
        })
        .collect();

    let config = AppConfig::normalize(slots);

    assert_eq!(config.slots[0].zoom, 2.0);
    assert_eq!(config.slots[1].zoom, 0.1);
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- view.test.ts`

Expected: 기존 `50`, `150` 때문에 실패

Run: `cargo test --manifest-path src-tauri/Cargo.toml normalize_clamps_zoom_to_supported_range`

Expected: 기존 `1.5`, `0.5` 때문에 실패

- [ ] **Step 4: 최소 구현**

`src/renderer/index.html`:

```html
<input id="slot-zoom" class="range-input" type="range" min="10" max="200" step="5" value="100">
<div class="range-labels" aria-hidden="true"><span>10%</span><span>200%</span></div>
```

`src-tauri/src/model.rs`:

```rust
(zoom.clamp(0.1, 2.0) * 100.0).round() / 100.0
```

- [ ] **Step 5: 전체 검증**

Run: `npm test && npm run check && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 모든 테스트·타입 검사·Clippy·빌드 통과

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/view.test.ts src/renderer/index.html src-tauri/src/model.rs
git commit -m "feat: expand screen zoom range"
```
