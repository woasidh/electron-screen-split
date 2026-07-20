const SLOT_COUNT = 4;
const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;

function calculateQuadrants(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new TypeError("width and height must be integers greater than 1");
  }

  const leftWidth = Math.floor(width / 2);
  const rightWidth = width - leftWidth;
  const topHeight = Math.floor(height / 2);
  const bottomHeight = height - topHeight;

  return [
    { x: 0, y: 0, width: leftWidth, height: topHeight },
    { x: leftWidth, y: 0, width: rightWidth, height: topHeight },
    { x: 0, y: topHeight, width: leftWidth, height: bottomHeight },
    { x: leftWidth, y: topHeight, width: rightWidth, height: bottomHeight },
  ];
}

function getOutputInfo(display) {
  const scaleFactor = Number(display.scaleFactor) || 1;
  const logicalWidth = display.bounds.width;
  const logicalHeight = display.bounds.height;
  const physicalWidth = Math.round(logicalWidth * scaleFactor);
  const physicalHeight = Math.round(logicalHeight * scaleFactor);

  return {
    displayId: String(display.id),
    logicalWidth,
    logicalHeight,
    physicalWidth,
    physicalHeight,
    scaleFactor,
    isTargetResolution:
      physicalWidth === TARGET_WIDTH && physicalHeight === TARGET_HEIGHT,
  };
}

module.exports = {
  SLOT_COUNT,
  TARGET_HEIGHT,
  TARGET_WIDTH,
  calculateQuadrants,
  getOutputInfo,
};
