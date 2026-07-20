const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("wallControl", {
  getInitialState: () => ipcRenderer.invoke("app:get-initial-state"),
  refreshPreview: () => ipcRenderer.invoke("preview:refresh"),
  reloadSlot: (index) => ipcRenderer.invoke("slot:reload", index),
  run: () => ipcRenderer.invoke("wall:run"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  stop: () => ipcRenderer.invoke("wall:stop"),
  onOutputChanged: (callback) => subscribe("output:changed", callback),
  onPreviewUpdated: (callback) => subscribe("preview:updated", callback),
  onStatusChanged: (callback) => subscribe("status:changed", callback),
});
