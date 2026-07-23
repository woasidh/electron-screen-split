# Drag Preview Size Design

## 문제

- 슬롯 카드는 2×2 그리드의 절반 크기를 채움.
- 현재 `dragstart`에서 `DataTransfer.setDragImage()`를 호출하지 않아 웹 엔진이 카드 전체를 기본 드래그 이미지로 캡처함.
- Ubuntu WebKitGTK의 배율 처리와 결합되면 포인터를 따라오는 이미지가 창처럼 크게 보임.

## 결정

- `dragstart`에서 1×1 투명 캔버스를 네이티브 드래그 이미지로 지정함.
- 캔버스는 드래그 시작 시 문서에 추가하고 드롭 또는 `dragend`에서 제거함.
- 원본 카드의 `is-dragging` 반투명 표시와 대상 카드의 `is-drop-target` 테두리는 유지함.

## 범위

- `src/renderer/view.ts`의 드래그 이미지 처리만 변경함.
- 교환, 렌더 보류, 설정 저장, 출력 웹뷰 코드는 변경하지 않음.
- 추가 런타임 의존성을 사용하지 않음.

## 검증

- 실제 `dragstart` 이벤트에 모의 `DataTransfer`를 연결해 `setDragImage()` 인자를 검사함.
- 지정 이미지가 1×1 투명 캔버스인지 확인함.
- `dragend` 후 임시 캔버스가 제거되는지 확인함.
- 전체 프런트엔드 테스트, 타입 검사, 빌드, Rust 테스트를 실행함.
