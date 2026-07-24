# Windows 카드 드래그 활성화 설계

## 목표

Windows WebView2에서 화면 카드의 HTML5 드래그 앤 드롭이 금지 커서와 함께 차단되는 문제를 해결함.

## 원인

Tauri manager WebView의 `dragDropEnabled`가 기본값 `true`로 동작해 네이티브 파일 드롭 핸들러가 활성화됨. Tauri는 Windows에서 HTML5 드래그 앤 드롭을 사용하려면 해당 핸들러를 비활성화해야 한다고 명시함.

## 변경

- manager 창 설정에 `dragDropEnabled: false` 추가
- 기존 카드 드래그, 위치 교환, 드래그 이미지 로직 유지
- 출력용 WebView 생성 로직 변경 없음

## 검증

- 설정 회귀 테스트에서 manager 창의 `dragDropEnabled`가 `false`인지 확인
- Renderer 테스트, TypeScript 검사, Rust 검사, 프로덕션 빌드 실행
- Windows 실기기 최종 드래그 확인은 배포본에서 수행
