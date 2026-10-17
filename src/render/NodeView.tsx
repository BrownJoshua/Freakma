import { createContext, useContext, useEffect, useRef } from "react";
import type { Layout, Node, Theme } from "../model/types";
import { nodeStyle } from "./style";
import { iconSvg } from "./icons";

export interface EditCtx {
  editingId: string | null;
  onTextCommit?: (id: string, text: string) => void;
}
export const EditContext = createContext<EditCtx>({ editingId: null });

interface Props {
  id: string;
  nodes: Record<string, Node>;
  theme: Theme;
  parentLayout?: Layout;
  top?: boolean;
}

function EditableText({ n, style, onDone }: { n: Node; style: React.CSSProperties; onDone: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, []);
  return (
    <div
      ref={ref}
      data-node-id={n.id}
      style={{ ...style, outline: "none", cursor: "text" }}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onDone(e.currentTarget.innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) (e.currentTarget as HTMLElement).blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {n.text}
    </div>
  );
}

/** renders one node and its children as real DOM, so auto layout is plain CSS flexbox/grid */
export function NodeView({ id, nodes, theme, parentLayout, top }: Props) {
  const ctx = useContext(EditContext);
  const n = nodes[id];
  if (!n || n.hidden) return null;
  const style = nodeStyle(n, parentLayout, theme, top);

  if (n.type === "text") {
    if (ctx.editingId === id && ctx.onTextCommit) return <EditableText n={n} style={style} onDone={(t) => ctx.onTextCommit!(id, t)} />;
    return (
      <div data-node-id={id} style={style}>
        {n.text || " "}
      </div>
    );
  }
  if (n.type === "icon") {
    return <span data-node-id={id} style={style} dangerouslySetInnerHTML={{ __html: iconSvg(n.icon ?? "box", n.w, "currentColor") }} />;
  }
  if (n.type === "image") {
    return (
      <div data-node-id={id} style={style}>
        {n.src ? (
          <img src={n.src} alt={n.name} draggable={false} style={{ width: "100%", height: "100%", objectFit: n.fit ?? "cover", display: "block", pointerEvents: "none" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "rgba(0,0,0,.35)", pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: iconSvg("image", Math.max(20, Math.min(48, n.h / 3)), "currentColor", 1.5) }} />
        )}
      </div>
    );
  }
  return (
    <div data-node-id={id} style={style}>
      {n.children.map((c) => (
        <NodeView key={c} id={c} nodes={nodes} theme={theme} parentLayout={n.layout} />
      ))}
    </div>
  );
}
