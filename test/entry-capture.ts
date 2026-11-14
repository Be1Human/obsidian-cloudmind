// 让真实的 src/main.ts 跑一遍 onload()，把注册的入口序列化到 window.__captured
import CloudMindPlugin from "../src/main";
import { Menu, MarkdownView, TFile, TFolder } from "obsidian";
import manifest from "../manifest.json";

const w = window as any;

const ser = (m: any) => ({
  items: m.items.map((i: any) => ({ title: i.title, icon: i.icon ?? null, disabled: !!i.disabled })),
  seps: m.seps ?? [],
});

w.capture = async () => {
  const rec = w.__rec;
  const md = new MarkdownView();
  md.file = new TFile("读书/原子习惯.md");
  const existing = new Set<string>();
  const app = {
    workspace: {
      on: (name: string, cb: any) => {
        rec.events[name] = cb;
        return {};
      },
      getActiveViewOfType: (T: any) => (T === MarkdownView ? md : null),
      onLayoutReady: () => {},
      iterateAllLeaves: () => {},
      getLeavesOfType: () => [],
      getActiveFile: () => md.file,
      getLeaf: () => ({ setViewState: async () => {} }),
    },
    vault: {
      getRoot: () => new TFolder("/"),
      getAbstractFileByPath: (p: string) => (existing.has(p) ? {} : null),
      create: async (path: string, data: string) => {
        rec.created.push({ path, data });
        existing.add(path);
        return new TFile(path);
      },
      cachedRead: async () => "",
    },
    metadataCache: { getFileCache: () => null },
  };
  const plugin: any = new (CloudMindPlugin as any)(app, manifest);
  await plugin.onload();

  // ① 左侧栏图标 → 菜单（当前打开着一篇普通笔记）
  rec.ribbon.cb(new MouseEvent("click"));
  const ribbonMenu = ser(w.__menu);

  // ② 文件列表右键：文件夹 / 笔记
  const folderMenu = new Menu();
  rec.events["file-menu"](folderMenu, new TFolder("读书"));
  const fileMenu = new Menu();
  rec.events["file-menu"](fileMenu, new TFile("读书/原子习惯.md"));

  // ③ 笔记右上角按钮
  plugin.decorate(md);

  // ④ 底部状态栏
  plugin.updateStatusItem();
  const statusText = rec.statusEl.textContent.trim();

  // ⑤ 命令面板：在“打开着一篇普通笔记”时哪些命令可用
  const commands = rec.commands.map((c: any) => ({
    id: c.id,
    name: c.name,
    available: c.callback ? true : !!c.checkCallback?.(true),
  }));

  // ⑥ 新建：实际写出的文件（在“读书”文件夹里新建两次，看重名处理）
  await plugin.createMindmap(new TFolder("读书"));
  await plugin.createMindmap(new TFolder("读书"));

  w.__captured = {
    pluginName: manifest.name,
    version: manifest.version,
    ribbon: { icon: rec.ribbon.icon, title: rec.ribbon.title },
    ribbonMenu,
    folderMenu: ser(folderMenu),
    fileMenu: ser(fileMenu),
    headerActions: rec.headerActions,
    statusText,
    commands,
    created: rec.created,
  };
  return w.__captured;
};
