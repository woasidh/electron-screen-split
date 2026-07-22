# Screen Wall Control

Tauri 기반 2×2 웹 월 관리자. 주 모니터를 네 영역으로 나눠 서로 격리된 웹페이지를 전체화면 출력함.

## 지원 환경

- macOS 14 이상: arm64, x64
- Windows 10 이상: x64, WebView2
- Ubuntu 24.04: x64, Wayland·X11, WebKitGTK 4.1
- 권장 출력: 3840×2160
- 검증 대상 배율: 100%, 125%, 150%, 200%

## 주요 동작

- URL·확대율·사용 여부 설정, 카드 드래그 위치 교환
- 하나의 native 출력 창 안에 child webview 네 개 배치
- 슬롯별 쿠키·스토리지·세션 분리, 위치 기준 세션 유지
- 원격 웹뷰 Tauri 권한 미부여, 새 창·다운로드 차단
- 원격 페이지 음소거, 실패 슬롯 독립 처리
- `ESC` 또는 우상단 오버레이 클릭으로 관리 화면 복귀
- 입력 3초 후 오버레이·커서 자동 숨김
- 웹 이미지 캡처 및 출력 미리보기 미제공

## 개발 준비

공통: Node.js 22 이상, Rust stable 필요함.

macOS:

```bash
xcode-select --install
rustup component add rustfmt clippy
```

Windows 10:

- Visual Studio Build Tools의 Desktop development with C++ 설치
- Rust MSVC toolchain 및 Node.js 설치
- 설치본은 WebView2 bootstrapper 포함함

Ubuntu 24.04:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential curl file libssl-dev libgtk-3-dev \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev patchelf
```

## 실행 및 검증

```bash
npm ci
npm test
npm run check
npm run tauri:dev
```

운영 순서:

1. 주 모니터 해상도·배율 확인
2. 네 슬롯 설정 후 `RUN` 선택
3. 관리 화면 복귀 시 `ESC` 입력 또는 오버레이 클릭

## 패키징

```bash
# macOS universal DMG
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri:build:mac

# Windows 10 x64 NSIS
rustup target add x86_64-pc-windows-msvc
npm run tauri:build:win

# Ubuntu 24.04 x64 deb
rustup target add x86_64-unknown-linux-gnu
npm run tauri:build:linux
```

배포 서명·공증은 별도 인증서 설정 필요함.

## 설정과 이전

- 현재 설정: Tauri app config 경로의 `config.json`
- 최초 실행 시 기존 Electron `Screen Wall Control/config.json` 탐색·복사
- 기존 파일 삭제하지 않음
- 손상된 설정은 기본값으로 복구하고 관리 화면에 경고 표시
- 저장 시 임시 파일과 원자 교체 사용

## Ubuntu 참고

- Tauri 기본 `GtkBox`의 child WebView를 전용 GTK `Fixed`로 재부모화한 뒤 위치·크기 적용함
- 출력 재배치 실패 시 전체 구성을 한 번만 재생성함
- NVIDIA에서 빈 화면 발생 시 아래 fallback으로 실행 후 확인함

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
```

## 구조

```text
src/renderer/        관리 UI, 오버레이, TypeScript 테스트
src-tauri/src/       설정, 레이아웃, command, wall, 플랫폼 보정
src-tauri/capabilities/
                     로컬 manager만 허용하는 capability
.github/workflows/   macOS·Windows·Ubuntu 빌드 및 패키징
```
