const assert = require("node:assert/strict");
const http = require("node:http");

const { app } = require("electron");

const { PREVIEW_REFRESH_INTERVAL, WallController } = require("../src/main/wall-controller");

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createServer() {
  const server = http.createServer((request, response) => {
    const index = new URL(request.url, "http://127.0.0.1").searchParams.get("screen") || "1";
    const testCases = {
      1: `<button class="stamp stamp--normal" onclick="window.loginClicks += 1">23:35:32</button>`,
      2: "<p>NO LOGIN BUTTON</p>",
      3: `<div>
        <button class="stamp stamp--normal">23:35:32</button>
        <button class="stamp stamp—normal">23:35:33</button>
      </div>`,
      4: `<button id="throwing-login-button" class="stamp stamp--normal">23:35:32</button>
        <script>
          document.getElementById("throwing-login-button").click = () => {
            throw new Error("smoke click failure");
          };
        </script>`,
    };
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><body style="margin:0;display:grid;place-items:center;width:100vw;height:100vh;background:#1f2937;color:white;font:32px sans-serif">
        <script>window.loginClicks = 0;</script>
        <main>SCREEN ${index}${testCases[index]}</main>
      </body></html>`);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

app.whenReady().then(async () => {
  const server = await createServer();
  const { port } = server.address();
  const statuses = [];
  let managerRequests = 0;
  const controller = new WallController({
    onManagerShortcut: () => {
      managerRequests += 1;
    },
    onPreview: () => {},
    onStatus: (status) => statuses.push(status),
    loginExtensionInterval: 50,
  });

  try {
    const config = {
      version: 1,
      slots: Array.from({ length: 4 }, (_, index) => ({
        enabled: true,
        loginExtension: true,
        url: `http://127.0.0.1:${port}/?screen=${index + 1}`,
        zoom: 1 + index * 0.1,
      })),
    };

    await controller.applyConfig(config, { forceReload: true });
    await controller.overlayReady;
    const previews = await controller.captureAll();
    let automaticRefreshes = 0;
    const captureAll = controller.captureAll.bind(controller);
    controller.captureAll = async () => {
      automaticRefreshes += 1;
      return controller.getPreviews();
    };
    await wait(PREVIEW_REFRESH_INTERVAL + 200);
    assert.equal(automaticRefreshes >= 1, true);
    controller.captureAll = captureAll;

    assert.equal(controller.views.length, 4);
    assert.equal(PREVIEW_REFRESH_INTERVAL, 5000);
    assert.notEqual(controller.previewRefreshTimer, null);
    assert.equal(controller.overlayViews.size, 1);
    assert.equal(statuses.filter((status) => status.state === "ready").length >= 4, true);
    assert.equal(
      previews.every((preview) => preview?.dataUrl?.startsWith("data:image/png")),
      true,
      JSON.stringify({ previews: previews.map(Boolean), statuses }),
    );
    assert.deepEqual(
      controller.views.map((view) => Math.round(view.webContents.getZoomFactor() * 10) / 10),
      config.slots.map(
        (slot) => Math.round((slot.zoom / controller.getOutputInfo().scaleFactor) * 10) / 10,
      ),
    );

    const outputViewports = await Promise.all(
      controller.views.map((view) =>
        view.webContents.executeJavaScript("({ width: innerWidth, height: innerHeight })"),
      ),
    );
    const previewViewports = await Promise.all(
      controller.previewWindows.map((window) =>
        window.webContents.executeJavaScript("({ width: innerWidth, height: innerHeight })"),
      ),
    );
    outputViewports.forEach((viewport, index) => {
      assert.equal(Math.abs(viewport.width - previewViewports[index].width) <= 1, true);
      assert.equal(Math.abs(viewport.height - previewViewports[index].height) <= 1, true);
    });

    const bounds = controller.views.map((view) => view.getBounds());
    assert.equal(bounds[0].width + bounds[1].width, controller.window.getContentSize()[0]);
    assert.equal(bounds[0].height + bounds[2].height, controller.window.getContentSize()[1]);

    controller.running = true;
    controller.startLoginExtension();
    const loginExtensionTimer = controller.loginExtensionTimer;
    assert.notEqual(loginExtensionTimer, null);
    controller.startLoginExtension();
    assert.equal(controller.loginExtensionTimer, loginExtensionTimer);
    await wait(140);

    const loginExtensionResults = await Promise.all(
      controller.views.map((view) =>
        view.webContents.executeJavaScript(`({
          text: document.getElementById("screen-wall-login-extension-result")?.textContent || "",
          background: document.getElementById("screen-wall-login-extension-result")
            ? getComputedStyle(document.getElementById("screen-wall-login-extension-result")).backgroundColor
            : ""
        })`),
      ),
    );
    assert.match(loginExtensionResults[0].text, /로그인 연장 버튼 클릭 완료/);
    assert.equal(loginExtensionResults[0].background, "rgba(21, 128, 61, 0.96)");
    assert.match(loginExtensionResults[1].text, /로그인 연장 대상 버튼 없음/);
    assert.match(loginExtensionResults[2].text, /로그인 연장 대상 버튼 여러 개/);
    assert.match(loginExtensionResults[3].text, /로그인 연장 버튼 클릭 실패/);
    loginExtensionResults.slice(1).forEach((result) => {
      assert.equal(result.background, "rgba(185, 28, 28, 0.96)");
    });
    const clicksBeforeStop = await controller.views[0].webContents.executeJavaScript(
      "window.loginClicks",
    );
    assert.equal(clicksBeforeStop >= 1, true);
    controller.stopLoginExtension();
    assert.equal(controller.loginExtensionTimer, null);
    await wait(80);
    assert.equal(
      await controller.views[0].webContents.executeJavaScript("window.loginClicks"),
      clicksBeforeStop,
    );
    controller.running = false;

    const loadedPanels = await Promise.all(
      [...controller.overlayViews.values()].map((view) =>
        view.webContents.executeJavaScript("location.hash.slice(1)"),
      ),
    );
    assert.deepEqual(loadedPanels, ["hint"]);

    const hintUi = await controller.overlayViews.get("hint").webContents.executeJavaScript(`({
      text: document.body.textContent.replace(/\\s+/g, " ").trim(),
      buttonCount: document.querySelectorAll("button").length,
      backdropFilter: getComputedStyle(document.querySelector(".hint-panel")).backdropFilter,
      keycapBackground: getComputedStyle(document.querySelector(".keycap")).backgroundColor
    })`);
    assert.equal(hintUi.text, "ESC 관리 화면");
    assert.equal(hintUi.buttonCount, 0);
    assert.notEqual(hintUi.backdropFilter, "none");
    assert.equal(hintUi.keycapBackground, "rgb(230, 33, 23)");

    controller.running = true;
    controller.showOverlay();
    assert.equal(controller.overlayControlsVisible, true);
    assert.deepEqual(controller.overlayPanelVisibility, { hint: true });

    controller.handleOverlayHover("hint", true);
    controller.hideOverlay();
    assert.equal(controller.overlayControlsVisible, true);
    controller.handleOverlayHover("hint", false);
    clearTimeout(controller.overlayHideTimer);
    controller.overlayHideTimer = null;
    controller.hideOverlay();
    assert.equal(controller.overlayControlsVisible, false);
    assert.deepEqual(controller.overlayPanelVisibility, { hint: false });

    controller.setStatus(0, "error", "smoke error");
    assert.deepEqual(controller.overlayPanelVisibility, { hint: false });

    let prevented = false;
    controller.handleShortcutInput(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      { type: "keyDown", key: "Escape" },
    );
    assert.equal(prevented, true);
    assert.equal(managerRequests, 1);

    prevented = false;
    controller.window.webContents.emit(
      "before-input-event",
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      { type: "keyDown", key: "Escape" },
    );
    assert.equal(prevented, true);
    assert.equal(managerRequests, 2);

    prevented = false;
    controller.handleShortcutInput(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      { type: "keyDown", key: "m", shift: true, control: true },
    );
    assert.equal(prevented, false);
    assert.equal(managerRequests, 2);

    controller.window.emit("leave-full-screen");
    assert.equal(managerRequests, 3);
    controller.checkWallModeState(false);
    assert.equal(managerRequests, 4);
    controller.running = false;

    console.log(
      JSON.stringify({
        status: "ok",
        webContentsViews: controller.views.length,
        overlayViews: controller.overlayViews.size,
        previewCaptures: previews.length,
        layoutCoversWindow: true,
        escapeReturnsToManager: true,
        outputMatchesPreviewViewport: true,
        autoPreviewRefresh: true,
        output: controller.getOutputInfo(),
      }),
    );
    controller.destroy();
    server.close(() => app.quit());
  } catch (error) {
    console.error(error);
    controller.destroy();
    server.close(() => app.exit(1));
  }
});
