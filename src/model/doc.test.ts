import { describe, expect, it } from "vitest";
import { duplicate, extract, insertFragment, makeFrame, moveNode, newDoc, normalize, parentOf, removeNode, wrap } from "./doc";
import { PARTS } from "../parts/library";
import { frameToHTML, frameToReact } from "../export/code";

function setup() {
  const doc = newDoc();
  const f = makeFrame(doc, doc.pages[0], "desktop", 0, 0);
  return { doc, f };
}

describe("document operations", () => {
  it("every library part builds a valid fragment", () => {
    for (const p of PARTS) {
      const frag = p.make();
      expect(frag.nodes[frag.root], p.name).toBeTruthy();
      for (const n of Object.values(frag.nodes)) for (const c of n.children) expect(frag.nodes[c], `${p.name} → ${c}`).toBeTruthy();
    }
    expect(PARTS.length).toBeGreaterThan(60);
  });

  it("inserts a part with fresh ids at an index", () => {
    const { doc, f } = setup();
    const p = PARTS.find((x) => x.name === "Primary button")!;
    const a = insertFragment(doc, p.make(), f.id);
    const b = insertFragment(doc, p.make(), f.id, 0);
    expect(f.children).toEqual([b, a]);
    expect(a).not.toEqual(b);
  });

  it("moves nodes, adjusting the index inside the same parent, and refuses cycles", () => {
    const { doc, f } = setup();
    const ids = ["Heading", "Paragraph", "Label"].map((n) => insertFragment(doc, PARTS.find((x) => x.name === n)!.make(), f.id));
    expect(moveNode(doc, ids[0], f.id, 3)).toBe(true);
    expect(f.children).toEqual([ids[1], ids[2], ids[0]]);
    const box = wrap(doc, [ids[1], ids[2]])!;
    expect(moveNode(doc, box, ids[1], 0)).toBe(false);
    expect(parentOf(doc, ids[1])?.id).toBe(box);
  });

  it("duplicates and removes whole subtrees", () => {
    const { doc, f } = setup();
    const card = insertFragment(doc, PARTS.find((x) => x.name === "Card")!.make(), f.id);
    const before = Object.keys(doc.nodes).length;
    const copy = duplicate(doc, card)!;
    expect(Object.keys(doc.nodes).length).toBe(before + Object.keys(extract(doc, card).nodes).length);
    removeNode(doc, copy);
    expect(Object.keys(doc.nodes).length).toBe(before);
  });

  it("normalize repairs dangling children", () => {
    const { doc, f } = setup();
    f.children.push("ghost");
    const d = normalize(JSON.parse(JSON.stringify(doc)));
    expect(d.nodes[f.id].children).not.toContain("ghost");
  });

  it("exports HTML and React that contain the copy", () => {
    const { doc, f } = setup();
    insertFragment(doc, PARTS.find((x) => x.name === "Login form")!.make(), f.id);
    const html = frameToHTML(doc, f.id);
    expect(html).toContain("Welcome back");
    expect(html).toContain("display: flex");
    const jsx = frameToReact(doc, f.id);
    expect(jsx).toContain("export default function");
    expect(jsx).toContain('"Welcome back"');
  });
});
