import { CloudMindView } from "../src/view";
import { DEFAULT_SETTINGS } from "../src/settings";

const w = window as any;
const handlers: Record<string, Function[]> = (w.__wsh = {});
w.__fire = (n: string) => (handlers[n] ?? []).forEach((f) => f());
w.__app = {
  workspace: {
    on: (n: string, cb: Function) => {
      (handlers[n] ||= []).push(cb);
      return {};
    },
    getActiveViewOfType: () => w.__view,
    openLinkText: (...a: any[]) => {
      (w.__opened ||= []).push(a);
      return Promise.resolve();
    },
  },
  vault: {
    adapter: { write: async () => {}, writeBinary: async () => {} },
    getMarkdownFiles: () => w.__files,
  },
  metadataCache: { fileToLinktext: (f: any) => f.basename },
};
const mk = (path: string, mtime: number) => {
  const base = path.split("/").pop()!.replace(/\.md$/, "");
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/";
  return { path, basename: base, extension: "md", parent: { path: dir }, stat: { mtime } };
};
w.__files = [
  mk("工作/资产治理.md", 300),
  mk("工作/资产治理周报.md", 200),
  mk("学习/Agent 评测.md", 400),
  mk("学习/Agent 系统设计题库.md", 100),
  mk("日记/2026-11-12.md", 500),
];

// 插件替身：settings + updateSettings（和真实插件一样：合并 -> 刷新视图）
const plugin: any = {
  settings: { ...DEFAULT_SETTINGS },
  settingsSaved: 0,
  async updateSettings(patch: any) {
    this.settings = { ...this.settings, ...patch };
    this.settingsSaved++;
    w.__view?.applySettings();
  },
  openSettings() {
    w.__openedSettings = true;
  },
  async switchToText() {
    w.__switchedText = true;
  },
};
w.__plugin = plugin;

w.boot = async (text: string, settings: any = {}) => {
  // 先关掉上一个视图，否则它的 window 键盘监听会一直在，干扰新视图
  if (w.__view) {
    try {
      await w.__view.onClose();
      w.__view.onunload?.();
    } catch {
      /* ignore */
    }
    w.__view.contentEl.remove();
    w.__view = null;
  }
  plugin.settings = { ...DEFAULT_SETTINGS, ...settings };
  const host = document.getElementById("host")!;
  const view = new CloudMindView({} as any, plugin);
  view.file = { basename: "测试导图", path: "测试导图.md", parent: { path: "/" } } as any;
  w.__view = view;
  host.appendChild(view.contentEl);
  await view.onOpen();
  view.setViewData(text, true);
  return true;
};
w.getText = () => w.__view.getViewData();
w.hasMM = () => !!w.__view.mm;
w.mm = () => w.__view.mm;
