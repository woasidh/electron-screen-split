# Remove ESC Overlay Design

## 목표

- Windows와 Ubuntu에서 ESC 시각 안내를 표시하지 않음.
- ESC 전역 단축키를 통한 관리 화면 복귀 기능은 유지함.
- 로그인 연장 selector 탐색과 click 호출 결과만 우측 상단에 표시함.

## ESC 처리

- `wall-overlay` child webview를 생성하지 않음.
- 마우스 좌표 polling과 overlay show/hide 스레드를 제거함.
- overlay 전용 renderer HTML, CSS, TypeScript, 테스트, Vite entry를 제거함.
- overlay 전용 `stop_wall` 권한 예외를 제거함.
- ESC 전역 단축키 등록과 `restore_manager` 경로는 유지함.
- 마우스 좌표 polling 제거에 따라 출력 중 커서는 기본 표시 상태를 유지함.
- 동작을 플랫폼별로 나누지 않고 macOS를 포함한 모든 플랫폼에서 동일하게 적용함.

## 로그인 결과 알림

- success 조건은 selector 후보가 정확히 하나이고 `click()`이 예외 없이 반환되는 경우임.
- fail 조건은 후보가 0개, 2개 이상 또는 `click()` 예외가 발생한 경우임.
- success는 초록색, fail은 빨간색으로 각 대상 웹뷰 우측 상단에 5초간 표시함.
- 실제 서버 응답이나 로그인 만료 시간 변화는 검증하지 않음.
- console 발견·완료·실패 로그를 유지함.

## 정리 범위

- `WallController`의 overlay, pointer cancel 상태와 관련 lifecycle 처리를 제거함.
- `OverlayState`, `ensure_overlay`, `start_pointer_monitor`를 제거함.
- `wall-overlay` command authorization을 제거함.
- `overlay.html`, `overlay.css`, `overlay.ts`, `overlay.test.ts`를 삭제함.
- Vite multi-page input에서 overlay entry를 제거함.

## 검증

- `wall-overlay`가 `stop_wall` 권한을 갖지 않는지 Rust 테스트함.
- Vite build input에 overlay entry가 없는지 테스트함.
- success 알림의 우측 상단 위치와 초록색을 DOM 테스트함.
- fail 알림의 우측 상단 위치와 빨간색을 DOM 테스트함.
- 전체 TypeScript·Rust 테스트, 타입 검사, Clippy, production build를 실행함.
- 빌드 산출물과 소스에 ESC overlay entry가 남아 있지 않은지 확인함.
- 최신 Tauri 앱을 재실행하고 원격 feature 브랜치만 갱신함.
