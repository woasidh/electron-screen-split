const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateQuadrants,
  getOutputInfo,
} = require("../src/main/layout");

test("3840x2160 화면을 1920x1080 네 영역으로 나눈다", () => {
  assert.deepEqual(calculateQuadrants(3840, 2160), [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
    { x: 0, y: 1080, width: 1920, height: 1080 },
    { x: 1920, y: 1080, width: 1920, height: 1080 },
  ]);
});

test("홀수 크기에서도 빈 픽셀 없이 전체 영역을 채운다", () => {
  const bounds = calculateQuadrants(101, 51);
  assert.equal(bounds[0].width + bounds[1].width, 101);
  assert.equal(bounds[0].height + bounds[2].height, 51);
  assert.deepEqual(bounds[3], { x: 50, y: 25, width: 51, height: 26 });
});

test("논리 해상도와 배율로 물리 출력 해상도를 계산한다", () => {
  const output = getOutputInfo({
    id: 7,
    bounds: { width: 1920, height: 1080 },
    scaleFactor: 2,
  });

  assert.equal(output.physicalWidth, 3840);
  assert.equal(output.physicalHeight, 2160);
  assert.equal(output.isTargetResolution, true);
});

test("유효하지 않은 화면 크기를 거부한다", () => {
  assert.throws(() => calculateQuadrants(1, 1080), TypeError);
  assert.throws(() => calculateQuadrants(1920.5, 1080), TypeError);
});
