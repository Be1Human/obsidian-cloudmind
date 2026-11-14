import { App, Menu, Modal, Notice, TextFileView, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import MindMap from "simple-mind-map";
import Drag from "simple-mind-map/src/plugins/Drag.js";
import Select from "simple-mind-map/src/plugins/Select.js";
import KeyboardNavigation from "simple-mind-map/src/plugins/KeyboardNavigation.js";
import AssociativeLine from "simple-mind-map/src/plugins/AssociativeLine.js";
import OuterFrame from "simple-mind-map/src/plugins/OuterFrame.js";
import RainbowLines from "simple-mind-map/src/plugins/RainbowLines.js";
import Export from "simple-mind-map/src/plugins/Export.js";
import ExportXMind from "simple-mind-map/src/plugins/ExportXMind.js";
import NodeImgAdjust from "simple-mind-map/src/plugins/NodeImgAdjust.js";
import TouchEvent from "simple-mind-map/src/plugins/TouchEvent.js";
import Style from "simple-mind-map/src/core/render/node/Style.js";
import icons from "simple-mind-map/src/svg/icons.js";
import { readableTextOn } from "./contrast";
import { improveDrag } from "./dragFix";
import { FM_KEYS, ParsedDoc, buildFmUpdates, parseDoc, pickFm, serializeDoc } from "./mdTree";
import { FILL_COLORS, LAYOUTS, RAINBOW, TEXT_COLORS, THEMES, defineThemes, themeDef, themePreview } from "./themes";
import { POS_LABELS, ToolbarPos } from "./settings";
import { WikiLink, WikiSuggest, extractLinks } from "./wikilink";
import { SmoothWheel } from "./wheel";
import type CloudMindPlugin from "./main";

export const VIEW_TYPE = "cloudmind-view";

let pluginsReady = false;
function setupMindMap() {
  if (pluginsReady) return;
  pluginsReady = true;
  defineThemes();

  // 节点手动填了颜色但没指定文字色时，保证文字看得清（主题的文字色是按主题底色选的，
  // 在深色主题里给节点填浅色会变成“浅底白字”）。只改显示，不写进笔记。
  const origMerge = Style.prototype.merge;
  Style.prototype.merge = function (this: any, prop: string, useRoot?: boolean) {
    const value = origMerge.call(this, prop, useRoot);
    if (prop !== "color" || this.getSelfStyle("color") !== undefined) return value;
    const fill = this.getSelfStyle("fillColor");
    return (fill && readableTextOn(fill, value)) || value;
  };
  // 拖拽换位置：感应区更宽、判定更及时
  improveDrag(Drag);
  MindMap.usePlugin(Drag)
    .usePlugin(Select)
    .usePlugin(KeyboardNavigation)
    .usePlugin(AssociativeLine)
    .usePlugin(OuterFrame)
    .usePlugin(RainbowLines)
    .usePlugin(Export)
    .usePlugin(ExportXMind)
    .usePlugin(NodeImgAdjust)
    .usePlugin(TouchEvent);
}

/* ------------------------------------------------------------ 小工具 */

function promptModal(
  app: App,
  title: string,
  fields: { label: string; value?: string; multiline?: boolean; placeholder?: string }[]
): Promise<string[] | null> {
  return new Promise((resolve) => {
    class M extends Modal {
      done = false;
      onOpen() {
        this.titleEl.setText(title);
        const inputs: (HTMLInputElement | HTMLTextAreaElement)[] = [];
        fields.forEach((f) => {
          const wrap = this.contentEl.createDiv({ cls: "cm-field" });
          wrap.createEl("label", { text: f.label });
          const el = f.multiline
            ? wrap.createEl("textarea", { attr: { rows: "8" } })
            : wrap.createEl("input", { attr: { type: "text" } });
          el.value = f.value ?? "";
          if (f.placeholder) el.setAttr("placeholder", f.placeholder);
          inputs.push(el);
        });
        const bar = this.contentEl.createDiv({ cls: "cm-modal-bar" });
        const ok = bar.createEl("button", { text: "确定", cls: "mod-cta" });
        const cancel = bar.createEl("button", { text: "取消" });
        const submit = () => {
          this.done = true;
          resolve(inputs.map((i) => i.value));
          this.close();
        };
        ok.onclick = submit;
        cancel.onclick = () => this.close();
        inputs.forEach((i) =>
          i.addEventListener("keydown", (ev: Event) => {
            const e = ev as KeyboardEvent;
            if (e.key === "Enter" && !(i instanceof HTMLTextAreaElement) && !e.isComposing) submit();
            if (e.key === "Enter" && i instanceof HTMLTextAreaElement && (e.ctrlKey || e.metaKey)) submit();
          })
        );
        window.setTimeout(() => inputs[0]?.focus(), 30);
      }
      onClose() {
        this.contentEl.empty();
        if (!this.done) resolve(null);
      }
    }
    new M(app).open();
  });
}

function dataToArrayBuffer(res: any): ArrayBuffer | string {
  if (typeof res === "string") {
    if (res.startsWith("data:")) {
      const comma = res.indexOf(",");
      const meta = res.slice(5, comma);
      const payload = res.slice(comma + 1);
      if (/;base64/.test(meta)) {
        const bin = atob(payload);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8.buffer;
      }
      return decodeURIComponent(payload);
    }
    return res;
  }
  return res;
}

const SHAPES: [string, string][] = [
  ["rectangle", "矩形"],
  ["roundedRectangle", "圆角矩形"],
  ["ellipse", "椭圆"],
  ["diamond", "菱形"],
  ["parallelogram", "平行四边形"],
  ["circle", "圆形"],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pad2 = (n: number) => String(n).padStart(2, "0");

function countNodes(tree: any): number {
  if (!tree) return 0;
  let n = 1;
  for (const c of tree.children ?? []) n += countNodes(c);
  return n;
}

interface BtnSpec {
  id: string;
  icon: string;
  label: string;
  tip: string;
  /** 需要先选中节点才可用 */
  need?: boolean;
  /** 在按钮底部显示当前颜色条 */
  swatch?: "fill" | "text";
  run: (ev: MouseEvent, el: HTMLElement) => void;
}

const TOOLBAR_GROUPS: string[][] = [
  ["undo", "redo"],
  ["child", "sibling", "parent", "summary", "frame", "relation"],
  ["note", "link", "wikilink", "tag", "icon"],
  ["fill", "textColor", "bold", "italic", "shape"],
  ["layout", "theme", "rainbow", "fold"],
  ["export", "more"],
];
const NODEBAR_ITEMS: string[] = [
  "child", "sibling", "|", "fill", "textColor", "bold", "italic", "shape", "|", "icon", "note", "link", "wikilink", "openlink", "|", "delete",
];

/* ------------------------------------------------------------ 视图 */

export class CloudMindView extends TextFileView {
  mm: any = null;
  private doc: ParsedDoc | null = null;
  private lastText = "";
  /** 用户是否真的在导图里改过东西；没改过就不会写回文件 */
  private touched = false;

  private mainEl!: HTMLElement;
  private stageEl!: HTMLElement;
  private canvasEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private gripEl!: HTMLElement;
  private nodebarEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private fabEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private ro: ResizeObserver | null = null;
  private mouseIn = false;

  private specs: Record<string, BtnSpec> = {};
  private tbBtns = new Map<string, { el: HTMLButtonElement; spec: BtnSpec }>();
  private nbBtns = new Map<string, { el: HTMLButtonElement; spec: BtnSpec }>();

  private st: Record<string, HTMLElement> = {};
  private saveState: "clean" | "dirty" | "saving" | "saved" = "clean";
  private savedAt = "";
  private editing = false;
  private dragging = false;
  private nodeCount = 0;
  private nbRaf = 0;
  private stRaf = 0;

  private fmLayout: string | null = null;
  private fmTheme: string | null = null;
  private fmRainbow: boolean | null = null;

  private popEl: HTMLElement | null = null;
  private popAnchor: HTMLElement | null = null;
  private popOff: (() => void) | null = null;
  private wiki: WikiSuggest | null = null;
  private wheel = new SmoothWheel(() => this.mm);

  constructor(leaf: WorkspaceLeaf, private plugin: CloudMindPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return this.file?.basename ?? "CloudMind";
  }
  getIcon() {
    return "network";
  }

  /* ---------- 生命周期 ---------- */

  async onOpen() {
    setupMindMap();
    this.contentEl.empty();
    this.contentEl.classList.add("cm-view");

    this.mainEl = this.contentEl.createDiv({ cls: "cm-main" });
    this.stageEl = this.mainEl.createDiv({ cls: "cm-stage" });
    this.canvasEl = this.stageEl.createDiv({ cls: "cm-canvas" });
    this.emptyEl = this.stageEl.createDiv({ cls: "cm-empty" });
    this.emptyEl.setText("这张导图还是空的：选中中心主题后按 Tab，添加第一个子主题");
    this.nodebarEl = this.stageEl.createDiv({ cls: "cm-nodebar" });
    this.buildZoomBar();
    this.fabEl = this.stageEl.createDiv({ cls: "cm-fab" });
    this.buildFab();

    this.buildSpecs();
    this.buildToolbar();
    this.buildNodebar();
    this.statusEl = this.contentEl.createDiv({ cls: "cm-status" });
    this.buildStatus();

    // 工具栏、快捷条上点按钮时不抢走键盘焦点，这样点完还能直接用键盘继续编辑
    for (const el of [this.toolbarEl, this.nodebarEl, this.fabEl]) {
      el.addEventListener("mousedown", (e) => {
        if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
      });
    }
    // 点击画布时让焦点回到 body，这样键盘事件（含“选中后直接打字进入编辑”）才会被导图接收
    this.canvasEl.addEventListener("mousedown", () => {
      this.closePopover();
      const doc = this.contentEl.ownerDocument;
      const ae = doc.activeElement as HTMLElement | null;
      if (ae && ae !== doc.body && !ae.closest(".smm-node-edit-wrap")) ae.blur();
    });
    this.contentEl.addEventListener("mouseenter", () => (this.mouseIn = true));
    this.contentEl.addEventListener("mouseleave", () => (this.mouseIn = false));

    this.addAction("file-text", "切回文本视图", () => this.plugin.switchToText(this.leaf));

    // 编辑节点时输入 [[ 弹出笔记搜索
    this.wiki = new WikiSuggest(this.app, () => this.file?.path ?? "", () => this.contentEl.ownerDocument);
    this.wiki.attach();

    // 删除键：用物理键位判断，不依赖 keyCode。
    // 中文输入法开着时，Windows 上 Backspace / Delete 的 keyCode 常常是 229（“输入法处理中”），
    // 库会把它当成“开始打字”而进入文字编辑，而不是删除节点。放在捕获阶段，抢在库之前处理。
    this.registerDomEvent(window, "keydown", (e: KeyboardEvent) => this.onDeleteKey(e), true);

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(this.stageEl);

    // 其它插件/主题会频繁触发 css-change；只有“明暗真的变了”才换主题
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        if (!this.mm || this.fmTheme) return;
        if (this.mm.getTheme() === this.autoThemeId()) return;
        this.applyConfig();
      })
    );

    this.applySettings();
    this.renderStatus();
  }

  async onClose() {
    this.ro?.disconnect();
    this.closePopover();
    this.wiki?.destroy();
    this.wiki = null;
    this.wheel.cancel();
    if (this.resizeRaf) window.cancelAnimationFrame(this.resizeRaf);
    if (this.nbRaf) window.cancelAnimationFrame(this.nbRaf);
    if (this.stRaf) window.cancelAnimationFrame(this.stRaf);
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.destroyMindMap();
  }

  private destroyMindMap() {
    if (this.mm) {
      try {
        this.mm.destroy();
      } catch {
        /* ignore */
      }
      this.mm = null;
    }
  }

  clear() {
    /* 视图内容由 setViewData 重建 */
  }

  /* ---------- 数据 <-> 文件 ---------- */

  getViewData(): string {
    // 只是预览、没有改过任何内容时，原样返回源文件，绝不改动用户的笔记
    if (!this.mm || !this.doc || !this.touched) return this.lastText;
    const text = this.serialize();
    this.lastText = text;
    return text;
  }

  setViewData(data: string, _clear: boolean) {
    if (this.mm && data === this.lastText) return;
    this.lastText = data;
    this.touched = false;
    this.setSaveState("clean");
    this.doc = parseDoc(data, this.file?.basename ?? "中心主题");
    this.fmLayout = pickFm(this.doc.fm, FM_KEYS.layout) || null;
    this.fmTheme = pickFm(this.doc.fm, FM_KEYS.theme) || null;
    const rb = pickFm(this.doc.fm, FM_KEYS.rainbow);
    this.fmRainbow = rb === undefined ? null : rb === "true";
    this.applyDoc();
  }

  async save(clear?: boolean) {
    const had = this.touched;
    if (had) this.setSaveState("saving");
    try {
      await super.save(clear);
    } finally {
      if (had) {
        const d = new Date();
        this.savedAt = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
        this.setSaveState("saved");
      }
    }
  }

  private serialize(): string {
    const doc = this.doc!;
    const tree = this.mm.getData(false);
    return serializeDoc({
      root: tree,
      virtualRoot: doc.virtualRoot,
      useTab: doc.useTab,
      eol: doc.eol,
      fmInner: doc.fmInner,
      fmUpdates: buildFmUpdates({ layout: this.fmLayout, theme: this.fmTheme, rainbow: this.fmRainbow }),
    });
  }

  /** 导图数据有变化：只在序列化结果真的变了时才触发保存 */
  private markDirty() {
    if (!this.mm || !this.doc) return;
    this.touched = true;
    const t = this.serialize();
    if (t !== this.lastText) {
      this.lastText = t;
      this.setSaveState("dirty");
      this.requestSave();
    }
  }

  /* ---------- 创建 / 更新导图 ---------- */

  private autoThemeId() {
    return activeDocument.body.classList.contains("theme-dark") ? "xmindDark" : "xmindFresh";
  }
  private curThemeId() {
    return this.fmTheme && THEMES.some((t) => t.id === this.fmTheme) ? this.fmTheme : this.autoThemeId();
  }
  private curLayout() {
    return this.fmLayout && LAYOUTS.some((l) => l.id === this.fmLayout) ? this.fmLayout : "mindMap";
  }
  private curRainbow() {
    return this.fmRainbow ?? themeDef(this.curThemeId()).rainbow;
  }

  private applyDoc() {
    if (!this.doc) return;
    const w = this.canvasEl?.clientWidth ?? 0;
    const h = this.canvasEl?.clientHeight ?? 0;
    if (w <= 0 || h <= 0) return; // 等 ResizeObserver 触发后再创建
    try {
      if (!this.mm) {
        this.createMindMap();
      } else {
        this.mm.setData(this.doc.root);
        this.applyConfig();
      }
      this.refreshAll();
    } catch (err) {
      // 出错时把原因直接显示在界面上，方便排查，而不是留一片空白
      console.error("[cloudmind]", err);
      this.canvasEl.empty();
      this.canvasEl.createDiv({
        cls: "cm-error",
        text: "导图渲染失败：" + ((err as Error)?.message ?? String(err)),
      });
      this.mm = null;
    }
  }

  onResize() {
    this.handleResize();
  }

  private resizeRaf = 0;
  private resizeTimer: number | null = null;
  private lastW = 0;
  private lastH = 0;

  /**
   * 容器尺寸变化：合并抖动。滚动条出现/消失、拖动面板都会让尺寸变 1~2px，
   * 如果每次都整张重绘，画面就会一直在跳。所以：先等一帧合并，变化很小就忽略，
   * 且最多每 150ms 重绘一次。
   */
  private handleResize() {
    if (this.resizeRaf) return;
    this.resizeRaf = window.requestAnimationFrame(() => {
      this.resizeRaf = 0;
      const w = this.canvasEl.clientWidth;
      const h = this.canvasEl.clientHeight;
      if (w <= 0 || h <= 0) return;
      this.clampFloat();
      if (!this.mm) {
        this.lastW = w;
        this.lastH = h;
        this.applyDoc();
        return;
      }
      if (Math.abs(w - this.lastW) <= 2 && Math.abs(h - this.lastH) <= 2) return;
      if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.resizeTimer = null;
        if (!this.mm) return;
        const w2 = this.canvasEl.clientWidth;
        const h2 = this.canvasEl.clientHeight;
        if (w2 <= 0 || h2 <= 0) return;
        if (Math.abs(w2 - this.lastW) <= 2 && Math.abs(h2 - this.lastH) <= 2) return;
        this.lastW = w2;
        this.lastH = h2;
        try {
          this.mm.resize();
        } catch {
          /* 容器暂时不可见 */
        }
        this.scheduleNodeBar();
      }, 150);
    });
  }

  private appliedRainbow: boolean | null = null;

  /** 只在“确实变了”的时候才动导图，避免无谓重绘 */
  private applyConfig() {
    if (!this.mm) return;
    const layout = this.curLayout();
    if (this.mm.getLayout() !== layout) this.mm.setLayout(layout);
    const theme = this.curThemeId();
    if (this.mm.getTheme() !== theme) this.mm.setTheme(theme);
    this.applyRainbow();
  }

  private applyRainbow(force = false) {
    if (!this.mm?.rainbowLines) return;
    const want = this.curRainbow();
    if (!force && this.appliedRainbow === want) return;
    this.appliedRainbow = want;
    this.mm.rainbowLines.updateRainLinesConfig({ open: want, colorsList: RAINBOW });
  }

  private createMindMap() {
    const mm = new MindMap({
      el: this.canvasEl,
      data: this.doc!.root,
      layout: this.curLayout(),
      theme: this.curThemeId(),
      readonly: false,
      initRootNodePosition: ["center", "center"],
      // —— 向 XMind 对齐的交互 ——
      mousewheelAction: "move", // 滚轮平移，Ctrl+滚轮缩放
      // 库自带的滚轮处理对触控板很不友好（会跳），换成我们自己的平滑实现
      customHandleMousewheel: this.wheel.handle,
      mouseScaleCenterUseMousePosition: true,
      enableAutoEnterTextEditWhenKeydown: true, // 选中节点直接打字即开始编辑
      autoEmptyTextWhenKeydownEnterEdit: true,
      enableDblclickBackToRootNode: false,
      useLeftKeySelectionRightKeyDrag: false,
      createNewNodeBehavior: "default",
      defaultInsertSecondLevelNodeText: "分支主题",
      defaultInsertBelowSecondLevelNodeText: "子主题",
      defaultGeneralizationText: "概要",
      textAutoWrapWidth: 420,
      maxHistoryCount: 500,
      addHistoryTime: 300,
      hoverRectColor: "rgba(75, 141, 246, 0.55)",
      hoverRectPadding: 3,
      dragPlaceholderRectFill: "rgba(75, 141, 246, 0.45)",
      rainbowLinesConfig: { open: this.curRainbow(), colorsList: RAINBOW },
      enableShortcutOnlyWhenMouseInSvg: false, // 是否响应由 customCheckEnableShortcut 决定
      customCheckEnableShortcut: (e: KeyboardEvent) => this.canHandleKey(e),
    });
    this.mm = mm;
    this.appliedRainbow = this.curRainbow();
    this.lastW = this.canvasEl.clientWidth;
    this.lastH = this.canvasEl.clientHeight;

    mm.on("data_change", () => {
      // 初始化阶段触发的数据事件不算用户编辑（历史栈还在起点）
      if (!this.touched && (mm.command?.activeHistoryIndex ?? 0) === 0) return;
      this.markDirty();
      this.scheduleStatus();
    });
    mm.on("back_forward", (index: number, len: number) => {
      const u = this.tbBtns.get("undo")?.el;
      const r = this.tbBtns.get("redo")?.el;
      if (u) u.disabled = index <= 0;
      if (r) r.disabled = index >= len - 1;
    });
    mm.on("scale", (s: number) => {
      this.renderStatus();
      this.scheduleNodeBar();
    });
    mm.on("view_data_change", () => this.scheduleNodeBar());
    mm.on("node_tree_render_end", () => {
      this.markLinkNodes();
      this.scheduleNodeBar();
      this.scheduleStatus();
    });
    mm.on("node_active", () => {
      this.refreshToolbarState();
      this.renderStatus();
      this.scheduleNodeBar();
    });
    mm.on("afterExecCommand", () => this.scheduleStatus());
    mm.on("before_show_text_edit", () => {
      this.editing = true;
      this.closePopover();
      this.hideNodeBar();
      this.renderStatus();
    });
    mm.on("hide_text_edit", () => {
      this.editing = false;
      this.renderStatus();
      this.scheduleNodeBar();
    });
    mm.on("node_dragging", () => {
      if (!this.dragging) {
        this.dragging = true;
        this.hideNodeBar();
      }
    });
    mm.on("node_dragend", () => {
      this.dragging = false;
      this.scheduleNodeBar();
    });
    mm.on("node_contextmenu", (e: MouseEvent, node: any) => {
      e.preventDefault();
      if (!node.getData("isActive")) {
        mm.execCommand("CLEAR_ACTIVE_NODE");
        node.active();
      }
      this.showNodeMenu(e);
    });
    mm.on("contextmenu", (e: MouseEvent) => {
      if (mm.renderer.activeNodeList.length === 0) {
        e.preventDefault();
        this.showCanvasMenu(e);
      }
    });
    mm.on("node_click", (node: any, e: MouseEvent) => {
      // Ctrl/Cmd + 点击：打开节点里引用的笔记（和 Obsidian 编辑器一致）
      if (e && (e.ctrlKey || e.metaKey)) this.openNodeLinks(node, e, true);
    });

    // 额外快捷键：Ctrl+B 加粗，Esc 关闭弹层 / 取消选中
    mm.keyCommand.addShortcut("Control+b", () => this.toggleStyle("fontWeight", "bold", "normal"));
    mm.keyCommand.addShortcut("Escape", () => {
      if (this.popEl) return this.closePopover();
      if (!this.editing && this.hasSel()) mm.execCommand("CLEAR_ACTIVE_NODE");
    });
  }

  private onDeleteKey(e: KeyboardEvent) {
    const isDel = e.code === "Backspace" || e.code === "Delete" || e.key === "Backspace" || e.key === "Delete";
    if (!isDel || !this.mm || e.altKey) return;
    // 组字过程中（拼音还没上屏）的退格是删拼音，不能当成删节点
    if (e.isComposing) return;
    if (this.editing || this.mm.renderer.textEdit?.isShowTextEdit?.()) return;
    if (!this.canHandleKey(e) || !this.hasSel()) return;
    // 有弹层 / 选择列表打开时交给它们
    if (this.popEl || this.wiki?.isOpen) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.deleteSelection(e.shiftKey);
  }

  /**
   * 删除选中的节点（键盘、工具栏、快捷条、右键菜单统一走这里）。
   * 中心主题不能删：库里选中根节点再删除，会把整张导图的子节点全部清空，一次误触代价太大。
   * onlyCurrent：只删当前节点，保留它的子节点。
   */
  private deleteSelection(onlyCurrent = false) {
    if (!this.mm || !this.hasSel()) return;
    const rootSelected = this.sel().filter((n) => n.isRoot);
    if (rootSelected.length) {
      if (this.sel().length === rootSelected.length) {
        new Notice("中心主题不能删除");
        return;
      }
      rootSelected.forEach((n) => this.mm.renderer.removeNodeFromActiveList(n));
    }
    this.mm.execCommand(onlyCurrent ? "REMOVE_CURRENT_NODE" : "REMOVE_NODE");
  }

  private canHandleKey(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.(".modal-container, .menu, .suggestion-container, .prompt, .cm-popover")) return false;
    const editing = !!t?.closest?.(".smm-node-edit-wrap");
    if (
      !editing &&
      (t?.instanceOf?.(HTMLInputElement) || t?.instanceOf?.(HTMLTextAreaElement) || (t && t.isContentEditable))
    )
      return false;
    if (editing) return true;
    return this.app.workspace.getActiveViewOfType(CloudMindView) === this || this.mouseIn;
  }

  /* ---------- 双链：引用 / 高亮 / 打开 ---------- */

  private linksOf(node: any): WikiLink[] {
    return extractLinks(node?.getData?.("text"));
  }

  /** 给含 [[链接]] 的节点打上样式类，让它看起来像链接 */
  private markLinkNodes() {
    const root = this.mm?.renderer?.root;
    if (!root) return;
    const walk = (n: any) => {
      const g = n.group;
      if (g?.addClass) {
        const has = extractLinks(n.getData?.("text")).length > 0;
        if (has) g.addClass("cm-wikilink");
        else g.removeClass("cm-wikilink");
      }
      (n.children ?? []).forEach(walk);
    };
    walk(root);
  }

  private openLink(l: WikiLink, newTab: boolean) {
    if (!this.file) return;
    void this.app.workspace.openLinkText(l.linktext, this.file.path, newTab ? "tab" : false);
  }

  /** 打开节点里引用的笔记；有多个链接时弹出菜单让你选 */
  private openNodeLinks(node: any, ev?: MouseEvent | null, newTab = false) {
    const links = this.linksOf(node);
    if (links.length === 0) return void new Notice("这个节点里没有 [[双链]]，可以点工具栏的“引用”添加");
    if (links.length === 1) return this.openLink(links[0], newTab);
    const menu = new Menu();
    links.forEach((l) =>
      menu.addItem((i) =>
        i.setTitle(l.alias || l.linktext).setIcon("file-text").onClick(() => this.openLink(l, newTab))
      )
    );
    if (ev) menu.showAtMouseEvent(ev);
    else {
      const r = this.canvasEl.getBoundingClientRect();
      menu.showAtPosition({ x: r.left + 40, y: r.top + 40 });
    }
  }

  /** 工具栏“引用”：进入编辑并输入 [[，弹出笔记搜索 */
  private startWikiLink() {
    if (!this.mm) return;
    if (!this.hasSel()) return void new Notice("请先选中一个节点，再引用笔记");
    const doc = this.contentEl.ownerDocument;
    const win = doc.defaultView ?? window;
    const begin = () => {
      const el = doc.querySelector<HTMLElement>(".smm-node-edit-wrap");
      if (!el) return;
      el.focus();
      // 光标放到文字末尾、插入 [[（不覆盖原有文字），再通知编辑框内容变了：触发笔记搜索、重新测量节点大小
      const tail = doc.createTextNode("[[");
      el.appendChild(tail);
      const range = doc.createRange();
      range.setStart(tail, tail.data.length);
      range.collapse(true);
      const s = win.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "[[" }));
    };
    if (this.mm.renderer.textEdit.isShowTextEdit()) return begin();
    // 必须等这次点击在 body 上冒泡完再打开编辑框，否则导图会把这次点击当成“点了编辑框外面”，
    // 刚打开就被关掉
    window.setTimeout(() => {
      if (!this.mm || !this.hasSel()) return;
      this.mm.renderer.textEdit.show({ node: this.sel()[0] });
      window.setTimeout(begin, 60);
    }, 0);
  }

  /* ---------- 设置：工具栏位置 / 状态栏 ---------- */

  /** 设置变化后由插件调用；只改界面，不动导图数据 */
  applySettings() {
    if (!this.mainEl) return;
    const s = this.plugin.settings;
    const pos: ToolbarPos = s.toolbarPos;
    const vertical = pos === "left" || pos === "right";

    this.mainEl.dataset.dock = pos;
    this.toolbarEl.dataset.orient = vertical ? "v" : "h";
    this.toolbarEl.classList.toggle("is-float", pos === "float");
    this.toolbarEl.classList.toggle("is-hidden", pos === "hidden");
    this.toolbarEl.classList.toggle("is-compact", s.toolbarSize === "compact");
    this.toolbarEl.classList.toggle("has-labels", s.toolbarLabels);
    this.gripEl.toggleClass("cm-hidden", pos !== "float");
    this.fabEl.toggleClass("cm-hidden", pos !== "hidden");
    this.statusEl.toggleClass("cm-hidden", !s.showStatus);

    // 悬浮时工具栏放进画布区域，其它情况放在画布旁边
    const host = pos === "float" ? this.stageEl : this.mainEl;
    if (this.toolbarEl.parentElement !== host) host.appendChild(this.toolbarEl);

    const tip = pos === "left" ? "right" : pos === "right" ? "left" : pos === "bottom" ? "top" : "bottom";
    this.tbBtns.forEach(({ el }) => el.setAttribute("data-tooltip-position", tip));

    if (pos === "float") {
      // 同步放置，不要先清掉位置再等下一帧：否则每次改设置工具栏都会闪一下跳到左上角
      this.placeFloat();
    } else {
      this.toolbarEl.setCssStyles({ left: "", top: "" });
    }
    this.scheduleNodeBar();
  }

  private floatXY: { x: number; y: number } | null = null;

  private placeFloat() {
    if (this.plugin.settings.toolbarPos !== "float") return;
    const sw = this.stageEl.clientWidth;
    const tw = this.toolbarEl.offsetWidth;
    const saved = this.plugin.settings.floatPos;
    const xy = this.floatXY ?? saved ?? { x: Math.round((sw - tw) / 2), y: 12 };
    this.setFloatXY(xy.x, xy.y);
  }

  private setFloatXY(x: number, y: number) {
    const sw = this.stageEl.clientWidth;
    const sh = this.stageEl.clientHeight;
    const tw = this.toolbarEl.offsetWidth;
    const th = this.toolbarEl.offsetHeight;
    const cx = clamp(x, 4, Math.max(4, sw - tw - 4));
    const cy = clamp(y, 4, Math.max(4, sh - th - 4));
    this.floatXY = { x: cx, y: cy };
    this.toolbarEl.setCssStyles({ left: cx + "px", top: cy + "px" });
  }

  private clampFloat() {
    if (this.plugin.settings.toolbarPos !== "float" || !this.floatXY) return;
    this.setFloatXY(this.floatXY.x, this.floatXY.y);
  }

  private lastGripDown = { t: 0, x: 0, y: 0 };

  private resetFloat() {
    this.floatXY = null;
    void this.plugin.updateSettings({ floatPos: null });
  }

  private bindGrip(grip: HTMLElement) {
    grip.addEventListener("pointerdown", (e: PointerEvent) => {
      if (this.plugin.settings.toolbarPos !== "float") return;
      e.preventDefault();
      // 双击抓手：回到默认位置（顶部居中）。pointerdown 被拦截后浏览器不保证触发 dblclick，所以自己判断
      const now = performance.now();
      const last = this.lastGripDown;
      if (now - last.t < 400 && Math.abs(e.clientX - last.x) < 6 && Math.abs(e.clientY - last.y) < 6) {
        this.lastGripDown = { t: 0, x: 0, y: 0 };
        return this.resetFloat();
      }
      this.lastGripDown = { t: now, x: e.clientX, y: e.clientY };
      const stage = this.stageEl.getBoundingClientRect();
      const tb = this.toolbarEl.getBoundingClientRect();
      const dx = e.clientX - tb.left;
      const dy = e.clientY - tb.top;
      grip.setPointerCapture(e.pointerId);
      this.toolbarEl.classList.add("is-dragging");
      const move = (ev: PointerEvent) => this.setFloatXY(ev.clientX - stage.left - dx, ev.clientY - stage.top - dy);
      const up = (ev: PointerEvent) => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        try {
          grip.releasePointerCapture(ev.pointerId);
        } catch {
          /* 已释放 */
        }
        this.toolbarEl.classList.remove("is-dragging");
        if (this.floatXY) void this.plugin.updateSettings({ floatPos: { ...this.floatXY } });
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
  }

  /* ---------- 工具栏 ---------- */

  private hasSel() {
    return (this.mm?.renderer.activeNodeList.length ?? 0) > 0;
  }
  private sel(): any[] {
    return this.mm?.renderer.activeNodeList ?? [];
  }
  private cmdNeedSel(name: string, ...args: any[]) {
    if (!this.mm) return;
    if (!this.hasSel()) {
      const root = this.mm.renderer.root;
      if (!root) return;
      root.active();
    }
    this.mm.execCommand(name, ...args);
  }

  private buildSpecs() {
    const S = (s: BtnSpec) => (this.specs[s.id] = s);
    const mm = () => this.mm;
    S({ id: "undo", icon: "undo-2", label: "撤销", tip: "撤销 (Ctrl+Z)", run: () => mm()?.execCommand("BACK") });
    S({ id: "redo", icon: "redo-2", label: "重做", tip: "重做 (Ctrl+Y)", run: () => mm()?.execCommand("FORWARD") });

    S({ id: "child", icon: "corner-down-right", label: "子主题", tip: "添加子主题 (Tab)", run: () => this.cmdNeedSel("INSERT_CHILD_NODE") });
    S({ id: "sibling", icon: "arrow-down", label: "同级", tip: "添加同级主题 (Enter)", need: true, run: () => this.cmdNeedSel("INSERT_NODE") });
    S({ id: "parent", icon: "arrow-up-from-line", label: "父主题", tip: "在上方插入父主题 (Shift+Tab)", need: true, run: () => this.cmdNeedSel("INSERT_PARENT_NODE") });
    S({ id: "summary", icon: "brackets", label: "概要", tip: "为选中节点添加概要 (Ctrl+G)", need: true, run: () => this.cmdNeedSel("ADD_GENERALIZATION") });
    S({ id: "frame", icon: "square-dashed", label: "外框", tip: "给选中节点加外框", need: true, run: () => this.cmdNeedSel("ADD_OUTER_FRAME", [], {}) });
    S({
      id: "relation",
      icon: "spline",
      label: "关联线",
      tip: "从选中节点画关联线，再点目标节点",
      need: true,
      run: () => {
        if (!this.hasSel()) return void new Notice("请先选中一个节点");
        this.mm.associativeLine.createLineFromActiveNode();
      },
    });

    S({ id: "note", icon: "sticky-note", label: "备注", tip: "编辑备注", need: true, run: () => void this.editNote() });
    S({ id: "link", icon: "link", label: "链接", tip: "添加超链接", need: true, run: () => void this.editLink() });
    S({
      id: "wikilink",
      icon: "file-symlink",
      label: "引用",
      tip: "引用笔记：在节点里插入 [[双链]]（编辑文字时输入 [[ 也可以）",
      need: true,
      run: () => this.startWikiLink(),
    });
    S({
      id: "openlink",
      icon: "external-link",
      label: "打开",
      tip: "打开节点里引用的笔记 (Ctrl+点击节点)",
      need: true,
      run: (ev) => this.openNodeLinks(this.sel()[0], ev, false),
    });
    S({ id: "tag", icon: "tag", label: "标签", tip: "添加标签", need: true, run: () => void this.editTags() });
    S({ id: "icon", icon: "smile-plus", label: "图标", tip: "添加图标", need: true, run: (_e, el) => this.openIconPopover(el) });

    S({
      id: "fill",
      icon: "paint-bucket",
      label: "填充",
      tip: "节点填充颜色",
      need: true,
      swatch: "fill",
      run: (_e, el) => this.openColorPopover(el, "填充颜色", FILL_COLORS, "fillColor"),
    });
    S({
      id: "textColor",
      icon: "baseline",
      label: "文字色",
      tip: "文字颜色",
      need: true,
      swatch: "text",
      run: (_e, el) => this.openColorPopover(el, "文字颜色", TEXT_COLORS, "color"),
    });
    S({ id: "bold", icon: "bold", label: "加粗", tip: "加粗 (Ctrl+B)", need: true, run: () => this.toggleStyle("fontWeight", "bold", "normal") });
    S({ id: "italic", icon: "italic", label: "斜体", tip: "斜体", need: true, run: () => this.toggleStyle("fontStyle", "italic", "normal") });
    S({ id: "shape", icon: "shapes", label: "形状", tip: "节点形状", need: true, run: (ev) => this.showShapeMenu(ev) });

    S({ id: "layout", icon: "layout-template", label: "结构", tip: "切换导图结构", run: (ev) => this.showLayoutMenu(ev) });
    S({ id: "theme", icon: "palette", label: "主题", tip: "切换主题（含方块风格）", run: (_e, el) => this.openThemePopover(el) });
    S({
      id: "rainbow",
      icon: "rainbow",
      label: "彩虹",
      tip: "彩虹分支开关",
      run: () => {
        this.fmRainbow = !this.curRainbow();
        this.applyRainbow(true);
        this.markDirty();
        this.refreshToolbarState();
      },
    });
    S({ id: "fold", icon: "chevrons-down-up", label: "折叠", tip: "折叠 / 展开层级 (选中节点按 / )", run: (ev) => this.showExpandMenu(ev) });
    S({ id: "export", icon: "download", label: "导出", tip: "导出图片 / .xmind", run: (ev) => this.showExportMenu(ev) });
    S({ id: "more", icon: "more-horizontal", label: "设置", tip: "工具栏位置与显示设置", run: (ev) => this.showToolbarMenu(ev) });
    S({ id: "delete", icon: "trash-2", label: "删除", tip: "删除选中节点 (Del)", need: true, run: () => this.deleteSelection() });
  }

  private makeBtn(spec: BtnSpec, parent: HTMLElement, withLabel: boolean): HTMLButtonElement {
    const b = parent.createEl("button", { cls: "cm-btn", attr: { "aria-label": spec.tip, "data-id": spec.id } });
    const ico = b.createSpan({ cls: "cm-ico" });
    setIcon(ico, spec.icon);
    if (spec.swatch) b.createSpan({ cls: "cm-swatchbar" });
    if (withLabel) b.createSpan({ cls: "cm-lbl", text: spec.label });
    b.addEventListener("click", (ev) => {
      if (b.disabled) return;
      spec.run(ev, b);
    });
    return b;
  }

  private buildToolbar() {
    const bar = (this.toolbarEl = createDiv({ cls: "cm-toolbar" }));
    this.gripEl = bar.createDiv({ cls: "cm-grip", attr: { "aria-label": "拖动移动工具栏（双击复位）" } });
    setIcon(this.gripEl, "grip-vertical");
    this.bindGrip(this.gripEl);

    TOOLBAR_GROUPS.forEach((group, gi) => {
      if (gi > 0) bar.createDiv({ cls: "cm-sep" });
      const g = bar.createDiv({ cls: "cm-group" });
      group.forEach((id) => {
        const spec = this.specs[id];
        this.tbBtns.set(id, { el: this.makeBtn(spec, g, true), spec });
      });
    });
    const u = this.tbBtns.get("undo")!.el;
    const r = this.tbBtns.get("redo")!.el;
    u.disabled = true;
    r.disabled = true;
    this.refreshToolbarState();
  }

  private buildNodebar() {
    NODEBAR_ITEMS.forEach((id) => {
      if (id === "|") return void this.nodebarEl.createDiv({ cls: "cm-sep" });
      const spec = this.specs[id];
      this.nbBtns.set(id, { el: this.makeBtn(spec, this.nodebarEl, false), spec });
    });
  }

  private buildFab() {
    const b = this.fabEl.createEl("button", { cls: "cm-fab-btn", attr: { "aria-label": "显示 CloudMind 工具栏" } });
    setIcon(b, "panel-top-open");
    b.createSpan({ text: "显示工具栏" });
    b.addEventListener("click", () => void this.plugin.updateSettings({ toolbarPos: this.plugin.settings.lastDock }));
  }

  private buildZoomBar() {
    const z = this.stageEl.createDiv({ cls: "cm-zoom" });
    const mk = (icon: string, tip: string, fn: () => void) => {
      const b = z.createEl("button", { cls: "cm-btn", attr: { "aria-label": tip } });
      setIcon(b, icon);
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", fn);
      return b;
    };
    mk("minus", "缩小 (Ctrl+-)", () => this.mm?.view.narrow());
    const lab = z.createSpan({ cls: "cm-zoom-label", text: "100%", attr: { "aria-label": "点击恢复 100%" } });
    lab.addEventListener("click", () => this.mm?.view.reset());
    this.st.zoom = lab;
    mk("plus", "放大 (Ctrl+=)", () => this.mm?.view.enlarge());
    mk("maximize", "适应画布 (Ctrl+I)", () => this.mm?.view.fit());
    mk("locate-fixed", "回到中心主题", () => this.mm?.renderer.setRootNodeCenter());
  }

  /** 选中状态变化后，刷新按钮可用 / 高亮状态 */
  private refreshToolbarState() {
    const has = this.hasSel();
    const n = this.sel()[0];
    const apply = (m: Map<string, { el: HTMLButtonElement; spec: BtnSpec }>) => {
      m.forEach(({ el, spec }, id) => {
        if (spec.need) el.disabled = !has;
        // “打开”按钮只在选中的节点里确实有 [[双链]] 时才出现
        if (id === "openlink") el.toggleClass("cm-hidden", !(n && this.linksOf(n).length));
        if (id === "bold") el.classList.toggle("is-active", !!n && n.getStyle?.("fontWeight") === "bold");
        if (id === "italic") el.classList.toggle("is-active", !!n && n.getStyle?.("fontStyle") === "italic");
        if (id === "rainbow") el.classList.toggle("is-active", this.curRainbow());
        if (spec.swatch && n) {
          const raw = n.getStyle?.(spec.swatch === "fill" ? "fillColor" : "color");
          const c = !raw || raw === "transparent" || raw === "none" ? "" : String(raw);
          el.setCssProps({ "--cm-swatch": c || "transparent" });
        } else if (spec.swatch) {
          el.setCssProps({ "--cm-swatch": "transparent" });
        }
      });
    };
    apply(this.tbBtns);
    apply(this.nbBtns);
  }

  /* ---------- 节点快捷条 ---------- */

  private hideNodeBar() {
    this.nodebarEl.classList.remove("is-show");
  }

  private scheduleNodeBar() {
    if (this.nbRaf) return;
    this.nbRaf = window.requestAnimationFrame(() => {
      this.nbRaf = 0;
      this.updateNodeBar();
    });
  }

  private updateNodeBar() {
    const bar = this.nodebarEl;
    const list = this.sel();
    if (!this.mm || !this.plugin.settings.showNodeBar || this.editing || this.dragging || list.length !== 1) {
      return this.hideNodeBar();
    }
    const node = list[0];
    let r: { left: number; top: number; width: number; height: number };
    try {
      r = node.getRectInSvg();
    } catch {
      return this.hideNodeBar();
    }
    const cw = this.canvasEl.clientWidth;
    const ch = this.canvasEl.clientHeight;
    // 节点滚出画布就隐藏，避免快捷条悬在空白处
    if (r.left + r.width < 0 || r.top + r.height < 0 || r.left > cw || r.top > ch) return this.hideNodeBar();

    bar.classList.add("is-show");
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    const gap = 10;
    const margin = 6;
    const fit = (x: number, y: number) => ({
      x: clamp(x, margin, Math.max(margin, cw - bw - margin)),
      y: clamp(y, margin, Math.max(margin, ch - bh - margin)),
    });
    const cx = r.left + r.width / 2 - bw / 2;
    // 候选位置，按偏好排序：上方居中 → 下方居中 → 上方左对齐 → 上方右对齐 → 下方左 / 右对齐
    const cands = [
      fit(cx, r.top - bh - gap),
      fit(cx, r.top + r.height + gap),
      fit(r.left, r.top - bh - gap),
      fit(r.left + r.width - bw, r.top - bh - gap),
      fit(r.left, r.top + r.height + gap),
      fit(r.left + r.width - bw, r.top + r.height + gap),
    ];
    // 其它节点的位置：快捷条尽量不要盖住它们（节点很多时跳过，直接放上方）
    const others = this.otherNodeRects(node, 500);
    let bestIdx = 0;
    if (others) {
      const nodeCenterY = r.top + r.height / 2;
      const scoreOf = (c: { x: number; y: number }) => {
        let overlap = 0;
        for (const o of others) {
          const w = Math.min(c.x + bw, o.left + o.width) - Math.max(c.x, o.left);
          const h = Math.min(c.y + bh, o.top + o.height) - Math.max(c.y, o.top);
          if (w > 0 && h > 0) overlap += w * h;
        }
        // 被夹回画布边缘、离节点太远的候选略微扣分
        const far = Math.abs(c.y + bh / 2 - nodeCenterY) > r.height / 2 + bh + gap * 3 ? 50 : 0;
        return overlap + far;
      };
      const scores = cands.map(scoreOf);
      let bestScore = Infinity;
      scores.forEach((s, i) => {
        if (s < bestScore - 1) {
          bestScore = s;
          bestIdx = i;
        }
      });
      // 粘滞：平移时两个位置得分接近就保持上一次的，避免快捷条在上下之间来回跳
      const same = this.nbNode === node;
      if (same && this.nbIdx !== bestIdx && scores[this.nbIdx] <= bestScore + 400) bestIdx = this.nbIdx;
    }
    this.nbNode = node;
    this.nbIdx = bestIdx;
    const best = cands[bestIdx];
    bar.setCssStyles({ transform: `translate(${Math.round(best.x)}px, ${Math.round(best.y)}px)` });
  }

  /** 快捷条上一次放在哪个候选位置（用于平移时保持稳定） */
  private nbNode: any = null;
  private nbIdx = 0;

  /** 画布里除选中节点外所有节点的矩形（画布坐标）；节点超过 limit 个时返回 null */
  private otherNodeRects(self: any, limit: number): { left: number; top: number; width: number; height: number }[] | null {
    const root = this.mm?.renderer?.root;
    if (!root) return null;
    const out: { left: number; top: number; width: number; height: number }[] = [];
    let count = 0;
    const walk = (n: any): boolean => {
      if (++count > limit) return false;
      if (n !== self) {
        try {
          out.push(n.getRectInSvg());
        } catch {
          /* 节点还没渲染好 */
        }
      }
      for (const c of n.children ?? []) if (!walk(c)) return false;
      return true;
    };
    return walk(root) ? out : null;
  }

  /* ---------- 状态栏 ---------- */

  private buildStatus() {
    const bar = this.statusEl;
    const seg = (key: string, cls = "", tip = "", fn?: () => void) => {
      const el = bar.createSpan({ cls: "cm-seg " + cls });
      if (tip) el.setAttribute("aria-label", tip);
      if (fn) {
        el.classList.add("is-click");
        el.addEventListener("click", fn);
      }
      this.st[key] = el;
      return el;
    };
    seg("save", "cm-seg-save", "点击立即保存", () => void this.save());
    seg("nodes", "", "节点总数");
    seg("sel", "cm-seg-sel", "当前选中");
    seg("hint", "cm-seg-hint");
    seg("layout", "", "点击切换结构", () => this.showLayoutMenuAt(this.st.layout));
    seg("theme", "", "点击切换主题", () => this.openThemePopover(this.st.theme));
    // 缩放标签放在右下角缩放条里，状态栏也同步显示
    seg("zoomText", "", "缩放比例（点击恢复 100%）", () => this.mm?.view.reset());
  }

  private setSaveState(s: "clean" | "dirty" | "saving" | "saved") {
    this.saveState = s;
    this.renderStatus();
  }

  private scheduleStatus() {
    if (this.stRaf) return;
    this.stRaf = window.requestAnimationFrame(() => {
      this.stRaf = 0;
      this.nodeCount = countNodes(this.mm?.renderer?.renderTree);
      const root = this.mm?.renderer?.renderTree;
      this.emptyEl.classList.toggle("is-show", !!root && (root.children ?? []).length === 0);
      this.refreshToolbarState();
      this.renderStatus();
    });
  }

  /** 导图建好或重新载入后，整体刷新一遍界面状态 */
  private refreshAll() {
    this.refreshToolbarState();
    this.scheduleStatus();
    this.scheduleNodeBar();
  }

  private hintText(): string {
    if (this.editing) return "输入文字 · Enter 完成 · Shift+Enter 换行";
    const n = this.sel().length;
    if (n === 0) return "点击选中节点 · 双击编辑 · 滚轮平移 · Ctrl+滚轮缩放 · 右键更多";
    if (n > 1) return "Del 删除 · Ctrl+C/X/V 复制剪切粘贴 · 拖动整体移动 · Esc 取消选择";
    const links = this.linksOf(this.sel()[0]);
    if (links.length) return `Ctrl+点击 打开「${links[0].alias || links[0].target}」${links.length > 1 ? ` 等 ${links.length} 篇` : ""} · F2 编辑 · Tab 子主题`;
    return "Tab 子主题 · Enter 同级 · F2 编辑 · / 折叠 · Ctrl+G 概要 · Del 删除";
  }

  private selText(): string {
    const list = this.sel();
    if (list.length === 0) return "未选中";
    if (list.length > 1) return `已选 ${list.length} 个节点`;
    const node = list[0];
    let t = String(node.getData?.("text") ?? "").replace(/\s+/g, " ").trim();
    if (t.length > 14) t = t.slice(0, 14) + "…";
    const kids = (node.nodeData?.children ?? []).length;
    const level = node.isRoot ? "中心主题" : `第 ${node.layerIndex + 1} 层`;
    return `「${t || "空"}」${level}${kids ? ` · ${kids} 个子主题` : ""}`;
  }

  private renderStatus() {
    if (!this.st.save) return;
    const save = this.st.save;
    save.className = "cm-seg cm-seg-save is-click is-" + this.saveState;
    save.setText(
      {
        clean: "✓ 无改动",
        dirty: "● 未保存",
        saving: "↻ 保存中…",
        saved: `✓ 已保存 ${this.savedAt}`,
      }[this.saveState]
    );
    this.st.nodes.setText(`${this.nodeCount} 个节点`);
    this.st.sel.setText(this.selText());
    this.st.hint.setText(this.hintText());
    this.st.layout.setText("结构：" + (LAYOUTS.find((l) => l.id === this.curLayout())?.name ?? ""));
    this.st.theme.setText("主题：" + themeDef(this.curThemeId()).name);
    const z = Math.round((this.mm?.view?.scale ?? 1) * 100) + "%";
    this.st.zoomText.setText(z);
    if (this.st.zoom) this.st.zoom.setText(z);
  }

  /* ---------- 弹层 ---------- */

  closePopover() {
    this.popOff?.();
    this.popOff = null;
    this.popEl?.remove();
    this.popEl = null;
    this.popAnchor = null;
  }

  private openPopover(anchor: HTMLElement, cls: string, build: (el: HTMLElement) => void) {
    if (this.popAnchor === anchor) return this.closePopover(); // 再点一次收起
    this.closePopover();
    const doc = this.contentEl.ownerDocument;
    const el = doc.body.createDiv({ cls: "cm-popover " + cls });
    el.addClass("cm-measuring");
    build(el);
    el.addEventListener("mousedown", (e) => {
      if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
    });
    const r = anchor.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const side = anchor.closest(".cm-toolbar")?.getAttribute("data-orient") === "v";
    let x = side ? r.right + 8 : r.left;
    let y = side ? r.top : r.bottom + 8;
    if (!side && y + ph > vh - 8) y = r.top - ph - 8; // 下方放不下就放上方
    if (side && x + pw > vw - 8) x = r.left - pw - 8;
    el.setCssStyles({
      left: clamp(x, 8, Math.max(8, vw - pw - 8)) + "px",
      top: clamp(y, 8, Math.max(8, vh - ph - 8)) + "px",
    });
    el.removeClass("cm-measuring");
    this.popEl = el;
    this.popAnchor = anchor;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!el.contains(t) && !anchor.contains(t)) this.closePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.closePopover();
      }
    };
    doc.addEventListener("mousedown", onDown, true);
    doc.addEventListener("keydown", onKey, true);
    this.popOff = () => {
      doc.removeEventListener("mousedown", onDown, true);
      doc.removeEventListener("keydown", onKey, true);
    };
  }

  private openColorPopover(anchor: HTMLElement, title: string, colors: string[], prop: string) {
    this.openPopover(anchor, "cm-pop-color", (el) => {
      el.createDiv({ cls: "cm-pop-title", text: title });
      const grid = el.createDiv({ cls: "cm-swatches" });
      const pick = (c: string | undefined) => {
        this.setStyle(prop, c);
        this.closePopover();
      };
      colors.forEach((c) => {
        const b = grid.createEl("button", { cls: "cm-swatch", attr: { "aria-label": c, "data-color": c } });
        b.setCssStyles({ background: c });
        b.addEventListener("click", () => pick(c));
      });
      const row = el.createDiv({ cls: "cm-pop-row" });
      const custom = row.createEl("label", { cls: "cm-pop-custom" });
      custom.createSpan({ text: "自定义" });
      const input = custom.createEl("input", { attr: { type: "color" } });
      input.value = "#5b8ff9";
      input.addEventListener("change", () => pick(input.value));
      const reset = row.createEl("button", { cls: "cm-pop-reset", text: "恢复默认" });
      reset.addEventListener("click", () => pick(undefined));
    });
  }

  /* ---------- 命令封装 ---------- */

  private setStyle(prop: string, value: any) {
    this.sel().forEach((n) => this.mm.execCommand("SET_NODE_STYLE", n, prop, value));
    this.refreshToolbarState();
  }

  /** 加粗 / 斜体：以第一个选中节点的状态为准，整体切换 */
  private toggleStyle(prop: string, on: string, off: string) {
    if (!this.hasSel()) return void new Notice("请先选中一个节点");
    const cur = this.sel()[0]?.getStyle?.(prop);
    this.setStyle(prop, cur === on ? off : on);
  }

  private async editNote() {
    if (!this.hasSel()) return void new Notice("请先选中一个节点");
    const node = this.sel()[0];
    const r = await promptModal(this.app, "节点备注", [
      { label: "备注（支持 Markdown，保存在节点下方）", value: node.getData("note") ?? "", multiline: true },
    ]);
    if (r) this.mm.execCommand("SET_NODE_NOTE", node, r[0].replace(/\s+$/, ""));
  }

  private async editLink() {
    if (!this.hasSel()) return void new Notice("请先选中一个节点");
    const node = this.sel()[0];
    const r = await promptModal(this.app, "超链接", [
      { label: "链接地址（留空删除）", value: node.getData("hyperlink") ?? "", placeholder: "https://" },
      { label: "链接标题（可选）", value: node.getData("hyperlinkTitle") ?? "" },
    ]);
    if (r) this.mm.execCommand("SET_NODE_HYPERLINK", node, r[0].trim(), r[1].trim());
  }

  private async editTags() {
    if (!this.hasSel()) return void new Notice("请先选中一个节点");
    const node = this.sel()[0];
    const cur: string[] = node.getData("tag") ?? [];
    const r = await promptModal(this.app, "标签", [{ label: "多个标签用逗号分隔（留空清除）", value: cur.join(", ") }]);
    if (r) {
      const tags = r[0]
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      this.mm.execCommand("SET_NODE_TAG", node, tags);
    }
  }

  /* ---------- 菜单 ---------- */

  private sub(item: any, build: (m: Menu) => void, fallbackMenu: Menu) {
    if (typeof item.setSubmenu === "function") {
      const m: Menu = item.setSubmenu();
      build(m);
    } else {
      fallbackMenu.addSeparator();
      build(fallbackMenu);
    }
  }

  private colorTitle(color: string, label: string): DocumentFragment {
    const f = createFragment();
    const dot = createSpan();
    dot.className = "cm-dot";
    dot.setCssStyles({ background: color });
    f.appendChild(dot);
    f.appendText(label);
    return f;
  }

  private colorItems(m: Menu, prop: string, colors: string[]) {
    colors.forEach((c) => m.addItem((i) => i.setTitle(this.colorTitle(c, c)).onClick(() => this.setStyle(prop, c))));
    m.addItem((i) => i.setTitle("默认").onClick(() => this.setStyle(prop, undefined)));
  }

  private showShapeMenu(ev: MouseEvent) {
    if (!this.hasSel()) return void new Notice("请先选中一个节点");
    const menu = new Menu();
    SHAPES.forEach(([v, n]) => menu.addItem((x) => x.setTitle(n).onClick(() => this.setStyle("shape", v))));
    menu.showAtMouseEvent(ev);
  }

  private showNodeMenu(e: MouseEvent) {
    const menu = new Menu();
    const mm = this.mm;
    const exec = (n: string, ...a: any[]) => () => mm.execCommand(n, ...a);
    menu.addItem((i) => i.setTitle("子主题    Tab").setIcon("corner-down-right").onClick(exec("INSERT_CHILD_NODE")));
    menu.addItem((i) => i.setTitle("同级主题    Enter").setIcon("arrow-down").onClick(exec("INSERT_NODE")));
    menu.addItem((i) => i.setTitle("父主题    Shift+Tab").setIcon("arrow-up-from-line").onClick(exec("INSERT_PARENT_NODE")));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("概要    Ctrl+G").setIcon("brackets").onClick(exec("ADD_GENERALIZATION")));
    menu.addItem((i) => i.setTitle("外框").setIcon("square-dashed").onClick(exec("ADD_OUTER_FRAME", [], {})));
    menu.addItem((i) =>
      i.setTitle("关联线").setIcon("spline").onClick(() => mm.associativeLine.createLineFromActiveNode())
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("备注…").setIcon("sticky-note").onClick(() => this.editNote()));
    menu.addItem((i) => i.setTitle("引用笔记 [[ ]]…").setIcon("file-symlink").onClick(() => this.startWikiLink()));
    if (this.linksOf(this.sel()[0]).length) {
      menu.addItem((i) =>
        i.setTitle("打开引用的笔记    Ctrl+点击").setIcon("external-link").onClick(() => this.openNodeLinks(this.sel()[0], e, false))
      );
    }
    menu.addItem((i) => i.setTitle("超链接…").setIcon("link").onClick(() => this.editLink()));
    menu.addItem((i) => i.setTitle("标签…").setIcon("tag").onClick(() => this.editTags()));
    menu.addItem((i) => i.setTitle("图标…").setIcon("smile-plus").onClick(() => this.openIconPopover(this.nodeAnchor())));
    menu.addSeparator();
    menu.addItem((i) => {
      i.setTitle("填充颜色").setIcon("paint-bucket");
      this.sub(i, (m) => this.colorItems(m, "fillColor", FILL_COLORS), menu);
    });
    menu.addItem((i) => {
      i.setTitle("文字颜色").setIcon("baseline");
      this.sub(i, (m) => this.colorItems(m, "color", TEXT_COLORS), menu);
    });
    menu.addItem((i) => {
      i.setTitle("边框颜色").setIcon("square");
      this.sub(i, (m) => this.colorItems(m, "borderColor", FILL_COLORS), menu);
    });
    menu.addItem((i) => {
      i.setTitle("形状").setIcon("shapes");
      this.sub(
        i,
        (m) => SHAPES.forEach(([v, n]) => m.addItem((x) => x.setTitle(n).onClick(() => this.setStyle("shape", v)))),
        menu
      );
    });
    menu.addItem((i) => i.setTitle("加粗 / 取消    Ctrl+B").setIcon("bold").onClick(() => this.toggleStyle("fontWeight", "bold", "normal")));
    menu.addItem((i) => i.setTitle("斜体 / 取消").setIcon("italic").onClick(() => this.toggleStyle("fontStyle", "italic", "normal")));
    menu.addItem((i) => i.setTitle("清除自定义样式").setIcon("eraser").onClick(exec("REMOVE_CUSTOM_STYLES")));
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("折叠 / 展开    /").setIcon("chevrons-down-up").onClick(() => mm.renderer.toggleActiveExpand())
    );
    menu.addItem((i) => i.setTitle("上移    Ctrl+↑").setIcon("arrow-up").onClick(exec("UP_NODE")));
    menu.addItem((i) => i.setTitle("下移    Ctrl+↓").setIcon("arrow-down").onClick(exec("DOWN_NODE")));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("复制    Ctrl+C").setIcon("copy").onClick(() => mm.renderer.copy()));
    menu.addItem((i) => i.setTitle("剪切    Ctrl+X").setIcon("scissors").onClick(() => mm.renderer.cut()));
    menu.addItem((i) => i.setTitle("粘贴    Ctrl+V").setIcon("clipboard-paste").onClick(() => mm.renderer.paste()));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("删除    Del").setIcon("trash-2").onClick(() => this.deleteSelection()));
    menu.addItem((i) => i.setTitle("仅删除当前节点    Shift+Backspace").setIcon("trash").onClick(() => this.deleteSelection(true)));
    menu.showAtMouseEvent(e);
  }

  private showCanvasMenu(e: MouseEvent) {
    const menu = new Menu();
    const mm = this.mm;
    menu.addItem((i) => i.setTitle("全选    Ctrl+A").setIcon("box-select").onClick(() => mm.execCommand("SELECT_ALL")));
    menu.addItem((i) => i.setTitle("展开全部").setIcon("chevrons-up-down").onClick(() => mm.execCommand("EXPAND_ALL")));
    menu.addItem((i) => i.setTitle("折叠全部").setIcon("chevrons-down-up").onClick(() => mm.execCommand("UNEXPAND_ALL")));
    menu.addItem((i) => i.setTitle("整理布局    Ctrl+L").setIcon("align-center").onClick(() => mm.execCommand("RESET_LAYOUT")));
    menu.addItem((i) => i.setTitle("适应画布    Ctrl+I").setIcon("maximize").onClick(() => mm.view.fit()));
    menu.addItem((i) => i.setTitle("回到中心主题").setIcon("locate-fixed").onClick(() => mm.renderer.setRootNodeCenter()));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("工具栏设置…").setIcon("settings-2").onClick(() => this.showToolbarMenu(e)));
    menu.showAtMouseEvent(e);
  }

  private layoutMenu(): Menu {
    const menu = new Menu();
    LAYOUTS.forEach((l) =>
      menu.addItem((i) =>
        i.setTitle(l.name).setChecked(this.curLayout() === l.id).onClick(() => {
          this.fmLayout = l.id;
          this.mm.setLayout(l.id);
          this.markDirty();
          this.renderStatus();
        })
      )
    );
    return menu;
  }
  private showLayoutMenu(ev: MouseEvent) {
    this.layoutMenu().showAtMouseEvent(ev);
  }
  private showLayoutMenuAt(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    this.layoutMenu().showAtPosition({ x: r.left, y: r.top });
  }

  /** 选中某个主题；id 为 null 表示“跟随 Obsidian 明暗” */
  applyTheme(id: string | null) {
    if (!this.mm) return;
    if (id === null) {
      this.fmTheme = null;
      this.fmRainbow = null;
      this.applyConfig();
    } else {
      this.fmTheme = id;
      this.fmRainbow = themeDef(id).rainbow;
      this.mm.setTheme(id);
      this.applyRainbow();
    }
    this.markDirty();
    this.renderStatus();
    this.refreshToolbarState();
  }

  /** 主题面板：带缩略图的卡片，方块系列单独一组 */
  private openThemePopover(anchor: HTMLElement) {
    this.openPopover(anchor, "cm-pop-theme", (el) => {
      const cur = this.fmTheme && THEMES.some((t) => t.id === this.fmTheme) ? this.fmTheme : null;
      const section = (title: string, group: "box" | "classic") => {
        el.createDiv({ cls: "cm-pop-title", text: title });
        const grid = el.createDiv({ cls: "cm-theme-grid" + (group === "box" ? " is-box" : "") });
        THEMES.filter((t) => t.group === group).forEach((t) => {
          const card = grid.createDiv({
            cls: "cm-theme-card" + (this.curThemeId() === t.id ? " is-current" : ""),
            attr: { "data-theme": t.id, "aria-label": t.desc },
          });
          card.appendChild(themePreview(t.id));
          card.createDiv({ cls: "cm-theme-name", text: t.name });
          card.addEventListener("click", () => {
            this.applyTheme(t.id);
            this.closePopover();
          });
        });
      };
      section("方块：每个节点都有方块围住", "box");
      section("其它风格", "classic");
      const foot = el.createDiv({ cls: "cm-pop-row" });
      const auto = foot.createEl("button", {
        cls: "cm-pop-reset" + (cur === null ? " is-current" : ""),
        text: "跟随 Obsidian 明暗",
        attr: { "data-theme": "__auto" },
      });
      auto.addEventListener("click", () => {
        this.applyTheme(null);
        this.closePopover();
      });
      foot.createSpan({ cls: "cm-pop-hint", text: "选择后自动保存到这篇笔记" });
    });
  }

  private showExpandMenu(ev: MouseEvent) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("展开全部").onClick(() => this.mm.execCommand("EXPAND_ALL")));
    [1, 2, 3, 4].forEach((n) =>
      menu.addItem((i) => i.setTitle(`展开到第 ${n} 层`).onClick(() => this.mm.execCommand("UNEXPAND_TO_LEVEL", n)))
    );
    menu.addItem((i) => i.setTitle("折叠全部").onClick(() => this.mm.execCommand("UNEXPAND_ALL")));
    menu.showAtMouseEvent(ev);
  }

  /** 工具栏自己的设置菜单：位置 / 大小 / 文字 / 快捷条 / 状态栏 */
  private showToolbarMenu(ev: MouseEvent) {
    const s = this.plugin.settings;
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("工具栏位置").setIcon("panel-top").setDisabled(true));
    (["top", "bottom", "left", "right", "float", "hidden"] as ToolbarPos[]).forEach((p) =>
      menu.addItem((i) =>
        i.setTitle(POS_LABELS[p]).setChecked(s.toolbarPos === p).onClick(() => {
          const patch: any = { toolbarPos: p };
          if (p !== "hidden") patch.lastDock = p;
          return this.plugin.updateSettings(patch);
        })
      )
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("紧凑图标").setChecked(s.toolbarSize === "compact").onClick(() =>
        this.plugin.updateSettings({ toolbarSize: s.toolbarSize === "compact" ? "normal" : "compact" })
      )
    );
    menu.addItem((i) =>
      i.setTitle("按钮显示文字").setChecked(s.toolbarLabels).onClick(() => this.plugin.updateSettings({ toolbarLabels: !s.toolbarLabels }))
    );
    menu.addItem((i) =>
      i.setTitle("节点快捷条").setChecked(s.showNodeBar).onClick(() => this.plugin.updateSettings({ showNodeBar: !s.showNodeBar }))
    );
    menu.addItem((i) =>
      i.setTitle("底部状态栏").setChecked(s.showStatus).onClick(() => this.plugin.updateSettings({ showStatus: !s.showStatus }))
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("更多设置…").setIcon("settings").onClick(() => this.plugin.openSettings()));
    menu.showAtMouseEvent(ev);
  }

  /** 把库里的 SVG 字符串转成元素（不用 innerHTML） */
  private svgEl(svg: string): Element | null {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg") return null;
    // 库里的图标只有 viewBox、没有尺寸，不写的话在部分布局里会被压成 0×0
    root.setAttribute("width", "22");
    root.setAttribute("height", "22");
    return this.contentEl.ownerDocument.importNode(root, true);
  }

  /** 右键菜单打开弹层时用来定位的锚点：选中节点在屏幕上的位置 */
  private nodeAnchor(): HTMLElement {
    const doc = this.contentEl.ownerDocument;
    const a = doc.body.createDiv({ cls: "cm-anchor" });
    const n = this.sel()[0];
    const c = this.canvasEl.getBoundingClientRect();
    let r = { left: 40, top: 40, width: 1, height: 1 };
    try {
      r = n.getRectInSvg();
    } catch {
      /* 节点还没渲染好：放在画布左上角附近 */
    }
    a.setCssStyles({ left: c.left + r.left + "px", top: c.top + r.top + "px", width: r.width + "px", height: r.height + "px" });
    window.setTimeout(() => a.remove(), 0);
    return a;
  }

  /** 图标面板：直接显示每个图标，点一下加上，再点一下去掉；同一类只保留一个 */
  private openIconPopover(anchor: HTMLElement) {
    if (!this.hasSel()) return void new Notice("请先选中一个节点");
    const groups: { name: string; type: string; list: { name: string; icon: string }[] }[] = icons.nodeIconList ?? [];
    this.openPopover(anchor, "cm-pop-icon", (el) => {
      const current = () => new Set<string>(this.sel().flatMap((n) => (n.getData("icon") as string[] | undefined) ?? []));
      const render = () => {
        el.empty();
        const cur = current();
        for (const g of groups) {
          el.createDiv({ cls: "cm-pop-title", text: g.name });
          const grid = el.createDiv({ cls: "cm-icon-grid" });
          for (const ic of g.list) {
            const key = `${g.type}_${ic.name}`;
            const b = grid.createEl("button", {
              cls: "cm-icon-btn" + (cur.has(key) ? " is-current" : ""),
              attr: { "aria-label": `${g.name} ${ic.name}`, "data-icon": key },
            });
            const svg = this.svgEl(ic.icon);
            if (svg) b.appendChild(svg);
            else b.setText(ic.name);
            b.addEventListener("click", () => {
              const on = cur.has(key);
              this.sel().forEach((n) => {
                const list: string[] = (n.getData("icon") as string[] | undefined) ?? [];
                const next = list.filter((k) => k.split("_")[0] !== g.type);
                if (!on) next.push(key);
                this.mm.execCommand("SET_NODE_ICON", n, next);
              });
              render();
            });
          }
        }
        const row = el.createDiv({ cls: "cm-pop-row" });
        const clear = row.createEl("button", { cls: "cm-pop-reset", text: "清除图标" });
        clear.addEventListener("click", () => {
          this.sel().forEach((n) => this.mm.execCommand("SET_NODE_ICON", n, []));
          render();
        });
        row.createSpan({ cls: "cm-pop-hint", text: "再点一次可取消，同类图标只保留一个" });
      };
      render();
    });
  }

  private showExportMenu(ev: MouseEvent) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("导出 PNG 图片到库").setIcon("image").onClick(() => this.exportTo("png")));
    menu.addItem((i) => i.setTitle("导出 SVG 矢量图到库").setIcon("file-code").onClick(() => this.exportTo("svg")));
    menu.addItem((i) => i.setTitle("导出 .xmind 文件到库").setIcon("file-output").onClick(() => this.exportTo("xmind")));
    menu.showAtMouseEvent(ev);
  }

  private async exportTo(type: "png" | "svg" | "xmind") {
    if (!this.mm || !this.file) return;
    try {
      const name = this.file.basename;
      const res = await this.mm.export(type, false, name, ...(type === "png" ? [false] : []));
      if (res == null) return void new Notice("导出失败");
      const out = dataToArrayBuffer(res);
      const dir = this.file.parent?.path ?? "";
      const path = normalizePath(`${dir === "/" ? "" : dir + "/"}${name}.${type}`);
      if (typeof out === "string") await this.app.vault.adapter.write(path, out);
      else await this.app.vault.adapter.writeBinary(path, out);
      new Notice(`已导出：${path}`);
    } catch (err) {
      console.error(err);
      new Notice("导出失败：" + (err as Error).message);
    }
  }
}
