const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wallOverlay", {
  action: (action) => ipcRenderer.send("wall-overlay:action", action),
  activity: (panel) => ipcRenderer.send("wall-overlay:activity", panel),
  hover: (panel, hovering) => ipcRenderer.send("wall-overlay:hover", { panel, hovering }),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("wall-overlay:status", listener);
    return () => ipcRenderer.removeListener("wall-overlay:status", listener);
  },
});
