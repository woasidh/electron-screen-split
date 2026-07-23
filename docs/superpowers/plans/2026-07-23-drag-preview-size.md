# Drag Preview Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 슬롯 드래그 중 웹 엔진이 표시하는 과대 이미지를 제거함.

**Architecture:** `dragstart`에서 문서에 1×1 투명 캔버스를 추가하고 `DataTransfer.setDragImage()`에 전달함. 드롭 또는 `dragend`에서 임시 캔버스를 제거하며 기존 교환 상태와 카드 강조는 유지함.

**Tech Stack:** TypeScript, DOM Drag Events, Vitest

## Global Constraints

- 기존 `feat/tauri-rewrite` 분리 워크트리에서만 작업함.
- 교환, 렌더 보류, 설정 저장, 출력 웹뷰 코드는 변경하지 않음.
- 추가 런타임 의존성을 사용하지 않음.
- Ubuntu 24.04 WebKitGTK와 Windows 10 WebView2에서 공통 DOM API만 사용함.

---

### Task 1: 투명 네이티브 드래그 이미지

**Files:**
- Modify: `src/renderer/view.ts`
- Test: `src/renderer/view.test.ts`

**Interfaces:**
- Consumes: `DragEvent.dataTransfer`, `DataTransfer.setDragImage(element, x, y)`
- Produces: 드래그 동안만 존재하는 `canvas[data-slot-drag-image]`

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

```ts
const setDragImage = vi.fn();
const dataTransfer = {
  effectAllowed: "none",
  setData: vi.fn(),
  setDragImage,
} as unknown as DataTransfer;
const dragStart = new Event("dragstart", { bubbles: true });
Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });

tile.dispatchEvent(dragStart);

const dragImage = setDragImage.mock.calls[0][0] as HTMLCanvasElement;
expect(dragImage.width).toBe(1);
expect(dragImage.height).toBe(1);
expect(setDragImage).toHaveBeenCalledWith(dragImage, 0, 0);
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- --run src/renderer/view.test.ts`
Expected: `setDragImage` 호출 횟수 0으로 FAIL

- [ ] **Step 3: 최소 구현**

```ts
function installTransparentDragImage(dataTransfer: DataTransfer): void {
  removeTransparentDragImage();
  const dragImage = document.createElement("canvas");
  dragImage.width = 1;
  dragImage.height = 1;
  dragImage.setAttribute("data-slot-drag-image", "");
  dragImage.setAttribute("aria-hidden", "true");
  Object.assign(dragImage.style, {
    position: "fixed",
    left: "0",
    top: "0",
    pointerEvents: "none",
  });
  document.body.append(dragImage);
  dataTransfer.setDragImage(dragImage, 0, 0);
}
```

`dragstart`에서 설치하고 `finishDrag()`에서 제거함.

- [ ] **Step 4: 대상 테스트 통과 확인**

Run: `npm test -- --run src/renderer/view.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 검증**

Run: `npm test -- --run && npm run check && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 모두 exit code 0

- [ ] **Step 6: 커밋 및 원격 푸시**

```bash
git add docs/superpowers/plans/2026-07-23-drag-preview-size.md src/renderer/view.ts src/renderer/view.test.ts
git commit -m "fix: suppress oversized drag preview"
git push origin feat/tauri-rewrite
```
