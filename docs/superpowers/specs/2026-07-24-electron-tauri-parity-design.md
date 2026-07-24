# Electron 마이그레이션 이후 기능 동기화 설계

## 목표

Tauri 마이그레이션 완료 커밋 `64a98d2` 이후 추가된 공통 기능과 버그 수정을 Electron 기반 `master`에도 동일한 사용자 동작으로 이식함.

## 작업 방식

- `master`의 사용자 변경을 보호하기 위해 `codex/electron-parity` worktree에서 구현함
- Electron의 기존 미리보기 기능과 Windows/macOS 지원 구조는 유지함
- Tauri API를 그대로 복사하지 않고 Electron `WebContentsView`·`webContents`에 맞게 같은 동작을 구현함
- 전체 검증 완료 후 `master`에 fast-forward 가능한 커밋으로 제공하고 원격 `master`에 반영함

## 이식 범위

### 로그인 연장

- 슬롯 설정에 `loginExtension: boolean` 추가, 기본값 `false`
- 기존 설정 파일에 필드가 없으면 `false`로 마이그레이션
- 관리 화면에 슬롯별 `로그인 연장` 스위치 추가
- 카드 교환 시 URL·확대율·사용 상태와 함께 이동
- RUN 이후 1시간 뒤 첫 실행, 이후 1시간마다 반복
- 사용 중이며 로그인 연장을 선택한 출력 WebContentsView만 실행
- STOP·창 종료·앱 종료 시 타이머 취소
- 중복 RUN으로 타이머를 중복 생성하지 않음
- 버튼 선택 조건:
  - `button.stamp.stamp--normal` 또는 `button.stamp.stamp—normal`
  - 텍스트 `HH:mm:ss`
  - 화면에 표시되고 활성 상태
  - 후보가 정확히 한 개
- 정확히 한 개를 찾고 `click()`이 예외 없이 끝나면 성공
- 후보 없음·여러 개·클릭 예외는 실패
- 성공은 초록색, 실패는 빨간색 우측 상단 알림을 5초간 표시
- 선택자 발견·클릭 완료·실패 결과를 페이지 콘솔에 기록
- 서버 응답이나 시간 변경 여부는 검사하지 않으며 재시도하지 않음

### 확대율 범위

- 관리 UI 범위 `10~200%`
- 조절 간격 `5%`, 기본값 `100%`
- 설정 정규화 범위 `0.1~2.0`
- 기존 OS 화면 배율 보정 공식 유지

### 카드 드래그 안정화

- 미리보기·상태 이벤트가 도착해도 드래그 중 카드 DOM을 교체하지 않음
- 드래그 원본 인덱스를 재렌더링에 영향받지 않는 컨테이너 상태로 유지
- drop·dragend에서 상태와 스타일을 정리
- URL·확대율·사용 상태·로그인 연장·미리보기·상태를 함께 교환

### 드래그 이미지

- 브라우저 기본 대형 카드 캡처 대신 `180×72` canvas 사용
- 화면 번호·위치·URL 표시
- 포인터 중앙 오프셋 `90×36`
- dragend·drop에서 canvas 제거

### ESC 시각 알림 제거

- 실행 화면의 `ESC 관리 화면` overlay WebContentsView 제거
- overlay HTML·CSS·preload·renderer 파일 제거
- 마우스 이동에 따른 overlay 표시와 커서 자동 숨김 제거
- 전역 ESC, 출력 WebContentsView의 ESC 입력, 전체화면 이탈 복귀는 유지

## Tauri 전용 변경 처리

| Tauri 변경 | Electron 처리 |
|---|---|
| Ubuntu GTK child WebView 재배치 | Electron master가 Windows/macOS 대상이므로 제외 |
| Tauri `dragDropEnabled: false` | Electron에는 해당 네이티브 핸들러 설정이 없어 제외 |
| Tauri manager 종료 시 Rust controller 정리 | Electron `before-quit`의 `destroy()`가 이미 동일 역할 수행 |
| Tauri 4-WebView 생성 복구 | Electron 기존 WebContentsView 생명주기 유지 |

## 기존 Electron 기능 유지

- 4개 실제 페이지 미리보기와 5초 자동 갱신
- 2×2 출력 및 해상도 경고
- 슬롯별 세션 분리
- 원격 페이지 권한·새 창·다운로드 차단
- OS 화면 배율 보정
- Windows/macOS 패키징

## 검증

- 설정 단위 테스트:
  - `loginExtension` 기본값·저장·구설정 마이그레이션
  - 확대율 `0.1~2.0` 정규화
- 관리 UI smoke:
  - 로그인 연장 스위치와 `10~200%` 슬라이더
  - 드래그 중 갱신 안정성
  - `180×72` drag image
  - 슬롯 교환 시 전체 설정 이동
- 출력 smoke:
  - 로그인 연장 대상 필터링
  - 첫 실행 전 대기·시간당 반복·STOP 취소
  - 선택자 성공·없음·중복·클릭 예외 알림과 로그
  - overlay WebContentsView가 없고 ESC 복귀가 유지됨
- `npm test`, `npm run check`, `npm run smoke`, `npm run smoke:wall`, 패키징 전 구문 검사 실행

## 완료 기준

- Tauri 마이그레이션 이후 추가된 공통 사용자 동작이 Electron에서도 동일함
- 로그인 연장은 운영 주기 1시간으로 동작함
- 확대율은 10~200%로 저장·출력됨
- 카드 드래그가 이벤트 갱신 중에도 유지되고 작은 drag image를 사용함
- ESC 시각 알림은 없고 ESC 복귀는 유지됨
- Electron 미리보기와 기존 출력 기능에 회귀 없음
- 사용자 `회의록.md` 변경이 보존됨
