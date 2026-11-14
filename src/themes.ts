import MindMap from "simple-mind-map";

const FONT = '"Microsoft YaHei", "PingFang SC", -apple-system, "Segoe UI", sans-serif';

export const RAINBOW = ["#F6BD16", "#5B8FF9", "#5AD8A6", "#E8684A", "#6DC8EC", "#9270CA", "#FF9D4D", "#269A99"];

export interface ThemeDef {
  id: string;
  name: string;
  /** 一句话说明，显示在主题面板里 */
  desc: string;
  dark: boolean;
  /** 选这个主题时是否默认打开彩虹分支线 */
  rainbow: boolean;
  /** 面板分组 */
  group: "box" | "classic";
}

export const THEMES: ThemeDef[] = [
  { id: "cloudBox", name: "方块", desc: "每个节点都是黑框方块", dark: false, rainbow: false, group: "box" },
  { id: "cloudBoxColor", name: "方块·彩色", desc: "方块 + 彩虹分支线", dark: false, rainbow: true, group: "box" },
  { id: "cloudBoxDark", name: "方块·深色", desc: "深色背景的方块", dark: true, rainbow: false, group: "box" },
  { id: "cloudBoxBlue", name: "方块·蓝图", desc: "蓝底白线，像设计图纸", dark: true, rainbow: false, group: "box" },
  { id: "xmindFresh", name: "清新（默认）", desc: "圆角、曲线、彩虹分支", dark: false, rainbow: true, group: "classic" },
  { id: "xmindBusiness", name: "商务", desc: "蓝色块、直角连线", dark: false, rainbow: false, group: "classic" },
  { id: "xmindDark", name: "深色", desc: "跟随深色界面", dark: true, rainbow: true, group: "classic" },
  { id: "cloudLine", name: "极简线条", desc: "无边框，只有下划线", dark: false, rainbow: true, group: "classic" },
  { id: "cloudMacaron", name: "马卡龙", desc: "粉色圆角", dark: false, rainbow: true, group: "classic" },
  { id: "cloudPaper", name: "暖纸", desc: "米黄纸张质感", dark: false, rainbow: false, group: "classic" },
];

function nodeBase(color: string, size: number, extra: Record<string, any> = {}) {
  return { fontFamily: FONT, color, fontSize: size, ...extra };
}

/** “方块”系列：根、二级、其余所有层级的节点都带实线边框，直角，连线直角折线 */
function boxed(o: {
  bg: string;
  line: string;
  rootFill: string;
  rootText: string;
  rootBorder: string;
  secFill: string;
  secText: string;
  secBorder: string;
  nodeFill: string;
  nodeText: string;
  nodeBorder: string;
  sumFill: string;
  sumBorder: string;
  assoc: string;
  borderW?: number;
}): Record<string, any> {
  const bw = o.borderW ?? 2;
  return {
    paddingX: 14,
    paddingY: 7,
    lineWidth: 2,
    lineColor: o.line,
    lineStyle: "straight",
    lineRadius: 0,
    generalizationLineWidth: 2,
    generalizationLineColor: o.line,
    associativeLineColor: o.assoc,
    associativeLineTextColor: o.nodeText,
    associativeLineTextFontFamily: FONT,
    backgroundColor: o.bg,
    root: nodeBase(o.rootText, 20, {
      fillColor: o.rootFill,
      borderColor: o.rootBorder,
      borderWidth: bw,
      borderRadius: 0,
      shape: "rectangle",
      fontWeight: "bold",
    }),
    second: nodeBase(o.secText, 16, {
      fillColor: o.secFill,
      borderColor: o.secBorder,
      borderWidth: bw,
      borderRadius: 0,
      shape: "rectangle",
      marginX: 64,
      marginY: 22,
    }),
    node: nodeBase(o.nodeText, 14, {
      fillColor: o.nodeFill,
      borderColor: o.nodeBorder,
      borderWidth: Math.max(1, bw - 0.5),
      borderRadius: 0,
      shape: "rectangle",
      marginX: 36,
      marginY: 10,
    }),
    generalization: nodeBase(o.nodeText, 14, {
      fillColor: o.sumFill,
      borderColor: o.sumBorder,
      borderWidth: bw,
      borderRadius: 0,
      shape: "rectangle",
    }),
  };
}

export const THEME_CONFIGS: Record<string, Record<string, any>> = {
  /* ---------------- 方块系列 ---------------- */
  cloudBox: boxed({
    bg: "#FFFFFF",
    line: "#1F2937",
    rootFill: "#1F2937",
    rootText: "#FFFFFF",
    rootBorder: "#1F2937",
    secFill: "#FFFFFF",
    secText: "#111827",
    secBorder: "#1F2937",
    nodeFill: "#FFFFFF",
    nodeText: "#1F2937",
    nodeBorder: "#4B5563",
    sumFill: "#FFFFFF",
    sumBorder: "#1F2937",
    assoc: "#5B8FF9",
  }),
  cloudBoxColor: boxed({
    bg: "#FAFAF7",
    line: "#6B7280",
    rootFill: "#2F3B52",
    rootText: "#FFFFFF",
    rootBorder: "#2F3B52",
    secFill: "#FFE9A8",
    secText: "#1F2937",
    secBorder: "#2F3B52",
    nodeFill: "#FFFFFF",
    nodeText: "#1F2937",
    nodeBorder: "#2F3B52",
    sumFill: "#E3D6F5",
    sumBorder: "#2F3B52",
    assoc: "#E8684A",
  }),
  cloudBoxDark: boxed({
    bg: "#1B1F24",
    line: "#8B949E",
    rootFill: "#3E6FD9",
    rootText: "#FFFFFF",
    rootBorder: "#8FB4FF",
    secFill: "#242A31",
    secText: "#E6EDF3",
    secBorder: "#8B949E",
    nodeFill: "#1B1F24",
    nodeText: "#C9D1D9",
    nodeBorder: "#5C6773",
    sumFill: "#242A31",
    sumBorder: "#8FB4FF",
    assoc: "#8FB4FF",
  }),
  cloudBoxBlue: boxed({
    bg: "#1E4FA3",
    line: "#FFFFFF",
    rootFill: "#FFFFFF",
    rootText: "#1E4FA3",
    rootBorder: "#FFFFFF",
    secFill: "transparent",
    secText: "#FFFFFF",
    secBorder: "#FFFFFF",
    nodeFill: "transparent",
    nodeText: "#E8F0FF",
    nodeBorder: "#BCD3FF",
    sumFill: "transparent",
    sumBorder: "#FFFFFF",
    assoc: "#FFD166",
    borderW: 1.8,
  }),

  /* ---------------- 经典系列 ---------------- */
  xmindFresh: {
    paddingX: 14,
    paddingY: 6,
    lineWidth: 2,
    lineColor: "#8FA3C7",
    lineStyle: "curve",
    rootLineKeepSameInCurve: true,
    generalizationLineWidth: 2,
    generalizationLineColor: "#5B8FF9",
    associativeLineColor: "#5B8FF9",
    associativeLineTextFontFamily: FONT,
    backgroundColor: "#ffffff",
    root: nodeBase("#ffffff", 20, {
      fillColor: "#2F3B52",
      fontWeight: "bold",
      borderRadius: 12,
      borderWidth: 0,
      shape: "roundedRectangle",
    }),
    second: nodeBase("#1F2937", 16, {
      fillColor: "#EEF3FF",
      borderColor: "#C7D6F5",
      borderWidth: 1,
      borderRadius: 8,
      marginX: 70,
      marginY: 22,
    }),
    node: nodeBase("#374151", 14, { fillColor: "transparent", borderWidth: 0, marginX: 36, marginY: 8 }),
    generalization: nodeBase("#1F2937", 14, {
      fillColor: "#ffffff",
      borderColor: "#5B8FF9",
      borderWidth: 1,
      borderRadius: 6,
    }),
  },

  xmindBusiness: {
    paddingX: 14,
    paddingY: 6,
    lineWidth: 2,
    lineColor: "#6B7280",
    lineStyle: "straight",
    lineRadius: 6,
    generalizationLineWidth: 2,
    generalizationLineColor: "#6B7280",
    associativeLineTextFontFamily: FONT,
    backgroundColor: "#F7F8FA",
    root: nodeBase("#ffffff", 20, {
      fillColor: "#1E4FA3",
      fontWeight: "bold",
      borderRadius: 4,
      borderWidth: 0,
    }),
    second: nodeBase("#ffffff", 16, {
      fillColor: "#3B7DDD",
      borderWidth: 0,
      borderRadius: 4,
      marginX: 60,
      marginY: 22,
    }),
    node: nodeBase("#1F2937", 14, {
      fillColor: "#E8EEF9",
      borderWidth: 0,
      borderRadius: 4,
      marginX: 36,
      marginY: 8,
    }),
    generalization: nodeBase("#1F2937", 14, {
      fillColor: "#ffffff",
      borderColor: "#6B7280",
      borderWidth: 1,
      borderRadius: 4,
    }),
  },

  xmindDark: {
    paddingX: 14,
    paddingY: 6,
    lineWidth: 2,
    lineColor: "#6B7785",
    lineStyle: "curve",
    rootLineKeepSameInCurve: true,
    generalizationLineWidth: 2,
    generalizationLineColor: "#5B8FF9",
    associativeLineColor: "#8FB4FF",
    associativeLineTextColor: "#C9D1D9",
    associativeLineTextFontFamily: FONT,
    backgroundColor: "#1E2227",
    root: nodeBase("#ffffff", 20, {
      fillColor: "#3E6FD9",
      fontWeight: "bold",
      borderRadius: 12,
      borderWidth: 0,
      shape: "roundedRectangle",
    }),
    second: nodeBase("#E6EDF3", 16, {
      fillColor: "#2B3139",
      borderColor: "#454D58",
      borderWidth: 1,
      borderRadius: 8,
      marginX: 70,
      marginY: 22,
    }),
    node: nodeBase("#C9D1D9", 14, { fillColor: "transparent", borderWidth: 0, marginX: 36, marginY: 8 }),
    generalization: nodeBase("#E6EDF3", 14, {
      fillColor: "#2B3139",
      borderColor: "#5B8FF9",
      borderWidth: 1,
      borderRadius: 6,
    }),
  },

  cloudLine: {
    paddingX: 10,
    paddingY: 5,
    lineWidth: 2,
    lineColor: "#374151",
    lineStyle: "curve",
    rootLineKeepSameInCurve: true,
    nodeUseLineStyle: true,
    generalizationLineWidth: 2,
    generalizationLineColor: "#374151",
    associativeLineColor: "#E8684A",
    associativeLineTextFontFamily: FONT,
    backgroundColor: "#FFFFFF",
    root: nodeBase("#FFFFFF", 20, {
      fillColor: "#111827",
      fontWeight: "bold",
      borderRadius: 6,
      borderWidth: 0,
      shape: "roundedRectangle",
    }),
    second: nodeBase("#111827", 16, {
      fillColor: "transparent",
      borderWidth: 0,
      fontWeight: "bold",
      marginX: 60,
      marginY: 20,
    }),
    node: nodeBase("#374151", 14, { fillColor: "transparent", borderWidth: 0, marginX: 36, marginY: 6 }),
    generalization: nodeBase("#111827", 14, {
      fillColor: "transparent",
      borderColor: "#374151",
      borderWidth: 1,
      borderRadius: 6,
    }),
  },

  cloudMacaron: {
    paddingX: 16,
    paddingY: 7,
    lineWidth: 2.5,
    lineColor: "#FFB3C1",
    lineStyle: "curve",
    rootLineKeepSameInCurve: true,
    generalizationLineWidth: 2,
    generalizationLineColor: "#FF8FA3",
    associativeLineColor: "#9B8CF2",
    associativeLineTextFontFamily: FONT,
    backgroundColor: "#FFF8F5",
    root: nodeBase("#FFFFFF", 20, {
      fillColor: "#FF8FA3",
      fontWeight: "bold",
      borderRadius: 18,
      borderWidth: 0,
      shape: "roundedRectangle",
    }),
    second: nodeBase("#7A3E4B", 16, {
      fillColor: "#FFE3E8",
      borderColor: "#FFB3C1",
      borderWidth: 1.5,
      borderRadius: 16,
      shape: "roundedRectangle",
      marginX: 70,
      marginY: 22,
    }),
    node: nodeBase("#7A3E4B", 14, {
      fillColor: "#FFFFFF",
      borderColor: "#FFD6DD",
      borderWidth: 1.5,
      borderRadius: 12,
      shape: "roundedRectangle",
      marginX: 36,
      marginY: 10,
    }),
    generalization: nodeBase("#7A3E4B", 14, {
      fillColor: "#E9E4FF",
      borderColor: "#9B8CF2",
      borderWidth: 1.5,
      borderRadius: 12,
    }),
  },

  cloudPaper: {
    paddingX: 14,
    paddingY: 6,
    lineWidth: 2,
    lineColor: "#A67C52",
    lineStyle: "straight",
    lineRadius: 6,
    generalizationLineWidth: 2,
    generalizationLineColor: "#A67C52",
    associativeLineColor: "#C0562F",
    associativeLineTextFontFamily: FONT,
    backgroundColor: "#FBF5E6",
    root: nodeBase("#FFF8EC", 20, {
      fillColor: "#8B5E3C",
      fontWeight: "bold",
      borderRadius: 6,
      borderWidth: 0,
    }),
    second: nodeBase("#4A3322", 16, {
      fillColor: "#F1DFC0",
      borderColor: "#A67C52",
      borderWidth: 1.5,
      borderRadius: 4,
      marginX: 64,
      marginY: 22,
    }),
    node: nodeBase("#5A3E2B", 14, { fillColor: "transparent", borderWidth: 0, marginX: 36, marginY: 8 }),
    generalization: nodeBase("#4A3322", 14, {
      fillColor: "#FFF8EC",
      borderColor: "#A67C52",
      borderWidth: 1.5,
      borderRadius: 4,
    }),
  },
};

let defined = false;
export function defineThemes() {
  if (defined) return;
  defined = true;
  for (const [id, cfg] of Object.entries(THEME_CONFIGS)) MindMap.defineTheme(id, cfg);
}

export function themeDef(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === "xmindFresh")!;
}

/* ------------------------------------------------------------ 主题缩略图 */

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = activeDocument.createElementNS(SVG_NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}

const none = (c: any) => (!c || c === "transparent" || c === "none" ? "none" : String(c));

/** 按主题配置画一张小示意图：中心主题、两个二级、四个三级，样式和真实导图一致 */
export function themePreview(id: string): SVGElement {
  const cfg = THEME_CONFIGS[id];
  const svg = el("svg", { viewBox: "0 0 132 84", width: 132, height: 84, class: "cm-theme-svg" });
  if (!cfg) return svg;
  el("rect", { x: 0, y: 0, width: 132, height: 84, rx: 6, fill: cfg.backgroundColor ?? "#fff" }, svg);

  const lineC = cfg.lineColor ?? "#888";
  const lw = Math.min(1.6, (cfg.lineWidth ?? 2) * 0.6);
  const curve = cfg.lineStyle === "curve";
  const link = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    const d = curve ? `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` : `M${x1} ${y1} H${mx} V${y2} H${x2}`;
    el("path", { d, fill: "none", stroke: lineC, "stroke-width": lw, "stroke-linejoin": "round" }, svg);
  };

  const box = (x: number, y: number, w: number, h: number, s: Record<string, any>, textBar: boolean) => {
    const fill = none(s.fillColor);
    const stroke = s.borderWidth > 0 ? none(s.borderColor) : "none";
    const r = Math.min(Math.max(0, Number(s.borderRadius ?? 0)) * 0.5, h / 2);
    if (fill !== "none" || stroke !== "none") {
      el("rect", { x, y, width: w, height: h, rx: r, fill, stroke, "stroke-width": Math.min(1.6, (s.borderWidth ?? 0) * 0.8) }, svg);
    } else if (cfg.nodeUseLineStyle) {
      el("path", { d: `M${x} ${y + h} H${x + w}`, stroke: lineC, "stroke-width": lw, fill: "none" }, svg);
    }
    if (textBar) {
      const bw = w * 0.58;
      el("rect", { x: x + (w - bw) / 2, y: y + h / 2 - 1.1, width: bw, height: 2.2, rx: 1.1, fill: s.color ?? "#555", opacity: 0.75 }, svg);
    }
  };

  const root = cfg.root ?? {};
  const second = cfg.second ?? {};
  const node = cfg.node ?? {};

  // 连线先画，方块盖在上面
  link(38, 42, 56, 22);
  link(38, 42, 56, 62);
  link(86, 22, 100, 14);
  link(86, 22, 100, 29);
  link(86, 62, 100, 55);
  link(86, 62, 100, 70);

  box(10, 32, 28, 20, root, true);
  box(56, 15, 30, 14, second, true);
  box(56, 55, 30, 14, second, true);
  [8, 23, 49, 64].forEach((y) => box(100, y, 26, 12, node, true));
  return svg;
}
export const FILL_COLORS = [
  "#FFFFFF", "#FFE9A8", "#FFD9B8", "#FFC9C2", "#F9CFE0", "#E3D6F5",
  "#D3E2FF", "#CDEFFA", "#C9F0DE", "#F6BD16", "#FF9D4D", "#E8684A",
  "#5B8FF9", "#5AD8A6", "#9270CA", "#2F3B52",
];

/** 文字色 */
export const TEXT_COLORS = [
  "#1F2937", "#6B7280", "#9CA3AF", "#FFFFFF", "#E8684A", "#FF9D4D",
  "#D4A106", "#2FA66F", "#269A99", "#5B8FF9", "#9270CA", "#D6336C",
];

export const LAYOUTS: { id: string; name: string }[] = [
  { id: "mindMap", name: "思维导图（双向）" },
  { id: "logicalStructure", name: "逻辑图（向右）" },
  { id: "logicalStructureLeft", name: "逻辑图（向左）" },
  { id: "organizationStructure", name: "组织结构图" },
  { id: "catalogOrganization", name: "目录组织图" },
  { id: "timeline", name: "时间轴" },
  { id: "verticalTimeline", name: "竖向时间轴" },
  { id: "fishbone", name: "鱼骨图" },
];
