// 主题测试：面板 / 缩略图 / 方块系列每个节点都有边框 / 保存 / 切换布局 / 往返
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const sample = `---
cloudmind: true
---
# 根主题
## 分支一
### 子主题 A
- 叶子 1
  - 更深的叶子
- 叶子 2
### 子主题 B
## 分支二
- 叶子 3
- 叶子 4
## 分支三
### 子主题 C
`;

let failed = 0;
const ok = (n, c, x = "") => {
  console.log(c ? "PASS" : "FAIL", n, c ? "" : x);
  if (!c) failed++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
await page.evaluate((t) => window.boot(t), sample);
await page.waitForFunction(() => window.hasMM());
await page.waitForTimeout(700);

const settleTheme = () => page.waitForTimeout(500);

/** 遍历每个节点，检查渲染出来的 SVG 里它的外框 */
const boxReport = () =>
  page.evaluate(() => {
    const out = [];
    const walk = (n, depth) => {
      const shape = n.group && n.group.find(".smm-node-shape")[0];
      const node = shape && shape.node;
      const cs = node ? getComputedStyle(node) : null;
      out.push({
        text: n.getData("text"),
        depth,
        bw: n.getStyle("borderWidth"),
        bc: n.getStyle("borderColor"),
        stroke: node ? node.getAttribute("stroke") : null,
        strokeW: node ? parseFloat(node.getAttribute("stroke-width") || "0") : 0,
        radius: n.getStyle("borderRadius"),
        shape: n.getStyle("shape"),
      });
      n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(window.mm().renderer.root, 0);
    return out;
  });

const isVisibleColor = (c) => c && c !== "none" && c !== "transparent" && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(c);

// ---------- 1. 主题面板 ----------
await page.click('.cm-toolbar [data-id="theme"]');
await page.waitForTimeout(250);
const cards = await page.locator(".cm-theme-card").count();
ok("theme gallery opens with all 10 themes", cards === 10, String(cards));
ok("each card has a preview thumbnail", (await page.locator(".cm-theme-card svg").count()) === 10);
ok("box themes are grouped first (4 cards)", await page.evaluate(() => {
  const grids = document.querySelectorAll(".cm-theme-grid");
  return grids.length === 2 && grids[0].children.length === 4 && grids[1].children.length === 6;
}));
ok("current theme is marked", (await page.locator(".cm-theme-card.is-current").count()) === 1);
ok("gallery stays inside the viewport", await page.evaluate(() => {
  const r = document.querySelector(".cm-popover").getBoundingClientRect();
  return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
}));
// 缩略图里方块主题：每个节点位置都画了带描边的矩形
const thumbs = await page.evaluate(() => {
  const res = {};
  document.querySelectorAll(".cm-theme-card").forEach((c) => {
    const rects = [...c.querySelectorAll("svg > rect")].filter((r) => r.getAttribute("width") !== "132");
    const boxes = rects.filter((r) => r.getAttribute("stroke") && r.getAttribute("stroke") !== "none" && r.getAttribute("height") !== "2.2");
    res[c.dataset.theme] = boxes.length;
  });
  return res;
});
ok("box thumbnails draw a bordered box for all 7 nodes", ["cloudBox", "cloudBoxColor", "cloudBoxDark", "cloudBoxBlue"].every((t) => thumbs[t] === 7), JSON.stringify(thumbs));
ok("classic fresh thumbnail does NOT box the leaf nodes", thumbs.xmindFresh < 7, JSON.stringify(thumbs));
await page.screenshot({ path: path.join(dir, "theme-gallery.png") });

// ---------- 2. 选“方块”：每个节点都有可见边框 ----------
await page.click('.cm-theme-card[data-theme="cloudBox"]');
await settleTheme();
ok("gallery closes after picking", (await page.locator(".cm-popover").count()) === 0);
ok("map switched to cloudBox", (await page.evaluate(() => window.mm().getTheme())) === "cloudBox");
let rep = await boxReport();
const unboxed = rep.filter((r) => !(r.bw > 0 && isVisibleColor(r.bc)));
ok(`cloudBox: every node (${rep.length}) has a border in the style`, unboxed.length === 0, JSON.stringify(unboxed));
const noStroke = rep.filter((r) => !isVisibleColor(r.stroke) || !(r.strokeW > 0));
ok("cloudBox: every rendered node shape really has a stroke", noStroke.length === 0, JSON.stringify(noStroke.slice(0, 4)));
ok("cloudBox: all boxes are square-cornered rectangles", rep.every((r) => r.radius === 0 && r.shape === "rectangle"), JSON.stringify(rep.filter((r) => r.radius !== 0).slice(0, 3)));
ok("cloudBox covers all depths 0..4", [0, 1, 2, 3, 4].every((d) => rep.some((r) => r.depth === d)));
await page.screenshot({ path: path.join(dir, "theme-box.png") });

// ---------- 3. 其它方块变体也都是每个节点有边框 ----------
for (const id of ["cloudBoxColor", "cloudBoxDark", "cloudBoxBlue"]) {
  await page.evaluate((id) => window.__view.applyTheme(id), id);
  await settleTheme();
  rep = await boxReport();
  const bad = rep.filter((r) => !(r.bw > 0 && isVisibleColor(r.bc)) || !isVisibleColor(r.stroke));
  ok(`${id}: every node is boxed`, bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  await page.screenshot({ path: path.join(dir, `theme-${id}.png`) });
}

// ---------- 4. 对照：经典“清新”的叶子节点没有框（说明上面的检查是有区分力的）----------
await page.evaluate(() => window.__view.applyTheme("xmindFresh"));
await settleTheme();
rep = await boxReport();
ok("control: xmindFresh leaf nodes have no border", rep.filter((r) => r.depth >= 3).every((r) => !(r.bw > 0)), JSON.stringify(rep.filter((r) => r.depth >= 3 && r.bw > 0)));

// ---------- 5. 保存到 md、重新载入还是这个主题 ----------
await page.evaluate(() => window.__view.applyTheme("cloudBox"));
await settleTheme();
const md = await page.evaluate(() => window.getText());
ok("theme saved in frontmatter (cloudmind-theme)", /cloudmind-theme: cloudBox/.test(md), md.slice(0, 120));
ok("box theme turns rainbow lines off in frontmatter", /cloudmind-rainbow: false/.test(md), md.slice(0, 160));
ok("body of the note unchanged by theme switching", md.includes("## 分支一") && md.includes("- 叶子 1"));
await page.evaluate((t) => window.__view.setViewData(t + "\n", true), md);
await page.waitForTimeout(700);
ok("reloading the note keeps the box theme", (await page.evaluate(() => window.mm().getTheme())) === "cloudBox");

// ---------- 6. 切换结构：方块主题在各种布局下仍然每个节点有框 ----------
for (const l of ["logicalStructure", "organizationStructure", "catalogOrganization", "mindMap"]) {
  await page.evaluate((l) => window.mm().setLayout(l), l);
  await page.waitForTimeout(450);
  rep = await boxReport();
  const bad = rep.filter((r) => !isVisibleColor(r.stroke) || !(r.strokeW > 0));
  ok(`cloudBox in layout ${l}: all ${rep.length} nodes boxed`, bad.length === 0, JSON.stringify(bad.slice(0, 3)));
}
await page.evaluate(() => window.mm().setLayout("logicalStructure"));
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(dir, "theme-box-logical.png") });

// ---------- 7. 新增节点自动带框 ----------
await page.evaluate(() => window.mm().renderer.root.children[0].active());
await page.waitForTimeout(200);
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
await page.keyboard.type("新节点");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
rep = await boxReport();
const added = rep.find((r) => r.text === "新节点");
ok("a node added later is boxed too", added && added.bw > 0 && isVisibleColor(added.stroke), JSON.stringify(added));

// ---------- 8. 单节点自定义颜色仍可覆盖主题 ----------
await page.evaluate(() => window.mm().renderer.root.children[1].active());
await page.waitForTimeout(200);
await page.click('.cm-toolbar [data-id="fill"]');
await page.waitForTimeout(200);
await page.click('.cm-popover .cm-swatch[data-color="#FFE9A8"]');
await page.waitForTimeout(400);
ok("per-node fill still works on top of a box theme", /"fillColor":"#FFE9A8"/.test(await page.evaluate(() => window.getText())));

// ---------- 9. 跟随 Obsidian 明暗 ----------
await page.click('.cm-toolbar [data-id="theme"]');
await page.waitForTimeout(250);
await page.click('.cm-pop-reset[data-theme="__auto"]');
await settleTheme();
ok("'follow Obsidian' resets to the auto theme", (await page.evaluate(() => window.mm().getTheme())) === "xmindFresh");
const md2 = await page.evaluate(() => window.getText());
ok("'follow Obsidian' removes theme keys from frontmatter", !/cloudmind-theme/.test(md2) && !/cloudmind-rainbow/.test(md2), md2.slice(0, 120));

// ---------- 10. 状态栏的“主题：”也能打开面板，并显示当前主题名 ----------
await page.evaluate(() => window.__view.applyTheme("cloudBoxBlue"));
await settleTheme();
ok("status bar shows current theme name", /方块·蓝图/.test(await page.evaluate(() => document.querySelector(".cm-status").textContent)));
await page.click('.cm-status .cm-seg[aria-label="点击切换主题"]');
await page.waitForTimeout(250);
ok("status-bar theme segment opens the gallery", (await page.locator(".cm-theme-card").count()) === 10);
ok("gallery flips above the status bar and stays in view", await page.evaluate(() => {
  const r = document.querySelector(".cm-popover").getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight;
}));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok("Esc closes the gallery", (await page.locator(".cm-popover").count()) === 0);

// ---------- 11. 深色主题：快捷条/工具栏不受影响，没有页面错误 ----------
console.log("page errors:", errors.length ? errors : "none");
ok("no page errors", errors.length === 0);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nTHEME PASSED");
process.exit(failed ? 1 : 0);
