/* Live collaboration client. Works in the desktop app and in a browser; only hosting
 * needs the desktop app (it runs the small server in electron/collab.cjs). */
import { applyRemote, getState, loadDoc, onLocalChange, setState, toast } from "../model/store";
import type { Peer } from "../model/store";
import type { Patch } from "../model/patch";
import { normalize } from "../model/doc";
import { getUser } from "../model/user";
import { bridge } from "../platform";

let ws: WebSocket | null = null;
let pending: Patch | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function merge(a: Patch, b: Patch): Patch {
  return { ...a, ...b, ...(a.nodes || b.nodes ? { nodes: { ...(a.nodes ?? {}), ...(b.nodes ?? {}) } } : {}) };
}
const send = (m: object) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

onLocalChange((p) => {
  if (!ws || ws.readyState !== 1) return;
  pending = pending ? merge(pending, p) : p;
  if (!flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (pending) send({ t: "patch", p: pending });
      pending = null;
    }, 40);
});

let lastCursor = 0;
export function sendCursor(world: { x: number; y: number }) {
  if (!ws || ws.readyState !== 1) return;
  const now = performance.now();
  if (now - lastCursor < 40) return;
  lastCursor = now;
  const s = getState();
  send({ t: "presence", peer: { cursor: world, selection: s.selection, page: s.pageId } });
}
export function sendSelection() {
  if (!ws || ws.readyState !== 1) return;
  const s = getState();
  send({ t: "presence", peer: { selection: s.selection, page: s.pageId } });
}

function connect(url: string, code: string, role: "host" | "guest") {
  leave(true);
  const u = getUser();
  const me = { id: u.id, name: u.name || "Guest", color: u.color };
  setState({ collab: { role, status: "Connecting…", address: url, code } });
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: "hello", code, user: me, ...(role === "host" ? { doc: getState().doc } : {}) }));
  sock.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.t === "denied") {
      toast(m.reason);
      leave();
    } else if (m.t === "welcome") {
      if (role === "guest" && m.doc) loadDoc(normalize(m.doc), { silent: true });
      const peers: Record<string, Peer> = {};
      for (const p of m.peers) peers[p.id] = { selection: [], ...p };
      setState({ peers, collab: { role, status: "Live", address: url, code } });
      toast(role === "host" ? "Session started — share the address and code" : "Joined the session");
    } else if (m.t === "patch") applyRemote(m.p);
    else if (m.t === "doc") loadDoc(normalize(m.doc), { keepHistory: true, silent: true });
    else if (m.t === "presence") setState((s) => ({ peers: { ...s.peers, [m.peer.id]: { ...(s.peers[m.peer.id] ?? { selection: [] }), ...m.peer } } }));
    else if (m.t === "leave")
      setState((s) => {
        const peers = { ...s.peers };
        delete peers[m.id];
        return { peers };
      });
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    setState({ peers: {}, collab: { role: "off", status: "Disconnected" } });
  };
  sock.onerror = () => toast("Could not reach that session. Check the address, and that both computers are on the same network.");
}

/** start hosting from this computer (desktop app only) */
export async function host() {
  if (!bridge) return toast("Hosting needs the desktop app");
  const info = await bridge.collabHost();
  connect(`ws://127.0.0.1:${info.port}`, info.code, "host");
  setState((s) => ({ collab: { ...s.collab, address: info.addresses[0] ?? `localhost:${info.port}`, code: info.code } }));
  return info;
}

export function join(address: string, code: string) {
  const a = address.trim().replace(/^wss?:\/\//, "");
  connect(`ws://${a.includes(":") ? a : a + ":4848"}`, code.trim().toUpperCase(), "guest");
}

export function leave(quiet = false) {
  const was = ws;
  ws = null;
  if (was) was.close();
  if (getState().collab.role === "host" && bridge) bridge.collabStop();
  if (!quiet) setState({ peers: {}, collab: { role: "off", status: "" } });
}

export const isLive = () => !!ws && ws.readyState === 1;
