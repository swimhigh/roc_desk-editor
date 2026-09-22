import React from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { KeyCode, KeyMod, Range, editor as monacoEditorApi, Uri as monacoUri } from "monaco-editor";
import { Save, Search, X, Eye, EyeOff, ExternalLink, GitCompare } from "lucide-react";
import { useEditorStore, isDiffId } from "../../stores/editorStore";
import { ConflictDialog } from "./ConflictDialog";
import { EncodingMenu } from "./EncodingMenu";
import { ExcelPreview } from "./ExcelPreview";
import { ImageViewer } from "./ImageViewer";
import { PdfPreview } from "./PdfPreview";
import { UnsupportedBinaryPanel } from "./UnsupportedBinaryPanel";
import { BinaryInfoPanel } from "./BinaryInfoPanel";
import { JarInfoPanel } from "./JarInfoPanel";
import { LegacyOfficePreview } from "./LegacyOfficePreview";
import { ContextMenu, type ContextMenuItem } from "../shared/ContextMenu";
import { useToastStore } from "../shared/Toast";
import { detectLanguage } from "../../utils/language";
import { formatError } from "../../utils/error";
import { renderMarkdown } from "../../utils/markdown";
import { useThemeStore } from "../../stores/themeStore";
import { formatBytes } from "../../utils/format";
import { inlineHtmlResources } from "../../utils/inlineHtmlResources";
import { fsService, localFileService } from "../../services/fsService";
import { symbolService } from "../../services/symbolService";
import type { SymbolLocation } from "../../types/bindings";
import { FileStack } from "lucide-react";

/** 只会有一份 CodeEditor 挂载，下面给 Monaco 全局注册一次的"转到定义/声明"
 * provider 拿不到 React props，只能靠这两个模块级 ref 读到"当前的符号索引
 * 键是什么"：
 * - `activeWorkspaceIdRef`：真正的工作区 id（`fs_*` 命令读写要用），没有工作区
 *   （游离文件/独立编辑器）时是 null。
 * - `activeSymbolRootRef`：符号索引实际用的 key——有工作区时等于工作区 id，
 *   没有工作区但打开了一个本地根目录（独立编辑器/工作区之外的"游离文件夹"）时
 *   退化成 `rootPath`。这是本工具相对宿主版本的一个改进：宿主里符号索引只认
 *   `workspaceId`，脱离工作区（独立编辑器）就完全没有"转到定义"；这里只要打开
 *   了一个本地根目录就能用，即使不属于任何工作区。 */
const activeWorkspaceIdRef: { current: string | null } = { current: null };
const activeSymbolRootRef: { current: string | null } = { current: null };
/** provideDefinition 为每个候选位置生成的 Monaco Uri -> 真实符号位置的映射，供
 * `registerEditorOpener` 把"要打开哪个 Uri"还原回真实文件路径。不能反向解析
 * monaco.Uri（`@monaco-editor/react` 用 `Uri.parse(path)` 建模型，Windows 路径
 * 的盘符冒号会被误判成 URI scheme，这是它自己的既有行为——只能顺着同一个方向查表，
 * 不能从 Uri 反推回原始路径字符串）。 */
const uriToSymbolLocation = new Map<string, SymbolLocation>();
let definitionProviderRegistered = false;
/** Monaco 内置支持右键"转到定义/转到声明"的语言 id（和 utils/language.ts 里
 * detectLanguage 产出的 id 对齐）——本轮符号索引只覆盖这几种语言，见
 * roc_desk_common::symbols。 */
const DEFINITION_LANGUAGES = ["c", "cpp", "rust", "python", "go", "javascript", "typescript"];

function registerGoToDefinitionOnce(monaco: typeof import("monaco-editor")) {
  if (definitionProviderRegistered) return;
  definitionProviderRegistered = true;

  const resolve = async (
    model: import("monaco-editor").editor.ITextModel,
    position: import("monaco-editor").Position,
  ) => {
    const root = activeSymbolRootRef.current;
    if (!root) return null;
    const word = model.getWordAtPosition(position);
    if (!word) return null;
    let locations: SymbolLocation[];
    try {
      locations = await symbolService.goToDefinition(root, word.word);
    } catch {
      return null;
    }
    if (locations.length === 0) return null;
    return locations.map((loc) => {
      const uri = monaco.Uri.parse(loc.path);
      uriToSymbolLocation.set(uri.toString(), loc);
      return { uri, range: new monaco.Range(loc.line, 1, loc.line, 1) };
    });
  };

  monaco.languages.registerDefinitionProvider(DEFINITION_LANGUAGES, { provideDefinition: resolve });
  monaco.languages.registerDeclarationProvider(DEFINITION_LANGUAGES, { provideDeclaration: resolve });

  // 目标位置在另一个还没打开的文件里时，Monaco 自己不知道怎么"打开"一个任意路径——
  // 这个 opener 就是那座桥：查表拿到真实路径后，按"当前是不是真的工作区"分流到
  // `openPreview`（工作区内文件，走 `fs_*`）或 `openStandaloneFile`（本地根目录/
  // 游离文件，走 `local_*`），打开后再跳到目标行。
  monaco.editor.registerEditorOpener({
    openCodeEditor: (_source, resource) => {
      const loc = uriToSymbolLocation.get(resource.toString());
      if (!loc) return false;
      void (async () => {
        const store = useEditorStore.getState();
        const workspaceId = activeWorkspaceIdRef.current;
        if (workspaceId) await store.openPreview(workspaceId, loc.path);
        else await store.openStandaloneFile(loc.path);
        store.revealLine(loc.path, loc.line);
      })();
      return true;
    },
  });
}

interface CodeEditorProps {
  /** 没有打开工作区、只剩游离标签的极简编辑器壳传 `null`——这种情况下打开的
   * 所有标签必然都是 `origin: "standalone"`。 */
  workspaceId: string | null;
  workspaceName: string;
  rootPath: string;
  /** 点标签页/面包屑联动左侧文件树选中当前文件——仅在 `workspaceId` 非空时
   * 触发。这个工具本身不知道"宿主的工作区文件树"长什么样（那是
   * `roc_desk-workspace` 自己的状态），所以把这个行为做成可选回调，由嵌入方
   * （宿主 / `roc_desk-workspace`）提供；不提供时退化成广播一个
   * `roc:reveal-workspace` DOM 事件，方便嵌入方在别处监听。 */
  onRevealInWorkspace?: (workspaceId: string, path: string) => void;
}

/**
 * 通用可编辑代码编辑器（Monaco 内核）。
 * 本地缓冲区编辑 + Ctrl+S 保存回写 + mtime 冲突检测，JSON/Markdown/日志/配置文件等
 * 常见类型按扩展名给语言高亮（`utils/language.ts`），远程文件走 SFTP 写回但用户侧体验一致。
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({ workspaceId, workspaceName, rootPath, onRevealInWorkspace }) => {
  const {
    buffers,
    diffs,
    order,
    activePath,
    setActive,
    pin,
    close,
    closeOthers,
    closeAll,
    closeToLeft,
    closeToRight,
    updateContent,
    save,
    conflict,
    resolveConflict,
    reopenWithEncoding,
    saveWithEncoding,
    pendingReveal,
    clearReveal,
  } = useEditorStore();
  const push = useToastStore((s) => s.push);
  // roc-dark/roc-light 是 monacoSetup.ts 里在 vs-dark/vs 基础上叠加的自定义主题
  // （加了日志文件的 token 配色规则），其它语言的高亮规则原样继承，不受影响。
  const monacoTheme = useThemeStore((s) => (s.theme === "dark" ? "roc-dark" : "roc-light"));
  const editorRef = React.useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const highlightDecorationsRef = React.useRef<import("monaco-editor").editor.IEditorDecorationsCollection | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Tab 右键菜单（参考 VS Code："关闭其他"/"关闭所有"/"关闭左侧的标签页"/
  // "关闭右侧的标签页"）。
  const [tabMenu, setTabMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);
  // 底部状态栏的光标位置（参考 VS Code 右下角 "行, 列"）——diff.path 换了（切标签/
  // Monaco 实例因 key={active.path} 重新挂载）时清空，避免残留上一个文件的坐标。
  const [cursorPos, setCursorPos] = React.useState<{ line: number; column: number } | null>(null);

  // "转到定义/声明"：让上面模块级注册的 Monaco provider 知道"现在的符号索引键是
  // 什么"；根目录一打开就顺带建一次符号索引（失败不打扰用户，只是这个功能暂时
  // 用不了）。既没有工作区又没有本地根目录时（比如单个拖进来的游离文件，连
  // 所在文件夹都不知道）两个 ref 都是 null，provider 直接跳过。
  React.useEffect(() => {
    activeWorkspaceIdRef.current = workspaceId;
  }, [workspaceId]);
  React.useEffect(() => {
    activeSymbolRootRef.current = workspaceId ?? (rootPath || null);
  }, [workspaceId, rootPath]);
  React.useEffect(() => {
    const root = workspaceId ?? (rootPath || null);
    if (!root) return;
    void symbolService.buildIndex(root).catch(() => {});
  }, [workspaceId, rootPath]);

  // 切标签时光标/滚动位置丢失：根因是下面 `<Editor key={active.path}>` 每切一个
  // 文件都整个卸载重挂载一次 Monaco 实例——`@monaco-editor/react` 自带按路径缓存
  // view state 的机制（`saveViewState` prop，默认开启），但它只在传了
  // `keepCurrentModel` 时才会在卸载前把 view state 存下来（见该库源码，
  // `keepCurrentModel` 为 false 时卸载分支直接 dispose 掉 model，根本不存 view
  // state），不传就是"每次切走都白丢"。加 `keepCurrentModel` 解决了丢失问题，
  // 代价是模型不再随标签切换自动释放——于是这里补一个"真正关掉标签才释放模型"的
  // 清理：比较 `order` 变化，对消失的路径手动 dispose，避免一个会话里打开过的
  // 每个文件的模型永久占内存。
  const prevOrderRef = React.useRef(order);
  React.useEffect(() => {
    const removed = prevOrderRef.current.filter((p) => !order.includes(p) && !isDiffId(p));
    for (const path of removed) {
      monacoEditorApi.getModel(monacoUri.parse(path))?.dispose();
    }
    prevOrderRef.current = order;
  }, [order]);

  const active = activePath ? buffers[activePath] : null;
  const activeDiff = activePath ? diffs[activePath] : null;
  React.useEffect(() => setCursorPos(null), [active?.path]);
  const isImage = active?.kind === "image";
  const isPdf = active?.kind === "pdf";
  const isWord = active?.kind === "word";
  const isExcel = active?.kind === "excel";
  const isExecutable = active?.kind === "executable";
  const isJar = active?.kind === "jar";
  const isLegacyOffice = active?.kind === "legacy-office";
  const isUnsupportedBinary = active?.kind === "unsupported-binary";
  // 这几种都是只读展示，不进 Monaco——编码菜单/搜索/Markdown 预览/保存这些跟文本
  // 编辑相关的工具栏按钮对它们没意义。
  const isPreviewOnly = isImage || isPdf || isWord || isExcel || isExecutable || isJar || isLegacyOffice || isUnsupportedBinary;

  // 点标签页/面包屑联动左侧文件树选中当前文件（参考 VS Code 的 "Auto Reveal"）。
  // 游离文件（不属于工作区）没有对应的宿主文件树条目可选，改成广播一个通用事件
  // 让本工具自己的本地文件树（LocalFileTree/StandaloneFileTree）去监听。工作区
  // 场景下这个工具不知道宿主的文件树状态长什么样，交给 `onRevealInWorkspace`
  // 回调，没提供就退化成广播事件（见 CodeEditorProps 注释）。
  const revealInExplorer = React.useCallback(async (path: string) => {
    if (!workspaceId) {
      window.dispatchEvent(new CustomEvent("roc:reveal-standalone", { detail: { path } }));
      return;
    }
    if (onRevealInWorkspace) {
      onRevealInWorkspace(workspaceId, path);
    } else {
      window.dispatchEvent(new CustomEvent("roc:reveal-workspace", { detail: { workspaceId, path } }));
    }
  }, [workspaceId, onRevealInWorkspace]);

  // 打开的文件联动：只要"当前激活的文件"变了（不管是谁触发的——文件树点击、AI
  // 面板打开、标签页切换），都自动展开/定位一次，不用每个打开文件的入口各自记得
  // 调用一遍。幂等操作（展开已展开的目录、选中已选中的项）重复调用无副作用。
  React.useEffect(() => {
    if (active?.path) void revealInExplorer(active.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.path]);

  const language = active ? detectLanguage(active.path) : "plaintext";
  const isMarkdown = language === "markdown";
  // HTML 文件预览：和 Markdown 预览共用同一套"编辑/预览切换"交互（Ctrl+Shift+V、
  // 同一块区域互斥展示），只是渲染方式不同——Markdown 渲染出的是一段 HTML 片段，用
  // dangerouslySetInnerHTML 塞进当前页面就行；用户打开的 *.html 文件本身是一份
  // 完整文档（可能带 <style>/<script>/<meta charset>），必须用 <iframe> 给它一个
  // 独立的文档上下文才能正确渲染，不能直接扔进 dangerouslySetInnerHTML（那样会
  // 当成 body 片段解析，<head> 里的东西全部丢失，<script> 也不会执行）。
  const isHtml = language === "html";
  const canPreview = isMarkdown || isHtml;
  // 只在预览真正打开时才解析，避免每次敲字符都跑一遍 marked（非 Markdown 文件更是完全不需要）。
  const previewHtml = React.useMemo(
    () => (isMarkdown && previewOpen && active ? renderMarkdown(active.content) : ""),
    [isMarkdown, previewOpen, active?.content],
  );

  // HTML 预览的 srcDoc 内容——不能直接用 active.content：iframe srcdoc 里的相对路径
  // 资源引用（<link href>/<script src>/<img src>）默认相对宿主页面（本工具自己
  // 的地址）解析，会 404，引用了外部 CSS/JS 的页面预览出来一片白屏。打开预览时
  // 异步把这些资源抓下来内联成 data URL 再喂给 iframe，见
  // `utils/inlineHtmlResources.ts`。转换过程中先显示原始内容（没有外部资源的简单
  // 页面本来就能正常显示，不用等），转换完成后再替换成内联版本。
  const [htmlPreviewSrc, setHtmlPreviewSrc] = React.useState<string | null>(null);
  const [inliningResources, setInliningResources] = React.useState(false);
  React.useEffect(() => {
    if (!isHtml || !previewOpen || !active) {
      setHtmlPreviewSrc(null);
      return;
    }
    let cancelled = false;
    setInliningResources(true);
    const baseDir = active.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    const readPreview = (p: string) =>
      active.origin === "standalone" ? localFileService.readBinaryPreview(p) : fsService.readBinaryPreview(workspaceId!, p);
    inlineHtmlResources(active.content, baseDir, readPreview).then(
      (html) => {
        if (cancelled) return;
        setHtmlPreviewSrc(html);
        setInliningResources(false);
      },
      () => {
        if (cancelled) return;
        setInliningResources(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isHtml, previewOpen, active?.path, active?.content, workspaceId]);

  // 搜索面板点一个匹配行之后要求跳转：这里统一处理"文件已经打开、只是切换
  // active" 和 "editor 实例刚挂载" 两种情况——后者靠 `active?.path` 变化触发这个
  // effect 重跑，届时子组件 <Editor> 的 onMount 已经在同一次 commit 里跑过（子
  // 组件的挂载 effect 先于父组件自己的 effect），editorRef.current 保证已经是
  // 最新的。
  React.useEffect(() => {
    if (!pendingReveal || !editorRef.current) return;
    if (pendingReveal.path !== active?.path) return;
    const editor = editorRef.current;
    editor.revealLineInCenter(pendingReveal.line);
    editor.setPosition({ lineNumber: pendingReveal.line, column: 1 });
    editor.focus();

    // 点亮这个文件命中的全部位置（不只是点击跳转到的那一行）。字符级精确高亮
    // （不是整行背景色），复用后端 SearchMatch 已经算好的字符下标，Monaco 的
    // 列号是 1-based 所以要 +1。
    if (pendingReveal.highlights && pendingReveal.highlights.length > 0) {
      const decorations = pendingReveal.highlights.map((h) => ({
        range: new Range(h.line, h.start + 1, h.line, h.end + 1),
        options: { inlineClassName: "search-match-highlight" },
      }));
      if (highlightDecorationsRef.current) {
        highlightDecorationsRef.current.set(decorations);
      } else {
        highlightDecorationsRef.current = editor.createDecorationsCollection(decorations);
      }
    } else {
      highlightDecorationsRef.current?.clear();
    }

    clearReveal();
  }, [pendingReveal, active?.path, clearReveal]);

  const handleSave = React.useCallback(async () => {
    if (!activePath) return;
    try {
      await save(workspaceId, activePath);
      push("success", "已保存");
      // 保存成功后增量重建这一个文件的符号索引，让"转到定义"很快就能看到新写的
      // 函数/类型——不用等下次重新打开根目录触发全量扫描。既没有工作区又没有
      // 本地根目录（单个游离文件）时没有索引可挂，不接这个逻辑。
      const savedBuf = useEditorStore.getState().buffers[activePath];
      const symbolRoot = workspaceId ?? (rootPath || null);
      if (symbolRoot && savedBuf?.kind === "text") {
        void symbolService.reindexFile(symbolRoot, activePath, savedBuf.content).catch(() => {});
      }
    } catch (e) {
      push("error", `保存失败：${formatError(e)}`, { label: "重试保存", onClick: handleSave });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, activePath, rootPath]);

  const handleOpenExternally = React.useCallback(async () => {
    if (!activePath || !active) return;
    try {
      if (active.origin === "standalone") await localFileService.openExternally(activePath);
      else await fsService.openExternally(workspaceId!, activePath);
    } catch (e) {
      push("error", `打开失败：${formatError(e)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, activePath, active?.origin]);

  const fileName = (path: string) => path.split(/[/\\]/).filter(Boolean).pop() ?? path;

  const tabStrip = order.length > 0 && (
    <div className="editor-tabs">
      {order.map((path) => {
        const buf = buffers[path];
        const diff = diffs[path];
        if (!buf && !diff) return null;
        const label = diff ? `${fileName(diff.leftPath)} ↔ ${fileName(diff.rightPath)}` : fileName(path);
        return (
          <div
            key={path}
            className={`editor-tab ${path === activePath ? "active" : ""} ${buf?.isPreview ? "preview" : ""}`}
            title={diff ? `${diff.leftPath}  ↔  ${diff.rightPath}` : path}
            onClick={() => {
              setActive(path);
              if (buf?.origin === "workspace") void revealInExplorer(path);
            }}
            onDoubleClick={() => buf && pin(path)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTabMenu({ x: e.clientX, y: e.clientY, path });
            }}
          >
            {diff && <GitCompare className="editor-tab-diff-icon" />}
            {/* 游离文件（不属于当前工作区）在标签上加个小图标区分——title 已经是
                完整绝对路径，hover 能看到，这里只做"一眼扫过去就能分辨"的视觉提示。 */}
            {buf?.origin === "standalone" && (
              <span title="游离文件，不属于当前工作区" style={{ display: "flex" }}>
                <FileStack className="editor-tab-standalone-icon" />
              </span>
            )}
            <span className="editor-tab-name">{label}</span>
            {buf?.dirty && <span className="dirty-dot" />}
            <button
              className="editor-tab-close"
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                close(path);
              }}
            >
              <X />
            </button>
          </div>
        );
      })}
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={(() => {
            const { path } = tabMenu;
            const idx = order.indexOf(path);
            const items: ContextMenuItem[] = [{ label: "关闭", onClick: () => close(path) }];
            if (order.length > 1) items.push({ label: "关闭其他", onClick: () => closeOthers(path) });
            if (idx > 0) items.push({ label: "关闭左侧的标签页", onClick: () => closeToLeft(path) });
            if (idx >= 0 && idx < order.length - 1) items.push({ label: "关闭右侧的标签页", onClick: () => closeToRight(path) });
            items.push({ label: "关闭所有", onClick: () => closeAll(), separatorBefore: true });
            return items;
          })()}
          onClose={() => setTabMenu(null)}
        />
      )}
    </div>
  );

  // PDF 标签切走再切回来会整个重新加载、滚动位置也跳回顶部——原因是内容区只按
  // `active.kind` 走三元分支渲染，切到别的标签时 `isPdf` 变 false，React 直接把
  // 整棵 `<PdfPreview>` 子树连同它内部状态（pdf.js 文档、滚动位置、缩放、搜索）
  // 卸载掉；切回来时是全新挂载，不是恢复。修法：不给每个 PDF 标签各自一份"只在
  // active 时挂载"的实例，而是给**所有当前打开着的** PDF 标签各常驻一份
  // `PdfPreview`，用 `visible` 控制 `display`，标签页存在期间实例不销毁。下面
  // `isPdf` 分支因此改成渲染 `null`——真正可见的那个实例由 `pdfLayer` 提供。
  const pdfBuffers = order
    .map((path) => buffers[path])
    .filter((buf): buf is NonNullable<typeof buf> => Boolean(buf) && buf.kind === "pdf");
  const pdfLayer = pdfBuffers.map((buf) => (
    <PdfPreview key={buf.path} base64={buf.content.split(",")[1] ?? ""} visible={buf.path === activePath} />
  ));

  // Windows 本地根目录下 `p`（buffer 路径，来自文件树，后端统一正规化成 `/`）和
  // `rootPath`（原生目录选择器选出来的，保留系统原样的 `\`）分隔符不一致，直接
  // `startsWith` 永远不命中，面包屑会显示完整绝对路径的每一段而不是相对路径。
  // 两边都正规化成 `/` 再按小写比较——Windows 路径大小写不敏感。
  const relOf = (p: string) => {
    const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
    const normalizedPath = p.replace(/\\/g, "/");
    return normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())
      ? normalizedPath.slice(normalizedRoot.length).replace(/^\//, "")
      : p;
  };

  if (!active) {
    if (activeDiff) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {tabStrip}
          <div className="editor-toolbar">
            <div className="breadcrumb">
              <span className="crumb">{relOf(activeDiff.leftPath)}</span>
              <span className="sep" style={{ margin: "0 8px" }}>⇄</span>
              <span className="crumb current">{relOf(activeDiff.rightPath)}</span>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DiffEditor
              language={activeDiff.language}
              original={activeDiff.leftContent}
              modified={activeDiff.rightContent}
              theme={monacoTheme}
              options={{
                readOnly: true,
                renderSideBySide: true,
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                wordWrap: "on",
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
          {pdfLayer}
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {tabStrip}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: 13,
          }}
        >
          {workspaceId ? "从左侧文件树中选择一个文件开始编辑" : "拖拽文件到此处，或按 Ctrl+O 打开文件"}
        </div>
        {pdfLayer}
      </div>
    );
  }

  // 游离文件不属于当前工作区，面包屑用"本地文件 › 完整路径"而不是"工作区名 › 相对路径"
  // ——套用工作区的相对路径规则毫无意义（rootPath 甚至可能不存在，比如无工作区的
  // 独立编辑器壳），完整路径才能让人分清这是磁盘上的哪个文件。
  const segments =
    active.origin === "standalone"
      ? ["本地文件", ...active.path.split(/[/\\]/).filter(Boolean)]
      : [workspaceName, ...relOf(active.path).split(/[/\\]/).filter(Boolean)];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {tabStrip}
      <div className="editor-toolbar">
        <div className="breadcrumb">
          {segments.map((seg, i) => (
            <span key={i}>
              {i > 0 && <span className="sep">›</span>}{" "}
              <span className={i === segments.length - 1 ? "crumb current" : "crumb"} onClick={() => {
                if (i === 0 || !active) return;
                const separator = active.path.includes("\\") ? "\\" : "/";
                const pathSegs = active.path.split(/[/\\]/).filter(Boolean);
                // standalone 面包屑包含"本地文件"前缀；工作区面包屑第一项是工作区名，
                // 后续项是相对根目录路径。始终把点击项映射回完整绝对路径。
                const target = active.origin === "standalone"
                  ? pathSegs.slice(0, i).join(separator)
                  : [rootPath.replace(/[\\/]$/, ""), ...segments.slice(1, i)].join(separator);
                void revealInExplorer(target);
              }}>{seg}</span>
            </span>
          ))}
          {active.dirty && <span className="dirty-dot" style={{ marginLeft: 6 }} title="未保存" />}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          {isPreviewOnly && (
            <button className="btn ghost sm" onClick={handleOpenExternally} title="用系统默认程序打开">
              <ExternalLink style={{ width: 14, height: 14 }} /> 用系统程序打开
            </button>
          )}
          {!isPreviewOnly && (
            <>
              <button
                className="btn ghost sm"
                title="搜索 (Ctrl+F)"
                onClick={() => editorRef.current?.trigger("toolbar", "actions.find", null)}
              >
                <Search style={{ width: 14, height: 14 }} />
              </button>
              {canPreview && (
                <button
                  className={`btn ghost sm ${previewOpen ? "active" : ""}`}
                  onClick={() => setPreviewOpen((v) => !v)}
                  title={`${isHtml ? "HTML" : "Markdown"} 预览 (Ctrl+Shift+V)`}
                >
                  {previewOpen ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />} 预览
                </button>
              )}
              <button
                className="btn ghost sm"
                onClick={handleSave}
                disabled={active.truncated}
                title={active.truncated ? "文件过大，当前只是只读预览，无法保存" : "保存 (Ctrl+S)"}
              >
                <Save style={{ width: 14, height: 14 }} /> 保存
              </button>
            </>
          )}
        </div>
      </div>
      {active.truncated && (
        <div className="editor-large-file-banner">
          文件过大（{formatBytes(active.totalSize)}），仅预览前 {formatBytes(active.content.length)}，只读模式，无法编辑保存。
        </div>
      )}
      {isImage ? (
        <ImageViewer src={active.content} alt={active.path} />
      ) : isPdf ? null : isWord ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "var(--bg-base)" }}>
          <div className="office-word-preview" dangerouslySetInnerHTML={{ __html: active.content }} />
        </div>
      ) : isExcel ? (
        <ExcelPreview sheets={active.sheets ?? []} />
      ) : isExecutable ? (
        <BinaryInfoPanel
          path={active.path}
          info={active.binaryInfo ?? null}
          error={active.binaryInfoError ?? null}
          onOpenExternally={handleOpenExternally}
        />
      ) : isJar ? (
        <JarInfoPanel
          path={active.path}
          info={active.jarInfo ?? null}
          error={active.jarInfoError ?? null}
          onOpenExternally={handleOpenExternally}
        />
      ) : isLegacyOffice ? (
        <LegacyOfficePreview
          path={active.path}
          content={active.content}
          error={active.legacyOfficeError}
          onOpenExternally={handleOpenExternally}
        />
      ) : isUnsupportedBinary ? (
        <UnsupportedBinaryPanel path={active.path} onOpenExternally={handleOpenExternally} />
      ) : (
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* 参考 VS Code 默认的 Ctrl+Shift+V"打开预览"（不是 Ctrl+K V 那种分栏预览）：
            预览会整体替换掉编辑区域，不是和源码并排——两者占同一块区域，用 display
            互斥切换，Monaco 实例不销毁（只是隐藏），切回编辑态时光标/滚动位置都还在。 */}
        <div style={{ display: previewOpen ? "none" : "block", width: "100%", height: "100%" }}>
          <Editor
            key={active.path}
            path={active.path}
            keepCurrentModel
            language={language}
            value={active.content}
            theme={monacoTheme}
            onChange={(value) => updateContent(active.path, value ?? "")}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              // provider 注册在 monaco 命名空间级别、只需要一次——`key={active.path}`
              // 导致每切一个文件就重新挂载一个新的 Editor 实例并重新触发 onMount，
              // 内部用 definitionProviderRegistered 挡掉重复注册。
              registerGoToDefinitionOnce(monaco);
              // 新文件挂载了一个全新的 Monaco 实例，旧的 decorations collection 对象
              // 属于已经销毁的上一个实例，不能带过来复用。
              highlightDecorationsRef.current = null;

              // 标签页恢复（localStorage 恢复逻辑）会连续挂载好几个 Editor 实例，
              // 容易和其它布局副作用并发抢布局——Monaco 自己的根节点在那个繁忙的
              // 挂载瞬间可能把容器测量成很小的像素（父级 flex 容器当时还没完全
              // 撑开），`automaticLayout` 的 ResizeObserver 之后不一定会再纠正回来。
              // 等浏览器完成当前这轮布局/绘制后（下一帧）再手动调一次 layout()
              // 强制重新测量，避免赶上这个繁忙窗口。
              requestAnimationFrame(() => editor.layout());

              const pos = editor.getPosition();
              if (pos) setCursorPos({ line: pos.lineNumber, column: pos.column });
              editor.onDidChangeCursorPosition((e) => {
                setCursorPos({ line: e.position.lineNumber, column: e.position.column });
              });

              editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
                handleSave();
              });
              if (canPreview) {
                editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
                  setPreviewOpen((v) => !v);
                });
              }
            }}
            options={{
              readOnly: active.truncated,
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              minimap: { enabled: true },
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        </div>
        {isMarkdown && previewOpen && (
          <div
            className="markdown-preview"
            style={{ width: "100%", height: "100%", overflowY: "auto" }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
        {isHtml && previewOpen && (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {inliningResources && (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  zIndex: 1,
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-surface-raised)",
                  color: "var(--text-secondary)",
                  boxShadow: "var(--shadow)",
                }}
              >
                正在加载页面引用的外部资源…
              </div>
            )}
            <iframe
              // key 换成 active.path：切换到另一个 html 文件时强制换一个全新的
              // iframe，避免上一个文档残留的全局状态（比如它自己的定时器/DOM 引用）
              // 泄漏进下一份预览。
              key={active.path}
              title={`${active.path} 预览`}
              srcDoc={htmlPreviewSrc ?? active.content}
              // 特意不给 allow-same-origin：预览的是用户自己打开的文件，允许里面的
              // <script> 跑起来（这就是"预览"的意义，和浏览器直接打开这个文件行为一致），
              // 但不给它同源权限去摸这个 Tauri 应用自身的 window/IPC 桥。
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
          </div>
        )}
      </div>
      )}
      {/* 底部状态栏（参考 VS Code 右下角编码/语言/光标位置徽标）。 */}
      {!isPreviewOnly && (
        <div className="editor-status-bar">
          <div className="status-left">
            <EncodingMenu
              current={active.encoding}
              onReopen={async (enc) => {
                try {
                  await reopenWithEncoding(workspaceId, active.path, enc);
                } catch (e) {
                  push("error", `重新打开失败：${formatError(e)}`);
                }
              }}
              onSaveAs={async (enc) => {
                try {
                  await saveWithEncoding(workspaceId, active.path, enc);
                  push("success", `已以 ${enc} 编码保存`);
                } catch (e) {
                  push("error", `保存失败：${formatError(e)}`);
                }
              }}
            />
            <span className="status-item">{language}</span>
          </div>
          <div className="status-right">
            {cursorPos && (
              <span className="status-item">
                第 {cursorPos.line} 行，第 {cursorPos.column} 列
              </span>
            )}
            <span className="status-item">{formatBytes(active.totalSize || active.content.length)}</span>
          </div>
        </div>
      )}
      {conflict && (
        <ConflictDialog
          open
          path={conflict.path}
          onViewDiff={() => resolveConflict(workspaceId, "discard")}
          onSaveAsCopy={() => resolveConflict(workspaceId, "discard")}
          onOverwrite={() => resolveConflict(workspaceId, "overwrite")}
        />
      )}
      {pdfLayer}
    </div>
  );
};
