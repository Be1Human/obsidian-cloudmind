import type { App, TFile } from "obsidian";

export interface WikiLink {
  /** 链接目标（不含 #标题 和 |别名） */
  target: string;
  heading: string;
  alias: string;
  /** 交给 openLinkText 的完整文本，如 "笔记#标题" */
  linktext: string;
}

const LINK_RE = /\[\[([^\]|#\n]+)(?:#([^\]|\n]*))?(?:\|([^\]\n]*))?\]\]/g;

export function extractLinks(text: string | undefined | null): WikiLink[] {
  const out: WikiLink[] = [];
  if (!text) return out;
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(text))) {
    const target = m[1].trim();
    const heading = (m[2] ?? "").trim();
    out.push({ target, heading, alias: (m[3] ?? "").trim(), linktext: heading ? `${target}#${heading}` : target });
  }
  return out;
}

/**
 * 导图上显示的文字：把 [[笔记]] 显示成“笔记”，[[笔记|别名]] 显示成“别名”，
 * [[笔记#标题]] 显示成“笔记 > 标题”（和 Obsidian 阅读模式一致）。只影响显示，数据里仍是原文。
 */
export function displayLinkText(text: string): string {
  if (!text || !text.includes("[[")) return text;
  return text.replace(new RegExp(LINK_RE.source, "g"), (_m, target: string, heading?: string, alias?: string) => {
    const a = (alias ?? "").trim();
    if (a) return a;
    const t = target.trim();
    const h = (heading ?? "").trim();
    return h ? `${t} > ${h}` : t;
  });
}

interface Item {
  file: TFile;
  link: string;
}

/**
 * 在节点文字编辑框里输入 [[ 时，弹出笔记搜索列表（和 Obsidian 编辑器里的体验一致）：
 * 继续输入过滤，↑↓ 选择，Enter / Tab / 点击确认，Esc 关闭。
 */
export class WikiSuggest {
  private el: HTMLElement | null = null;
  private items: Item[] = [];
  private index = 0;
  private bound = false;

  /** 编辑框所在的 document：视图可能在 Obsidian 的弹出窗口里，不能直接用全局 document */
  constructor(private app: App, private getSourcePath: () => string, private getDoc: () => Document) {}

  private get doc(): Document {
    return this.getDoc();
  }
  private get win(): Window {
    return this.getDoc().defaultView ?? window;
  }

  attach() {
    if (this.bound) return;
    this.bound = true;
    this.boundDoc = this.doc;
    this.boundDoc.addEventListener("input", this.onInput, true);
    this.boundDoc.addEventListener("compositionend", this.onInput, true);
    this.boundDoc.addEventListener("selectionchange", this.onSelection);
  }

  private boundDoc: Document | null = null;

  destroy() {
    if (this.bound && this.boundDoc) {
      this.boundDoc.removeEventListener("input", this.onInput, true);
      this.boundDoc.removeEventListener("compositionend", this.onInput, true);
      this.boundDoc.removeEventListener("selectionchange", this.onSelection);
      this.bound = false;
      this.boundDoc = null;
    }
    this.close();
  }

  get isOpen() {
    return !!this.el;
  }

  /* ---------- 触发 ---------- */

  private editEl(): HTMLElement | null {
    const sel = this.win.getSelection();
    const n = sel?.anchorNode;
    const el = (n?.instanceOf(Element) ? n : n?.parentElement) ?? null;
    return el?.closest<HTMLElement>(".smm-node-edit-wrap") ?? null;
  }

  private onInput = () => {
    if (!this.editEl()) return this.close();
    this.update();
  };

  /** 光标移出了 [[ ... 的范围就关闭 */
  private onSelection = () => {
    if (!this.el) return;
    if (!this.editEl() || !this.context()) this.close();
  };

  /** 光标前面是否处在一个未闭合的 [[xxx 中 */
  private context(): { node: Text; start: number; end: number; query: string } | null {
    const sel = this.win.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const anchor = sel.anchorNode;
    if (!anchor?.instanceOf(Text)) return null;
    const node = anchor;
    const end = sel.anchorOffset;
    const before = node.data.slice(0, end);
    const m = /\[\[([^[\]|#\n]*)$/.exec(before);
    if (!m) return null;
    return { node, start: m.index, end, query: m[1] };
  }

  private update() {
    const ctx = this.context();
    if (!ctx) return this.close();
    this.items = this.search(ctx.query);
    this.index = 0;
    this.render(ctx.query);
  }

  /* ---------- 搜索 ---------- */

  private search(q: string): Item[] {
    const src = this.getSourcePath();
    const files = this.app.vault.getMarkdownFiles();
    const query = q.trim().toLowerCase();
    const scored: { f: TFile; s: number }[] = [];
    for (const f of files) {
      const name = f.basename.toLowerCase();
      let s = -1;
      if (!query) s = 3;
      else if (name === query) s = 0;
      else if (name.startsWith(query)) s = 1;
      else if (name.includes(query)) s = 2;
      else if (f.path.toLowerCase().includes(query)) s = 4;
      if (s >= 0) scored.push({ f, s });
    }
    scored.sort((a, b) => a.s - b.s || (b.f.stat?.mtime ?? 0) - (a.f.stat?.mtime ?? 0));
    return scored.slice(0, 8).map(({ f }) => ({
      file: f,
      link: this.app.metadataCache.fileToLinktext(f, src, true),
    }));
  }

  /* ---------- 渲染 ---------- */

  private render(query: string) {
    if (!this.el) {
      this.el = this.doc.body.createDiv({ cls: "cm-popover cm-suggest" });
      // 不抢走编辑框焦点；也不让鼠标事件冒泡到 body —— 导图会把 body 上的点击当成“点了编辑框外面”而结束编辑
      this.el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      this.el.addEventListener("click", (e) => e.stopPropagation());
      this.keyWin = this.win;
      this.keyWin.addEventListener("keydown", this.onKey, true);
    }
    const el = this.el;
    el.empty();
    if (this.items.length === 0) {
      el.createDiv({ cls: "cm-suggest-empty", text: query ? `没有匹配「${query}」的笔记` : "库里还没有笔记" });
    } else {
      this.items.forEach((it, i) => {
        const row = el.createDiv({ cls: "cm-suggest-item" + (i === this.index ? " is-active" : "") });
        row.createSpan({ cls: "cm-suggest-name", text: it.file.basename });
        const dir = it.file.parent?.path;
        if (dir && dir !== "/") row.createSpan({ cls: "cm-suggest-path", text: dir });
        row.addEventListener("mousemove", () => this.setIndex(i, false));
        // 用 mousedown 确认：此时编辑框还保持着光标，选区信息才是有效的
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.accept(i);
        });
      });
      el.createDiv({ cls: "cm-suggest-foot", text: "↑↓ 选择 · Enter 引用 · Esc 取消" });
    }
    this.place();
  }

  private place() {
    const el = this.el;
    if (!el) return;
    const sel = this.win.getSelection();
    let r: DOMRect | null = null;
    if (sel && sel.rangeCount) {
      const rects = sel.getRangeAt(0).getClientRects();
      r = rects.length ? rects[rects.length - 1] : null;
      if (!r || (r.width === 0 && r.height === 0 && r.x === 0 && r.y === 0)) {
        r = this.editEl()?.getBoundingClientRect() ?? null;
      }
    }
    const vw = this.doc.documentElement.clientWidth;
    const vh = this.doc.documentElement.clientHeight;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const x = (r?.left ?? 40) - 4;
    let y = (r?.bottom ?? 40) + 6;
    if (y + ph > vh - 8) y = (r?.top ?? 40) - ph - 6;
    el.setCssStyles({
      left: Math.max(8, Math.min(x, vw - pw - 8)) + "px",
      top: Math.max(8, Math.min(y, vh - ph - 8)) + "px",
    });
  }

  private setIndex(i: number, scroll = true) {
    if (!this.el || i === this.index) return;
    this.index = i;
    this.el.querySelectorAll(".cm-suggest-item").forEach((n, k) => n.classList.toggle("is-active", k === i));
    if (scroll) this.el.querySelectorAll(".cm-suggest-item")[i]?.scrollIntoView({ block: "nearest" });
  }

  /* ---------- 键盘 ---------- */

  private onKey = (e: KeyboardEvent) => {
    if (!this.el) return;
    // 输入法组词期间的回车/方向键是选字，不能拦
    if (e.isComposing || e.key === "Process") return;
    const n = this.items.length;
    const stop = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    switch (e.key) {
      case "ArrowDown":
        if (n) this.setIndex((this.index + 1) % n);
        return stop();
      case "ArrowUp":
        if (n) this.setIndex((this.index - 1 + n) % n);
        return stop();
      case "Enter":
      case "Tab":
        if (n) {
          stop();
          return this.accept(this.index);
        }
        return this.close(); // 没有候选时回车照常结束编辑
      case "Escape":
        stop();
        return this.close();
    }
  };

  /* ---------- 确认 ---------- */

  private accept(i: number) {
    const it = this.items[i];
    const ctx = this.context();
    if (!it || !ctx) return this.close();
    const { node, start, end } = ctx;
    const text = `[[${it.link}]]`;
    // 如果光标后面已经跟着 ]]（比如用户手动补过），不要重复
    const after = node.data.slice(end);
    const rest = after.startsWith("]]") ? after.slice(2) : after;
    node.data = node.data.slice(0, start) + text + rest;
    const sel = this.win.getSelection();
    const range = this.doc.createRange();
    range.setStart(node, start + text.length);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    this.close();
    // 通知导图：编辑框内容变了（重新测量节点大小）
    node.parentElement?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  close() {
    if (!this.el) return;
    (this.keyWin ?? this.win).removeEventListener("keydown", this.onKey, true);
    this.keyWin = null;
    this.el.remove();
    this.el = null;
    this.items = [];
  }

  private keyWin: Window | null = null;
}
