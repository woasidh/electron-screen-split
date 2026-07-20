# Screen Wall Control

3840×2160 입력을 2×2로 분할하는 비디오월 컨트롤러용 Electron 관리 앱.

## 주요 기능

- 관리 화면에서 URL·확대율·사용 여부 설정
- 2×2 미리보기 화면을 드래그해 위치 교환
- 실제 웹페이지 렌더링 기반 썸네일 미리보기
- 관리 화면 미리보기 5초 자동 갱신
- 설정 자동 저장
- 3840×2160 출력 상태 확인 및 비표준 해상도 경고
- OS 화면 배율을 자동 보정해 물리 픽셀 기준으로 웹페이지 출력
- `RUN` 실행 시 관리 UI 없이 웹페이지 네 개만 전체화면 출력
- 마우스 이동 시 고대비 검정 블러 배경의 `ESC 관리 화면` 안내 표시
- 3초 동안 입력이 없으면 컨트롤과 마우스 커서 자동 숨김
- `ESC` 전역 단축키와 전체화면 상태 감지로 즉시 관리 화면 복귀
- `CommandOrControl+Shift+M` 관리 화면 복귀 예비 단축키
- Windows/macOS 지원

## 실행

요구사항: Node.js 18 이상

```bash
npm install
npm start
```

실행 순서:

1. 운영체제 출력 해상도를 3840×2160으로 설정
2. 네 화면의 URL과 확대율 확인
3. 필요하면 미리보기 화면을 드래그해 위치 교환
4. 5초마다 자동 갱신되는 실제 렌더링 확인
5. `RUN` 실행
6. 관리 화면 복귀 시 `ESC` 입력

실행 화면에서 마우스를 움직이면 `ESC 관리 화면` 안내가 표시되고 3초 후 자동으로 숨겨짐. 안내 위에 마우스를 올린 동안은 숨김이 정지함. `Ctrl+Shift+M` 또는 `Cmd+Shift+M`은 `ESC`가 전달되지 않는 예외 상황용 단축키임.

설정은 Electron의 OS별 `userData/config.json` 경로에 자동 저장됨.

## 검증

```bash
npm test
npm run check
npm run smoke
npm run smoke:wall
```

- `npm test`: 설정 검증과 화면 배치 단위 테스트
- `npm run smoke`: 실제 Electron 관리 UI, 드래그 교환, RUN 호출 테스트
- `npm run smoke:wall`: `WebContentsView` 네 개의 로딩·썸네일·분할 영역 테스트

## 패키징

```bash
# 현재 OS용 unpacked 앱
npm run pack

# macOS DMG
npm run dist:mac

# Windows NSIS 설치 파일
npm run dist:win
```

운영 배포 시 macOS는 Apple Developer 서명·공증, Windows는 코드 서명 인증서 적용 권장.

## 구조

```text
index.js
src/
  main/
    index.js             앱 진입·IPC·창 생명주기
    wall-controller.js   출력창·웹페이지·미리보기 관리
    config-store.js      설정 저장·검증
    layout.js            2×2 좌표·출력 해상도 계산
  renderer/
    index.html           관리 화면
    app.js               관리 UI 동작
    styles.css           관리 UI 스타일
    wall.html            전체화면 출력 배경
    overlay.*            실행 화면 ESC 안내 오버레이
  preload.js             안전한 IPC 브리지
  overlay-preload.js     실행 화면 오버레이 IPC 브리지
test/
```
