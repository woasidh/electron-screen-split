const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ConfigStore,
  getConfigIssues,
  getDefaultConfig,
  isSafeRemoteUrl,
  normalizeConfig,
} = require("../src/main/config-store");

test("기본 설정은 로그인 연장을 끈 네 개의 활성 슬롯을 제공한다", () => {
  const config = getDefaultConfig();
  assert.equal(config.slots.length, 4);
  assert.equal(config.slots.every((slot) => slot.enabled), true);
  assert.equal(config.slots.every((slot) => slot.loginExtension === false), true);
});

test("설정의 슬롯 수와 확대율 및 로그인 연장을 정규화한다", () => {
  const config = normalizeConfig({
    slots: [
      { enabled: true, url: " https://example.com ", zoom: 8, loginExtension: true },
      { enabled: false, url: "", zoom: 0.1 },
    ],
  });

  assert.equal(config.slots.length, 4);
  assert.deepEqual(config.slots[0], {
    enabled: true,
    url: "https://example.com",
    zoom: 2,
    loginExtension: true,
  });
  assert.equal(config.slots[1].zoom, 0.1);
  assert.equal(config.slots[1].enabled, false);
  assert.equal(config.slots[1].loginExtension, false);
});

test("HTTP와 HTTPS 주소만 원격 화면 URL로 허용한다", () => {
  assert.equal(isSafeRemoteUrl("https://example.com"), true);
  assert.equal(isSafeRemoteUrl("http://localhost:3000"), true);
  assert.equal(isSafeRemoteUrl("file:///etc/passwd"), false);
  assert.equal(isSafeRemoteUrl("javascript:alert(1)"), false);
  assert.equal(isSafeRemoteUrl("not-a-url"), false);
});

test("비활성 슬롯은 빈 URL을 허용하고 활성 슬롯만 검사한다", () => {
  const config = getDefaultConfig();
  config.slots[0].url = "";
  config.slots[1].enabled = false;
  config.slots[1].url = "";

  assert.deepEqual(getConfigIssues(config), [
    { index: 0, message: "화면 1의 URL을 확인해 주세요." },
  ]);
});

test("설정을 JSON 파일에 저장하고 다시 읽는다", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "screen-wall-config-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "nested", "config.json");
  const store = new ConfigStore(filePath);
  const config = getDefaultConfig();
  config.slots[2].zoom = 1.25;
  config.slots[3].enabled = false;

  store.save(config);

  const reloaded = new ConfigStore(filePath).load();
  assert.equal(reloaded.slots[2].zoom, 1.25);
  assert.equal(reloaded.slots[3].enabled, false);
});
