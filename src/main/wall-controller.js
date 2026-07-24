const path = require("node:path");

const { BrowserWindow, WebContentsView, screen } = require("electron");

const { isSafeRemoteUrl, normalizeConfig } = require("./config-store");
const { calculateOutputZoom, calculateQuadrants, getOutputInfo } = require("./layout");
const {
  LOGIN_EXTENSION_INTERVAL,
  LOGIN_EXTENSION_SCRIPT,
  shouldExtendLogin,
} = require("./login-extension");

const PREVIEW_REFRESH_INTERVAL = 5000;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class WallController {
  constructor({
    onManagerShortcut,
    onPreview,
    onStatus,
    loginExtensionInterval = LOGIN_EXTENSION_INTERVAL,
  }) {
    this.onManagerShortcut = onManagerShortcut;
    this.onPreview = onPreview;
    this.onStatus = onStatus;
    this.window = null;
    this.views = [];
    this.previewWindows = [];
    this.configuredSessions = new WeakSet();
    this.config = null;
    this.statuses = Array.from({ length: 4 }, () => ({ state: "idle" }));
    this.previews = Array.from({ length: 4 }, () => null);
    this.captureTimers = new Map();
    this.previewRefreshTimer = null;
    this.previewRefreshInFlight = false;
    this.loginExtensionInterval = loginExtensionInterval;
    this.loginExtensionTimer = null;
    this.wallModeGuardTimer = null;
    this.running = false;
    this.destroying = false;
  }

  getOutputInfo() {
    return getOutputInfo(screen.getPrimaryDisplay());
  }

  getStatuses() {
    return structuredClone(this.statuses);
  }

  getPreviews() {
    return structuredClone(this.previews);
  }

  getPartition(index) {
    return `wall-slot-${index + 1}`;
  }

  getOutputZoom(index) {
    const configuredZoom = this.config?.slots[index]?.zoom || 1;
    return calculateOutputZoom(configuredZoom, screen.getPrimaryDisplay().scaleFactor);
  }

  applyOutputZoom(index) {
    const view = this.views[index];
    if (!view || view.webContents.isDestroyed()) return;
    view.webContents.setZoomFactor(this.getOutputZoom(index));
  }

  applyPreviewZoom(index) {
    const previewWindow = this.previewWindows[index];
    if (!previewWindow || previewWindow.isDestroyed()) return;
    previewWindow.webContents.setZoomFactor(this.getOutputZoom(index));
  }

  configureSession(contents) {
    const targetSession = contents.session;
    if (this.configuredSessions.has(targetSession)) return;
    this.configuredSessions.add(targetSession);
    targetSession.setPermissionCheckHandler(() => false);
    targetSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    targetSession.on("will-download", (event) => event.preventDefault());
  }

  configureRemoteContents(contents) {
    this.configureSession(contents);
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!isSafeRemoteUrl(url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return;

    const display = screen.getPrimaryDisplay();
    this.window = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      show: false,
      frame: false,
      resizable: false,
      fullscreenable: true,
      skipTaskbar: true,
      backgroundColor: "#000000",
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.window.loadFile(path.join(__dirname, "../renderer/wall.html"));
    this.window.webContents.on("before-input-event", (event, input) => {
      this.handleShortcutInput(event, input);
    });
    this.window.on("resize", () => this.layoutViews());
    this.window.on("enter-full-screen", () => this.layoutViews());
    this.window.on("leave-full-screen", () => this.handleFullscreenExit());
    this.window.on("leave-html-full-screen", () => this.handleFullscreenExit());
    this.window.on("close", (event) => {
      if (this.destroying) return;
      event.preventDefault();
      this.stop();
      this.onManagerShortcut();
    });

    this.createViews();
    this.layoutViews();
  }

  createViews() {
    this.views = Array.from({ length: 4 }, (_, index) => {
      const view = new WebContentsView({
        webPreferences: {
          backgroundThrottling: false,
          contextIsolation: true,
          nodeIntegration: false,
          partition: this.getPartition(index),
          sandbox: true,
          spellcheck: false,
        },
      });

      view.setBackgroundColor("#000000");
      this.configureRemoteContents(view.webContents);
      view.webContents.on("before-input-event", (event, input) => {
        this.handleShortcutInput(event, input);
      });
      view.webContents.on("did-start-loading", () => {
        if (this.config?.slots[index]?.enabled) this.setStatus(index, "loading");
      });
      view.webContents.on("did-finish-load", () => {
        if (!this.config?.slots[index]?.enabled) return;
        this.applyOutputZoom(index);
        this.setStatus(index, "ready");
      });
      view.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
          if (!isMainFrame || errorCode === -3 || !this.config?.slots[index]?.enabled) return;
          this.setStatus(index, "error", errorDescription);
        },
      );
      view.webContents.on("render-process-gone", (_event, details) => {
        this.setStatus(index, "error", `렌더러 종료: ${details.reason}`);
      });
      view.webContents.on("unresponsive", () => {
        this.setStatus(index, "error", "페이지가 응답하지 않음");
      });

      this.window.contentView.addChildView(view);
      return view;
    });
  }

  handleShortcutInput(event, input) {
    const type = String(input.type || "").toLowerCase();
    if (type !== "keydown" && type !== "rawkeydown") return;

    const key = String(input.key || "").toLowerCase();
    if (key !== "escape") return;

    event.preventDefault();
    this.onManagerShortcut();
  }

  handleFullscreenExit() {
    this.layoutViews();
    if (this.running) this.onManagerShortcut();
  }

  checkWallModeState(isActive = null) {
    if (!this.running || !this.window || this.window.isDestroyed()) return;
    const currentlyActive =
      typeof isActive === "boolean"
        ? isActive
        : process.platform !== "darwin" || this.window.isSimpleFullScreen();
    if (!currentlyActive) this.onManagerShortcut();
  }

  startWallModeGuard() {
    clearInterval(this.wallModeGuardTimer);
    if (process.platform !== "darwin") return;
    this.wallModeGuardTimer = setInterval(() => this.checkWallModeState(), 100);
  }

  enterWallMode() {
    if (process.platform === "darwin") {
      this.window.setSimpleFullScreen(true);
    }
    this.window.setAlwaysOnTop(true, "screen-saver");
  }

  leaveWallMode() {
    if (process.platform === "darwin" && this.window.isSimpleFullScreen()) {
      this.window.setSimpleFullScreen(false);
    }
    if (this.window.isFullScreen()) this.window.setFullScreen(false);
    this.window.setAlwaysOnTop(false);
  }

  ensurePreviewWindows() {
    if (
      this.previewWindows.length === 4 &&
      this.previewWindows.every((window) => !window.isDestroyed())
    ) {
      return;
    }

    this.previewWindows.forEach((window) => {
      if (!window.isDestroyed()) window.destroy();
    });

    const display = screen.getPrimaryDisplay();
    const previewBounds = calculateQuadrants(display.bounds.width, display.bounds.height);
    this.previewWindows = Array.from({ length: 4 }, (_, index) => {
      const previewWindow = new BrowserWindow({
        width: previewBounds[index].width,
        height: previewBounds[index].height,
        show: false,
        frame: false,
        backgroundColor: "#000000",
        webPreferences: {
          backgroundThrottling: false,
          contextIsolation: true,
          nodeIntegration: false,
          offscreen: {
            deviceScaleFactor: 1,
            useSharedTexture: false,
          },
          partition: this.getPartition(index),
          sandbox: true,
          spellcheck: false,
        },
      });

      this.configureRemoteContents(previewWindow.webContents);
      previewWindow.webContents.setAudioMuted(true);
      previewWindow.webContents.on("did-finish-load", () => {
        if (!this.config?.slots[index]?.enabled || this.running) return;
        this.applyPreviewZoom(index);
        this.scheduleCapture(index);
      });
      previewWindow.webContents.on("render-process-gone", (_event, details) => {
        if (!this.running) {
          this.setStatus(index, "error", `미리보기 렌더러 종료: ${details.reason}`);
        }
      });
      return previewWindow;
    });
  }

  layoutViews() {
    if (!this.window || this.window.isDestroyed() || this.views.length !== 4) return;
    const [width, height] = this.window.getContentSize();
    if (width < 2 || height < 2) return;

    const bounds = calculateQuadrants(width, height);
    this.views.forEach((view, index) => {
      view.setBounds(bounds[index]);
      this.applyOutputZoom(index);
      const previewWindow = this.previewWindows[index];
      if (previewWindow && !previewWindow.isDestroyed()) {
        previewWindow.setContentSize(bounds[index].width, bounds[index].height);
        this.applyPreviewZoom(index);
      }
    });
  }

  async applyConfig(nextConfig, { forceReload = false } = {}) {
    this.ensureWindow();
    this.ensurePreviewWindows();
    const normalized = normalizeConfig(nextConfig);
    const previous = this.config;
    this.config = normalized;

    await Promise.all(
      normalized.slots.map(async (slot, index) => {
        const previousSlot = previous?.slots[index];
        const mustReload =
          forceReload ||
          !previousSlot ||
          previousSlot.url !== slot.url ||
          previousSlot.enabled !== slot.enabled;

        if (!slot.enabled) {
          this.setStatus(index, "disabled");
          this.previews[index] = null;
          this.onPreview({ index, dataUrl: null, capturedAt: Date.now() });
          if (mustReload) {
            await Promise.all([
              this.views[index].webContents.loadURL("about:blank"),
              this.previewWindows[index].webContents.loadURL("about:blank"),
            ]);
          }
          return;
        }

        this.applyOutputZoom(index);
        this.applyPreviewZoom(index);
        if (mustReload) {
          await this.loadSlot(index);
        } else if (previousSlot.zoom !== slot.zoom) {
          this.scheduleCapture(index);
        }
      }),
    );

    this.startPreviewAutoRefresh();
    return normalized;
  }

  async loadSlot(index) {
    const slot = this.config?.slots[index];
    if (!slot?.enabled) return;
    if (!isSafeRemoteUrl(slot.url)) {
      this.setStatus(index, "error", "HTTP 또는 HTTPS URL을 입력해 주세요.");
      await Promise.all([
        this.views[index].webContents.loadURL("about:blank"),
        this.previewWindows[index].webContents.loadURL("about:blank"),
      ]);
      return;
    }

    this.setStatus(index, "loading");
    const results = await Promise.allSettled([
      this.views[index].webContents.loadURL(slot.url),
      this.previewWindows[index].webContents.loadURL(slot.url),
    ]);
    const failure = results.find(
      (result) => result.status === "rejected" && result.reason?.code !== "ERR_ABORTED",
    );
    if (failure) this.setStatus(index, "error", failure.reason.message);
  }

  scheduleCapture(index) {
    clearTimeout(this.captureTimers.get(index));
    const timer = setTimeout(() => {
      this.captureTimers.delete(index);
      this.captureSlot(index).catch((error) => {
        this.setStatus(index, "error", `미리보기 실패: ${error.message}`);
      });
    }, 250);
    this.captureTimers.set(index, timer);
  }

  async captureSlot(index) {
    const slot = this.config?.slots[index];
    const previewWindow = this.previewWindows[index];
    if (this.running || !slot?.enabled || !previewWindow || previewWindow.isDestroyed()) {
      return null;
    }

    let image = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        previewWindow.webContents.invalidate();
        await wait(attempt === 0 ? 80 : 180);
        image = await previewWindow.webContents.capturePage();
        if (!image.isEmpty()) break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    if (this.running) return null;
    if (!image || image.isEmpty()) throw new Error("캡처 이미지가 비어 있음");

    const thumbnail = image.resize({ width: 640, quality: "good" });
    const preview = {
      index,
      dataUrl: thumbnail.toDataURL(),
      capturedAt: Date.now(),
    };
    this.previews[index] = preview;
    this.onPreview(preview);
    return preview;
  }

  async captureAll() {
    const results = await Promise.allSettled(
      this.previewWindows.map((_window, index) => this.captureSlot(index)),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected" && this.config?.slots[index]?.enabled) {
        this.setStatus(index, "error", `미리보기 실패: ${result.reason.message}`);
      }
    });

    return this.getPreviews();
  }

  startPreviewAutoRefresh() {
    if (this.running || this.destroying || this.previewRefreshTimer) return;
    this.previewRefreshTimer = setInterval(() => {
      this.refreshPreviewsInBackground();
    }, PREVIEW_REFRESH_INTERVAL);
  }

  stopPreviewAutoRefresh() {
    clearInterval(this.previewRefreshTimer);
    this.previewRefreshTimer = null;
  }

  async refreshPreviewsInBackground() {
    if (this.running || this.destroying || this.previewRefreshInFlight) return;
    this.previewRefreshInFlight = true;
    try {
      await this.captureAll();
    } catch (error) {
      console.error("자동 미리보기 갱신 실패", error);
    } finally {
      this.previewRefreshInFlight = false;
    }
  }

  startLoginExtension() {
    if (
      !this.running
      || this.destroying
      || this.loginExtensionTimer !== null
      || !this.config?.slots.some(shouldExtendLogin)
    ) {
      return;
    }

    this.loginExtensionTimer = setInterval(() => {
      this.executeLoginExtension();
    }, this.loginExtensionInterval);
  }

  stopLoginExtension() {
    clearInterval(this.loginExtensionTimer);
    this.loginExtensionTimer = null;
  }

  executeLoginExtension() {
    this.config?.slots.forEach((slot, index) => {
      const view = this.views[index];
      if (!shouldExtendLogin(slot) || !view || view.webContents.isDestroyed()) return;
      view.webContents.executeJavaScript(LOGIN_EXTENSION_SCRIPT, true).catch((error) => {
        console.error(`[Screen Wall] ${index + 1}번 화면 로그인 연장 실행 실패`, error);
      });
    });
  }

  run() {
    this.ensureWindow();
    this.running = true;
    this.stopPreviewAutoRefresh();
    this.captureTimers.forEach((timer) => clearTimeout(timer));
    this.captureTimers.clear();
    const display = screen.getPrimaryDisplay();
    this.previewWindows.forEach((window) => {
      if (!window.isDestroyed() && window.webContents.isPainting()) {
        window.webContents.stopPainting();
      }
    });
    this.window.setBounds(display.bounds);
    this.layoutViews();
    this.window.show();
    this.enterWallMode();
    this.window.focus();
    this.startWallModeGuard();
    this.startLoginExtension();
  }

  stop() {
    if (!this.window || this.window.isDestroyed()) return;
    this.running = false;
    this.stopLoginExtension();
    clearInterval(this.wallModeGuardTimer);
    this.wallModeGuardTimer = null;
    this.leaveWallMode();
    this.window.hide();
    this.previewWindows.forEach((window, index) => {
      if (window.isDestroyed()) return;
      if (!window.webContents.isPainting()) window.webContents.startPainting();
      if (this.config?.slots[index]?.enabled) this.scheduleCapture(index);
    });
    this.startPreviewAutoRefresh();
  }

  destroy() {
    this.destroying = true;
    this.stopLoginExtension();
    clearInterval(this.wallModeGuardTimer);
    this.wallModeGuardTimer = null;
    this.stopPreviewAutoRefresh();
    this.captureTimers.forEach((timer) => clearTimeout(timer));
    this.captureTimers.clear();
    this.previewWindows.forEach((window) => {
      if (!window.isDestroyed()) window.destroy();
    });
    this.previewWindows = [];
    this.views.forEach((view) => {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    });
    this.views = [];
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  setStatus(index, state, message = "") {
    const status = { index, state, message, updatedAt: Date.now() };
    this.statuses[index] = status;
    this.onStatus(status);
  }
}

module.exports = { PREVIEW_REFRESH_INTERVAL, WallController };
