import type { Doc, Layout, Node } from "../model/types";
import { nodeStyle, cssText } from "../render/style";
import { iconSvg } from "../render/icons";
import { color, textSpec } from "../model/theme";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const fileSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";

const HEADING: Record<string, string> = { display: "h1", h1: "h1", h2: "h2", h3: "h3", h4: "h4" };

function fontsLink(doc: Doc): string {
  const fams = new Set<string>([doc.theme.fonts.heading, doc.theme.fonts.body, doc.theme.fonts.mono]);
  for (const n of Object.values(doc.nodes)) if (n.fontFamily) fams.add(n.fontFamily);
  const q = [...fams].filter((f) => !/system-ui|georgia/i.test(f)).map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
  return q ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">` : "";
}

/** one screen as a standalone HTML page (links to other screens become <a href="other.html">) */
export function frameToHTML(doc: Doc, frameId: string): string {
  const t = doc.theme;
  const walk = (id: string, parent: Layout | undefined, top: boolean, depth: number): string => {
    const n = doc.nodes[id];
    if (!n || n.hidden) return "";
    const pad = "  ".repeat(depth);
    const st = nodeStyle(n, parent, t, top);
    if (n.link) st.cursor = "pointer";
    const style = esc(cssText(st));
    const wrapLink = (inner: string) => (n.link && doc.nodes[n.link] ? `${pad}<a href="${fileSlug(doc.nodes[n.link].name)}.html" style="text-decoration:none;color:inherit;display:contents">\n${inner}\n${pad}</a>` : inner);
    if (n.type === "text") {
      const tag = HEADING[n.textStyle ?? ""] ?? "p";
      return wrapLink(`${pad}<${tag} style="${style}">${esc(n.text ?? "").replace(/\n/g, "<br>")}</${tag}>`);
    }
    if (n.type === "icon") return wrapLink(`${pad}<span style="${style}">${iconSvg(n.icon ?? "box", n.w, "currentColor")}</span>`);
    if (n.type === "image") {
      return wrapLink(n.src ? `${pad}<div style="${style}"><img src="${esc(n.src)}" alt="${esc(n.name)}" style="width:100%;height:100%;object-fit:${n.fit ?? "cover"};display:block"></div>` : `${pad}<div style="${style}" aria-label="${esc(n.name)}"></div>`);
    }
    const kids = n.children.map((c) => walk(c, n.layout, false, depth + 1)).filter(Boolean).join("\n");
    return wrapLink(`${pad}<div style="${style}">\n${kids}\n${pad}</div>`);
  };
  const f = doc.nodes[frameId];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(f.name)}</title>
${fontsLink(doc)}
<style>
  body { margin: 0; background: ${color(t, "$background")}; }
  h1, h2, h3, h4, p { margin: 0; }
  * { box-sizing: border-box; }
  .screen { margin: 0 auto; max-width: 100%; }
</style>
</head>
<body>
<!-- Exported from Freakma -->
<div class="screen">
${walk(frameId, undefined, true, 1)}
</div>
</body>
</html>
`;
}

/** one screen as a React component (inline style objects, no dependencies) */
export function frameToReact(doc: Doc, frameId: string): string {
  const t = doc.theme;
  const f = doc.nodes[frameId];
  const comp = fileSlug(f.name).split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join("") || "Screen";
  const obj = (s: object) => JSON.stringify(s).replace(/"([a-zA-Z]+)":/g, "$1: ");
  const walk = (id: string, parent: Layout | undefined, top: boolean, depth: number): string => {
    const n = doc.nodes[id];
    if (!n || n.hidden) return "";
    const pad = "  ".repeat(depth);
    const st = nodeStyle(n, parent, t, top);
    const click = n.link && doc.nodes[n.link] ? ` onClick={() => onNavigate?.(${JSON.stringify(fileSlug(doc.nodes[n.link].name))})}` : "";
    if (n.link) st.cursor = "pointer";
    if (n.type === "text") {
      const tag = HEADING[n.textStyle ?? ""] ?? "p";
      return `${pad}<${tag} style={${obj(st)}}${click}>{${JSON.stringify(n.text ?? "")}}</${tag}>`;
    }
    if (n.type === "icon") return `${pad}<span style={${obj(st)}}${click} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(iconSvg(n.icon ?? "box", n.w, "currentColor"))} }} />`;
    if (n.type === "image") return n.src ? `${pad}<div style={${obj(st)}}${click}><img src={${JSON.stringify(n.src)}} alt={${JSON.stringify(n.name)}} style={{ width: "100%", height: "100%", objectFit: "${n.fit ?? "cover"}", display: "block" }} /></div>` : `${pad}<div style={${obj(st)}} aria-label={${JSON.stringify(n.name)}} />`;
    const kids = n.children.map((c) => walk(c, n.layout, false, depth + 1)).filter(Boolean).join("\n");
    return `${pad}<div style={${obj(st)}}${click}>\n${kids}\n${pad}</div>`;
  };
  return `// Exported from Freakma: ${f.name}
// Fonts used: ${[t.fonts.heading, t.fonts.body, t.fonts.mono].filter((v, i, a) => a.indexOf(v) === i).join(", ")}

export default function ${comp}({ onNavigate }) {
  return (
${walk(frameId, undefined, true, 2)}
  );
}
`;
}

/** plain-language spec of a screen, handy for prompts and handoff */
export function frameToSpec(doc: Doc, frameId: string): string {
  const t = doc.theme;
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    const n: Node | undefined = doc.nodes[id];
    if (!n || n.hidden) return;
    const pad = "  ".repeat(depth);
    if (n.type === "text") lines.push(`${pad}- text (${n.textStyle ?? "body"}, ${textSpec(t, n).size}px): "${n.text}"`);
    else if (n.type === "icon") lines.push(`${pad}- icon ${n.icon}`);
    else if (n.type === "image") lines.push(`${pad}- image ${n.name}`);
    else {
      lines.push(`${pad}- ${n.name}${n.layout ? ` [${n.layout.mode}, gap ${n.layout.gap}]` : ""}${n.link ? ` → opens "${doc.nodes[n.link]?.name}"` : ""}`);
      n.children.forEach((c) => walk(c, depth + 1));
    }
  };
  walk(frameId, 0);
  return lines.join("\n");
}
