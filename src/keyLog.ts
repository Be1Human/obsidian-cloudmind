/**
 * Backspace / Delete 删除诊断。
 *
 * 用户反馈“用一会儿删除键就失效”，但在测试环境里复现不了。这里把每次按删除键时插件的判断过程记下来：
 * 如果有导图显示着、却没有任何一个导图删除节点也没有在编辑框里删字，就把当时的完整状态
 * 和之前发生过的事件写到插件目录下的 delete-debug.log，方便定位。只记在本地，不上传。
 */

export interface KeyDecision {
  view: string;
  /** deleted = 删了节点；text = 在编辑框里删字（正常）；其余 = 没处理的原因 */
  result: string;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS = 40;
const MAX_LINES = 300;

class KeyLog {
  private events: string[] = [];
  private pending: KeyDecision[] = [];
  private lines: string[] = [];
  private flushTimer: number | null = null;
  private writer: ((text: string) => Promise<void>) | null = null;
  private loaded = false;

  setWriter(w: ((text: string) => Promise<void>) | null, existing = "") {
    this.writer = w;
    if (!this.loaded) {
      this.lines = existing ? existing.split("\n").filter(Boolean).slice(-MAX_LINES) : [];
      this.loaded = true;
    }
  }

  /** 记一条普通事件（打开 / 重建导图、开始 / 结束编辑、弹层……） */
  note(ev: string) {
    this.events.push(`${stamp()} ${ev}`);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  begin() {
    this.pending = [];
  }

  decide(d: KeyDecision) {
    this.pending.push(d);
  }

  decisions(): KeyDecision[] {
    return this.pending;
  }

  recentEvents(n = 10): string[] {
    return this.events.slice(-n);
  }

  /** 记录一次“没删掉”：写到文件 */
  miss(record: Record<string, unknown>) {
    this.lines.push(JSON.stringify({ t: new Date().toISOString(), ...record, recent: [...this.events] }));
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.writer?.(this.lines.join("\n") + "\n").catch(() => undefined);
    }, 800);
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export const keyLog = new KeyLog();

/** 描述一个元素，便于看出焦点在哪 */
export function describeEl(el: Element | null | undefined): string {
  if (!el) return "null";
  const h = el as HTMLElement;
  const cls = typeof h.className === "string" ? h.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
  const ce = h.isContentEditable ? "[contenteditable]" : "";
  const extra: string[] = [];
  if (h.instanceOf?.(HTMLInputElement)) {
    extra.push(`type=${h.type}`);
    if (h.placeholder) extra.push(`ph=${h.placeholder.slice(0, 12)}`);
  }
  // 所在的容器，便于看出是哪个面板 / 弹窗里的输入框
  const box = el.closest?.(".modal, .prompt, .menu, .cm-popover, .workspace-leaf-content, .workspace-ribbon, .status-bar, .titlebar");
  if (box && box !== el) {
    const bh = box as HTMLElement;
    extra.push("in=" + (bh.dataset?.type ? bh.dataset.type : (typeof bh.className === "string" ? bh.className.split(/\s+/)[0] : box.tagName)));
  }
  if (!h.isConnected) extra.push("detached");
  return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${ce}${extra.length ? "{" + extra.join(",") + "}" : ""}`;
}
