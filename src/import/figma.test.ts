import { describe, expect, it } from "vitest";
import { convertFigma, parseFigmaUrl } from "./figma";
import type { FigmaFile } from "./figma";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const file: FigmaFile = {
  name: "Test",
  document: {
    id: "0:0", name: "Document", type: "DOCUMENT",
    children: [{
      id: "0:1", name: "Page 1", type: "CANVAS",
      children: [{
        id: "1:1", name: "Home", type: "FRAME", absoluteBoundingBox: box(100, 50, 390, 844), size: { x: 390, y: 844 },
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }], clipsContent: true,
        layoutMode: "VERTICAL", itemSpacing: 12, paddingTop: 24, paddingLeft: 16, paddingRight: 16, paddingBottom: 24,
        primaryAxisSizingMode: "FIXED", counterAxisSizingMode: "FIXED",
        children: [
          {
            id: "1:2", name: "Title", type: "TEXT", absoluteBoundingBox: box(116, 74, 200, 30), size: { x: 200, y: 30 },
            characters: "Hello", fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
            style: { fontFamily: "Inter", fontWeight: 700, fontSize: 24, lineHeightPx: 30, textAutoResize: "WIDTH_AND_HEIGHT" },
          },
          {
            id: "1:3", name: "Card", type: "FRAME", absoluteBoundingBox: box(116, 116, 358, 120), size: { x: 358, y: 120 },
            layoutSizingHorizontal: "FILL", layoutSizingVertical: "FIXED", cornerRadius: 12,
            effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 4 }, radius: 12 }],
            children: [{
              id: "1:4", name: "Dot", type: "ELLIPSE", absoluteBoundingBox: box(136, 136, 20, 20), size: { x: 20, y: 20 },
              fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }], fillGeometry: [{ path: "M0 10A10 10 0 1 0 20 10A10 10 0 1 0 0 10Z" }],
            }],
          },
          { id: "1:5", name: "Hidden", type: "RECTANGLE", visible: false, absoluteBoundingBox: box(0, 0, 1, 1) },
        ],
      }],
    }],
  },
};

describe("figma import", () => {
  it("parses links", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/AbC123xyz/My-File?node-id=12-34&t=x")).toEqual({ key: "AbC123xyz", nodeId: "12:34" });
    expect(parseFigmaUrl("https://www.figma.com/file/KEY1234567/x")).toEqual({ key: "KEY1234567", nodeId: undefined });
    expect(parseFigmaUrl("not a link")).toBeNull();
  });

  it("maps auto layout, text, shapes and positions", () => {
    const [page] = convertFigma(file);
    expect(page.name).toBe("Page 1");
    const { frag, x, y } = page.frames[0];
    expect([x, y]).toEqual([100, 50]);
    const root = frag.nodes[frag.root];
    expect(root.type).toBe("frame");
    expect(root.device).toBe("iphone");
    expect(root.layout).toMatchObject({ mode: "column", gap: 12, padding: [24, 16, 24, 16] });
    expect(root.fill).toBe("#FFFFFF");
    expect(root.children).toHaveLength(2); // hidden layer skipped
    const title = frag.nodes[root.children[0]];
    expect(title).toMatchObject({ type: "text", text: "Hello", fontSize: 24, fontWeight: 700, lineHeight: 1.25, wMode: "hug", hMode: "hug", color: "#000000" });
    const card = frag.nodes[root.children[1]];
    expect(card).toMatchObject({ wMode: "fill", radius: 12, layout: { mode: "free" } });
    expect(card.shadowCss).toContain("rgba(0, 0, 0, 0.2)");
    const dot = frag.nodes[card.children[0]];
    expect(dot).toMatchObject({ type: "vector", x: 20, y: 20, fill: "#FF0000", vw: 20 });
    expect(dot.d).toContain("M0 10");
  });

  it("imports only the linked frame", () => {
    const pages = convertFigma(file, {}, "1:3");
    expect(pages[0].frames).toHaveLength(1);
    const f = pages[0].frames[0];
    expect(f.frag.nodes[f.frag.root].name).toBe("Card");
  });
});
