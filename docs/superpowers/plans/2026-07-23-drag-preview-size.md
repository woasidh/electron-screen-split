# Visible Drag Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 슬롯 드래그 중 작고 읽을 수 있는 고정 크기 미리보기를 표시함.

**Architecture:** `dragstart`에서 180×72 캔버스에 화면 번호, 위치, URL을 그려 `DataTransfer.setDragImage()`에 전달함. 포인터는 캔버스 중앙에 두고, 드롭 또는 `dragend`에서 임시 캔버스를 제거함.

**Tech Stack:** TypeScript, DOM Drag Events, Vitest

## Global Constraints

- 기존 `feat/tauri-rewrite` 분리 워크트리에서만 작업함.
- 교환, 렌더 보류, 설정 저장, 출력 웹뷰 코드는 변경하지 않음.
- 추가 런타임 의존성을 사용하지 않음.
- Ubuntu 24.04 WebKitGTK와 Windows 10 WebView2에서 공통 DOM API만 사용함.

---

### Task 1: 작은 가시형 네이티브 드래그 이미지

**Files:**
- Modify: `src/renderer/view.ts`
- Test: `src/renderer/view.test.ts`

**Interfaces:**
- Consumes: `DragEvent.dataTransfer`, `DataTransfer.setDragImage(element, x, y)`
- Produces: 드래그 동안만 존재하는 180×72 `canvas[data-slot-drag-image]`

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

```ts
const setDragImage = vi.fn();
const fillText = vi.fn();
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText,
} as unknown as CanvasRenderingContext2D);
const dataTransfer = {
  effectAllowed: "none",
  setData: vi.fn(),
  setDragImage,
} as unknown as DataTransfer;
const dragStart = new Event("dragstart", { bubbles: true });
Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });

tile.dispatchEvent(dragStart);

const dragImage = setDragImage.mock.calls[0][0] as HTMLCanvasElement;
expect(dragImage.width).toBe(180);
expect(dragImage.height).toBe(72);
expect(setDragImage).toHaveBeenCalledWith(dragImage, 90, 36);
expect(fillText).toHaveBeenCalledWith("화면 1 · 좌상", 12, 27, 156);
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- --run src/renderer/view.test.ts`
Expected: 캔버스 너비가 1이므로 180 기대값에서 FAIL

- [ ] **Step 3: 최소 구현**

```ts
function installDragImage(dataTransfer: DataTransfer, index: number, url: string): void {
  removeDragImage();
  const dragImage = document.createElement("canvas");
  dragImage.width = 180;
  dragImage.height = 72;
  dragImage.setAttribute("data-slot-drag-image", "");
  dragImage.setAttribute("aria-hidden", "true");
  const context = dragImage.getContext("2d");
  if (context) {
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
    context.fillText(url, 12, 51, 156);
  }
  document.body.append(dragImage);
  dataTransfer.setDragImage(dragImage, 90, 36);
}
```

`dragstart`에서 슬롯 인덱스와 URL을 전달하고 `finishDrag()`에서 제거함.

- [ ] **Step 4: 대상 테스트 통과 확인**

Run: `npm test -- --run src/renderer/view.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 검증**

Run: `npm test -- --run && npm run check && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 모두 exit code 0

- [ ] **Step 6: 커밋 및 원격 푸시**

```bash
git add docs/superpowers/plans/2026-07-23-drag-preview-size.md src/renderer/view.ts src/renderer/view.test.ts
git commit -m "fix: show compact drag preview"
git push origin feat/tauri-rewrite
```
