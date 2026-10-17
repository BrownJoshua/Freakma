import { useRef, useState } from "react";
import { setState, toast, useStore } from "../model/store";
import { getUser, saveUser } from "../model/user";
import { bridge, isDesktop } from "../platform";
import { convertFigma, fetchFigma, parseFigmaUrl } from "../import/figma";
import type { FigmaFile } from "../import/figma";
import { addImportedPages, importHtml } from "../import/apply";
import { host, join, leave } from "../collab/client";
import { Ico } from "./controls";

const close = () => setState({ dialog: null });
const TOKEN_KEY = "freakma:figma-token";

function Modal({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onClick={close}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="x" onClick={close} aria-label="Close"><Ico name="close" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

/* ================= Import ================= */

export function ImportDialog() {
  const [tab, setTab] = useState<"figma" | "html">("figma");
  return (
    <Modal title="Import" wide>
      <div className="seg big">
        <button type="button" className={tab === "figma" ? "on" : ""} onClick={() => setTab("figma")}>From Figma</button>
        <button type="button" className={tab === "html" ? "on" : ""} onClick={() => setTab("html")}>From HTML / a website</button>
      </div>
      {tab === "figma" ? <FigmaImport /> : <HtmlImport />}
    </Modal>
  );
}

function FigmaImport() {
  const [link, setLink] = useState("");
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = (name: string, n: number) => {
    toast(`Imported ${n} screen${n === 1 ? "" : "s"} from ${name}`);
    close();
  };
  const go = async () => {
    if (!parseFigmaUrl(link)) return setStatus("Paste the link of a Figma file (Share → Copy link).");
    if (!token.trim()) return setStatus("Paste your Figma personal access token.");
    try {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } catch {}
    setBusy(true);
    try {
      const r = await fetchFigma(link, token.trim(), setStatus);
      done(r.name, addImportedPages(r.name, r.pages));
    } catch (e) {
      const msg = (e as Error).message;
      setStatus(!isDesktop && /fetch/i.test(msg) ? "The browser blocked the request to Figma. Use the desktop app, or import a saved .json copy below." : msg);
    } finally {
      setBusy(false);
    }
  };
  const fromFile = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      // either the /v1/files response, or a /v1/files/:key/nodes response
      let file: FigmaFile = raw;
      if (!raw.document && raw.nodes) {
        const docs = Object.values(raw.nodes as Record<string, { document: FigmaFile["document"] }>).map((n) => n.document);
        file = { name: raw.name, document: { id: "0:0", name: "Document", type: "DOCUMENT", children: [{ id: "0:1", name: raw.name ?? "Imported", type: "CANVAS", children: docs }] } };
      }
      if (!file.document) throw new Error("That file isn't a Figma API export");
      done(file.name ?? f.name, addImportedPages(file.name ?? "", convertFigma(file)));
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <div className="imp">
      <label className="field">
        <span>Figma file link</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.figma.com/design/…" autoFocus />
      </label>
      <p className="hint">Link to the whole file, or to one frame (right-click a frame → Copy link to selection) to import only that screen.</p>
      <label className="field">
        <span>Personal access token</span>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="figd_…" />
      </label>
      <p className="hint">
        In Figma: your avatar → Settings → Security → Personal access tokens → Generate (read access to file content is enough). It stays on this computer.
      </p>
      <div className="imp-row">
        <button type="button" onClick={() => fileRef.current?.click()}><Ico name="upload" size={14} />Import a saved Figma .json</button>
        <button type="button" className="primary" disabled={busy} onClick={go}>{busy ? "Importing…" : "Import from Figma"}</button>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
      {status && <p className="imp-status">{status}</p>}
      <p className="hint">
        Auto-layout frames stay auto layout; plain frames and groups become free-position containers. Text, colours, gradients,
        corner radius, shadows, images and vector shapes come across. Fonts you don't have installed fall back to a similar one.
      </p>
    </div>
  );
}

function HtmlImport() {
  const [src, setSrc] = useState<"paste" | "file" | "url">("paste");
  const [html, setHtml] = useState("");
  const [url, setUrl] = useState("https://");
  const [width, setWidth] = useState(1440);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const go = async () => {
    setBusy(true);
    setStatus("Rendering the page…");
    try {
      let text = html, base: string | undefined, name = fileName.replace(/\.html?$/i, "");
      if (src === "url") {
        if (!/^https?:\/\//.test(url)) throw new Error("Enter a web address starting with https://");
        if (bridge) {
          // a real browser render picks up the page's JavaScript-built content too
          const r = await bridge.captureUrl(url, width).catch(() => null);
          if (r) text = r.html;
          else {
            const f = await bridge.fetchUrl(url);
            if (!f.ok) throw new Error(`The site answered ${f.status}`);
            text = f.text ?? "";
          }
        } else {
          const f = await fetch(url).catch(() => null);
          if (!f) throw new Error("The browser blocked fetching that site. Use the desktop app, or save the page and import the file.");
          text = await f.text();
        }
        base = url;
        name = new URL(url).hostname;
      }
      if (!text.trim()) throw new Error("There is no HTML to import yet");
      const r = await importHtml(text, { width, baseUrl: base, name: name || undefined });
      toast(`Imported ${r.count} layers. Everything is editable.`);
      close();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="imp">
      <div className="seg">
        <button type="button" className={src === "paste" ? "on" : ""} onClick={() => setSrc("paste")}>Paste HTML</button>
        <button type="button" className={src === "file" ? "on" : ""} onClick={() => setSrc("file")}>HTML file</button>
        <button type="button" className={src === "url" ? "on" : ""} onClick={() => setSrc("url")}>Website</button>
      </div>
      {src === "paste" && <textarea rows={9} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<!doctype html>…  (styles in <style> tags are used)" autoFocus />}
      {src === "file" && (
        <div className="imp-row">
          <button type="button" onClick={() => fileRef.current?.click()}><Ico name="upload" size={14} />Choose an .html file</button>
          <span className="hint">{fileName || "Inline <style> and styles from absolute links are used."}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              setHtml(await f.text());
            }}
          />
        </div>
      )}
      {src === "url" && (
        <>
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} autoFocus />
          {!isDesktop && <p className="hint">Most sites only allow this from the desktop app.</p>}
        </>
      )}
      <div className="imp-row">
        <span>Screen width</span>
        <div className="seg">
          <button type="button" className={width === 1440 ? "on" : ""} onClick={() => setWidth(1440)}>Desktop 1440</button>
          <button type="button" className={width === 1280 ? "on" : ""} onClick={() => setWidth(1280)}>Laptop 1280</button>
          <button type="button" className={width === 390 ? "on" : ""} onClick={() => setWidth(390)}>Mobile 390</button>
        </div>
      </div>
      <div className="imp-row end">
        <button type="button" className="primary" disabled={busy} onClick={go}>{busy ? "Importing…" : "Import as an editable screen"}</button>
      </div>
      {status && <p className="imp-status">{status}</p>}
      <p className="hint">Flex and grid become auto layout, positioned elements become free layers, and text keeps its fonts and colours. Scripts never run.</p>
    </div>
  );
}

/* ================= Share / live collaboration ================= */

export function ShareDialog() {
  const collab = useStore((s) => s.collab);
  const peers = useStore((s) => s.peers);
  const [name, setName] = useState(getUser().name);
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const live = collab.role !== "off";
  const keepName = () => {
    const u = getUser();
    if (name.trim() !== u.name) saveUser({ ...u, name: name.trim() });
  };

  return (
    <Modal title="Work together live">
      <label className="field">
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={keepName} placeholder="Shown on your cursor and comments" />
      </label>

      {live ? (
        <div className="share-live">
          <p className="status-line"><span className={"dot" + (collab.status === "Live" ? " on" : "")} />{collab.status || "…"} · {collab.role === "host" ? "you are hosting" : "joined"}</p>
          {collab.role === "host" && (
            <div className="share-code">
              <div>
                <small>Address</small>
                <strong>{collab.address}</strong>
              </div>
              <div>
                <small>Code</small>
                <strong>{collab.code}</strong>
              </div>
              <button type="button" onClick={() => navigator.clipboard?.writeText(`Join my Freakma design: File → Work together → Join · address ${collab.address} · code ${collab.code}`).then(() => toast("Invite copied"))}>
                <Ico name="share" size={14} />Copy invite
              </button>
            </div>
          )}
          <h4>In this session</h4>
          <ul className="people">
            <li><span className="av" style={{ background: getUser().color }}>{(name || "You")[0].toUpperCase()}</span>{name || "You"} (you)</li>
            {Object.values(peers).map((p) => (
              <li key={p.id}><span className="av" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>{p.name}</li>
            ))}
          </ul>
          <button type="button" className="danger wide" onClick={() => leave()}>{collab.role === "host" ? "Stop the session" : "Leave"}</button>
        </div>
      ) : (
        <>
          <section className="share-opt">
            <h4>Host from this computer</h4>
            <p className="hint">Others on the same network (office Wi-Fi, LAN or a VPN) join with your address and code and edit with you in real time. Everything stays on your network.</p>
            <button type="button" className="primary" disabled={!isDesktop} onClick={() => (keepName(), host()?.catch((e: Error) => toast(e.message)))}>
              <Ico name="users" size={14} />Start a live session
            </button>
            {!isDesktop && <p className="hint">Hosting needs the desktop app. You can still join a session from here.</p>}
          </section>
          <section className="share-opt">
            <h4>Join someone</h4>
            <div className="imp-row">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address, e.g. 192.168.1.20:4848" />
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={6} style={{ width: 90 }} />
            </div>
            <button type="button" disabled={!address.trim() || code.trim().length < 4} onClick={() => (keepName(), join(address, code))}>Join</button>
            <p className="hint">Joining replaces what's on your canvas with the shared design. Save your own work first.</p>
          </section>
        </>
      )}
    </Modal>
  );
}
