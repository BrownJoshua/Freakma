/* Putting imported designs into the document. */
import { commit, getState, page, select, setState } from "../model/store";
import { insertFragment, nextFramePosition, uid } from "../model/doc";
import type { Doc, Fragment, Node, Page } from "../model/types";
import { focusNode, zoomToFit } from "../model/actions";
import { htmlToFragment } from "./html";
import type { ImportedPage } from "./figma";

const DEVICE_BY_WIDTH: Record<number, string> = { 1440: "desktop", 1280: "laptop", 834: "tablet", 390: "iphone", 412: "android" };

/** a fragment whose root is a frame → a screen on the page at x/y */
function placeFrame(doc: Doc, p: Page, frag: Fragment, x: number, y: number): string {
  // insertFragment wants a parent: use a scratch node, then lift the root out as a screen
  const tmp = uid("tmp");
  doc.nodes[tmp] = { id: tmp, type: "box", name: "", children: [], w: 0, h: 0, wMode: "fixed", hMode: "fixed" };
  const root = insertFragment(doc, frag, tmp);
  delete doc.nodes[tmp];
  const r = doc.nodes[root];
  Object.assign(r, { type: "frame", x, y });
  delete r.abs;
  p.frames.push(root);
  return root;
}

/** one new page per Figma page, keeping the screens where Figma had them */
export function addImportedPages(fileName: string, pages: ImportedPage[]) {
  const ids: string[] = [];
  let first = "";
  commit((doc) => {
    for (const ip of pages) {
      const p: Page = { id: uid("p"), name: pages.length > 1 || !fileName ? ip.name : `${fileName} · ${ip.name}`, frames: [] };
      doc.pages.push(p);
      if (!first) first = p.id;
      const minX = Math.min(...ip.frames.map((f) => f.x)), minY = Math.min(...ip.frames.map((f) => f.y));
      for (const f of ip.frames) ids.push(placeFrame(doc, p, f.frag, f.x - minX, f.y - minY));
    }
  });
  setState({ pageId: first, selection: [] });
  setTimeout(zoomToFit, 60);
  return ids.length;
}

/** HTML → a new screen to the right of the others */
export async function importHtml(html: string, opts: { width: number; baseUrl?: string; name?: string }) {
  const { frag, height, title } = await htmlToFragment(html, opts);
  const name = opts.name || title || "Imported page";
  let id = "";
  commit((doc) => {
    const p = doc.pages.find((x) => x.id === getState().pageId) ?? doc.pages[0];
    const pos = nextFramePosition(doc, p);
    id = placeFrame(doc, p, frag, pos.x, pos.y);
    const r: Node = doc.nodes[id];
    r.name = name;
    r.w = opts.width;
    r.wMode = "fixed";
    r.h = Math.max(200, height);
    r.hMode = opts.width >= 800 ? "hug" : "fixed";
    r.clip = true;
    const dev = DEVICE_BY_WIDTH[opts.width];
    if (dev) r.device = dev;
    if (!r.fill) r.fill = "#FFFFFF";
  });
  select([id]);
  setTimeout(() => focusNode(id), 60);
  return { id, count: Object.keys(frag.nodes).length };
}

export const currentPage = () => page();
