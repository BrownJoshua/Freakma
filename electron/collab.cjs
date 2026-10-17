// Live collaboration server. One person hosts (this runs in their Freakma), others on the
// same network join with the address and the session code. The server keeps the latest
// document so late joiners get it, and relays edits (patches) and presence.
const os = require("os");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

let wss = null;
let session = null;

function applyPatch(doc, p) {
  if (p.nodes) {
    for (const [id, n] of Object.entries(p.nodes)) {
      if (n) doc.nodes[id] = n;
      else delete doc.nodes[id];
    }
    for (const n of Object.values(doc.nodes)) if (n.children.some((c) => !doc.nodes[c])) n.children = n.children.filter((c) => doc.nodes[c]);
  }
  for (const k of ["pages", "theme", "components", "comments", "name"]) if (p[k] !== undefined) doc[k] = p[k];
  for (const pg of doc.pages) pg.frames = pg.frames.filter((f) => doc.nodes[f]);
}

function addresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push(`${a.address}:${port}`);
  return out;
}

function start(preferredPort = 4848) {
  if (wss) return Promise.resolve(info());
  return new Promise((resolve, reject) => {
    const tryPort = (port, left) => {
      const server = new WebSocketServer({ port, host: "0.0.0.0", maxPayload: 64 * 1024 * 1024 });
      server.once("listening", () => {
        wss = server;
        session = { port, code: crypto.randomBytes(3).toString("hex").toUpperCase(), doc: null, peers: new Map() };
        wire(server);
        resolve(info());
      });
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && left > 0) tryPort(port + 1, left - 1);
        else reject(err);
      });
    };
    tryPort(preferredPort, 10);
  });
}

function info() {
  return session ? { port: session.port, code: session.code, addresses: addresses(session.port) } : null;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(from, msg) {
  for (const ws of wss.clients) if (ws !== from && ws.authed) send(ws, msg);
}

function wire(server) {
  server.on("connection", (ws) => {
    ws.authed = false;
    ws.on("message", (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.t === "hello") {
        if (String(m.code || "").toUpperCase() !== session.code) {
          send(ws, { t: "denied", reason: "Wrong session code" });
          return ws.close();
        }
        ws.authed = true;
        ws.user = m.user;
        if (m.doc && !session.doc) session.doc = m.doc; // the host seeds the document
        session.peers.set(m.user.id, { ...m.user, selection: [] });
        send(ws, { t: "welcome", doc: session.doc, peers: [...session.peers.values()].filter((p) => p.id !== m.user.id) });
        broadcast(ws, { t: "presence", peer: session.peers.get(m.user.id) });
        return;
      }
      if (!ws.authed) return;
      if (m.t === "patch") {
        if (session.doc) applyPatch(session.doc, m.p);
        broadcast(ws, { t: "patch", p: m.p, from: ws.user.id });
      } else if (m.t === "presence") {
        const peer = { ...(session.peers.get(ws.user.id) || ws.user), ...m.peer, id: ws.user.id };
        session.peers.set(ws.user.id, peer);
        broadcast(ws, { t: "presence", peer });
      } else if (m.t === "doc") {
        session.doc = m.doc;
        broadcast(ws, { t: "doc", doc: m.doc });
      }
    });
    ws.on("close", () => {
      if (!ws.user) return;
      session && session.peers.delete(ws.user.id);
      if (wss) broadcast(ws, { t: "leave", id: ws.user.id });
    });
  });
}

function stop() {
  if (!wss) return;
  for (const ws of wss.clients) ws.close();
  wss.close();
  wss = null;
  session = null;
}

module.exports = { start, stop, info };
