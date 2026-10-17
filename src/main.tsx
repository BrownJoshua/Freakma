import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PreviewWindow } from "./ui/LivePreview";
import "./styles.css";

// the same bundle serves the pop-out live preview window (opened at #preview)
createRoot(document.getElementById("root")!).render(location.hash === "#preview" ? <PreviewWindow /> : <App />);
