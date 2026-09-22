# 独立编辑器

`roc_desk-editor` 是 roc_desk 多仓库拆分后的独立工具仓库。

## 用途

提供多标签文本编辑、编码处理、图片/PDF/Office/JAR/EXE 预览和独立文件树。

## 依赖

- `roc_desk-common`（`common-v0.4.0`）：`roc_desk_core`（错误类型）+ `roc_desk_common`
  （`fsops::FileOps`、`symbols`——本仓库的符号索引就建在 `roc_desk_common::symbols`
  之上，那份逻辑本身和 `roc_desk-workspace` 共用）。
- `roc_desk-explorer`（`v0.2.0`）：本地文件系统读写（打开/保存/二进制预览/EXE·JAR
  信息）直接复用它的 19 个 `roc_desk_explorer::cmd::local_*` 命令，本仓库不重新
  实现这部分——只有 `editor_ocr_image`、`editor_symbols_*` 是这个工具真正专属的。
- Windows `Media.Ocr`（`windows`/`windows-future` crate）：图片预览的 OCR 文字识别，
  仅 Windows 平台生效，其它平台编译通过、调用返回错误。
- 前端：Monaco Editor（`@monaco-editor/react`）+ pdf.js/xlsx/mammoth（预览）。

## 本仓库专属命令

- `editor_ocr_image`（`lib/src/ocr.rs`）：`{ input: { data_base64 } } -> OcrResult`。
- `editor_symbols_build_index` / `editor_symbols_go_to_definition` /
  `editor_symbols_reindex_file`（`lib/src/symbols.rs`）：按本地根目录路径（不是
  工作区 id）为键的符号索引，见该文件顶部注释——这是相对宿主版本的一个有意
  偏离：宿主的 `symbols_*` 命令按 `workspace_id: Uuid` 索引（依赖
  `roc_desk-workspace` 自己的工作区注册表），这个工具没有那张注册表，只有
  "打开了哪个本地根目录"，所以退化成按根目录路径字符串索引；好处是"游离
  文件夹"（不属于任何工作区）也能用上转到定义。

## 前端导出

`src-web` 除了给自己的 `standalone` 壳提供入口（`src/main.tsx`），还导出一个
可嵌入的编辑器面板供其它工具复用（比如 `roc_desk-workspace` 内嵌编辑器）：

```ts
import { EditorPane, useEditorStore } from "@roc_desk/tool-editor";

<EditorPane workspaceId={null} rootPath="D:/some/project" />
```

`workspaceId` 传 `null` 时是"本地根目录/游离文件"模式，只需要嵌入方注册好
`roc_desk_explorer::cmd::local_*` + 本仓库的 `editor_*` 命令；传真实 id 时是
"工作区"模式，还需要嵌入方自己实现 `fs_*` 系列命令（工作区边界校验/SFTP/Agent
远程读写，`roc_desk-workspace` 的职责，不是这个包提供的）。完整导出列表见
`src-web/src/index.ts`。

## 构建

```powershell
# 前端（可选，standalone 目前仍内置占位页面，见下方"已知缺口"）
cd src-web
npm install
npm run build

# 独立 EXE
cd ..
.\build-standalone.ps1
```

默认生成 Release 版本：`bin\roc_desk-editor.exe`。开发构建使用：

```powershell
.\build-standalone.ps1 -Configuration debug
```

## 运行截图

截图放在 `docs/screenshots/`，例如：

```markdown
![独立编辑器主界面](docs/screenshots/main.png)
```

当前仓库已预留截图目录，后续补充实际运行截图。

## 迁移状态

- Rust：本地文件系统命令复用 `roc_desk-explorer`；OCR、符号索引两组本仓库专属
  命令已迁移并接入 `standalone`；`cargo check --workspace` 与
  `.\build-standalone.ps1` 均通过。
- 前端：`CodeEditor`/`ImageViewer`（含 OCR 面板）/`PdfPreview`/`LocalFileTree`/
  `StandaloneFileTree` 等组件与 `editorStore` 已迁移，`src-web` 补齐了
  `package.json`/Vite 脚手架，`npm run build`（`tsc && vite build`）通过；导出
  `<EditorPane/>` 供其它工具嵌入。
- 已知缺口：`standalone/dist/` 目前仍是迁移前遗留的极简占位页面（能跑，但不是
  `src-web` 真实构建产物），把 `npm run build` 的产物接进 `standalone` 的
  `frontendDist` 是后续工作，不影响 Rust 侧命令/`<EditorPane/>` 导出可用；宿主
  仍保留兼容实现，完成宿主侧的 Git 依赖切换和旧代码删除由宿主仓库那边单独处理。

总体方案见：[多仓库拆分计划](https://github.com/swimhigh/roc_desk/blob/main/docs/MULTI_REPO_SPLIT_PLAN.md)。
