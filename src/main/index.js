const path = require("node:path");

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  session,
} = require("electron");

const { ConfigStore, getConfigIssues } = require("./config-store");
const { WallController } = require("./wall-controller");

const MANAGER_SHORTCUT = "CommandOrControl+Shift+M";
const WALL_ESCAPE_SHORTCUT = "Esc";

let managerWindow = null;
let configStore = null;
let wallController = null;
let isQuitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function sendToManager(channel, payload) {
  if (!managerWindow || managerWindow.isDestroyed()) return;
  managerWindow.webContents.send(channel, payload);
}

function showManager() {
  globalShortcut.unregister(WALL_ESCAPE_SHORTCUT);
  wallController?.stop();
  if (!managerWindow || managerWindow.isDestroyed()) return;
  managerWindow.show();
  managerWindow.focus();
}

function registerWallEscapeShortcut() {
  globalShortcut.unregister(WALL_ESCAPE_SHORTCUT);
  const registered = globalShortcut.register(WALL_ESCAPE_SHORTCUT, showManager);
  if (!registered) {
    console.warn(`${WALL_ESCAPE_SHORTCUT} 단축키 등록에 실패해 전체화면 상태 감시를 사용합니다.`);
  }
}

function createManagerWindow() {
  managerWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 760,
    show: false,
    title: "Screen Wall Control",
    backgroundColor: "#101114",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  managerWindow.setMenuBarVisibility(false);
  managerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  managerWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== managerWindow.webContents.getURL()) event.preventDefault();
  });
  managerWindow.once("ready-to-show", () => managerWindow.show());
  managerWindow.on("closed", () => {
    managerWindow = null;
    if (!isQuitting) app.quit();
  });
  managerWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function assertManagerSender(event) {
  if (!managerWindow || event.sender !== managerWindow.webContents) {
    throw new Error("허용되지 않은 IPC 요청입니다.");
  }
}

function registerIpcHandlers() {
  ipcMain.handle("app:get-initial-state", (event) => {
    assertManagerSender(event);
    return {
      config: configStore.get(),
      output: wallController.getOutputInfo(),
      previews: wallController.getPreviews(),
      statuses: wallController.getStatuses(),
      shortcut: MANAGER_SHORTCUT,
    };
  });

  ipcMain.handle("config:save", async (event, nextConfig) => {
    assertManagerSender(event);
    const saved = configStore.save(nextConfig);
    await wallController.applyConfig(saved);
    return saved;
  });

  ipcMain.handle("wall:run", (event) => {
    assertManagerSender(event);
    const issues = getConfigIssues(configStore.get());
    if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join("\n"));
    wallController.run();
    registerWallEscapeShortcut();
    managerWindow.hide();
    return true;
  });

  ipcMain.handle("wall:stop", (event) => {
    assertManagerSender(event);
    showManager();
    return true;
  });
}

async function startApplication() {
  Menu.setApplicationMenu(null);

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.on("will-download", (event) => event.preventDefault());

  configStore = new ConfigStore(path.join(app.getPath("userData"), "config.json"));
  const config = configStore.load();

  wallController = new WallController({
    onManagerShortcut: showManager,
    onPreview: (preview) => sendToManager("preview:updated", preview),
    onStatus: (status) => sendToManager("status:changed", status),
  });

  createManagerWindow();
  registerIpcHandlers();

  managerWindow.webContents.once("did-finish-load", () => {
    wallController.applyConfig(config, { forceReload: true }).catch((error) => {
      console.error("초기 화면 로딩 실패", error);
    });
  });

  const shortcutRegistered = globalShortcut.register(MANAGER_SHORTCUT, showManager);
  if (!shortcutRegistered) {
    console.warn(`${MANAGER_SHORTCUT} 단축키 등록에 실패했습니다.`);
  }

  screen.on("display-metrics-changed", () => {
    wallController.layoutViews();
    sendToManager("output:changed", wallController.getOutputInfo());
  });
}

if (hasSingleInstanceLock) {
  app.whenReady().then(startApplication);
}

app.on("second-instance", showManager);

app.on("activate", showManager);

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  wallController?.destroy();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
