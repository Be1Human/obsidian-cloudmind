/**
 * 节点文字颜色自动对比。
 *
 * 问题：主题给文字配的颜色是按“主题自己的底色”选的（深色主题里是白字）。
 * 用户给某个节点手动填了浅色（比如淡黄），文字还是白色，浅底白字几乎看不见。
 * 做法：节点自己没指定文字色、但自己指定了填充色时，如果主题文字色和这个填充色对比度不够，
 * 自动换成黑 / 白中对比度更高的那个。只影响显示，不写进笔记。
 */

type RGB = [number, number, number];

export function parseColor(input: unknown): RGB | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s || s === "transparent" || s === "none") return null;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as RGB;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as RGB;
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)(?:[ ,/]+([\d.]+))?\s*\)$/.exec(s);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) < 0.5) return null; // 基本透明，看不出底色
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return null;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = "#1F2937";
const LIGHT_TEXT = "#FFFFFF";

/**
 * 返回应该使用的文字色；当前文字色已经够清楚（对比度 >= 4）就返回 null，表示不用改。
 */
export function readableTextOn(fill: unknown, current: unknown): string | null {
  const bg = parseColor(fill);
  if (!bg) return null;
  const fg = parseColor(current);
  if (fg && contrastRatio(fg, bg) >= 4) return null;
  const dark = parseColor(DARK_TEXT)!;
  const light = parseColor(LIGHT_TEXT)!;
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? DARK_TEXT : LIGHT_TEXT;
}
