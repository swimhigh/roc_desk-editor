import React from "react";
import ReactDOM from "react-dom/client";
import { StandaloneFileTree } from "./components/Editor/StandaloneFileTree";
import { EditorPane } from "./EditorPane";
import { useEditorStore } from "./stores/editorStore";
import "./styles.css";

/**
 * Dev/build entry for `npm run dev` / `npm run build` -- mounts a minimal
 * "loose files" shell (drag-and-drop / local file tree, no workspace concept)
 * around `<EditorPane/>`, purely so this package's own `src-web` is a
 * buildable Vite app on its own. This is NOT what `standalone/`'s Tauri exe
 * ships (that shell currently embeds a much smaller placeholder page, see
 * `standalone/dist/index.html`) -- wiring this real build into the Tauri
 * shell's `frontendDist` is a follow-up, not required for this package to
 * compile and for `<EditorPane/>` to be consumable by other tools.
 */
const App: React.FC = () => (
  <div style={{ display: "flex", height: "100vh" }}>
    <StandaloneFileTree onOpenFile={(p) => void useEditorStore.getState().openStandaloneFile(p)} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <EditorPane workspaceId={null} />
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
