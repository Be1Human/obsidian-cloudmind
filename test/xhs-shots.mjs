// 小红书用的中文截图：只截“窗口”本身（圆角外透明），供 xhs-cards.mjs 排版
// 用法: npm run build:harness && node test/xhs-shots.mjs
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const out = path.join(root, "marketing", "xiaohongshu", "shots");
mkdirSync(out, { recursive: true });
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const css = readFileSync(path.join(root, "styles.css"), "utf8");

const LIGHT = `--background-primary:#ffffff;--background-secondary:#f6f6f6;--background-modifier-border:#e0e0e0;--background-modifier-border-hover:#cfcfcf;--background-modifier-hover:rgba(0,0,0,.06);--text-normal:#222222;--text-muted:#5c5c5c;--text-faint:#ababab;--interactive-accent:#7852ee;--interactive-accent-hover:#6a45dd;--text-on-accent:#ffffff;--text-accent:#7852ee;--text-success:#1e9e63;--text-warning:#d98e04;--link-color:#5b4bd6;`;
const DARK = `--background-primary:#1e1e1e;--background-secondary:#262626;--background-modifier-border:#3a3a3a;--background-modifier-border-hover:#4a4a4a;--background-modifier-hover:rgba(255,255,255,.08);--text-normal:#dadada;--text-muted:#b3b3b3;--text-faint:#6f6f6f;--interactive-accent:#8a6cf5;--interactive-accent-hover:#9a80f7;--text-on-accent:#ffffff;--text-accent:#a995f9;--text-success:#4cc38a;--text-warning:#e0a63a;--link-color:#a995f9;`;

function html(W, H, dark, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:"Microsoft YaHei","PingFang SC",-apple-system,"Segoe UI",sans-serif;font-size:14px}
body{${dark ? DARK : LIGHT}}
#frame{position:absolute;inset:0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:var(--background-primary);color:var(--text-normal)}
#bar{flex:0 0 36px;display:flex;align-items:center;gap:8px;padding:0 14px;background:var(--background-secondary);border-bottom:1px solid var(--background-modifier-border)}
#bar i{width:12px;height:12px;border-radius:50%;display:block}
#bar .t{margin-left:14px;padding:5px 14px;border-radius:7px 7px 0 0;background:var(--background-primary);font-size:12.5px;color:var(--text-normal);position:relative;top:4px;border:1px solid var(--background-modifier-border);border-bottom:none}
#host{flex:1;min-height:0;display:flex;flex-direction:column}
#host>div{flex:1;display:flex;flex-direction:column;min-height:0}
${css}
</style></head><body class="${dark ? "theme-dark" : "theme-light"}"><div id="frame"><div id="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span class="t">${title}</span></div><div id="host"></div></div><script src="harness.js"></script></body></html>`;
}

const FILES = ["每日复盘模板", "读书清单 2026", "原子习惯-摘抄", "晨间日记", "项目周报", "习惯打卡表"];

export const BOOK = `---
cloudmind: true
---
# 读书笔记：原子习惯
## 核心观点
- 每天进步 1%
- 系统比目标更重要
## 四大定律
### 让它显而易见
- 习惯叠加
- 环境设计
### 让它有吸引力
### 让它简便易行
- 两分钟法则
### 让它令人愉悦
## 我的行动 <!--mm:{"fillColor":"#FFE9A8"}-->
- 起床后读书 10 分钟
- 睡前复盘
  - 用 [[每日复盘模板]]
## 金句 <!--mm:{"fillColor":"#D3E2FF"}-->
- 你不会达到目标的高度
- 只会跌到系统的水平
`;

// 第 2 张卡片：左边源码、下边导图，用一段更短的笔记，保证两边都看得清
export const SMALL = `---
cloudmind: true
---
# 周末计划
## 学习
- 读完《原子习惯》
- 整理 [[读书清单 2026]]
## 运动 <!--mm:{"fillColor":"#C9F0DE"}-->
- 跑步 5 公里
## 生活
- 大扫除
- 买菜做饭
`;

const browser = await chromium.launch({ executablePath: exe, headless: true });

async function open(name, { W = 1200, H = 760, dark = false, theme, layout, settings = {}, md = BOOK, title = "读书笔记：原子习惯", pad = 60 } = {}) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const htmlPath = path.join(dir, `.xhs-${name}.html`);
  writeFileSync(htmlPath, html(W, H, dark, title));
  await page.goto("file:///" + htmlPath.replace(/\\/g, "/"));
  await page.evaluate((f) => {
    window.__files = f.map((n, i) => ({ path: `笔记/${n}.md`, basename: n, extension: "md", parent: { path: "笔记" }, stat: { mtime: 1000 - i } }));
  }, FILES);
  const head = `---\ncloudmind: true\n${theme ? `cloudmind-theme: ${theme}\n` : ""}${layout ? `cloudmind-layout: ${layout}\n` : ""}---\n`;
  const text = md.replace(/^---\ncloudmind: true\n---\n/, head);
  await page.evaluate(([t, s]) => window.boot(t, s), [text, settings]);
  await page.waitForFunction(() => window.hasMM());
  await page.waitForTimeout(900);
  await page.evaluate((p) => window.mm().view.fit(undefined, true, p), pad);
  await page.waitForTimeout(500);
  return page;
}

const select = (page, text) =>
  page.evaluate((t) => {
    let f = null;
    const walk = (n) => {
      if (n.getData("text") === t) f = n;
      n.children.forEach(walk);
    };
    walk(window.mm().renderer.root);
    window.mm().execCommand("CLEAR_ACTIVE_NODE");
    if (f) f.active();
  }, text);

const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.locator("#frame").screenshot({ path: path.join(out, name + ".png"), omitBackground: true });
  console.log("saved", name + ".png");
  await page.close();
};

// 封面：方块·彩色，选中中心主题（快捷条在最上方，不挡东西）
{
  const p = await open("cover", { theme: "cloudBoxColor", layout: "logicalStructure", W: 1000, H: 800, pad: 26 });
  await p.evaluate(() => window.mm().execCommand("CLEAR_ACTIVE_NODE"));
  await shot(p, "cover");
}
// 源码 ↔ 导图：逻辑图、清新，不选中，干净
{
  const p = await open("small", { md: SMALL, theme: "cloudBoxColor", layout: "logicalStructure", title: "周末计划", W: 1200, H: 640, pad: 50, settings: { showStatus: false } });
  await p.evaluate(() => window.mm().execCommand("CLEAR_ACTIVE_NODE"));
  await shot(p, "small-map");
}
// 编辑：选中一个子节点，展示快捷条
{
  const p = await open("edit", { theme: "xmindFresh", layout: "logicalStructure", W: 1000, H: 760, pad: 30 });
  await select(p, "四大定律");
  await shot(p, "edit");
}
// 双链：编辑节点时输入 [[
{
  const p = await open("wiki", { theme: "xmindFresh", layout: "logicalStructure", W: 940, H: 800, pad: 26 });
  await select(p, "睡前复盘");
  await p.keyboard.press("F2");
  await p.waitForTimeout(300);
  await p.keyboard.press("End");
  await p.keyboard.type("，参考 [[");
  await p.waitForTimeout(600);
  await shot(p, "wiki");
}
// 主题面板
{
  const p = await open("themes", { theme: "cloudBox", layout: "logicalStructure", W: 1200, H: 860 });
  await p.evaluate(() => {
    window.mm().execCommand("CLEAR_ACTIVE_NODE");
    window.mm().view.translateXY(-90, 0);
  });
  await p.click('.cm-toolbar [data-id="theme"]');
  await p.waitForTimeout(500);
  await shot(p, "themes");
}
// 四种方块主题 + 其它风格的小图
for (const [id, dark] of [["cloudBox", false], ["cloudBoxDark", true], ["cloudBoxBlue", false], ["cloudMacaron", false]]) {
  const p = await open("t-" + id, { theme: id, dark, layout: "mindMap", W: 1000, H: 640, pad: 40, settings: { showStatus: false } });
  await p.evaluate(() => window.mm().execCommand("CLEAR_ACTIVE_NODE"));
  await shot(p, "theme-" + id);
}
// 悬浮工具栏（带文字）
{
  const p = await open("float", { theme: "cloudPaper", layout: "logicalStructure", W: 1200, H: 820, settings: { toolbarPos: "float", floatPos: { x: 120, y: 18 } } });
  await select(p, "我的行动");
  await shot(p, "float");
}
// 深色 + 左侧竖排工具栏
{
  const p = await open("dark", { dark: true, theme: "cloudBoxDark", layout: "logicalStructure", W: 1200, H: 820, settings: { toolbarPos: "left", toolbarSize: "compact" } });
  await p.evaluate(() => window.mm().execCommand("CLEAR_ACTIVE_NODE"));
  await shot(p, "dark-left");
}

await browser.close();
console.log("done");
