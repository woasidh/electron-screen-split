const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOGIN_EXTENSION_INTERVAL,
  LOGIN_EXTENSION_SCRIPT,
  shouldExtendLogin,
} = require("../src/main/login-extension");

test("로그인 연장 운영 주기는 1시간이다", () => {
  assert.equal(LOGIN_EXTENSION_INTERVAL, 60 * 60 * 1000);
});

test("사용 중이며 선택된 슬롯만 로그인 연장한다", () => {
  assert.equal(shouldExtendLogin({ enabled: true, loginExtension: true }), true);
  assert.equal(shouldExtendLogin({ enabled: false, loginExtension: true }), false);
  assert.equal(shouldExtendLogin({ enabled: true, loginExtension: false }), false);
});

test("스크립트는 stamp 시간 버튼 하나만 클릭하고 결과를 표시한다", () => {
  assert.match(LOGIN_EXTENSION_SCRIPT, /candidates\.length === 1/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /stamp--normal/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /stamp—normal/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /로그인 연장 버튼 클릭 완료/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /로그인 연장 대상 버튼 없음/);
  assert.match(LOGIN_EXTENSION_SCRIPT, /로그인 연장 대상 버튼 여러 개/);
});
