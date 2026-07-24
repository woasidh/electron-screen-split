const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { app, BrowserWindow, ipcMain } = require("electron");

const { getDefaultConfig } = require("../src/main/config-store");

const screenshotPath = process.env.SMOKE_SCREENSHOT_PATH || "/tmp/screen-wall-control-smoke.png";
let runCount = 0;

function registerMockIpc() {
  ipcMain.handle("app:get-initial-state", () => ({
    config: getDefaultConfig(),
    output: {
      displayId: "smoke",
      logicalWidth: 3840,
      logicalHeight: 2160,
      physicalWidth: 3840,
      physicalHeight: 2160,
      scaleFactor: 1,
      isTargetResolution: true,
    },
    previews: Array.from({ length: 4 }, () => null),
    statuses: Array.from({ length: 4 }, (_, index) => ({
      index,
      state: "ready",
      message: "",
    })),
    shortcut: "ESC",
  }));
  ipcMain.handle("config:save", (_event, config) => config);
  ipcMain.handle("wall:run", () => {
    runCount += 1;
    return true;
  });
  ipcMain.handle("wall:stop", () => true);
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

app.whenReady().then(async () => {
  registerMockIpc();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: "#101114",
    webPreferences: {
      preload: path.join(__dirname, "../src/preload.js"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "../src/renderer/index.html"));
    await wait(350);

    const initial = await window.webContents.executeJavaScript(`({
      tileCount: document.querySelectorAll('.screen-tile').length,
      hasDragGuide: document.querySelector('.drag-guide')?.textContent.includes('끌어 놓으면'),
      hasPositionButtons: document.body.innerText.includes('위치 교환'),
      outputResolution: document.querySelector('#output-resolution')?.textContent,
      shortcutHint: document.querySelector('#shortcut-hint')?.textContent.trim(),
      runLabel: document.querySelector('#run-wall')?.textContent.trim(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      runBounds: document.querySelector('#run-wall')?.getBoundingClientRect().toJSON(),
      autoRefreshLabel: document.querySelector('#preview-state')?.textContent,
      hasManualRefreshButtons: document.body.innerText.includes('새로고침') || document.body.innerText.includes('미리보기 갱신'),
      hasSavedMessage: document.body.innerText.includes('모든 변경사항 저장됨'),
      hasLoginExtension: Boolean(document.querySelector('#slot-login-extension')),
      zoomRange: {
        min: document.querySelector('#slot-zoom')?.min,
        max: document.querySelector('#slot-zoom')?.max,
        step: document.querySelector('#slot-zoom')?.step
      }
    })`);

    assert.equal(initial.tileCount, 4);
    assert.equal(initial.hasDragGuide, true);
    assert.equal(initial.hasPositionButtons, false);
    assert.equal(initial.outputResolution, "3840 × 2160");
    assert.equal(initial.shortcutHint, "실행 중 ESC로 관리 화면 복귀");
    assert.equal(initial.runLabel, "RUN");
    assert.equal(initial.autoRefreshLabel, "5초 자동 갱신");
    assert.equal(initial.hasManualRefreshButtons, false);
    assert.equal(initial.hasSavedMessage, false);
    assert.equal(initial.hasLoginExtension, true);
    assert.deepEqual(initial.zoomRange, { min: "10", max: "200", step: "5" });
    assert.ok(initial.runBounds.right <= initial.viewport.width);
    assert.ok(initial.runBounds.bottom <= initial.viewport.height);

    const dragImage = await window.webContents.executeJavaScript(`(() => {
      const original = DataTransfer.prototype.setDragImage;
      let observed = null;
      DataTransfer.prototype.setDragImage = (element, x, y) => {
        observed = { width: element.width, height: element.height, x, y };
      };
      const tile = document.querySelectorAll('.screen-tile')[0];
      const transfer = new DataTransfer();
      tile.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      tile.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
      DataTransfer.prototype.setDragImage = original;
      return observed;
    })()`);

    assert.deepEqual(dragImage, { width: 180, height: 72, x: 90, y: 36 });

    await window.webContents.executeJavaScript(`(() => {
      document.querySelector('#slot-login-extension').click();
      const tiles = document.querySelectorAll('.screen-tile');
      const transfer = new DataTransfer();
      tiles[0].dataset.dragIdentity = 'source-kept';
      window.__testDragTransfer = transfer;
      window.__sourceUrl = tiles[0].querySelector('.tile-url').textContent;
      window.__targetUrl = tiles[3].querySelector('.tile-url').textContent;
      tiles[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    })()`);

    window.webContents.send("preview:updated", {
      index: 0,
      dataUrl: null,
      capturedAt: Date.now(),
    });
    await wait(50);

    const sourceKept = await window.webContents.executeJavaScript(
      `document.querySelectorAll('.screen-tile')[0]?.dataset.dragIdentity === 'source-kept'`,
    );
    assert.equal(sourceKept, true);

    const dragResult = await window.webContents.executeJavaScript(`(() => {
      const tiles = document.querySelectorAll('.screen-tile');
      const transfer = window.__testDragTransfer;
      tiles[3].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      tiles[3].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const nextTiles = document.querySelectorAll('.screen-tile');
      return {
        sourceUrl: window.__sourceUrl,
        targetUrl: window.__targetUrl,
        nextSourceUrl: nextTiles[0].querySelector('.tile-url').textContent,
        nextTargetUrl: nextTiles[3].querySelector('.tile-url').textContent,
        targetMeta: nextTiles[3].querySelector('.tile-meta').textContent
      };
    })()`);

    assert.equal(dragResult.nextSourceUrl, dragResult.targetUrl);
    assert.equal(dragResult.nextTargetUrl, dragResult.sourceUrl);
    assert.match(dragResult.targetMeta, /로그인 연장/);

    await window.webContents.executeJavaScript("document.querySelector('#run-wall').click()");
    await wait(50);
    assert.equal(runCount, 1);

    await window.webContents.executeJavaScript("document.querySelector('#toast').hidden = true");

    const image = await window.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());

    console.log(
      JSON.stringify({
        status: "ok",
        screenshotPath,
        tileCount: initial.tileCount,
        dragSwap: true,
        runInvoked: true,
        controlsInViewport: true,
      }),
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
