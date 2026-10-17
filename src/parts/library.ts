import type { Fragment } from "../model/types";
import { Builder, make } from "./builder";

export interface PartDef {
  id: string;
  name: string;
  cat: string;
  /** width of the box the preview tile renders the part into */
  previewW: number;
  /** screen templates become a whole new frame on this device */
  screen?: string;
  keywords?: string;
  make: () => Fragment;
}

export const CATEGORIES = ["Screens", "Basics", "Buttons", "Inputs", "Web navigation", "Mobile", "Data", "Feedback", "Sections", "ERP"];

const P: PartDef[] = [];
const def = (cat: string, name: string, fn: (b: Builder) => string, previewW = 480, extra: Partial<PartDef> = {}) =>
  P.push({ id: `${cat}/${name}`.toLowerCase().replace(/[^a-z0-9/]+/g, "-"), name, cat, previewW, make: () => make(fn), ...extra });

/* ================= Basics ================= */
def("Basics", "Heading", (b) => b.text("Page heading", "h1", { wMode: "fill" }));
def("Basics", "Subheading", (b) => b.text("Section heading", "h3", { wMode: "fill" }));
def("Basics", "Paragraph", (b) => b.text("Write a short paragraph here. Keep lines under about 70 characters so they stay easy to read.", "body", { wMode: "fill", color: "$textMuted" }));
def("Basics", "Label", (b) => b.text("Label", "label"));
def("Basics", "Overline", (b) => b.text("Section label", "overline", { color: "$primary" }));
def("Basics", "Link", (b) => b.text("Learn more", "label", { color: "$primary", underline: true }));
def("Basics", "Vertical stack", (b) => b.col({ name: "Vertical stack", gap: 12, pad: 16, stroke: "$border", strokeWidth: 1, radius: "md" }, [b.text("Item one"), b.text("Item two"), b.text("Item three")]));
def("Basics", "Horizontal row", (b) => b.row({ name: "Horizontal row", gap: 12, pad: 16, stroke: "$border", strokeWidth: 1, radius: "md" }, [b.text("Left"), b.text("Middle"), b.text("Right")]));
def("Basics", "Grid · 3 columns", (b) => b.grid({ name: "Grid", gap: 16, columns: 3 }, [1, 2, 3, 4, 5, 6].map((i) => b.card([b.text(`Item ${i}`, "label")], { pad: 16 }))));
def("Basics", "Card", (b) => b.card([b.text("Card title", "h4"), b.text("Supporting text that explains what this card is about.", "bodySm", { color: "$textMuted", wMode: "fill" })], { wMode: "fixed", w: 320 }));
def("Basics", "Image", (b) => b.img({ w: 360, h: 200 }));
def("Basics", "Image card", (b) => b.col({ name: "Image card", gap: 0, wMode: "fixed", w: 320, fill: "$surface", radius: "md", stroke: "$border", strokeWidth: 1, clip: true }, [b.img({ radius: "none", h: 160 }), b.col({ gap: 6, pad: 16 }, [b.text("Card headline", "h4"), b.text("Supporting text goes here.", "bodySm", { color: "$textMuted" })])]));
def("Basics", "Icon", (b) => b.icon("star", 24, "$primary"));
def("Basics", "Divider", (b) => b.divider());
def("Basics", "Spacer", (b) => b.col({ name: "Spacer", hMode: "fixed", h: 32 }));
def("Basics", "Avatar", (b) => b.avatar("MS", 48));

/* ================= Buttons ================= */
def("Buttons", "Primary button", (b) => b.button("Save changes", "primary"));
def("Buttons", "Secondary button", (b) => b.button("Save draft", "secondary"));
def("Buttons", "Outline button", (b) => b.button("Cancel", "outline"));
def("Buttons", "Text button", (b) => b.button("Learn more", "ghost"));
def("Buttons", "Danger button", (b) => b.button("Delete", "danger"));
def("Buttons", "Button with icon", (b) => b.button("New invoice", "primary", { icon: "plus" }));
def("Buttons", "Icon button", (b) => b.button("", "outline", { icon: "edit" }));
def("Buttons", "Floating action button", (b) => b.button("Create", "secondary", { icon: "plus", h: 56, radius: "lg", shadow: "md", pad: [0, 20] }));
def("Buttons", "Button pair", (b) => b.row({ name: "Button pair", gap: 12, justify: "end" }, [b.button("Cancel", "outline"), b.button("Confirm", "primary")]));
def("Buttons", "Full-width button", (b) => b.button("Continue", "primary", { wMode: "fill", h: 48 }));
def("Buttons", "Segmented control", (b) =>
  b.row({ name: "Segmented", gap: 0, wMode: "hug", radius: "md", stroke: "$border", strokeWidth: 1, clip: true }, [
    b.row({ pad: [0, 16], hMode: "fixed", h: 40, wMode: "hug", fill: "$primarySoft", gap: 6 }, [b.icon("check", 16, "$onPrimarySoft"), b.text("Day", "label", { color: "$onPrimarySoft" })]),
    b.row({ pad: [0, 16], hMode: "fixed", h: 40, wMode: "hug", stroke: "$border", strokeWidth: 0 }, [b.text("Week", "label")]),
    b.row({ pad: [0, 16], hMode: "fixed", h: 40, wMode: "hug" }, [b.text("Month", "label")]),
  ]),
);

/* ================= Inputs ================= */
def("Inputs", "Text field", (b) => b.field("Full name", "Enter your name"));
def("Inputs", "Email field", (b) => b.field("Email", "name@company.com", { icon: "mail" }));
def("Inputs", "Password field", (b) => b.field("Password", "••••••••", { icon: "lock", trailing: "eye" }));
def("Inputs", "Search field", (b) => b.field("", "Search", { icon: "search" }));
def("Inputs", "Text area", (b) => b.field("Notes", "Type a message…", { multiline: true }));
def("Inputs", "Select", (b) => b.field("State", "Tamil Nadu (33)", { trailing: "chevron-down", value: "Tamil Nadu (33)" }));
def("Inputs", "Date picker", (b) => b.field("Invoice date", "DD/MM/YYYY", { icon: "calendar", value: "17/10/2026" }));
def("Inputs", "Field with help", (b) => b.field("GSTIN", "15-character GST number", { help: "Found on the supplier's tax invoice." }));
def("Inputs", "Checkbox", (b) => b.check("I agree to the terms", true));
def("Inputs", "Checkbox group", (b) => b.col({ name: "Checkbox group", gap: 4 }, [b.text("Notify me by", "label"), b.check("Email", true), b.check("SMS", false), b.check("WhatsApp", true)]));
def("Inputs", "Radio group", (b) => b.col({ name: "Radio group", gap: 4 }, [b.text("Payment terms", "label"), b.radio("Advance", false), b.radio("Net 30", true), b.radio("Net 45", false)]));
def("Inputs", "Switch", (b) => b.toggle("Send PO by WhatsApp", true));
def("Inputs", "Slider", (b) =>
  b.col({ name: "Slider", gap: 8 }, [
    b.row({ justify: "between" }, [b.text("Discount", "label"), b.text("12%", "mono")]),
    b.row({ name: "Track", hMode: "fixed", h: 6, radius: "full", fill: "$surfaceAlt", gap: 0 }, [b.row({ name: "Filled", wMode: "fixed", w: 90, hMode: "fill", radius: "full", fill: "$primary" }), b.row({ name: "Thumb", wMode: "fixed", w: 20, hMode: "fixed", h: 20, radius: "full", fill: "$primary", shadow: "sm" })]),
  ]),
);
def("Inputs", "Filter chips", (b) => b.row({ name: "Chips", gap: 8, wrap: true }, [b.chip("Low stock", true), b.chip("Main plant"), b.chip("This month", false, "calendar")]));
def("Inputs", "Quantity stepper", (b) =>
  b.row({ name: "Stepper", gap: 0, wMode: "hug", radius: "sm", stroke: "$border", strokeWidth: 1 }, [
    b.button("", "ghost", { icon: "minus", h: 40, w: 40 }),
    b.row({ wMode: "fixed", w: 56, hMode: "fixed", h: 40, justify: "center" }, [b.text("12", "mono")]),
    b.button("", "ghost", { icon: "plus", h: 40, w: 40 }),
  ]),
);
def("Inputs", "File upload", (b) =>
  b.col({ name: "File upload", gap: 8, pad: 24, align: "center", radius: "md", stroke: "$border", strokeWidth: 2, fill: "$surfaceAlt" }, [
    b.icon("upload", 28, "$primary"),
    b.text("Drop files here or browse", "label"),
    b.text("PDF, JPG or PNG up to 10 MB", "caption", { color: "$textMuted" }),
  ]),
);

/* ================= Web navigation ================= */
def("Web navigation", "Top navigation bar", (b) =>
  b.row({ name: "Top nav", gap: 24, pad: [0, 32], hMode: "fixed", h: 64, fill: "$surface", stroke: "$border", strokeWidth: 1, justify: "between" }, [
    b.row({ gap: 10, wMode: "hug" }, [b.row({ wMode: "fixed", w: 32, hMode: "fixed", h: 32, radius: "sm", fill: "$primary", justify: "center" }, [b.text("F", "label", { color: "$onPrimary" })]), b.text("Brand", "h4")]),
    b.row({ gap: 24, wMode: "hug" }, [b.text("Product", "label"), b.text("Pricing", "label"), b.text("Customers", "label"), b.text("Docs", "label")]),
    b.row({ gap: 12, wMode: "hug" }, [b.button("Sign in", "ghost"), b.button("Get started", "primary")]),
  ]),
  1100,
);
def("Web navigation", "Sidebar", (b) => {
  const item = (icon: string, label: string, on = false) =>
    b.row({ name: `Nav · ${label}`, gap: 10, pad: [0, 12], hMode: "fixed", h: 40, radius: "sm", fill: on ? "#2E3843" : undefined }, [b.icon(icon, 18, on ? "#FFFFFF" : "#C3CBD3"), b.text(label, "label", { color: on ? "#FFFFFF" : "#C3CBD3" })]);
  return b.col({ name: "Sidebar", gap: 4, pad: [20, 12], wMode: "fixed", w: 240, hMode: "fixed", h: 560, fill: "$inverse" }, [
    b.row({ gap: 10, pad: [0, 8, 16, 8] }, [b.row({ wMode: "fixed", w: 32, hMode: "fixed", h: 32, radius: "sm", fill: "$primary", justify: "center" }, [b.text("ERP", "caption", { color: "#FFFFFF", fontWeight: 700 })]), b.text("Company", "label", { color: "#FFFFFF" })]),
    item("grid", "Dashboard", true), item("file", "Sales & invoices"), item("box", "Inventory"), item("cart", "Purchase"), item("factory", "Production"), item("chart", "Reports"),
    b.col({ hMode: "fill" }), item("settings", "Settings"),
  ]);
}, 260);
def("Web navigation", "Breadcrumbs", (b) => b.row({ name: "Breadcrumbs", gap: 6, wMode: "hug" }, [b.text("Sales", "bodySm", { color: "$primary" }), b.icon("chevron-right", 14, "$textMuted"), b.text("Invoices", "bodySm", { color: "$primary" }), b.icon("chevron-right", 14, "$textMuted"), b.text("INV/26-27/0418", "bodySm", { color: "$textMuted" })]));
def("Web navigation", "Tabs", (b) =>
  b.row({ name: "Tabs", gap: 0, stroke: "$border", strokeWidth: 0 }, [
    b.col({ name: "Tab · active", pad: [12, 16, 10, 16], wMode: "hug", gap: 8 }, [b.text("Raw materials", "label", { color: "$primary" }), b.row({ hMode: "fixed", h: 3, radius: "full", fill: "$primary" })]),
    b.col({ name: "Tab", pad: [12, 16, 13, 16], wMode: "hug" }, [b.text("Work in progress", "label", { color: "$textMuted" })]),
    b.col({ name: "Tab", pad: [12, 16, 13, 16], wMode: "hug" }, [b.text("Finished goods", "label", { color: "$textMuted" })]),
  ]),
);
def("Web navigation", "Pagination", (b) => {
  const pg = (t: string, on = false) => b.row({ wMode: "fixed", w: 36, hMode: "fixed", h: 36, justify: "center", radius: "sm", fill: on ? "$primary" : undefined, stroke: on ? undefined : "$border", strokeWidth: on ? undefined : 1 }, [b.text(t, "label", { color: on ? "$onPrimary" : "$text" })]);
  return b.row({ name: "Pagination", gap: 6, wMode: "hug" }, [b.button("", "outline", { icon: "chevron-left", h: 36, w: 36 }), pg("1", true), pg("2"), pg("3"), b.text("…", "label"), pg("12"), b.button("", "outline", { icon: "chevron-right", h: 36, w: 36 })]);
});
def("Web navigation", "Footer", (b) => {
  const colm = (title: string, items: string[]) => b.col({ gap: 10, wMode: "fill" }, [b.text(title, "label", { color: "#FFFFFF" }), ...items.map((i) => b.text(i, "bodySm", { color: "#A9B1BA" }))]);
  return b.col({ name: "Footer", gap: 32, pad: [48, 48], fill: "$inverse" }, [
    b.row({ gap: 32, align: "start" }, [b.col({ gap: 8, wMode: "fill" }, [b.text("Brand", "h4", { color: "#FFFFFF" }), b.text("One line about what you do.", "bodySm", { color: "#A9B1BA" })]), colm("Product", ["Features", "Pricing", "Changelog"]), colm("Company", ["About", "Careers", "Contact"]), colm("Help", ["Docs", "Support", "Status"])]),
    b.row({ hMode: "fixed", h: 1, fill: "#2E3843" }),
    b.text("© 2026 Your company. All rights reserved.", "caption", { color: "#A9B1BA" }),
  ]);
}, 1100);

/* ================= Mobile ================= */
def("Mobile", "App bar", (b) => b.row({ name: "App bar", gap: 8, pad: [0, 8], hMode: "fixed", h: 64, fill: "$surface" }, [b.button("", "ghost", { icon: "arrow-left" }), b.text("Title", "h4", { wMode: "fill" }), b.button("", "ghost", { icon: "search" }), b.button("", "ghost", { icon: "more-v" })]), 390);
def("Mobile", "Large title bar", (b) => b.col({ name: "Large title", gap: 4, pad: [16, 20, 12, 20], fill: "$surface" }, [b.text("Today", "overline", { color: "$textMuted" }), b.text("Purchase", "h1")]), 390);
def("Mobile", "Bottom navigation", (b) => {
  const tab = (icon: string, label: string, on = false) =>
    b.col({ name: `Tab · ${label}`, gap: 4, align: "center", wMode: "fill", pad: [10, 0] }, [b.row({ wMode: "fixed", w: 64, hMode: "fixed", h: 32, radius: "full", justify: "center", fill: on ? "$primarySoft" : undefined }, [b.icon(icon, 22, on ? "$onPrimarySoft" : "$textMuted")]), b.text(label, "caption", { color: on ? "$text" : "$textMuted", fontWeight: on ? 600 : 400 })]);
  return b.row({ name: "Bottom nav", gap: 0, fill: "$surface", stroke: "$border", strokeWidth: 1, pad: [0, 0, 8, 0] }, [tab("home", "Home", true), tab("file", "Sales"), tab("box", "Stock"), tab("cart", "Purchase")]);
}, 390);
def("Mobile", "Search bar", (b) => b.row({ name: "Search bar", gap: 12, pad: [0, 16], hMode: "fixed", h: 52, radius: "full", fill: "$surfaceAlt" }, [b.icon("search", 20, "$textMuted"), b.text("Search items", "body", { color: "$textMuted", wMode: "fill" }), b.icon("barcode", 20, "$primary")]), 390);
def("Mobile", "List row", (b) => b.row({ name: "List row", gap: 14, pad: [12, 16], fill: "$surface" }, [b.avatar("MS"), b.col({ gap: 2, wMode: "fill" }, [b.text("Madurai Steels", "label"), b.text("PO/26-27/0264 · ₹80,240", "caption", { color: "$textMuted" })]), b.icon("chevron-right", 20, "$textMuted")]), 390);
def("Mobile", "Settings list", (b) => {
  const r = (icon: string, label: string, tail?: string) => b.row({ name: `Row · ${label}`, gap: 14, pad: [14, 16] }, [b.icon(icon, 22, "$textMuted"), b.text(label, "body", { wMode: "fill" }), tail ? b.text(tail, "bodySm", { color: "$textMuted" }) : b.icon("chevron-right", 18, "$textMuted")]);
  return b.col({ name: "Settings list", gap: 0, fill: "$surface", radius: "md", clip: true }, [r("user", "Profile"), b.divider(), r("bell", "Notifications", "On"), b.divider(), r("globe", "Language", "English"), b.divider(), r("logout", "Sign out")]);
}, 390);
def("Mobile", "Bottom sheet", (b) =>
  b.col({ name: "Bottom sheet", gap: 14, pad: [10, 20, 24, 20], fill: "$surface", radius: "lg", shadow: "lg" }, [
    b.row({ justify: "center" }, [b.row({ wMode: "fixed", w: 40, hMode: "fixed", h: 4, radius: "full", fill: "$border" })]),
    b.text("Approve this order?", "h3"),
    b.text("PO/26-27/0264 · Madurai Steels · ₹80,240", "bodySm", { color: "$textMuted" }),
    b.row({ gap: 10 }, [b.button("Cancel", "outline", { wMode: "fill" }), b.button("Approve", "primary", { wMode: "fill" })]),
  ]),
  390,
);
def("Mobile", "Summary header", (b) =>
  b.col({ name: "Summary header", gap: 6, pad: [20, 20], fill: "$inverse" }, [b.text("Sales this month", "bodySm", { color: "#A9B1BA" }), b.text("₹48,62,300", "h1", { color: "#FFFFFF", fontFamily: "IBM Plex Mono" }), b.text("▲ 11.7% vs last month", "bodySm", { color: "#8FD3A8" })]),
  390,
);
def("Mobile", "Action card", (b) =>
  b.card([
    b.row({ justify: "between", align: "start" }, [b.col({ gap: 2, wMode: "fill" }, [b.text("Madurai Steels", "label"), b.text("PO/26-27/0264", "caption", { color: "$textMuted" })]), b.text("₹80,240", "mono")]),
    b.text("MS round bar EN8 Ø40 · 800 kg", "bodySm", { color: "$textMuted" }),
    b.row({ gap: 8 }, [b.button("Reject", "outline", { wMode: "fill" }), b.button("Approve", "primary", { wMode: "fill" })]),
  ], { pad: 16 }),
  390,
);

/* ================= Data ================= */
def("Data", "Stat tile", (b) => b.card([b.text("Sales this month", "bodySm", { color: "$textMuted" }), b.text("₹48,62,300", "h2", { fontFamily: "IBM Plex Mono", fontWeight: 500 }), b.text("▲ 11.7% vs Sep", "bodySm", { color: "$success" })], { gap: 6, wMode: "fixed", w: 260 }));
def("Data", "KPI row", (b) => {
  const t = (l: string, v: string, s: string, tone: string) => b.card([b.text(l, "bodySm", { color: "$textMuted" }), b.text(v, "h3", { fontFamily: "IBM Plex Mono", fontWeight: 500 }), b.text(s, "caption", { color: tone })], { gap: 4, pad: 16 });
  return b.grid({ name: "KPI row", columns: 4, gap: 16 }, [t("Sales", "₹48.6 L", "▲ 11.7%", "$success"), t("Receivables", "₹21.2 L", "12 overdue", "$danger"), t("Payables", "₹14.8 L", "₹3.2 L this week", "$textMuted"), t("Stock value", "₹62.4 L", "7 to reorder", "$warning")]);
}, 1000);
def("Data", "Data table", (b) => {
  const cell = (t: string, w: "fill" | number, o: object = {}) => b.text(t, "bodySm", typeof w === "number" ? { wMode: "fixed", w, ...o } : { wMode: "fill", ...o });
  const head = b.row({ name: "Header row", gap: 12, pad: [10, 16], fill: "$surfaceAlt" }, [cell("Item", "fill", { textStyle: "overline", color: "$textMuted" }), cell("Qty", 80, { textStyle: "overline", color: "$textMuted", textAlign: "right" }), cell("Amount", 120, { textStyle: "overline", color: "$textMuted", textAlign: "right" }), cell("Status", 100, { textStyle: "overline", color: "$textMuted" })]);
  const row = (a: string, q: string, amt: string, st: string, tone: "success" | "warning" | "danger") =>
    b.row({ name: "Row", gap: 12, pad: [12, 16], stroke: "$border", strokeWidth: 0 }, [cell(a, "fill"), cell(q, 80, { textStyle: "mono", textAlign: "right" }), cell(amt, 120, { textStyle: "mono", textAlign: "right" }), b.row({ wMode: "fixed", w: 100 }, [b.badge(st, tone)])]);
  return b.col({ name: "Data table", gap: 0, fill: "$surface", radius: "md", stroke: "$border", strokeWidth: 1, clip: true }, [head, row("Gear housing GH-220", "200", "3,42,200", "Paid", "success"), b.divider(), row("Machined shaft MS-40", "350", "2,56,060", "Due", "warning"), b.divider(), row("Wooden packing crate", "20", "19,040", "Overdue", "danger")]);
}, 760);
def("Data", "List with avatars", (b) => {
  const r = (i: string, n: string, s: string, v: string) => b.row({ name: `Row · ${n}`, gap: 12, pad: [12, 0] }, [b.avatar(i, 36), b.col({ gap: 2, wMode: "fill" }, [b.text(n, "label"), b.text(s, "caption", { color: "$textMuted" })]), b.text(v, "mono")]);
  return b.col({ name: "List", gap: 0 }, [r("KP", "Kovai Pumps", "Net 30", "₹6,17,300"), b.divider(), r("SV", "Sri Velan Engg.", "Net 30", "₹2,84,160"), b.divider(), r("AM", "Annai Motors", "Paid", "₹1,12,100")]);
});
def("Data", "Status badges", (b) => b.row({ name: "Badges", gap: 8, wrap: true }, [b.badge("Paid", "success"), b.badge("Due", "warning"), b.badge("Overdue", "danger"), b.badge("Draft", "neutral"), b.badge("Part received", "primary")]));
def("Data", "Progress", (b) => b.col({ name: "Progress", gap: 8 }, [b.row({ justify: "between" }, [b.text("WO-1042 · Gear housing", "label"), b.text("240 / 400", "mono")]), b.bar(60)]));
def("Data", "Bar chart", (b) => {
  const vals = [38, 42, 37, 45, 47, 53];
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  return b.card([
    b.text("Monthly sales (₹ lakh)", "h4"),
    b.row({ name: "Bars", gap: 14, align: "end", hMode: "fixed", h: 180 }, vals.map((v, i) => b.col({ name: months[i], gap: 6, align: "center", wMode: "fill" }, [b.text(String(v), "caption", { textStyle: "mono" }), b.row({ name: "Bar", hMode: "fixed", h: Math.round(v * 2.6), radius: 4, fill: i === vals.length - 1 ? "$primary" : "$primarySoft" }), b.text(months[i], "caption", { color: "$textMuted" })]))),
  ], { gap: 16 });
}, 520);
def("Data", "Key–value list", (b) => {
  const kv = (k: string, v: string) => b.row({ justify: "between", pad: [8, 0] }, [b.text(k, "bodySm", { color: "$textMuted" }), b.text(v, "bodySm", { fontWeight: 500 })]);
  return b.col({ name: "Details", gap: 0 }, [kv("Supplier", "Madurai Steels"), kv("Deliver by", "20 Oct 2026"), kv("Payment terms", "Net 30"), kv("GSTIN", "33AAAFM0000X1Z0")]);
});
def("Data", "Timeline", (b) => {
  const ev = (t: string, d: string, on = true) => b.row({ gap: 12, align: "start" }, [b.row({ wMode: "fixed", w: 12, hMode: "fixed", h: 12, radius: "full", fill: on ? "$primary" : "$border" }), b.col({ gap: 2, wMode: "fill" }, [b.text(t, "label"), b.text(d, "caption", { color: "$textMuted" })])]);
  return b.col({ name: "Timeline", gap: 16 }, [ev("Order placed", "16 Oct · 10:42"), ev("Approved", "16 Oct · 14:05"), ev("Dispatched", "Expected 19 Oct", false), ev("Received", "Expected 20 Oct", false)]);
});
def("Data", "Empty state", (b) => b.col({ name: "Empty state", gap: 10, pad: 40, align: "center" }, [b.row({ wMode: "fixed", w: 64, hMode: "fixed", h: 64, radius: "full", fill: "$primarySoft", justify: "center" }, [b.icon("file", 28, "$onPrimarySoft")]), b.text("No invoices yet", "h4"), b.text("Create your first invoice to see it here.", "bodySm", { color: "$textMuted", textAlign: "center" }), b.button("New invoice", "primary", { icon: "plus" })]));

/* ================= Feedback ================= */
const alertPart = (tone: "info" | "success" | "warning" | "danger", title: string, body: string) => (b: Builder) => {
  const map = { info: ["$primarySoft", "$onPrimarySoft", "info"], success: ["$successSoft", "$success", "check-circle"], warning: ["$warningSoft", "$warning", "alert"], danger: ["$dangerSoft", "$danger", "alert"] }[tone];
  return b.row({ name: `Alert · ${tone}`, gap: 12, pad: [14, 16], align: "start", radius: "md", fill: map[0] }, [b.icon(map[2], 20, map[1]), b.col({ gap: 2, wMode: "fill" }, [b.text(title, "label", { color: map[1] }), b.text(body, "bodySm", { wMode: "fill" })])]);
};
def("Feedback", "Info alert", alertPart("info", "Heads up", "GSTR-1 for October is due on 11 November."));
def("Feedback", "Success alert", alertPart("success", "Invoice sent", "INV/26-27/0418 was emailed to Kovai Pumps."));
def("Feedback", "Warning alert", alertPart("warning", "Stock running low", "7 items are below their reorder level."));
def("Feedback", "Error alert", alertPart("danger", "Payment failed", "The bank rejected the transfer. Check the account number."));
def("Feedback", "Toast", (b) => b.row({ name: "Toast", gap: 16, pad: [12, 16], wMode: "fixed", w: 360, radius: "md", fill: "$inverse", shadow: "md" }, [b.text("Purchase order approved", "bodySm", { color: "#FFFFFF", wMode: "fill" }), b.text("Undo", "label", { color: "#A9C7E3" })]));
def("Feedback", "Dialog", (b) =>
  b.col({ name: "Dialog", gap: 14, pad: 24, wMode: "fixed", w: 420, radius: "lg", fill: "$surface", shadow: "lg" }, [
    b.text("Delete draft invoice?", "h3"),
    b.text("INV/26-27/0418 will be removed. This can't be undone.", "body", { color: "$textMuted", wMode: "fill" }),
    b.row({ gap: 10, justify: "end" }, [b.button("Cancel", "ghost"), b.button("Delete", "danger")]),
  ]),
);
def("Feedback", "Tooltip", (b) => b.row({ name: "Tooltip", pad: [6, 10], wMode: "hug", radius: "sm", fill: "$inverse" }, [b.text("Copied to clipboard", "caption", { color: "#FFFFFF" })]));
def("Feedback", "Loading skeleton", (b) => b.col({ name: "Skeleton", gap: 10 }, [b.row({ wMode: "fixed", w: 220, hMode: "fixed", h: 18, radius: "sm", fill: "$surfaceAlt" }), b.row({ hMode: "fixed", h: 12, radius: "sm", fill: "$surfaceAlt" }), b.row({ hMode: "fixed", h: 12, radius: "sm", fill: "$surfaceAlt" }), b.row({ wMode: "fixed", w: 160, hMode: "fixed", h: 12, radius: "sm", fill: "$surfaceAlt" })]));

/* ================= Sections ================= */
def("Sections", "Hero", (b) =>
  b.row({ name: "Hero", gap: 48, pad: [72, 64], fill: "$surface" }, [
    b.col({ gap: 20, wMode: "fill" }, [b.text("New · version 2", "overline", { color: "$primary" }), b.text("Run your factory from one screen", "display", { wMode: "fill" }), b.text("Invoices, stock, purchase and production in one place, built for Indian manufacturers.", "body", { color: "$textMuted", wMode: "fill" }), b.row({ gap: 12 }, [b.button("Start free trial", "primary", { h: 48 }), b.button("Book a demo", "outline", { h: 48 })])]),
    b.img({ wMode: "fill", h: 360, radius: "lg" }),
  ]),
  1200,
);
def("Sections", "Feature grid", (b) => {
  const f = (icon: string, t: string, d: string) => b.col({ gap: 10 }, [b.row({ wMode: "fixed", w: 44, hMode: "fixed", h: 44, radius: "md", fill: "$primarySoft", justify: "center" }, [b.icon(icon, 22, "$onPrimarySoft")]), b.text(t, "h4"), b.text(d, "bodySm", { color: "$textMuted", wMode: "fill" })]);
  return b.col({ name: "Features", gap: 32, pad: [64, 64] }, [b.col({ gap: 8, align: "center" }, [b.text("Everything you need", "h2"), b.text("Replace five spreadsheets with one tool.", "body", { color: "$textMuted" })]), b.grid({ columns: 3, gap: 32 }, [f("file", "GST invoices", "E-invoice and e-way bill in one click."), f("box", "Live stock", "Know what is running low before it stops a line."), f("cart", "Purchase", "Approve orders from your phone."), f("factory", "Production", "Track work orders shift by shift."), f("chart", "Reports", "Sales, margins and ageing at a glance."), f("shield", "Secure", "Role-based access for every user.")])]);
}, 1200);
def("Sections", "Pricing", (b) => {
  const plan = (n: string, p: string, items: string[], hi = false) =>
    b.col({ name: `Plan · ${n}`, gap: 14, pad: 24, radius: "lg", fill: hi ? "$inverse" : "$surface", stroke: hi ? undefined : "$border", strokeWidth: hi ? undefined : 1 }, [b.text(n, "h4", { color: hi ? "#FFFFFF" : "$text" }), b.text(p, "h1", { color: hi ? "#FFFFFF" : "$text" }), ...items.map((i) => b.row({ gap: 8 }, [b.icon("check", 18, hi ? "#8FD3A8" : "$success"), b.text(i, "bodySm", { color: hi ? "#E8EAED" : "$text" })])), b.button("Choose " + n, hi ? "primary" : "outline", { wMode: "fill" })]);
  return b.grid({ name: "Pricing", columns: 3, gap: 20, pad: [48, 64] }, [plan("Starter", "₹999", ["1 user", "Invoices", "Email support"]), plan("Business", "₹2,999", ["10 users", "Stock & purchase", "WhatsApp alerts"], true), plan("Enterprise", "Custom", ["Unlimited users", "Production", "On-site setup"])]);
}, 1100);
def("Sections", "Testimonial", (b) => b.col({ name: "Testimonial", gap: 16, pad: 40, align: "center", fill: "$surfaceAlt", radius: "lg" }, [b.text("“We closed the month in two days instead of ten.”", "h3", { textAlign: "center", wMode: "fill" }), b.row({ gap: 12, wMode: "hug" }, [b.avatar("SR"), b.col({ gap: 0, wMode: "hug" }, [b.text("S. Ramesh", "label"), b.text("Finance head, Kovai Pumps", "caption", { color: "$textMuted" })])])]), 900);
def("Sections", "Call to action band", (b) => b.row({ name: "CTA band", gap: 24, pad: [40, 48], radius: "lg", fill: "$primary", justify: "between" }, [b.col({ gap: 6, wMode: "fill" }, [b.text("Ready to switch?", "h2", { color: "$onPrimary" }), b.text("Import your Tally data in minutes.", "body", { color: "$onPrimary" })]), b.button("Get started", "secondary", { h: 48 })]), 1000);
def("Sections", "Login form", (b) =>
  b.col({ name: "Login form", gap: 18, pad: 32, wMode: "fixed", w: 400, fill: "$surface", radius: "lg", shadow: "md" }, [
    b.col({ gap: 6 }, [b.text("Welcome back", "h2"), b.text("Sign in to continue", "body", { color: "$textMuted" })]),
    b.field("Email", "name@company.com", { icon: "mail" }),
    b.field("Password", "••••••••", { icon: "lock", trailing: "eye" }),
    b.row({ justify: "between" }, [b.check("Remember me", true), b.text("Forgot password?", "label", { color: "$primary" })]),
    b.button("Sign in", "primary", { wMode: "fill", h: 48 }),
  ]),
);
def("Sections", "Contact form", (b) => b.col({ name: "Contact form", gap: 16, pad: 32, fill: "$surface", radius: "lg", stroke: "$border", strokeWidth: 1 }, [b.text("Talk to us", "h3"), b.row({ gap: 16, align: "start" }, [b.field("Name", "Your name"), b.field("Phone", "+91")]), b.field("Email", "name@company.com"), b.field("Message", "How can we help?", { multiline: true }), b.button("Send message", "primary")]), 640);
def("Sections", "FAQ", (b) => {
  const q = (t: string, a?: string) => b.col({ gap: 8, pad: [16, 0] }, [b.row({ justify: "between" }, [b.text(t, "label"), b.icon(a ? "chevron-up" : "chevron-down", 18, "$textMuted")]), ...(a ? [b.text(a, "bodySm", { color: "$textMuted", wMode: "fill" })] : [])]);
  return b.col({ name: "FAQ", gap: 0 }, [b.text("Questions", "h3"), q("Does it support e-invoicing?", "Yes. IRN and QR are generated when you save the invoice."), b.divider(), q("Can I import from Tally?"), b.divider(), q("Is there a mobile app?")]);
}, 640);

/* ================= ERP ================= */
def("ERP", "Invoice line items", (b) => {
  const c = (t: string, w: number | "fill", o: object = {}) => b.text(t, "bodySm", typeof w === "number" ? { wMode: "fixed", w, ...o } : { wMode: "fill", ...o });
  const head = b.row({ name: "Head", gap: 10, pad: [10, 14], fill: "$surfaceAlt" }, [c("Item", "fill", { textStyle: "overline", color: "$textMuted" }), c("HSN", 60, { textStyle: "overline", color: "$textMuted" }), c("Qty", 60, { textStyle: "overline", color: "$textMuted", textAlign: "right" }), c("Rate", 80, { textStyle: "overline", color: "$textMuted", textAlign: "right" }), c("GST", 50, { textStyle: "overline", color: "$textMuted", textAlign: "right" }), c("Amount", 100, { textStyle: "overline", color: "$textMuted", textAlign: "right" })]);
  const r = (a: string, h: string, q: string, rt: string, g: string, amt: string) => b.row({ name: "Line", gap: 10, pad: [12, 14] }, [c(a, "fill"), c(h, 60, { textStyle: "mono" }), c(q, 60, { textStyle: "mono", textAlign: "right" }), c(rt, 80, { textStyle: "mono", textAlign: "right" }), c(g, 50, { textStyle: "mono", textAlign: "right" }), c(amt, 100, { textStyle: "mono", textAlign: "right" })]);
  return b.col({ name: "Invoice lines", gap: 0, fill: "$surface", radius: "md", stroke: "$border", strokeWidth: 1, clip: true }, [head, r("Gear housing GH-220", "8483", "200", "1,450.00", "18%", "3,42,200.00"), b.divider(), r("Machined shaft MS-40", "8483", "350", "620.00", "18%", "2,56,060.00"), b.divider(), r("Wooden packing crate", "4415", "20", "850.00", "12%", "19,040.00")]);
}, 820);
def("ERP", "GST totals", (b) => {
  const l = (k: string, v: string, strong = false) => b.row({ justify: "between" }, [b.text(k, strong ? "label" : "bodySm"), b.text(v, "mono", strong ? { fontWeight: 600 } : {})]);
  return b.card([b.text("Summary", "h4"), l("Taxable value", "₹5,24,000.00"), l("CGST", "₹46,650.00"), l("SGST", "₹46,650.00"), b.divider(), l("Invoice total", "₹6,17,300.00", true), b.text("Rupees six lakh seventeen thousand three hundred only", "caption", { color: "$textMuted", wMode: "fill" })], { gap: 10, wMode: "fixed", w: 340 });
}, 380);
def("ERP", "Stock level", (b) => b.card([b.row({ justify: "between" }, [b.text("MS round bar EN8 Ø40", "label"), b.badge("Low", "warning")]), b.bar(40, "$warning", 300), b.row({ justify: "between" }, [b.text("320 kg in stock", "caption", { color: "$textMuted" }), b.text("Reorder at 500 kg", "caption", { color: "$textMuted" })])], { gap: 10, wMode: "fixed", w: 340 }), 380);
def("ERP", "Party card", (b) => b.card([b.row({ gap: 12 }, [b.avatar("KP", 44), b.col({ gap: 2, wMode: "fill" }, [b.text("Kovai Pumps Pvt Ltd", "label"), b.text("GSTIN 33ABCDE1234F1Z5", "caption", { color: "$textMuted", textStyle: "mono" })])]), b.row({ gap: 24 }, [b.col({ gap: 2, wMode: "hug" }, [b.text("Outstanding", "caption", { color: "$textMuted" }), b.text("₹6,17,300", "mono")]), b.col({ gap: 2, wMode: "hug" }, [b.text("Terms", "caption", { color: "$textMuted" }), b.text("Net 30", "bodySm")])])], { wMode: "fixed", w: 360 }), 400);
def("ERP", "Filter toolbar", (b) => b.row({ name: "Filter toolbar", gap: 12, wrap: true }, [b.field("", "Search invoices, parties", { icon: "search" }), b.chip("Unpaid", true), b.chip("This month", false, "calendar"), b.button("Export", "outline", { icon: "download" }), b.button("New invoice", "primary", { icon: "plus" })]), 900);
def("ERP", "Approval card", (b) => b.card([b.row({ justify: "between" }, [b.col({ gap: 2, wMode: "fill" }, [b.text("PO/26-27/0264", "caption", { color: "$textMuted", textStyle: "mono" }), b.text("Madurai Steels", "h4")]), b.badge("Waiting approval")]), b.text("800 kg MS round bar EN8 Ø40 · deliver by 20 Oct", "bodySm", { color: "$textMuted", wMode: "fill" }), b.row({ justify: "between" }, [b.text("₹80,240", "h3", { fontFamily: "IBM Plex Mono", fontWeight: 500 }), b.row({ gap: 8, wMode: "hug" }, [b.button("Reject", "outline"), b.button("Approve", "primary")])])], { wMode: "fixed", w: 460 }), 500);

/* ================= Screens (each makes a new frame) ================= */
def("Screens", "Login · web", (b) =>
  b.row({ name: "Login page", gap: 0, hMode: "fill", align: "start" }, [
    b.col({ name: "Brand panel", gap: 16, pad: 64, wMode: "fill", hMode: "fill", fill: "$inverse", justify: "end" }, [b.text("Your company", "h2", { color: "#FFFFFF" }), b.text("Everything about your business, in one place.", "body", { color: "#A9B1BA", wMode: "fill" })]),
    b.col({ name: "Form side", gap: 0, wMode: "fill", hMode: "fill", align: "center", justify: "center", pad: 48 }, [
      b.col({ gap: 18, wMode: "fixed", w: 380 }, [b.text("Sign in", "h1"), b.field("Email", "name@company.com", { icon: "mail" }), b.field("Password", "••••••••", { icon: "lock" }), b.button("Sign in", "primary", { wMode: "fill", h: 48 }), b.text("Forgot password?", "label", { color: "$primary" })]),
    ]),
  ]),
  1440, { screen: "desktop" },
);
def("Screens", "Dashboard · web", (b) => {
  const nav = (icon: string, l: string, on = false) => b.row({ gap: 10, pad: [0, 12], hMode: "fixed", h: 40, radius: "sm", fill: on ? "#2E3843" : undefined }, [b.icon(icon, 18, on ? "#FFFFFF" : "#C3CBD3"), b.text(l, "label", { color: on ? "#FFFFFF" : "#C3CBD3" })]);
  const kpi = (l: string, v: string, s: string, tone: string) => b.card([b.text(l, "bodySm", { color: "$textMuted" }), b.text(v, "h3", { fontFamily: "IBM Plex Mono", fontWeight: 500 }), b.text(s, "caption", { color: tone })], { gap: 4, pad: 16 });
  return b.row({ name: "Dashboard", gap: 0, hMode: "fill", align: "start" }, [
    b.col({ name: "Sidebar", gap: 4, pad: [20, 12], wMode: "fixed", w: 232, hMode: "fill", fill: "$inverse" }, [b.text("Company", "h4", { color: "#FFFFFF" }), b.col({ hMode: "fixed", h: 12 }), nav("grid", "Dashboard", true), nav("file", "Sales"), nav("box", "Inventory"), nav("cart", "Purchase"), nav("chart", "Reports")]),
    b.col({ name: "Main", gap: 20, pad: [28, 32], wMode: "fill" }, [
      b.row({ justify: "between" }, [b.text("Dashboard", "h1"), b.button("New invoice", "primary", { icon: "plus" })]),
      b.grid({ columns: 4, gap: 16 }, [kpi("Sales", "₹48.6 L", "▲ 11.7%", "$success"), kpi("Receivables", "₹21.2 L", "12 overdue", "$danger"), kpi("Payables", "₹14.8 L", "Due this week ₹3.2 L", "$textMuted"), kpi("Stock value", "₹62.4 L", "7 to reorder", "$warning")]),
      b.card([b.text("Recent invoices", "h4"), b.text("Drop a Data table here", "bodySm", { color: "$textMuted" })], { hMode: "fixed", h: 320 }),
    ]),
  ]);
}, 1440, { screen: "desktop" });
def("Screens", "Landing page · web", (b) =>
  b.col({ name: "Landing", gap: 0 }, [
    b.row({ name: "Top nav", gap: 24, pad: [0, 48], hMode: "fixed", h: 64, fill: "$surface", justify: "between" }, [b.text("Brand", "h4"), b.row({ gap: 24, wMode: "hug" }, [b.text("Product", "label"), b.text("Pricing", "label"), b.text("Contact", "label")]), b.button("Get started", "primary")]),
    b.col({ name: "Hero", gap: 20, pad: [96, 48], align: "center", fill: "$surfaceAlt" }, [b.text("A clear headline about your product", "display", { textAlign: "center" }), b.text("One sentence that says who it is for and what it does.", "body", { color: "$textMuted", textAlign: "center" }), b.row({ gap: 12, wMode: "hug" }, [b.button("Start now", "primary", { h: 48 }), b.button("See how it works", "outline", { h: 48 })])]),
    b.grid({ name: "Features", columns: 3, gap: 24, pad: [64, 48] }, ["Fast", "Simple", "Secure"].map((t) => b.card([b.text(t, "h4"), b.text("Explain the benefit in a line or two.", "bodySm", { color: "$textMuted", wMode: "fill" })]))),
  ]),
  1440, { screen: "desktop" },
);
def("Screens", "Home · mobile", (b) => {
  const tab = (icon: string, label: string, on = false) => b.col({ gap: 4, align: "center", wMode: "fill", pad: [10, 0] }, [b.row({ wMode: "fixed", w: 64, hMode: "fixed", h: 32, radius: "full", justify: "center", fill: on ? "$primarySoft" : undefined }, [b.icon(icon, 22, on ? "$onPrimarySoft" : "$textMuted")]), b.text(label, "caption", { color: on ? "$text" : "$textMuted" })]);
  return b.col({ name: "Home", gap: 0, hMode: "fill" }, [
    b.col({ gap: 6, pad: [24, 20], fill: "$inverse" }, [b.text("Today", "bodySm", { color: "#A9B1BA" }), b.text("₹48,62,300", "h1", { color: "#FFFFFF", fontFamily: "IBM Plex Mono" }), b.text("Sales this month", "bodySm", { color: "#A9B1BA" })]),
    b.col({ gap: 12, pad: 16, hMode: "fill" }, [
      b.grid({ columns: 2, gap: 12 }, [b.card([b.text("To collect", "caption", { color: "$textMuted" }), b.text("₹21.2 L", "h4")], { pad: 14, gap: 4 }), b.card([b.text("To pay", "caption", { color: "$textMuted" }), b.text("₹14.8 L", "h4")], { pad: 14, gap: 4 })]),
      b.card([b.text("Needs attention", "h4"), b.text("3 purchase orders to approve", "bodySm"), b.text("7 items below reorder level", "bodySm")], { pad: 16 }),
    ]),
    b.row({ name: "Bottom nav", gap: 0, fill: "$surface", stroke: "$border", strokeWidth: 1, pad: [0, 0, 8, 0] }, [tab("home", "Home", true), tab("file", "Sales"), tab("box", "Stock"), tab("cart", "Purchase")]),
  ]);
}, 390, { screen: "iphone" });
def("Screens", "List · mobile", (b) => {
  const r = (i: string, n: string, s: string) => b.row({ gap: 14, pad: [12, 16] }, [b.avatar(i), b.col({ gap: 2, wMode: "fill" }, [b.text(n, "label"), b.text(s, "caption", { color: "$textMuted" })]), b.icon("chevron-right", 20, "$textMuted")]);
  return b.col({ name: "List screen", gap: 0, hMode: "fill", fill: "$surface" }, [
    b.row({ gap: 8, pad: [0, 8], hMode: "fixed", h: 64 }, [b.button("", "ghost", { icon: "arrow-left" }), b.text("Suppliers", "h4", { wMode: "fill" }), b.button("", "ghost", { icon: "plus" })]),
    b.col({ pad: [0, 16, 8, 16] }, [b.row({ gap: 12, pad: [0, 16], hMode: "fixed", h: 48, radius: "full", fill: "$surfaceAlt" }, [b.icon("search", 20, "$textMuted"), b.text("Search suppliers", "body", { color: "$textMuted" })])]),
    r("MS", "Madurai Steels", "Net 30 · 94% on time"), b.divider(), r("CF", "Coimbatore Foundry", "Net 45 · 71% on time"), b.divider(), r("SL", "Sakthi Lubricants", "Net 15 · 98% on time"),
  ]);
}, 390, { screen: "iphone" });
def("Screens", "Form · mobile", (b) =>
  b.col({ name: "Form screen", gap: 0, hMode: "fill", fill: "$surface" }, [
    b.row({ gap: 8, pad: [0, 8], hMode: "fixed", h: 64 }, [b.button("", "ghost", { icon: "close" }), b.text("New supplier", "h4", { wMode: "fill" })]),
    b.col({ gap: 16, pad: [8, 20], hMode: "fill" }, [b.field("Supplier name", "Company name"), b.field("GSTIN", "15-character GST number"), b.field("Phone", "+91"), b.field("Payment terms", "Net 30", { trailing: "chevron-down", value: "Net 30" }), b.toggle("Send POs on WhatsApp", true)]),
    b.col({ pad: [12, 20, 24, 20] }, [b.button("Save supplier", "primary", { wMode: "fill", h: 52 })]),
  ]),
  390, { screen: "iphone" },
);

export const PARTS = P;
export const partById = (id: string) => P.find((p) => p.id === id);
