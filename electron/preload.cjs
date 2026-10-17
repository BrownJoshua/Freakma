// The only bridge between the page and the computer: a small, fixed API.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("freakma", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  openProject: () => ipcRenderer.invoke("open-project"),
  readProject: (dir) => ipcRenderer.invoke("read-project", dir),
  writeProject: (dir, json, guide) => ipcRenderer.invoke("write-project", dir, json, guide),
  watch: (dir) => ipcRenderer.invoke("watch", dir),
  onFileChanged: on("file-changed"),
  writeExport: (dir, name, data, base64) => ipcRenderer.invoke("write-export", dir, name, data, base64),
  reveal: (p) => ipcRenderer.invoke("reveal", p),
  claudeCheck: () => ipcRenderer.invoke("claude-check"),
  claudeRun: (dir, prompt, opts) => ipcRenderer.invoke("claude-run", dir, prompt, opts),
  claudeStop: () => ipcRenderer.invoke("claude-stop"),
  onClaude: on("claude-event"),
});
