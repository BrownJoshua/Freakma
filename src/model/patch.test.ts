import { describe, expect, it } from "vitest";
import { applyPatch, diff } from "./patch";
import { makeFrame, newDoc } from "./doc";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("patches", () => {
  it("round-trips forward and back", () => {
    const a = newDoc();
    makeFrame(a, a.pages[0], "iphone", 0, 0);
    const b = clone(a);
    const f = b.pages[0].frames[0];
    b.nodes[f].name = "Login";
    b.nodes.t1 = { id: "t1", type: "text", name: "Hi", children: [], w: 10, h: 10, wMode: "hug", hMode: "hug", text: "Hi" };
    b.nodes[f].children.push("t1");
    b.theme.colors.primary = "#FF0000";
    const d = diff(a, b)!;
    expect(d).not.toBeNull();
    const fwd = applyPatch(clone(a), d.fwd);
    expect(fwd).toEqual(b);
    const back = applyPatch(clone(b), d.back);
    expect(back).toEqual(a);
  });

  it("returns null when nothing changed", () => {
    const a = newDoc();
    expect(diff(a, clone(a))).toBeNull();
  });

  it("drops dangling children when a remote patch deletes a node", () => {
    const a = newDoc();
    const f = makeFrame(a, a.pages[0], "iphone", 0, 0);
    a.nodes.k = { id: "k", type: "box", name: "k", children: [], w: 1, h: 1, wMode: "fixed", hMode: "fixed" };
    f.children.push("k");
    const out = applyPatch(clone(a), { nodes: { k: null } });
    expect(out.nodes[f.id].children).toEqual([]);
  });
});
