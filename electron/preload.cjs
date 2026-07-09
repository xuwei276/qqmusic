const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qqMusicDesktop", {
  getFullscreen: () => ipcRenderer.invoke("qqmusic:get-fullscreen"),
  toggleFullscreen: () => ipcRenderer.invoke("qqmusic:toggle-fullscreen")
});
