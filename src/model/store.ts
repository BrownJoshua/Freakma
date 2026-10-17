import { useSyncExternalStore } from "react";
import type { Doc, Fragment, Node } from "./types";
import { allFrames, newDoc, normalize, parentOf } from "./doc";

export type LeftTab = "parts" | "layers" | "theme";
export type RightTab = "design" | "prototype" | "claude";

export interface DropHint {
  parentId: string;
  index: number;
  /** indicator line in stage coordinates */
  line: { x: number; y: number; w: number; h: number };
}

export interface State {
  doc: Doc;
  pageId: string;
  selection: string[];
  hover: string | null;
  view: { x: number; y: number; zoom: number };
  leftTab: LeftTab;
  rightTab: RightTab;
  editingText: string | null;
  dropHint: DropHint | null;
  play: string | null;
  projectDir: string | null;
  saved: boolean;
  toast: string | null;
  /** bumps on every change so overlays re-measure */
  rev: number;
}

const LOCAL_KEY = "freakma:doc";

function initialDoc(): Doc {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return newDoc();
}

const doc0 = initialDoc();
let state: State = {
  doc: doc0,
  pageId: doc0.pages[0].id,
  selection: [],
  hover: null,
  view: { x: 80, y: 80, zoom: 0.5 },
  leftTab: "parts",
  rightTab: "design",
  editingText: null,
  dropHint: null,
  play: null,
  projectDir: null,
  saved: true,
  toast: null,
  rev: 0,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = () => state;

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p, rev: state.rev + 1 };
  emit();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

/* ---------------- history ---------------- */

const past: string[] = [];
const future: string[] = [];
let gestureStart: string | null = null;
const snap = () => JSON.stringify(state.doc);

function changed() {
  scheduleSave();
}

/** every edit goes through here: one undo step per call */
export function commit(mutate: (doc: Doc) => void, extra?: Partial<State>) {
  const before = snap();
  const doc: Doc = JSON.parse(before);
  mutate(doc);
  const after = JSON.stringify(doc);
  if (after === before) {
    if (extra) setState(extra);
    return;
  }
  if (!gestureStart) {
    past.push(before);
    if (past.length > 150) past.shift();
    future.length = 0;
  }
  setState({ doc, saved: false, ...extra });
  changed();
}

/** live edits while dragging: no history until endGesture */
export function beginGesture() {
  if (!gestureStart) gestureStart = snap();
}
export function live(mutate: (doc: Doc) => void) {
  const doc: Doc = JSON.parse(snap());
  mutate(doc);
  setState({ doc, saved: false });
}
export function endGesture() {
  if (gestureStart && gestureStart !== snap()) {
    past.push(gestureStart);
    future.length = 0;
    changed();
  }
  gestureStart = null;
}

export function undo() {
  const prev = past.pop();
  if (!prev) return;
  future.push(snap());
  const doc = JSON.parse(prev) as Doc;
  setState({ doc, selection: state.selection.filter((id) => doc.nodes[id]), saved: false, editingText: null });
  changed();
}
export function redo() {
  const next = future.pop();
  if (!next) return;
  past.push(snap());
  const doc = JSON.parse(next) as Doc;
  setState({ doc, selection: state.selection.filter((id) => doc.nodes[id]), saved: false, editingText: null });
  changed();
}
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

/** replace the whole document (open file, reload after Claude) */
export function loadDoc(doc: Doc, opts: { keepHistory?: boolean; projectDir?: string | null } = {}) {
  if (opts.keepHistory) {
    past.push(snap());
    future.length = 0;
  } else {
    past.length = 0;
    future.length = 0;
  }
  const pageId = doc.pages.find((p) => p.id === state.pageId)?.id ?? doc.pages[0].id;
  setState({
    doc,
    pageId,
    selection: state.selection.filter((id) => doc.nodes[id]),
    editingText: null,
    saved: true,
    ...(opts.projectDir !== undefined ? { projectDir: opts.projectDir } : {}),
  });
  saveLocal();
}

/* ---------------- saving ---------------- */

type Saver = (doc: Doc) => Promise<void>;
let diskSaver: Saver | null = null;
export const setDiskSaver = (s: Saver | null) => (diskSaver = s);

let timer: ReturnType<typeof setTimeout> | null = null;
function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.doc));
  } catch {}
}
function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushSave, 700);
}
export async function flushSave() {
  if (timer) clearTimeout(timer);
  timer = null;
  saveLocal();
  if (diskSaver && state.projectDir) {
    await diskSaver(state.doc);
  }
  setState({ saved: true });
}

/* ---------------- helpers ---------------- */

export const page = (s: State = state) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
export const node = (id: string | null | undefined, s: State = state): Node | undefined => (id ? s.doc.nodes[id] : undefined);
export const selected = (s: State = state) => s.selection.map((id) => s.doc.nodes[id]).filter(Boolean) as Node[];

export function toast(msg: string) {
  setState({ toast: msg });
  setTimeout(() => {
    if (getState().toast === msg) setState({ toast: null });
  }, 2600);
}

export function select(ids: string[]) {
  setState({ selection: ids, editingText: null });
}

/** the container new parts go into: the selection if it lays out children, else its parent, else the first frame */
export function insertionParent(): { parentId: string; index: number } | null {
  const s = state;
  const sel = s.selection[0] ? s.doc.nodes[s.selection[0]] : undefined;
  if (sel) {
    if (sel.layout) return { parentId: sel.id, index: sel.children.length };
    const p = parentOf(s.doc, sel.id);
    if (p) return { parentId: p.id, index: p.children.indexOf(sel.id) + 1 };
  }
  const f = page(s).frames[0];
  if (f) return { parentId: f, index: s.doc.nodes[f].children.length };
  return null;
}

let clipboard: Fragment[] = [];
export const setClipboard = (f: Fragment[]) => (clipboard = f);
export const getClipboard = () => clipboard;

export const framesOnPage = (s: State = state) => page(s).frames.map((id) => s.doc.nodes[id]).filter(Boolean) as Node[];
export const everyFrame = (s: State = state) => allFrames(s.doc);
