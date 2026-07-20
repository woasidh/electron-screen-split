const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wallOverlay", {
  action: (action) => ipcRenderer.send("wall-overlay:action", action),
  activity: (panel) => ipcRenderer.send("wall-overlay:activity", panel),
  hover: (panel, hovering) => ipcRenderer.send("wall-overlay:hover", { panel, hovering }),
});
