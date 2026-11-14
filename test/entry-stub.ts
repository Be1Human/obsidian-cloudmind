// 录制用的 obsidian 替身：在测试替身基础上补上 Plugin / MarkdownView / TFile / TFolder，
// 让 src/main.ts 原样执行 onload()，记录它注册的所有入口（文字、图标都来自插件源码）。
export * from "./obsidian-stub";

const w = window as any;
w.__rec = { commands: [], events: {}, headerActions: [], created: [] };

export class TFolder {
  name: string;
  parent: TFolder | null = null;
  constructor(public path: string) {
    this.name = path.split("/").pop() || path;
  }
}
export class TFile {
  basename: string;
  extension = "md";
  parent: TFolder;
  stat = { mtime: 0 };
  constructor(public path: string) {
    const name = path.split("/").pop()!;
    this.basename = name.replace(/\.md$/, "");
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/";
    this.parent = new TFolder(dir);
  }
}
export class MarkdownView {
  file: TFile | null = null;
  leaf: any = { setViewState: async () => {} };
  addAction(icon: string, title: string) {
    w.__rec.headerActions.push({ icon, title });
    const el = document.createElement("div");
    (el as any).addClass = () => {};
    return el;
  }
}
export class PluginSettingTab {
  containerEl = document.createElement("div");
  constructor(public app: any, public plugin: any) {}
}
export class Setting {
  constructor(_el: any) {}
}
export class Plugin {
  constructor(public app: any, public manifest: any) {}
  registerView() {}
  addSettingTab() {}
  registerEvent() {}
  addRibbonIcon(icon: string, title: string, cb: (ev: MouseEvent) => void) {
    w.__rec.ribbon = { icon, title, cb };
    return document.createElement("div");
  }
  addCommand(c: any) {
    w.__rec.commands.push(c);
    return c;
  }
  addStatusBarItem() {
    const el = document.createElement("div");
    w.__rec.statusEl = el;
    return el;
  }
  async loadData() {
    return { lastVersion: this.manifest.version };
  }
  async saveData() {}
}
