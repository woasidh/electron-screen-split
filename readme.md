# Screen Wall Control

3840×2160 입력을 2×2로 분할하는 비디오월 컨트롤러용 Electron 관리 앱.

## 주요 기능

- 관리 화면에서 URL·확대율·사용 여부 설정
- 2×2 미리보기 화면을 드래그해 위치 교환
- 실제 웹페이지 렌더링 기반 썸네일 미리보기
- 설정 자동 저장
- 3840×2160 출력 상태 확인 및 비표준 해상도 경고
- `RUN` 실행 시 관리 UI 없이 웹페이지 네 개만 전체화면 출력
- `CommandOrControl+Shift+M`으로 관리 화면 복귀
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
4. `미리보기 갱신`으로 실제 렌더링 확인
5. `RUN` 실행
6. 관리 화면 복귀 시 `Ctrl+Shift+M` 또는 `Cmd+Shift+M` 입력

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
  preload.js             안전한 IPC 브리지
test/
```
