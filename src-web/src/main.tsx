import React from "react";
import ReactDOM from "react-dom/client";
import { LocalFileTree } from "./components/Editor/LocalFileTree";
import { EditorPane } from "./EditorPane";
import { useEditorStore } from "./stores/editorStore";
import "./styles.css";

/**
 * 独立编辑器壳的挂载入口——UltraEdit 式布局：左侧本地文件树（`LocalFileTree`，
 * 默认展示"此电脑"全部盘符，支持钉常用目录/多选/剪切复制/新建/删除/重命名，和
 * 宿主 `roc_desk` 里编辑器工作台左侧面板是同一份实现），右侧 `<EditorPane/>`
 * （Monaco 多标签编辑 + 图片/PDF 预览 + OCR）。
 *
 * 早期版本这里挂载的是一个 27 行的极简 `StandaloneFileTree`（只有点击展开/
 * 打开，没有多选、剪切复制、新建、删除、重命名），`LocalFileTree` 虽然已经
 * 完整搬过来了但没有接进这个入口——用户反馈"编辑器的功能要和原始的 roc_desk
 * 保持一致"后改成这样接。
 */
const App: React.FC = () => {
  const [root, setRoot] = React.useState<string | null>(null);
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 260, flexShrink: 0, minHeight: 0 }}>
        <LocalFileTree
          root={root}
          onRootChange={setRoot}
          onOpenFile={(p) => void useEditorStore.getState().openStandaloneFile(p)}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <EditorPane workspaceId={null} rootPath={root ?? undefined} />
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
