const { app, BrowserWindow } = require("electron");

function createWindow() {
  const { width, height } =
      require("electron").screen.getPrimaryDisplay().workAreaSize;

  const windowWidth = Math.floor(width / 2);
  const windowHeight = Math.floor(height / 2);

  console.log(windowWidth, windowHeight);

  const topLeft = new BrowserWindow({
    frame: false,
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: 0,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const topRight = new BrowserWindow({
    frame: false,
    width: windowWidth,
    height: windowHeight,
    x: windowWidth,
    y: 0,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const bottomLeft = new BrowserWindow({
    frame: false,
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: windowHeight,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const bottomRight = new BrowserWindow({
    frame: false,
    width: windowWidth,
    height: windowHeight,
    x: windowWidth,
    y: windowHeight,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const url = "https://robot.delisys.net";
  const seconUrl = "https://secon.robotics-lab.net";
  const figmaUrl = "https://m.site.naver.com/1JYMi"

  topLeft.loadURL(url);
  topRight.loadURL(figmaUrl);
  bottomLeft.loadURL(url);
  bottomRight.loadURL(seconUrl);

  // topLeft.webContents.setUserAgent(
  //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  // );
  // topLeft.webContents.setUserAgent(
  //     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  // );
  // topLeft.webContents.setUserAgent(
  //     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  // );
  // topLeft.webContents.setUserAgent(
  //     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  // );
  // topLeft.webContents.on("did-finish-load", () =>
  //     topLeft.webContents.setZoomFactor(0.8)
  // );
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (ProcessingInstruction.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length == 0) createWindow();
});
