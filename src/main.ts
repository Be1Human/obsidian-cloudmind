import { MarkdownView, Menu, Notice, Plugin, TFile, TFolder, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import { CloudMindView, VIEW_TYPE } from "./view";
import { FM_MARK, LEGACY_MARKS, hasMindmapMark, newMindmapText } from "./mdTree";
import { CloudMindSettings, DEFAULT_SETTINGS } from "./settings";
import { CloudMindSettingTab } from "./settingTab";


export default class CloudMindPlugin extends Plugin {
  settings: CloudMindSettings = { ...DEFAULT_SETTINGS };

  /** 用户手动切到文本视图的标签页（不再自动切回导图） */
  private textLeaves = new WeakMap<WorkspaceLeaf, string>();
  private switching = new WeakSet<WorkspaceLeaf>();
  /** 已经加过“导图预览”按钮的文本视图 */
  private decorated = new WeakSet<MarkdownView>();
  private statusEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new CloudMindView(leaf, this));
    this.addSettingTab(new CloudMindSettingTab(this.app, this));

    // ① 左侧竖条：一个 CloudMind 入口，点开是菜单
    this.addRibbonIcon("network", "CloudMind 思维导图", (ev) => this.showEntryMenu(ev));

    // ② 命令面板
    this.addCommand({ id: "create-mindmap", name: "新建思维导图", callback: () => this.createMindmap() });
    this.addCommand({
      id: "open-as-mindmap",
      name: "将当前笔记以思维导图预览",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) void this.switchToMindmap(view.leaf, view.file);
        return true;
      },
    });
    this.addCommand({
      id: "open-as-text",
      name: "将当前思维导图切回文本",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(CloudMindView);
        if (!view) return false;
        if (!checking) void this.switchToText(view.leaf);
        return true;
      },
    });
    this.addCommand({
      id: "cycle-toolbar",
      name: "切换工具栏位置（顶部 → 悬浮 → 左侧 → 右侧 → 底部 → 隐藏）",
      checkCallback: (checking) => {
        if (!this.app.workspace.getActiveViewOfType(CloudMindView)) return false;
        if (!checking) {
          const order = ["top", "float", "left", "right", "bottom", "hidden"] as const;
          const i = order.indexOf(this.settings.toolbarPos);
          const next = order[(i + 1) % order.length];
          void this.updateSettings({ toolbarPos: next, ...(next !== "hidden" ? { lastDock: next } : {}) });
          new Notice(`CloudMind 工具栏：${next}`);
        }
        return true;
      },
    });

    // ③ 文件列表右键
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((i) => i.setTitle("CloudMind：新建思维导图").setIcon("network").onClick(() => this.createMindmap(file)));
        } else if (file instanceof TFile && file.extension === "md") {
          menu.addItem((i) =>
            i.setTitle("CloudMind：以思维导图预览").setIcon("network").onClick(async () => {
              await this.switchToMindmap(this.app.workspace.getLeaf(false), file);
            })
          );
        }
      })
    );

    // ④ 底部状态栏入口：一直显示，点一下就能预览 / 切回文本
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("cm-appstatus");
    this.statusEl.addEventListener("click", (ev) => this.onStatusClick(ev));

    // ⑤ 每篇笔记右上角的按钮 + 自动识别导图笔记
    // （注意：标记不能用 mindmap-plugin，那是 obsidian-markmind / enhancing-mindmap 的）
    const refresh = () => this.refreshLeaves();
    this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
    this.registerEvent(this.app.workspace.on("layout-change", refresh));
    this.registerEvent(this.app.workspace.on("file-open", refresh));
    this.app.workspace.onLayoutReady(refresh);

    // 只在首次安装 / 版本更新后提示一次，平时启动不打扰
    const ver = this.manifest.version;
    if (this.settings.lastVersion !== ver) {
      new Notice(this.settings.lastVersion ? `CloudMind 已更新到 ${ver}` : `CloudMind ${ver} 已启用：点笔记右上角的导图图标即可预览`);
      void this.updateSettings({ lastVersion: ver });
    }
  }

  onunload() {
    /* 视图由 Obsidian 自动清理 */
  }

  /* ---------- 设置 ---------- */

  async loadSettings() {
    const saved = (await this.loadData()) ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
  }

  async updateSettings(patch: Partial<CloudMindSettings>) {
    this.settings = { ...this.settings, ...patch };
    await this.saveData(this.settings);
    this.refreshViews();
  }

  async resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveData(this.settings);
    this.refreshViews();
  }

  openSettings() {
    const s = (this.app as any).setting;
    s?.open?.();
    s?.openTabById?.(this.manifest.id);
  }

  private refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => {
      if (l.view instanceof CloudMindView) l.view.applySettings();
    });
    this.updateStatusItem();
  }

  /* ---------- 入口：菜单 / 按钮 / 状态栏 ---------- */

  private showEntryMenu(ev: MouseEvent) {
    const menu = new Menu();
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = this.app.workspace.getActiveViewOfType(CloudMindView);
    if (cm) {
      menu.addItem((i) => i.setTitle("切回文本").setIcon("file-text").onClick(() => void this.switchToText(cm.leaf)));
    } else {
      menu.addItem((i) =>
        i
          .setTitle(md?.file ? `把「${md.file.basename}」预览成思维导图` : "预览当前笔记（请先打开一篇笔记）")
          .setIcon("network")
          .setDisabled(!md?.file)
          .onClick(() => md?.file && void this.switchToMindmap(md.leaf, md.file))
      );
    }
    menu.addItem((i) => i.setTitle("新建思维导图").setIcon("file-plus-2").onClick(() => this.createMindmap()));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("CloudMind 设置").setIcon("settings").onClick(() => this.openSettings()));
    menu.showAtMouseEvent(ev);
  }

  private onStatusClick(ev: MouseEvent) {
    const cm = this.app.workspace.getActiveViewOfType(CloudMindView);
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (cm) return void this.switchToText(cm.leaf);
    if (md?.file) return void this.switchToMindmap(md.leaf, md.file);
    this.showEntryMenu(ev);
  }

  private updateStatusItem() {
    const el = this.statusEl;
    if (!el) return;
    const cm = this.app.workspace.getActiveViewOfType(CloudMindView);
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    el.empty();
    const ico = el.createSpan({ cls: "cm-appstatus-ico" });
    setIcon(ico, "network");
    if (cm) {
      el.createSpan({ text: " CloudMind · 点击切回文本" });
      el.setAttribute("aria-label", "当前是 CloudMind 导图视图，点击切回文本");
    } else if (md?.file) {
      el.createSpan({ text: " CloudMind · 点击以导图预览" });
      el.setAttribute("aria-label", "把当前笔记预览成思维导图");
    } else {
      el.createSpan({ text: " CloudMind" });
      el.setAttribute("aria-label", "CloudMind 思维导图");
    }
  }

  /* ---------- 自动识别 / 切换视图 ---------- */

  private refreshLeaves() {
    this.updateStatusItem();
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      this.decorate(view);
      if (this.settings.autoOpen) void this.autoSwitch(leaf, view);
    });
  }

  /** 文本视图右上角加一个按钮，一点就预览成导图 */
  private decorate(view: MarkdownView) {
    if (this.decorated.has(view)) return;
    this.decorated.add(view);
    const el = view.addAction("network", "CloudMind：以思维导图预览", () => {
      if (view.file) void this.switchToMindmap(view.leaf, view.file);
    });
    el.addClass("cm-header-btn");
  }

  private async isMindmapFile(file: TFile): Promise<boolean> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm) {
      for (const k of [FM_MARK, ...LEGACY_MARKS]) {
        if (k in fm) return !!fm[k] && String(fm[k]).toLowerCase() !== "false";
      }
      return false;
    }
    // 元数据缓存还没准备好时，直接读文件头
    const head = (await this.app.vault.cachedRead(file)).slice(0, 2000);
    return hasMindmapMark(head);
  }

  private async autoSwitch(leaf: WorkspaceLeaf, view: MarkdownView) {
    const file = view.file;
    if (!file || file.extension !== "md") return;
    if (this.textLeaves.get(leaf) === file.path) return;
    if (this.switching.has(leaf)) return;
    if (!(await this.isMindmapFile(file))) return;
    // 读取期间视图可能已变化
    if (leaf.view !== view || view.file?.path !== file.path) return;
    await this.switchToMindmap(leaf, file);
  }

  async switchToMindmap(leaf: WorkspaceLeaf, file: TFile) {
    this.textLeaves.delete(leaf);
    this.switching.add(leaf);
    try {
      await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
    } catch (e) {
      console.error("[cloudmind] 切换失败", e);
      new Notice("打开思维导图失败：" + (e as Error).message);
    } finally {
      this.switching.delete(leaf);
    }
    this.updateStatusItem();
  }

  async switchToText(leaf: WorkspaceLeaf) {
    const view = leaf.view;
    const file = view instanceof CloudMindView ? view.file : null;
    if (!file) return;
    this.textLeaves.set(leaf, file.path);
    await leaf.setViewState({ type: "markdown", state: { file: file.path }, active: true });
    this.updateStatusItem();
  }

  private async createMindmap(folder?: TFolder) {
    const dir = folder ?? this.app.workspace.getActiveFile()?.parent ?? this.app.vault.getRoot();
    const prefix = dir.path === "/" ? "" : dir.path + "/";
    let name = "未命名导图";
    let path = normalizePath(`${prefix}${name}.md`);
    let n = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      name = `未命名导图 ${n++}`;
      path = normalizePath(`${prefix}${name}.md`);
    }
    try {
      const file = await this.app.vault.create(path, newMindmapText("中心主题"));
      await this.switchToMindmap(this.app.workspace.getLeaf(true), file);
    } catch (e) {
      new Notice("创建失败：" + (e as Error).message);
    }
  }
}
