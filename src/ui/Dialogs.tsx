import { useRef, useState } from "react";
import { setState, toast, useStore } from "../model/store";
import { getUser, saveUser } from "../model/user";
import { bridge, isDesktop } from "../platform";
import { convertFigma, fetchFigma, parseFigmaUrl } from "../import/figma";
import type { FigmaFile } from "../import/figma";
import { addImportedPages, importHtml, importHtmlScreens, readHtmlFolder } from "../import/apply";
import type { HtmlFile } from "../import/htmlScreens";
import { host, join, leave } from "../collab/client";
import { Ico } from "./controls";

const close = () => setState({ dialog: null });
const TOKEN_KEY = "freakma:figma-token";

function Modal({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onClick={close}>
      <div className={"modal" + (wide ? " modal-wide" : "")} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
  const [src, setSrc] = useState<"paste" | "file" | "folder" | "url">("file");
  const [html, setHtml] = useState("");
  const [url, setUrl] = useState("https://");
  const [width, setWidth] = useState(390);
  const [split, setSplit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const go = async () => {
    setBusy(true);
    setStatus("Rendering the page…");
    try {
      let files: HtmlFile[] = [];
      if (src === "paste") {
        if (!html.trim()) throw new Error("Paste some HTML first");
        files = [{ name: "pasted.html", html }];
      } else if (src === "file" || src === "folder") {
        if (!picked.length) throw new Error(src === "folder" ? "Choose the folder first" : "Choose the .html file(s) first");
        setStatus("Reading files, styles and images…");
        files = await readHtmlFolder(picked);
        if (!files.length) throw new Error("No .html files in what you picked");
      } else {
        if (!/^https?:\/\//.test(url)) throw new Error("Enter a web address starting with https://");
        let text = "";
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
        files = [{ name: new URL(url).hostname + ".html", html: text, baseUrl: url }];
      }
      if (split) {
        const r = await importHtmlScreens(files, { width, pageName: files.length > 1 ? "Imported prototype" : files[0].name.replace(/\.html?$/i, ""), onStatus: setStatus });
        toast(`Imported ${r.screens} screens${r.popups ? ` (${r.popups} popups)` : ""} with ${r.links} wired links${r.unresolved ? ` · ${r.unresolved} links pointed nowhere` : ""}`);
      } else {
        for (const f of files) await importHtml(f.html, { width, baseUrl: f.baseUrl, name: f.name.replace(/\.html?$/i, "") });
        toast(files.length > 1 ? `Imported ${files.length} pages` : "Imported. Everything is editable.");
      }
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
        <button type="button" className={src === "file" ? "on" : ""} onClick={() => setSrc("file")}>HTML file(s)</button>
        <button type="button" className={src === "folder" ? "on" : ""} onClick={() => setSrc("folder")}>Whole folder</button>
        <button type="button" className={src === "paste" ? "on" : ""} onClick={() => setSrc("paste")}>Paste HTML</button>
        <button type="button" className={src === "url" ? "on" : ""} onClick={() => setSrc("url")}>Website</button>
      </div>
      {src === "paste" && <textarea rows={9} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<!doctype html>…  (styles in <style> tags are used)" autoFocus />}
      {(src === "file" || src === "folder") && (
        <div className="imp-row">
          <button type="button" onClick={() => (src === "folder" ? folderRef : fileRef).current?.click()}>
            <Ico name={src === "folder" ? "folder" : "upload"} size={14} />
            {src === "folder" ? "Choose a folder" : "Choose .html files"}
          </button>
          <span className="hint">
            {picked.length
              ? `${picked.filter((f) => /\.html?$/i.test(f.name)).length} HTML file(s)${picked.length > 1 ? `, ${picked.filter((f) => !/\.html?$/i.test(f.name)).length} other files (CSS, images)` : ""}`
              : src === "folder"
                ? "Pick the folder that holds your pages, CSS and images. Links between the pages become wires."
                : "Pick one file, or several pages that link to each other (with their .css files)."}
          </span>
          <input ref={fileRef} type="file" accept=".html,.htm,.css,image/*,text/html" multiple hidden onChange={(e) => setPicked(Array.from(e.target.files ?? []))} />
          <input ref={folderRef} type="file" hidden multiple {...({ webkitdirectory: "", directory: "" } as object)} onChange={(e) => setPicked(Array.from(e.target.files ?? []))} />
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
      <label className="opt">
        <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        Split into screens and popups, and wire up the buttons and links between them
      </label>
      <div className="imp-row end">
        <button type="button" className="primary" disabled={busy} onClick={go}>{busy ? "Importing…" : split ? "Import as wired screens" : "Import as an editable screen"}</button>
      </div>
      {status && <p className="imp-status">{status}</p>}
      <p className="hint">
        Hidden screens, tabs and popups in the page each become a screen; <code>href="#id"</code>, <code>href="page.html"</code>,
        <code>data-target</code> and <code>onclick="show('id')"</code> become prototype links, and close buttons in popups lead back.
        Scripts never run, so content that only JavaScript creates won't appear. Flex and grid become auto layout.
      </p>
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
