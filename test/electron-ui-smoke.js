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
    shortcut: "CommandOrControl+Shift+M",
  }));
  ipcMain.handle("config:save", (_event, config) => config);
  ipcMain.handle("preview:refresh", () => Array.from({ length: 4 }, () => null));
  ipcMain.handle("slot:reload", () => true);
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
      runLabel: document.querySelector('#run-wall')?.textContent.trim(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      runBounds: document.querySelector('#run-wall')?.getBoundingClientRect().toJSON(),
      refreshBounds: document.querySelector('#refresh-preview')?.getBoundingClientRect().toJSON(),
      reloadBounds: document.querySelector('#reload-selected')?.getBoundingClientRect().toJSON()
    })`);

    assert.equal(initial.tileCount, 4);
    assert.equal(initial.hasDragGuide, true);
    assert.equal(initial.hasPositionButtons, false);
    assert.equal(initial.outputResolution, "3840 × 2160");
    assert.equal(initial.runLabel, "RUN");
    assert.ok(initial.runBounds.right <= initial.viewport.width);
    assert.ok(initial.runBounds.bottom <= initial.viewport.height);
    assert.ok(initial.refreshBounds.right <= initial.viewport.width);
    assert.ok(initial.refreshBounds.bottom <= initial.viewport.height);

    const dragResult = await window.webContents.executeJavaScript(`(() => {
      const tiles = document.querySelectorAll('.screen-tile');
      const sourceUrl = tiles[0].querySelector('.tile-url').textContent;
      const targetUrl = tiles[3].querySelector('.tile-url').textContent;
      const transfer = new DataTransfer();
      tiles[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      tiles[3].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      tiles[3].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const nextTiles = document.querySelectorAll('.screen-tile');
      return {
        sourceUrl,
        targetUrl,
        nextSourceUrl: nextTiles[0].querySelector('.tile-url').textContent,
        nextTargetUrl: nextTiles[3].querySelector('.tile-url').textContent
      };
    })()`);

    assert.equal(dragResult.nextSourceUrl, dragResult.targetUrl);
    assert.equal(dragResult.nextTargetUrl, dragResult.sourceUrl);

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
