import type { Comment, Component, Doc, Node, Page, Theme } from "./types";

/** a change to a document: changed/added nodes (null = deleted) plus any top-level parts
 * that changed. Used for undo/redo and to sync edits between people. */
export interface Patch {
  nodes?: Record<string, Node | null>;
  pages?: Page[];
  theme?: Theme;
  components?: Component[];
  comments?: Comment[];
  name?: string;
}

const j = (v: unknown) => JSON.stringify(v);

export function diff(a: Doc, b: Doc): { fwd: Patch; back: Patch } | null {
  const fwd: Patch = {}, back: Patch = {};
  const fn: Record<string, Node | null> = {}, bn: Record<string, Node | null> = {};
  let n = 0;
  for (const [id, nb] of Object.entries(b.nodes)) {
    const na = a.nodes[id];
    if (!na || j(na) !== j(nb)) {
      fn[id] = nb;
      bn[id] = na ?? null;
      n++;
    }
  }
  for (const id of Object.keys(a.nodes)) {
    if (!b.nodes[id]) {
      fn[id] = null;
      bn[id] = a.nodes[id];
      n++;
    }
  }
  if (n) {
    fwd.nodes = fn;
    back.nodes = bn;
  }
  for (const k of ["pages", "theme", "components", "comments", "name"] as const) {
    if (j(a[k]) !== j(b[k])) {
      (fwd as Record<string, unknown>)[k] = b[k] ?? (k === "comments" ? [] : undefined);
      (back as Record<string, unknown>)[k] = a[k] ?? (k === "comments" ? [] : undefined);
    }
  }
  return Object.keys(fwd).length ? { fwd, back } : null;
}

/** applies a patch in place and returns the doc */
export function applyPatch(doc: Doc, p: Patch): Doc {
  if (p.nodes) {
    for (const [id, n] of Object.entries(p.nodes)) {
      if (n) doc.nodes[id] = JSON.parse(j(n));
      else delete doc.nodes[id];
    }
    // keep the tree consistent if someone else deleted a child we still point at
    for (const n of Object.values(doc.nodes)) if (n.children.some((c) => !doc.nodes[c])) n.children = n.children.filter((c) => doc.nodes[c]);
  }
  if (p.pages) doc.pages = JSON.parse(j(p.pages));
  if (p.theme) doc.theme = JSON.parse(j(p.theme));
  if (p.components) doc.components = JSON.parse(j(p.components));
  if (p.comments) doc.comments = JSON.parse(j(p.comments));
  if (p.name !== undefined) doc.name = p.name;
  for (const pg of doc.pages) pg.frames = pg.frames.filter((f) => doc.nodes[f]);
  return doc;
}

export const isEmpty = (p: Patch) => Object.keys(p).length === 0;
