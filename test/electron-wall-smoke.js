const assert = require("node:assert/strict");
const http = require("node:http");

const { app } = require("electron");

const { WallController } = require("../src/main/wall-controller");

function createServer() {
  const server = http.createServer((request, response) => {
    const index = new URL(request.url, "http://127.0.0.1").searchParams.get("screen") || "1";
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html><body style="margin:0;display:grid;place-items:center;width:100vw;height:100vh;background:#1f2937;color:white;font:64px sans-serif">
        SCREEN ${index}
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
  const controller = new WallController({
    onManagerShortcut: () => {},
    onPreview: () => {},
    onStatus: (status) => statuses.push(status),
  });

  try {
    const config = {
      version: 1,
      slots: Array.from({ length: 4 }, (_, index) => ({
        enabled: true,
        url: `http://127.0.0.1:${port}/?screen=${index + 1}`,
        zoom: 1 + index * 0.1,
      })),
    };

    await controller.applyConfig(config, { forceReload: true });
    const previews = await controller.captureAll();

    assert.equal(controller.views.length, 4);
    assert.equal(statuses.filter((status) => status.state === "ready").length >= 4, true);
    assert.equal(
      previews.every((preview) => preview?.dataUrl?.startsWith("data:image/png")),
      true,
      JSON.stringify({ previews: previews.map(Boolean), statuses }),
    );
    assert.deepEqual(
      controller.views.map((view) => Math.round(view.webContents.getZoomFactor() * 10) / 10),
      [1, 1.1, 1.2, 1.3],
    );

    const bounds = controller.views.map((view) => view.getBounds());
    assert.equal(bounds[0].width + bounds[1].width, controller.window.getContentSize()[0]);
    assert.equal(bounds[0].height + bounds[2].height, controller.window.getContentSize()[1]);

    console.log(
      JSON.stringify({
        status: "ok",
        webContentsViews: controller.views.length,
        previewCaptures: previews.length,
        layoutCoversWindow: true,
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
