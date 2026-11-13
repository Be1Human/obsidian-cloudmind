// 仅用于浏览器冒烟测试：模拟 obsidian 模块的最小子集
import icons from "./icons.json";

const w = window as any;
w.__saves = 0;

// Obsidian 给 HTMLElement 扩展的辅助方法
const P: any = HTMLElement.prototype;
P.empty = function () {
  this.innerHTML = "";
};
P.addClass = function (c: string) {
  this.classList.add(c);
};
P.removeClass = function (c: string) {
  this.classList.remove(c);
};
P.toggleClass = function (c: string, on: boolean) {
  this.classList.toggle(c, !!on);
};
P.setText = function (t: string) {
  this.textContent = t;
};
P.setAttr = function (k: string, v: string) {
  this.setAttribute(k, v);
};
P.createEl = function (tag: string, o: any = {}) {
  const el = document.createElement(tag);
  if (o.cls) el.className = o.cls;
  if (o.text) el.textContent = o.text;
  if (o.attr) for (const k of Object.keys(o.attr)) el.setAttribute(k, o.attr[k]);
  this.appendChild(el);
  return el;
};
P.createDiv = function (o: any = {}) {
  return this.createEl("div", o);
};
P.createSpan = function (o: any = {}) {
  return this.createEl("span", o);
};

export class TextFileView {
  contentEl: HTMLElement = document.createElement("div");
  app: any = w.__app;
  file: any = null;
  constructor(public leaf: any) {}
  addAction() {}
  registerEvent() {}
  private __doms: (() => void)[] = [];
  registerDomEvent(el: any, type: string, cb: any, opts?: any) {
    el.addEventListener(type, cb, opts);
    this.__doms.push(() => el.removeEventListener(type, cb, opts));
  }
  onunload() {
    this.__doms.forEach((f) => f());
    this.__doms = [];
  }
  requestSave() {
    w.__saves++;
  }
  async save(_clear?: boolean) {
    w.__disk = (this as any).getViewData();
    w.__flushes = (w.__flushes || 0) + 1;
  }
}
export class WorkspaceLeaf {}
export class Menu {
  static last: Menu | null = null;
  items: any[] = [];
  static nested = false;
  constructor() {
    Menu.last = this;
    if (!Menu.nested) w.__menu = this;
  }
  addItem(cb: (i: any) => void) {
    const item: any = {
      title: "",
      setTitle(t: any) {
        this.title = typeof t === "string" ? t : t.textContent;
        return this;
      },
      setIcon() {
        return this;
      },
      setChecked(v?: boolean) {
        this.checked = !!v;
        return this;
      },
      setDisabled(v?: boolean) {
        this.disabled = !!v;
        return this;
      },
      onClick(f: any) {
        this.fn = f;
        return this;
      },
      setSubmenu() {
        Menu.nested = true;
        const m = new Menu();
        Menu.nested = false;
        this.sub = m;
        return m;
      },
    };
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent() {}
  showAtPosition() {}
}
export class Modal {
  contentEl = document.createElement("div");
  titleEl = document.createElement("div");
  constructor(public app: any) {}
  open() {}
  close() {}
}
export class Notice {
  constructor(public msg: string) {
    (w.__notices ||= []).push(msg);
  }
}
export function setIcon(el: HTMLElement, name: string) {
  el.dataset.icon = name;
  // 真实 Obsidian 会画 lucide 图标；测试里用 lucide-static 导出的映射，没有的名字退回占位方块
  const svg = (icons as Record<string, string>)[name.replace(/^lucide-/, "")];
  el.innerHTML =
    svg ??
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8"/></svg>';
}
export function normalizePath(p: string) {
  return p;
}
export type App = any;
