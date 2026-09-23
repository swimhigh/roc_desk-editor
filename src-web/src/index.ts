/**
 * Public entry point for embedding this tool's editor pane in another
 * tool's frontend (e.g. `roc_desk-workspace`). Import from
 * `@roc_desk/tool-editor` (this package) rather than reaching into
 * `src/components/Editor/*` directly -- those paths are free to change,
 * this barrel is the stable surface.
 */
export { EditorPane } from "./EditorPane";
export type { EditorPaneProps } from "./EditorPane";

export { useEditorStore, isDiffId } from "./stores/editorStore";
export type { EditorBuffer, DiffBuffer } from "./stores/editorStore";

export { CodeEditor } from "./components/Editor/CodeEditor";
export { LocalFileTree } from "./components/Editor/LocalFileTree";

export * from "./types/bindings";
