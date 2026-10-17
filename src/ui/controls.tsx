import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { iconSvg } from "../render/icons";
import type { Theme } from "../model/types";
import { COLOR_LABELS } from "../model/theme";

export const Ico = ({ name, size = 16 }: { name: string; size?: number }) => <span className="ico" dangerouslySetInnerHTML={{ __html: iconSvg(name, size, "currentColor", 1.8) }} />;

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="sec">
      <header>
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-l">{label}</span>
      <div className="row-c">{children}</div>
    </div>
  );
}

/** number input that commits on Enter/blur and supports arrow keys */
export function Num({ value, onChange, min, max, step = 1, suffix, width }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; width?: number }) {
  const [v, setV] = useState(value === undefined ? "" : String(value));
  useEffect(() => setV(value === undefined ? "" : String(value)), [value]);
  const done = () => {
    const n = Number(v);
    if (v === "" || Number.isNaN(n)) return setV(value === undefined ? "" : String(value));
    const c = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
    if (c !== value) onChange(c);
  };
  return (
    <label className="num" style={width ? { width } : undefined}>
      <input
        value={v}
        inputMode="decimal"
        onChange={(e) => setV(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = (Number(v) || 0) + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const c = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Math.round(n * 100) / 100));
            setV(String(c));
            onChange(c);
          }
        }}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T | undefined; options: { v: T; label?: string; icon?: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? "on" : ""} title={o.title ?? o.label} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.icon ? <Ico name={o.icon} size={14} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T | undefined; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select className="sel" value={value ?? ""} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Text({ value, onChange, placeholder, multiline }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const p = { value: v, placeholder, onChange: (e: { target: { value: string } }) => setV(e.target.value), onBlur: () => v !== (value ?? "") && onChange(v) };
  return multiline ? <textarea className="txt" rows={3} {...p} /> : <input className="txt" {...p} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

/** theme swatches first, then a custom colour, then "none" */
export function ColorPick({ value, theme, onChange, allowNone = true }: { value: string | undefined; theme: Theme; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  const resolved = value?.startsWith("$") ? theme.colors[value.slice(1)] : value;
  const keys = Object.keys(theme.colors);
  return (
    <div className="colorpick">
      <div className="swatches">
        {allowNone && <button type="button" className={"sw none" + (!value ? " on" : "")} title="None" onClick={() => onChange(undefined)} />}
        {keys.map((k) => (
          <button key={k} type="button" className={"sw" + (value === "$" + k ? " on" : "")} title={COLOR_LABELS[k] ?? k} style={{ background: theme.colors[k] }} onClick={() => onChange("$" + k)} />
        ))}
      </div>
      <div className="custom">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(resolved ?? "") ? resolved : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
        <span>{value?.startsWith("$") ? COLOR_LABELS[value.slice(1)] ?? value : value ?? "None"}</span>
      </div>
    </div>
  );
}
