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
const os = require("os");

/* Finding the claude command. Windows is the tricky part: an app started from the desktop keeps
 * the PATH Explorer had at login, so a Claude Code installed later isn't on it; npm installs a
 * .cmd shim; the native installer uses ~/.local/bin. So: a path the user picked, else search the
 * live PATH (read from the registry) plus the usual install folders. */
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const readSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
};
const writeSettings = (patch) => fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }, null, 1));

let livePath = null;
function searchPath() {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  const home = os.homedir();
  if (isWin) {
    if (livePath === null) {
      try {
        livePath = require("child_process").execFileSync(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"],
          { encoding: "utf8", windowsHide: true, timeout: 8000 },
        ).trim();
      } catch {
        livePath = "";
      }
    }
    dirs.push(...livePath.split(";"));
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    dirs.push(path.join(home, ".local", "bin"), path.join(appData, "npm"), path.join(home, ".claude", "local"), path.join(local, "Programs", "claude"), path.join(local, "Microsoft", "WinGet", "Links"));
  } else {
    dirs.push(path.join(home, ".local", "bin"), path.join(home, ".claude", "local"), "/usr/local/bin", "/opt/homebrew/bin", path.join(home, ".npm-global", "bin"));
  }
  return [...new Set(dirs.map((d) => d.trim().replace(/^"|"$/g, "")).filter(Boolean))];
}

function findClaude() {
  const picked = readSettings().claudePath;
  if (picked && fs.existsSync(picked)) return picked;
  const names = isWin ? ["claude.exe", "claude.cmd", "claude.bat", "claude"] : ["claude"];
  for (const d of searchPath())
    for (const n of names) {
      const p = path.join(d, n);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {}
    }
  return null;
}

/** the environment Claude runs in: the full PATH, and Git Bash (Claude Code on Windows needs it) */
function claudeEnv() {
  const env = { ...process.env, PATH: searchPath().join(path.delimiter) };
  if (isWin && !env.CLAUDE_CODE_GIT_BASH_PATH) {
    const pf = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], path.join(os.homedir(), "AppData", "Local", "Programs")].filter(Boolean);
    for (const base of pf) {
      const b = path.join(base, "Git", "bin", "bash.exe");
      if (fs.existsSync(b)) {
        env.CLAUDE_CODE_GIT_BASH_PATH = b;
        break;
      }
    }
  }
  return env;
}

/** run the claude binary; .cmd/.bat shims need a shell on Windows (and a quoted path) */
function spawnClaude(bin, args, opts) {
  if (isWin && /\.(cmd|bat)$/i.test(bin)) return spawn(`"${bin}"`, args, { ...opts, shell: true });
  return spawn(bin, args, { ...opts, shell: false });
}

ipcMain.handle("claude-check", async () => {
  const bin = findClaude();
  if (!bin)
    return {
      ok: false,
      error: isWin
        ? "Freakma couldn't find claude.exe. Install it in PowerShell with:  irm https://claude.ai/install.ps1 | iex  then run  claude  once to sign in, and restart Freakma. If it's installed somewhere unusual, use “Locate claude.exe…”."
        : "The `claude` command was not found. Install Claude Code, run `claude` once to sign in, and restart Freakma.",
    };
  return new Promise((resolve) => {
    const p = spawnClaude(bin, ["--version"], { env: claudeEnv(), windowsHide: true });
    let out = "", err = "";
    const t = setTimeout(() => (p.kill(), resolve({ ok: false, path: bin, error: "claude --version took too long to answer." })), 20000);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => (clearTimeout(t), resolve({ ok: false, path: bin, error: `Found ${bin} but could not start it: ${e.message}` })));
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ ok: true, version: out.trim(), path: bin });
      else resolve({ ok: false, path: bin, error: `Found ${bin} but it failed (exit ${code}): ${(err || out).trim().slice(0, 600)}` });
    });
  });
});

ipcMain.handle("claude-locate", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Find the claude program",
    properties: ["openFile"],
    filters: isWin ? [{ name: "Claude Code", extensions: ["exe", "cmd", "bat"] }] : [],
    defaultPath: path.join(os.homedir(), ".local", "bin"),
  });
  if (r.canceled) return null;
  writeSettings({ claudePath: r.filePaths[0] });
  return r.filePaths[0];
});

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
  const bin = findClaude();
  if (!bin) throw new Error("Claude Code was not found. Open the Claude tab and use “Locate claude.exe…”.");
  claude = spawnClaude(bin, args, { cwd: dir, env: claudeEnv(), windowsHide: true });
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

/* ---------------- live preview window (for a second monitor) ---------------- */

let previewWin = null;
ipcMain.handle("open-preview", async () => {
  if (previewWin && !previewWin.isDestroyed()) return previewWin.focus();
  // no preload: the preview only renders the design it is sent over a BroadcastChannel
  previewWin = new BrowserWindow({
    width: 520,
    height: 940,
    minWidth: 320,
    minHeight: 400,
    backgroundColor: "#1c1d20",
    title: "Freakma · Live preview",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (process.env.VITE_DEV_SERVER_URL) previewWin.loadURL(process.env.VITE_DEV_SERVER_URL + "#preview");
  else previewWin.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "preview" });
  previewWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  previewWin.on("closed", () => (previewWin = null));
});
