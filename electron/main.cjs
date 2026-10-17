// Freakma desktop shell: window, project files on disk, and the Claude Code bridge.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");

const PROJECT_FILE = "design.freakma.json";
const GUIDE_MARK = "<!-- freakma-guide";
let win = null;
let watcher = null;
let claude = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#1c1d20",
    title: "Freakma",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  // links in the app open in the real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => {
  if (claude) claude.kill();
  if (process.platform !== "darwin") app.quit();
});

/* ---------------- project files ---------------- */

const projectPath = (dir) => path.join(dir, PROJECT_FILE);

ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choose a folder for this design", properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("open-project", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Open a Freakma project",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Freakma design", extensions: ["json"] }],
  });
  if (r.canceled) return null;
  let p = r.filePaths[0];
  let dir = p;
  if (fs.statSync(p).isFile()) dir = path.dirname(p);
  else p = projectPath(dir);
  if (!fs.existsSync(p)) throw new Error(`No ${PROJECT_FILE} in that folder`);
  return { dir, json: fs.readFileSync(p, "utf8") };
});

ipcMain.handle("read-project", async (_e, dir) => {
  const p = projectPath(dir);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

ipcMain.handle("write-project", async (_e, dir, json, guide) => {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = projectPath(dir) + ".tmp";
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, projectPath(dir));
  // keep the Claude guide current, but never overwrite a CLAUDE.md the user wrote
  const g = path.join(dir, "CLAUDE.md");
  if (!fs.existsSync(g) || fs.readFileSync(g, "utf8").startsWith(GUIDE_MARK)) fs.writeFileSync(g, guide, "utf8");
});

ipcMain.handle("watch", async (_e, dir) => {
  if (watcher) watcher.close();
  let t = null;
  try {
    watcher = fs.watch(dir, (_ev, name) => {
      if (name !== PROJECT_FILE) return;
      clearTimeout(t);
      t = setTimeout(() => win && win.webContents.send("file-changed"), 250);
    });
  } catch (err) {
    console.error("watch failed", err);
  }
});

ipcMain.handle("write-export", async (_e, dir, name, data, base64) => {
  const out = path.join(dir, "exports");
  fs.mkdirSync(out, { recursive: true });
  const p = path.join(out, name.replace(/[\\/:*?"<>|]/g, "-"));
  fs.writeFileSync(p, base64 ? Buffer.from(data, "base64") : data);
  return p;
});

ipcMain.handle("reveal", async (_e, p) => shell.showItemInFolder(p));

/* ---------------- Claude Code ----------------
 * Runs the user's own Claude Code CLI in the project folder (their login, no API key).
 * The prompt goes in on stdin so nothing the user types is ever parsed by a shell. */

const isWin = process.platform === "win32";

ipcMain.handle("claude-check", async () =>
  new Promise((resolve) => {
    execFile("claude", ["--version"], { shell: isWin, timeout: 15000 }, (err, stdout) => {
      if (err) resolve({ ok: false, error: err.code === "ENOENT" || /not recognized|not found/i.test(String(err.message)) ? "The `claude` command was not found on PATH." : String(err.message) });
      else resolve({ ok: true, version: String(stdout).trim() });
    });
  }),
);

const send = (ev) => win && win.webContents.send("claude-event", ev);

function summarizeTool(block) {
  const i = block.input || {};
  const target = i.file_path || i.path || i.pattern || i.command || "";
  return `${block.name}${target ? " · " + String(target).split(/[\\/]/).slice(-2).join("/") : ""}`;
}

ipcMain.handle("claude-run", async (_e, dir, prompt, opts) => {
  if (claude) throw new Error("Claude is already working");
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Glob,Grep"];
  if (opts && opts.continue) args.push("--continue");
  claude = spawn("claude", args, { cwd: dir, shell: isWin, env: process.env, windowsHide: true });
  send({ kind: "text", text: "Claude Code started…" });
  let buf = "";
  let finished = false;
  claude.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === "assistant" && msg.message && Array.isArray(msg.message.content)) {
        for (const b of msg.message.content) {
          if (b.type === "text" && b.text.trim()) send({ kind: "text", text: b.text.trim() });
          if (b.type === "tool_use") send({ kind: "tool", text: summarizeTool(b) });
        }
      } else if (msg.type === "result") {
        finished = true;
        if (msg.is_error) send({ kind: "error", text: String(msg.result || "Claude reported an error") });
        else send({ kind: "done", text: "", cost: msg.total_cost_usd });
      }
    }
  });
  claude.stderr.on("data", (d) => {
    const t = d.toString("utf8").trim();
    if (t) send({ kind: "stderr", text: t.slice(0, 800) });
  });
  claude.on("error", (err) => send({ kind: "error", text: `Could not start Claude Code: ${err.message}` }));
  claude.on("close", (code) => {
    if (!finished) send(code === 0 ? { kind: "done", text: "" } : { kind: "error", text: `Claude Code stopped (exit code ${code}).` });
    claude = null;
  });
  claude.stdin.write(prompt);
  claude.stdin.end();
});

ipcMain.handle("claude-stop", async () => {
  if (!claude) return;
  if (isWin) spawn("taskkill", ["/pid", String(claude.pid), "/t", "/f"], { windowsHide: true });
  else claude.kill("SIGINT");
});

/* ---------------- live collaboration ---------------- */

const collab = require("./collab.cjs");
ipcMain.handle("collab-host", async () => collab.start());
ipcMain.handle("collab-stop", async () => collab.stop());
app.on("before-quit", () => collab.stop());

/* ---------------- fetching (Figma API, web pages, images) ---------------- */

ipcMain.handle("fetch-url", async (_e, url, headers, binary) => {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) addresses can be fetched");
  const res = await fetch(url, { headers: headers || {}, redirect: "follow" });
  const type = res.headers.get("content-type") || "";
  if (binary) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: res.ok, status: res.status, type, base64: buf.toString("base64") };
  }
  return { ok: res.ok, status: res.status, type, text: await res.text(), url: res.url };
});

/** screenshot of a web page, full height up to 8000px, plus its HTML */
ipcMain.handle("capture-url", async (_e, url, width) => {
  if (!/^https?:\/\//i.test(url)) throw new Error("Enter a web address starting with http:// or https://");
  const w = new BrowserWindow({ show: false, width: width || 1440, height: 900, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  try {
    await Promise.race([w.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error("The page took too long to load")), 30000))]);
    await new Promise((r) => setTimeout(r, 1500));
    const h = await w.webContents.executeJavaScript("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)");
    const height = Math.min(Math.max(600, Number(h) || 900), 8000);
    w.setContentSize(width || 1440, height);
    await new Promise((r) => setTimeout(r, 700));
    const img = await w.webContents.capturePage();
    const html = await w.webContents.executeJavaScript("document.documentElement.outerHTML");
    const title = w.webContents.getTitle();
    const size = img.getSize();
    return { png: img.toPNG().toString("base64"), html, title, w: size.width, h: size.height };
  } finally {
    w.destroy();
  }
});

/* ---------------- reference library (shared by all projects) ---------------- */

const refsDir = () => {
  const d = path.join(app.getPath("userData"), "references");
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const refsIndex = () => path.join(refsDir(), "index.json");
const readRefs = () => {
  try {
    return JSON.parse(fs.readFileSync(refsIndex(), "utf8"));
  } catch {
    return [];
  }
};
const writeRefs = (list) => fs.writeFileSync(refsIndex(), JSON.stringify(list, null, 1));
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

ipcMain.handle("refs-list", async () => readRefs());
ipcMain.handle("refs-add", async (_e, meta, data) => {
  const list = readRefs();
  const file = `${meta.id}.${meta.ext}`;
  const m = /^data:[^;]+;base64,(.*)$/.exec(data);
  fs.writeFileSync(path.join(refsDir(), file), m ? Buffer.from(m[1], "base64") : data);
  list.unshift(meta);
  writeRefs(list);
  return meta;
});
ipcMain.handle("refs-update", async (_e, id, patch) => {
  const list = readRefs().map((r) => (r.id === id ? { ...r, ...patch, id } : r));
  writeRefs(list);
});
ipcMain.handle("refs-delete", async (_e, id) => {
  const list = readRefs();
  const r = list.find((x) => x.id === id);
  if (r) fs.rmSync(path.join(refsDir(), `${r.id}.${r.ext}`), { force: true });
  writeRefs(list.filter((x) => x.id !== id));
});
ipcMain.handle("refs-data", async (_e, id) => {
  const r = readRefs().find((x) => x.id === id);
  if (!r) return null;
  const p = path.join(refsDir(), `${r.id}.${r.ext}`);
  if (!fs.existsSync(p)) return null;
  if (MIME[r.ext]) return `data:${MIME[r.ext]};base64,${fs.readFileSync(p).toString("base64")}`;
  return fs.readFileSync(p, "utf8");
});
/** copy a reference into a project so Claude Code can look at it */
ipcMain.handle("refs-to-project", async (_e, id, dir) => {
  const r = readRefs().find((x) => x.id === id);
  if (!r) throw new Error("Reference not found");
  const out = path.join(dir, "references");
  fs.mkdirSync(out, { recursive: true });
  const name = `${(r.name || r.id).replace(/[^a-z0-9-_]+/gi, "-").slice(0, 40)}-${r.id.slice(-4)}.${r.ext}`;
  fs.copyFileSync(path.join(refsDir(), `${r.id}.${r.ext}`), path.join(out, name));
  return `references/${name}`;
});
