/**
 * Markdown <-> 思维导图树 的双向转换。
 *
 * 文件约定（全部存在 .md 里，不产生任何额外文件）：
 * - frontmatter:  cloudmind: true           标记这是导图笔记
 *                 xmind-layout / xmind-theme / xmind-rainbow 保存导图全局设置
 * - 标题(#..######) 和 列表(- ) 的层级 = 导图的层级
 * - 节点行尾的 <!--mm:{...}-->  保存样式/折叠/图标/概要/外框等元数据（阅读视图里不可见）
 * - 节点下面的普通文本行 = 该节点的备注
 */

export interface MmNode {
  data: Record<string, any>;
  children: MmNode[];
}

export interface ParsedDoc {
  fmInner: string | null;
  fm: Record<string, string>;
  root: MmNode;
  virtualRoot: boolean;
  useTab: boolean;
  eol: string;
}

/** 当前标记，新建/保存时写入 */
export const FM_MARK = "cloudmind";
/** 旧版本用过的标记，仍然识别，保存时自动迁移成新标记 */
export const LEGACY_MARKS = ["xmind-mindmap"];
/** 导图全局设置键：新键 / 旧键 */
export const FM_KEYS = {
  layout: ["cloudmind-layout", "xmind-layout"],
  theme: ["cloudmind-theme", "xmind-theme"],
  rainbow: ["cloudmind-rainbow", "xmind-rainbow"],
};

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const HEADING_RE = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const FENCE_RE = /^[ \t]*(```+|~~~+)/;
const META_RE = /[ \t]*<!--mm:(\{[\s\S]*?\})-->[ \t]*$/;

/**
 * 备注是“节点下面的普通文字行”。如果某一行本身像标题（# ）或列表（- 、1. ），
 * 再读回时会被当成新节点。保存时给开头的符号加 Markdown 转义（\- 、1\. 、\# ），
 * 阅读模式里显示不变；读回时去掉。
 */
export function escapeNoteLine(ln: string): string {
  if (HEADING_RE.test(ln)) return ln.replace(/^([ \t]*)#/, "$1\\#");
  if (LIST_RE.test(ln)) return ln.replace(/^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))/, (_m, sp, b, num, d) => (b ? `${sp}\\${b}` : `${sp}${num}\\${d}`));
  return ln;
}
export function unescapeNoteLine(ln: string): string {
  const un = ln.replace(/^([ \t]*)\\([-*+#])/, "$1$2").replace(/^([ \t]*)(\d{1,9})\\([.)])/, "$1$2$3");
  return un !== ln && (HEADING_RE.test(un) || LIST_RE.test(un)) ? un : ln;
}

/** 序列化时不写进元数据的字段 */
const SKIP_KEYS = new Set([
  "text",
  "uid",
  "note",
  "isActive",
  "inserting",
  "needUpdate",
  "richText",
  "resetRichText",
  "_k",
  "_virtual",
  "expand",
  "children",
]);
/** 嵌套对象(概要等)里需要清掉的瞬时字段 */
const TRANSIENT_KEYS = new Set(["isActive", "inserting", "needUpdate", "richText", "resetRichText", "uid"]);

export function hasMindmapMark(text: string): boolean {
  const m = FM_RE.exec(text);
  if (!m) return false;
  for (const key of [FM_MARK, ...LEGACY_MARKS]) {
    const hit = new RegExp("^" + key + ":[ \\t]*(\\S+)", "m").exec(m[1]);
    if (hit && !/^(false|no|0)$/i.test(hit[1])) return true;
  }
  return false;
}

/** 取第一个存在的 frontmatter 键 */
export function pickFm(fm: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) if (fm[k] !== undefined && fm[k] !== "") return fm[k];
  return undefined;
}

function readFm(inner: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!inner) return out;
  for (const line of inner.split(/\r?\n/)) {
    const m = /^([\w-]+):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function tabWidthIndent(s: string): number {
  let n = 0;
  for (const ch of s) n += ch === "\t" ? 4 : 1;
  return n;
}

function decodeText(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").trim();
}

function encodeText(s: string): string {
  return (s ?? "").replace(/\r?\n/g, "<br>");
}

function parseMeta(raw: string): { text: string; meta: Record<string, any> } {
  const m = META_RE.exec(raw);
  if (!m) return { text: raw, meta: {} };
  let meta: Record<string, any> = {};
  try {
    meta = JSON.parse(m[1]);
  } catch {
    /* 元数据损坏就忽略，保留文本 */
  }
  return { text: raw.slice(0, m.index), meta };
}

interface Frame {
  node: MmNode;
  kind: "r" | "h" | "l";
  level: number;
  noteStrip: number;
}

export function parseDoc(text: string, fallbackTitle: string): ParsedDoc {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let body = text;
  let fmInner: string | null = null;
  const fmMatch = FM_RE.exec(text);
  if (fmMatch) {
    fmInner = fmMatch[1];
    body = text.slice(fmMatch[0].length);
  }
  const fm = readFm(fmInner);
  const lines = body.split(/\r?\n/);

  const vroot: MmNode = { data: { text: "" }, children: [] };
  const rootFrame: Frame = { node: vroot, kind: "r", level: 0, noteStrip: 0 };
  const stack: Frame[] = [rootFrame];
  let cur: Frame = rootFrame;
  const kindOf = new Map<MmNode, "h" | "l">();
  const notes = new Map<MmNode, string[]>();
  let useTab = false;
  let inFence = false;
  let fenceMark = "";
  let pendingBlank = 0;

  const pushNote = (frame: Frame, line: string, raw = false) => {
    const arr = notes.get(frame.node) ?? [];
    if (arr.length > 0) for (let i = 0; i < pendingBlank; i++) arr.push("");
    pendingBlank = 0;
    const stripped = frame.noteStrip > 0 ? line.replace(new RegExp("^[ \\t]{0," + frame.noteStrip + "}"), "") : line;
    arr.push(raw ? stripped : unescapeNoteLine(stripped));
    notes.set(frame.node, arr);
  };

  const createNode = (rawText: string, kind: "h" | "l"): MmNode => {
    const { text: t, meta } = parseMeta(rawText);
    const data: Record<string, any> = { expand: true, ...meta, text: decodeText(t), _k: kind };
    return { data, children: [] };
  };

  for (const line of lines) {
    // 围栏代码块：内部一律视为备注内容
    const fence = FENCE_RE.exec(line);
    if (fence && (!inFence || line.trim().startsWith(fenceMark))) {
      if (!inFence) {
        inFence = true;
        fenceMark = fence[1][0].repeat(3);
      } else {
        inFence = false;
      }
      pushNote(cur, line, true);
      continue;
    }
    if (inFence) {
      pushNote(cur, line, true);
      continue;
    }

    if (line.trim() === "") {
      pendingBlank++;
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1].length;
      while (stack[stack.length - 1].kind === "l") stack.pop();
      while (stack[stack.length - 1].kind === "h" && stack[stack.length - 1].level >= level) stack.pop();
      const node = createNode(h[2] ?? "", "h");
      stack[stack.length - 1].node.children.push(node);
      cur = { node, kind: "h", level, noteStrip: 0 };
      stack.push(cur);
      kindOf.set(node, "h");
      pendingBlank = 0;
      continue;
    }

    const l = LIST_RE.exec(line);
    if (l) {
      if (l[1].includes("\t")) useTab = true;
      const indent = tabWidthIndent(l[1]);
      while (stack[stack.length - 1].kind === "l" && stack[stack.length - 1].level >= indent) stack.pop();
      const node = createNode(l[3] ?? "", "l");
      stack[stack.length - 1].node.children.push(node);
      cur = { node, kind: "l", level: indent, noteStrip: indent + 2 };
      stack.push(cur);
      kindOf.set(node, "l");
      pendingBlank = 0;
      continue;
    }

    // 其他行：当前节点的备注
    pushNote(cur, line);
  }

  for (const [node, arr] of notes) {
    while (arr.length && arr[arr.length - 1] === "") arr.pop();
    if (arr.length) node.data.note = arr.join("\n");
  }

  const top = vroot.children;
  let root: MmNode;
  let virtualRoot = false;
  if (top.length === 0) {
    root = { data: { text: fallbackTitle, expand: true }, children: [] };
  } else if (top.length === 1 && kindOf.get(top[0]) === "h") {
    root = top[0];
  } else {
    virtualRoot = true;
    root = { data: { text: fallbackTitle, expand: true, _virtual: true }, children: top };
    const pre = notes.get(vroot);
    if (pre && pre.length) root.data.note = pre.join("\n");
  }
  root.data.expand = true;
  return { fmInner, fm, root, virtualRoot, useTab, eol };
}

// ---------------------------------------------------------------- 序列化

function cleanDeep(v: any): any {
  if (Array.isArray(v)) return v.map(cleanDeep);
  if (v && typeof v === "object") {
    const o: Record<string, any> = {};
    for (const k of Object.keys(v)) {
      if (TRANSIENT_KEYS.has(k)) continue;
      if (v[k] === undefined) continue;
      o[k] = cleanDeep(v[k]);
    }
    return o;
  }
  return v;
}

function collectKeepUids(root: MmNode): Set<string> {
  const keep = new Set<string>();
  const walk = (n: MmNode) => {
    const t = n.data.associativeLineTargets;
    if (Array.isArray(t) && t.length) {
      if (n.data.uid) keep.add(n.data.uid);
      t.forEach((u: string) => keep.add(u));
    }
    n.children.forEach(walk);
  };
  walk(root);
  return keep;
}

function metaComment(node: MmNode, keepUids: Set<string>): string {
  const meta: Record<string, any> = {};
  if (node.data.expand === false) meta.expand = false;
  if (node.data.uid && keepUids.has(node.data.uid)) meta.uid = node.data.uid;
  for (const k of Object.keys(node.data)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = node.data[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    meta[k] = cleanDeep(v);
  }
  if (Object.keys(meta).length === 0) return "";
  const json = JSON.stringify(meta).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return ` <!--mm:${json}-->`;
}

export interface SerializeOpts {
  root: MmNode;
  virtualRoot: boolean;
  useTab: boolean;
  eol: string;
  fmInner: string | null;
  fmUpdates: Record<string, string | null>;
}

interface Ctx {
  kind: "h" | "l";
  hLevel: number; // 父节点标题层级（虚拟根为 0）
  depth: number; // 父节点列表缩进深度
}

function inferKind(node: MmNode, parent: MmNode, ctx: Ctx): "h" | "l" {
  if (ctx.kind === "l") return "l";
  const own = node.data._k;
  if (own === "h" || own === "l") return own;
  const sib = parent.children.find((c) => c !== node && (c.data._k === "h" || c.data._k === "l"));
  if (sib) return sib.data._k;
  return ctx.hLevel + 1 <= 3 ? "h" : "l";
}

export function serializeDoc(o: SerializeOpts): string {
  const keep = collectKeepUids(o.root);
  const out: string[] = [];
  const indentUnit = o.useTab ? "\t" : "  ";

  const emitNote = (node: MmNode, prefix: string) => {
    const note = node.data.note;
    if (typeof note !== "string" || note === "") return;
    let fence = "";
    for (const ln of note.split(/\r?\n/)) {
      if (ln === "") {
        out.push("");
        continue;
      }
      const f = FENCE_RE.exec(ln);
      if (f && (!fence || ln.trim().startsWith(fence))) {
        fence = fence ? "" : f[1][0].repeat(3);
        out.push(prefix + ln);
        continue;
      }
      out.push(prefix + (fence ? ln : escapeNoteLine(ln)));
    }
  };

  const emit = (node: MmNode, parent: MmNode | null, ctx: Ctx, isRoot: boolean) => {
    let kind: "h" | "l";
    if (isRoot) kind = "h";
    else {
      kind = inferKind(node, parent as MmNode, ctx);
      if (kind === "h" && ctx.hLevel + 1 > 6) kind = "l";
    }
    const text = encodeText(node.data.text ?? "");
    const meta = metaComment(node, keep);
    let childCtx: Ctx;
    if (kind === "h") {
      const level = ctx.hLevel + 1;
      out.push(`${"#".repeat(level)} ${text}${meta}`);
      emitNote(node, "");
      childCtx = { kind: "h", hLevel: level, depth: 0 };
    } else {
      const depth = ctx.kind === "l" ? ctx.depth + 1 : 0;
      const pad = indentUnit.repeat(depth);
      out.push(`${pad}- ${text}${meta}`);
      emitNote(node, pad + "  ");
      childCtx = { kind: "l", hLevel: ctx.hLevel, depth };
    }
    for (const c of node.children) emit(c, node, childCtx, false);
  };

  if (o.virtualRoot) {
    emitNote(o.root, "");
    if (out.length) out.push("");
    for (const c of o.root.children) emit(c, o.root, { kind: "h", hLevel: 0, depth: 0 }, false);
  } else {
    emit(o.root, null, { kind: "h", hLevel: 0, depth: 0 }, true);
  }

  const fm = buildFm(o.fmInner, o.fmUpdates, o.eol);
  return fm + out.join(o.eol) + o.eol;
}

function buildFm(inner: string | null, updates: Record<string, string | null>, eol: string): string {
  const lines = inner === null ? [] : inner.split(/\r?\n/);
  for (const key of Object.keys(updates)) {
    const val = updates[key];
    const idx = lines.findIndex((l) => new RegExp("^" + key + ":").test(l));
    if (val === null) {
      if (idx >= 0) lines.splice(idx, 1);
    } else if (idx >= 0) lines[idx] = `${key}: ${val}`;
    else lines.push(`${key}: ${val}`);
  }
  if (lines.length === 0) return "";
  return `---${eol}${lines.join(eol)}${eol}---${eol}`;
}

export function newMindmapText(title: string): string {
  return `---\n${FM_MARK}: true\n---\n# ${title}\n\n## 分支主题 1\n\n## 分支主题 2\n\n## 分支主题 3\n`;
}

/** 保存时要对 frontmatter 做的更新：写新标记、删旧标记，设置键同理 */
export function buildFmUpdates(opts: {
  layout: string | null;
  theme: string | null;
  rainbow: boolean | null;
}): Record<string, string | null> {
  const u: Record<string, string | null> = { [FM_MARK]: "true" };
  for (const k of LEGACY_MARKS) u[k] = null;
  const put = (keys: string[], val: string | null) => {
    u[keys[0]] = val;
    for (const old of keys.slice(1)) u[old] = null;
  };
  put(FM_KEYS.layout, opts.layout);
  put(FM_KEYS.theme, opts.theme);
  put(FM_KEYS.rainbow, opts.rainbow === null ? null : String(opts.rainbow));
  return u;
}
