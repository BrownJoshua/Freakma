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
  claudeLocate: () => ipcRenderer.invoke("claude-locate"),
  claudeRun: (dir, prompt, opts) => ipcRenderer.invoke("claude-run", dir, prompt, opts),
  claudeStop: () => ipcRenderer.invoke("claude-stop"),
  onClaude: on("claude-event"),
  collabHost: () => ipcRenderer.invoke("collab-host"),
  collabStop: () => ipcRenderer.invoke("collab-stop"),
  fetchUrl: (url, headers, binary) => ipcRenderer.invoke("fetch-url", url, headers, binary),
  captureUrl: (url, width) => ipcRenderer.invoke("capture-url", url, width),
  refsList: () => ipcRenderer.invoke("refs-list"),
  refsAdd: (meta, data) => ipcRenderer.invoke("refs-add", meta, data),
  refsUpdate: (id, patch) => ipcRenderer.invoke("refs-update", id, patch),
  refsDelete: (id) => ipcRenderer.invoke("refs-delete", id),
  refsData: (id) => ipcRenderer.invoke("refs-data", id),
  refsToProject: (id, dir) => ipcRenderer.invoke("refs-to-project", id, dir),
  openPreview: () => ipcRenderer.invoke("open-preview"),
});
