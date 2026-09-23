/**
 * Public entry point for embedding this tool's editor pane in another
 * tool's frontend (e.g. `roc_desk-workspace`). Import from
 * `@roc_desk/tool-editor` (this package) rather than reaching into
 * `src/components/Editor/*` directly -- those paths are free to change,
 * this barrel is the stable surface.
 *
 * Side-effecting import: registers Monaco's local worker config, the
 * `makefile`/`log` languages, and the `roc-dark`/`roc-light` themes
 * `<CodeEditor/>` requests by name -- without this, Monaco silently falls
 * back to its own built-in "vs" (light) theme for the *editor content*
 * even while the surrounding app chrome is dark (this tool's standalone
 * shell hit exactly that bug once already; embedders must import this
 * module once, e.g. at their own app's entry point, or do the equivalent
 * setup themselves).
 */
import "./monacoSetup";

export { EditorPane } from "./EditorPane";
export type { EditorPaneProps } from "./EditorPane";

export { useEditorStore, isDiffId } from "./stores/editorStore";
export type { EditorBuffer, DiffBuffer } from "./stores/editorStore";

export { CodeEditor } from "./components/Editor/CodeEditor";
export { LocalFileTree } from "./components/Editor/LocalFileTree";

export * from "./types/bindings";
