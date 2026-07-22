# Drag Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상태 갱신과 겹쳐도 Tauri 슬롯 카드 드래그 교환이 안정적으로 완료되게 함.

**Architecture:** 드래그 원본은 슬롯 그리드 컨테이너에 보관해 카드 DOM 수명과 분리함. 작은 렌더 게이트가 드래그 중 슬롯 그리드 교체를 보류하고 종료 시 대기 중인 렌더를 한 번 실행함.

**Tech Stack:** TypeScript, DOM Drag Events, Vitest, Tauri 2

## Global Constraints

- 기존 `feat/tauri-rewrite` 분리 워크트리에서만 작업함.
- 기존 Electron 앱과 출력 웹뷰 네이티브 배치 코드는 변경하지 않음.
- 새 런타임 의존성을 추가하지 않음.

---

### Task 1: 드래그 상태 수명 수정

**Files:**
- Modify: `src/renderer/view.ts`
- Test: `src/renderer/view.test.ts`

**Interfaces:**
- Consumes: 기존 `renderSlotCards(container, config, statuses, selectedIndex, actions)`
- Produces: `SlotCardActions.onDragStateChange?(active: boolean): void`

- [ ] **Step 1: 재렌더링 중 드래그 원본 유지 실패 테스트 작성**

```ts
const onSwap = vi.fn();
renderSlotCards(container, config, statuses, 0, { onSwap });
tiles()[0].dispatchEvent(new Event("dragstart", { bubbles: true }));
renderSlotCards(container, config, statuses, 0, { onSwap });
tiles()[1].dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
expect(onSwap).toHaveBeenCalledWith(0, 1);
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run src/renderer/view.test.ts`
Expected: `onSwap` 호출 누락으로 FAIL

- [ ] **Step 3: 컨테이너 기반 드래그 상태 구현**

```ts
container.dataset.draggedIndex = String(index);
actions.onDragStateChange?.(true);
```

드롭 또는 드래그 종료 시 데이터 속성을 제거하고 `onDragStateChange(false)`를 호출함.

- [ ] **Step 4: 대상 테스트 통과 확인**

Run: `npm test -- --run src/renderer/view.test.ts`
Expected: PASS

### Task 2: 드래그 중 슬롯 그리드 재렌더링 보류

**Files:**
- Create: `src/renderer/render-gate.ts`
- Create: `src/renderer/render-gate.test.ts`
- Modify: `src/renderer/app.ts`

**Interfaces:**
- Produces: `createRenderGate(render: () => void)`
- Produces: `{ request(): void; setBlocked(blocked: boolean): void }`

- [ ] **Step 1: 렌더 게이트 실패 테스트 작성**

```ts
const render = vi.fn();
const gate = createRenderGate(render);
gate.setBlocked(true);
gate.request();
gate.request();
expect(render).not.toHaveBeenCalled();
gate.setBlocked(false);
expect(render).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run src/renderer/render-gate.test.ts`
Expected: 모듈 미구현으로 FAIL

- [ ] **Step 3: 최소 렌더 게이트와 앱 연결 구현**

```ts
const slotGridRenderGate = createRenderGate(renderSlotGrid);
```

`renderAll()`은 `request()`를 사용하고 슬롯 카드의 `onDragStateChange`는 `setBlocked()`에 연결함.

- [ ] **Step 4: 전체 정적 검증 실행**

Run: `npm test -- --run && npm run check && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 모두 exit code 0

- [ ] **Step 5: 실제 앱 드래그 확인 후 커밋/푸시**

실행 중인 이전 Electron 앱을 종료하고 Tauri 관리 화면에서 서로 다른 URL 카드 위치를 교환한 뒤 원복함.

```bash
git add docs/superpowers src/renderer
git commit -m "fix: stabilize slot dragging during updates"
git push origin feat/tauri-rewrite
```
