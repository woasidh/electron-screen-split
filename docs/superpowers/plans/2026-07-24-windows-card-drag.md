# Windows Card Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows WebView2에서 화면 카드의 HTML5 드래그 앤 드롭을 정상화함.

**Architecture:** manager WebView의 Tauri 네이티브 파일 드롭 핸들러만 설정으로 비활성화함. 기존 Renderer 카드 교환 로직과 출력 WebView는 변경하지 않음.

**Tech Stack:** Tauri 2.11, TypeScript, Vitest

## Global Constraints

- manager 창에만 `dragDropEnabled: false` 적용
- 기존 카드 드래그·위치 교환·드래그 이미지 로직 유지
- 출력 WebView 생성 로직 변경 금지

---

### Task 1: Windows HTML5 드래그 허용

**Files:**
- Create: `src/renderer/tauri-config.test.ts`
- Modify: `src-tauri/tauri.conf.json:17-26`

**Interfaces:**
- Consumes: Tauri `WindowConfig.dragDropEnabled`
- Produces: manager WebView의 비활성화된 네이티브 드롭 핸들러

- [ ] **Step 1: 설정 회귀 테스트 작성**

```ts
import { expect, test } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

test("disables Tauri native drag-drop so Windows can use HTML5 card dragging", () => {
  const manager = tauriConfig.app.windows.find((window) => window.label === "manager");

  expect(manager?.dragDropEnabled).toBe(false);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tauri-config.test.ts`

Expected: `dragDropEnabled`가 없으므로 `expected undefined to be false`로 실패

- [ ] **Step 3: 최소 설정 추가**

`src-tauri/tauri.conf.json`의 manager 창 설정:

```json
"dragDropEnabled": false,
```

- [ ] **Step 4: 회귀 및 전체 검증**

Run: `npm test -- tauri-config.test.ts`

Expected: 1개 테스트 통과

Run: `npm test && npm run check && npm run build`

Expected: 모든 테스트·TypeScript·Rust 검사·프로덕션 빌드 통과

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/tauri-config.test.ts src-tauri/tauri.conf.json
git commit -m "fix: enable Windows card dragging"
```
