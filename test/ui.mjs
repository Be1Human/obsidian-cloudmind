// CloudMind 界面测试：工具栏停靠 / 悬浮拖动 / 隐藏、节点快捷条、状态栏、颜色弹层、按钮状态
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const sample = `---
cloudmind: true
---
# Agent 研发
## 系统设计
### 核心循环
- 感知
- 规划
## 评测
- 离线
## 工程化
- 排障
`;

let failed = 0;
const ok = (n, c, x = "") => {
  console.log(c ? "PASS" : "FAIL", n, c ? "" : x);
  if (!c) failed++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
await page.evaluate((t) => window.boot(t), sample);
await page.waitForFunction(() => window.hasMM());
await page.waitForTimeout(700);

const rect = (sel) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, parent: e.parentElement.className };
  }, sel);
const settings = (patch) => page.evaluate((p) => window.__plugin.updateSettings(p), patch);
const text = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent, sel);
const renders = () => page.evaluate(() => window.__renders);

await page.evaluate(() => {
  window.__renders = 0;
  window.mm().on("node_tree_render_end", () => window.__renders++);
});

// ---------- 1. 默认：顶部工具栏 + 底部状态栏 ----------
let tb = await rect(".cm-toolbar");
let stage = await rect(".cm-stage");
let st = await rect(".cm-status");
ok("default: toolbar on top, above stage", tb && tb.y < stage.y && tb.w > 500, JSON.stringify([tb, stage]));
ok("default: status bar at bottom", st && st.y > stage.y + stage.h - 1, JSON.stringify([st, stage]));
await page.screenshot({ path: path.join(dir, "ui-top.png") });

// ---------- 2. 各停靠位置 ----------
for (const [pos, check] of [
  ["bottom", (t, s) => t.y > s.y + s.h - 2],
  ["left", (t, s) => t.x + t.w <= s.x + 2 && t.h > 300],
  ["right", (t, s) => t.x >= s.x + s.w - 2 && t.h > 300],
]) {
  await settings({ toolbarPos: pos });
  await page.waitForTimeout(350);
  tb = await rect(".cm-toolbar");
  stage = await rect(".cm-stage");
  ok(`dock ${pos}: toolbar placed correctly`, check(tb, stage), JSON.stringify([tb, stage]));
  ok(`dock ${pos}: stage keeps a sane size`, stage.w > 600 && stage.h > 400, JSON.stringify(stage));
  await page.screenshot({ path: path.join(dir, `ui-${pos}.png`) });
}
// 竖排时按钮不能被截断：工具栏内容都在可见区域内（允许滚动）
await settings({ toolbarPos: "left" });
await page.waitForTimeout(300);
ok("left dock: buttons stacked vertically", await page.evaluate(() => {
  const b = [...document.querySelectorAll(".cm-toolbar .cm-btn")];
  return b[1].getBoundingClientRect().y > b[0].getBoundingClientRect().y + 10;
}));

// ---------- 3. 悬浮 + 拖动 + 记住位置 ----------
await settings({ toolbarPos: "float", floatPos: null });
await page.waitForTimeout(400);
tb = await rect(".cm-toolbar");
stage = await rect(".cm-stage");
ok("float: toolbar lives inside the stage", tb.parent.includes("cm-stage"), tb.parent);
ok("float: default is top-center", Math.abs(tb.x + tb.w / 2 - (stage.x + stage.w / 2)) < 20 && tb.y - stage.y < 30, JSON.stringify([tb, stage]));
ok("float: overlays canvas (stage not shrunk)", stage.h > 600, String(stage.h));
await page.screenshot({ path: path.join(dir, "ui-float.png") });

const grip = await rect(".cm-grip");
await page.mouse.move(grip.x + grip.w / 2, grip.y + grip.h / 2);
await page.mouse.down();
await page.mouse.move(grip.x + 80, grip.y + 260, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const moved = await rect(".cm-toolbar");
ok("float: dragging moves the toolbar", moved.x > tb.x + 50 && moved.y > tb.y + 200, JSON.stringify([tb, moved]));
const savedPos = await page.evaluate(() => window.__plugin.settings.floatPos);
ok("float: position saved to settings", savedPos && Math.abs(savedPos.x - (moved.x - stage.x)) < 3, JSON.stringify(savedPos));
// 拖到画布外要被夹回来
await page.mouse.move(moved.x + 12, moved.y + 14);
await page.mouse.down();
await page.mouse.move(5000, 5000, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(300);
const clamped = await rect(".cm-toolbar");
ok("float: dragged outside is clamped inside stage", clamped.x + clamped.w <= stage.x + stage.w + 1 && clamped.y + clamped.h <= stage.y + stage.h + 1, JSON.stringify([clamped, stage]));
// 双击抓手复位
const g2 = await rect(".cm-grip");
await page.mouse.dblclick(g2.x + g2.w / 2, g2.y + g2.h / 2);
await page.waitForTimeout(400);
const reset = await rect(".cm-toolbar");
ok("float: double-click grip resets to top-center", reset.y - stage.y < 30 && Math.abs(reset.x + reset.w / 2 - (stage.x + stage.w / 2)) < 20, JSON.stringify(reset));

// ---------- 4. 隐藏 + 一键恢复 ----------
await settings({ toolbarPos: "hidden", lastDock: "top" });
await page.waitForTimeout(300);
ok("hidden: toolbar not displayed", (await page.evaluate(() => getComputedStyle(document.querySelector(".cm-toolbar")).display)) === "none");
ok("hidden: restore button visible", (await page.evaluate(() => getComputedStyle(document.querySelector(".cm-fab")).display)) !== "none");
await page.click(".cm-fab-btn");
await page.waitForTimeout(350);
ok("hidden: clicking restore brings the toolbar back", (await page.evaluate(() => window.__plugin.settings.toolbarPos)) === "top");
ok("restored toolbar visible", (await rect(".cm-toolbar")).w > 500);

// ---------- 5. 切换位置不应重绘导图 ----------
await page.waitForTimeout(500);
const before = await renders();
await settings({ toolbarPos: "bottom" });
await page.waitForTimeout(500);
await settings({ toolbarPos: "top" });
await page.waitForTimeout(500);
const delta = (await renders()) - before;
ok("moving the toolbar re-renders map at most twice", delta <= 2, String(delta));

// ---------- 6. 按钮可用状态：未选中时需要选中的按钮是灰的 ----------
const dis = () =>
  page.evaluate(() => ({
    fill: document.querySelector('.cm-toolbar [data-id="fill"]').disabled,
    note: document.querySelector('.cm-toolbar [data-id="note"]').disabled,
    child: document.querySelector('.cm-toolbar [data-id="child"]').disabled,
    undo: document.querySelector('.cm-toolbar [data-id="undo"]').disabled,
  }));
let d = await dis();
ok("nothing selected: style/note buttons disabled, add-child enabled", d.fill && d.note && !d.child, JSON.stringify(d));
ok("fresh map: undo disabled", d.undo);

// ---------- 7. 选中节点：快捷条出现在节点上方、状态栏更新、按钮可用 ----------
await page.evaluate(() => window.mm().renderer.root.children[0].active());
await page.waitForTimeout(400);
d = await dis();
ok("selected: buttons enabled", !d.fill && !d.note, JSON.stringify(d));
const nb = await rect(".cm-nodebar.is-show");
ok("selected: node quick bar shown", !!nb && nb.w > 150, JSON.stringify(nb));
const nodeRect = await page.evaluate(() => {
  const n = window.mm().renderer.activeNodeList[0];
  const r = n.getRectInSvg();
  const c = document.querySelector(".cm-canvas").getBoundingClientRect();
  return { x: c.x + r.left, y: c.y + r.top, w: r.width, h: r.height };
});
ok("quick bar sits above the node and is centered on it", nb.y + nb.h <= nodeRect.y + 2 && Math.abs(nb.x + nb.w / 2 - (nodeRect.x + nodeRect.w / 2)) < 40, JSON.stringify([nb, nodeRect]));
const selTxt = await text(".cm-seg-sel");
ok("status shows selection info", /系统设计/.test(selTxt) && /子主题/.test(selTxt), selTxt);
const cntText = async () => await text('.cm-status .cm-seg[aria-label="节点总数"]');
ok("status counts nodes (9)", parseInt(await cntText()) === 9, await cntText());
ok("status hint for selected node", /Tab 子主题/.test(await text(".cm-seg-hint")), await text(".cm-seg-hint"));
await page.screenshot({ path: path.join(dir, "ui-selected.png") });

// ---------- 8. 颜色弹层：选色 → 节点样式改变 → 写进 md ----------
await page.click('.cm-toolbar [data-id="fill"]');
await page.waitForTimeout(250);
ok("fill popover opens", (await page.locator(".cm-popover .cm-swatch").count()) >= 12);
ok("popover is within viewport", await page.evaluate(() => {
  const r = document.querySelector(".cm-popover").getBoundingClientRect();
  return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
}));
await page.screenshot({ path: path.join(dir, "ui-popover.png") });
await page.click('.cm-popover .cm-swatch[data-color="#C9F0DE"]');
await page.waitForTimeout(500);
ok("popover closes after picking", (await page.locator(".cm-popover").count()) === 0);
const md1 = await page.evaluate(() => window.getText());
ok("fill color saved into md meta", /"fillColor":"#C9F0DE"/.test(md1), md1);
ok("selection preserved after toolbar click", (await page.evaluate(() => window.mm().renderer.activeNodeList.length)) === 1);
ok("swatch bar shows the node's color", (await page.evaluate(() => getComputedStyle(document.querySelector('.cm-toolbar [data-id="fill"]')).getPropertyValue("--cm-swatch").trim().toLowerCase())) === "#c9f0de");
// 弹层：再点按钮收起 / Esc 收起 / 点外面收起
await page.click('.cm-toolbar [data-id="textColor"]');
await page.waitForTimeout(150);
await page.click('.cm-toolbar [data-id="textColor"]');
await page.waitForTimeout(150);
ok("popover toggles closed on second click", (await page.locator(".cm-popover").count()) === 0);
await page.click('.cm-toolbar [data-id="textColor"]');
await page.waitForTimeout(150);
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
ok("popover closes on Escape", (await page.locator(".cm-popover").count()) === 0);

// ---------- 9. 加粗：按钮高亮 + Ctrl+B ----------
await page.click('.cm-toolbar [data-id="bold"]');
await page.waitForTimeout(400);
ok("bold applied and button highlighted", (await page.evaluate(() => document.querySelector('.cm-toolbar [data-id="bold"]').classList.contains("is-active"))));
await page.keyboard.press("Control+b");
await page.waitForTimeout(400);
ok("Ctrl+B toggles bold off", !(await page.evaluate(() => document.querySelector('.cm-toolbar [data-id="bold"]').classList.contains("is-active"))));

// ---------- 10. 工具栏加子主题 → 自动进入编辑 → 状态栏提示 → 快捷条隐藏 ----------
await page.click('.cm-toolbar [data-id="child"]');
await page.waitForTimeout(500);
ok("child added via toolbar enters text edit", await page.evaluate(() => window.mm().renderer.textEdit.isShowTextEdit()));
ok("status hint switches to editing", /Enter 完成/.test(await text(".cm-seg-hint")), await text(".cm-seg-hint"));
ok("quick bar hidden while editing", (await page.locator(".cm-nodebar.is-show").count()) === 0);
await page.keyboard.type("新子主题");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
ok("typed text kept (focus not stolen by toolbar)", /新子主题/.test(await page.evaluate(() => window.getText())));
ok("node count increased to 10", parseInt(await cntText()) === 10, await cntText());

// ---------- 11. 保存状态：未保存 → 已保存 ----------
ok("status: unsaved after edit", /未保存/.test(await text(".cm-seg-save")), await text(".cm-seg-save"));
await page.click(".cm-seg-save");
await page.waitForTimeout(400);
ok("status: saved after clicking it", /已保存 \d\d:\d\d:\d\d/.test(await text(".cm-seg-save")), await text(".cm-seg-save"));
ok("click-to-save really flushed", (await page.evaluate(() => window.__flushes || 0)) >= 1);

// ---------- 12. 状态栏开关 / 快捷条开关 / 文字标签 ----------
await settings({ showStatus: false });
await page.waitForTimeout(200);
ok("status bar can be hidden", (await page.evaluate(() => getComputedStyle(document.querySelector(".cm-status")).display)) === "none");
await settings({ showStatus: true, showNodeBar: false });
await page.evaluate(() => window.mm().renderer.root.children[1].active());
await page.waitForTimeout(400);
ok("quick bar can be turned off", (await page.locator(".cm-nodebar.is-show").count()) === 0);
await settings({ showNodeBar: true, toolbarLabels: true });
await page.waitForTimeout(300);
ok("labels option shows button text", (await page.evaluate(() => getComputedStyle(document.querySelector('.cm-toolbar [data-id="child"] .cm-lbl')).display)) !== "none");
await page.screenshot({ path: path.join(dir, "ui-labels.png") });
await settings({ toolbarLabels: false });

// ---------- 13. 工具栏设置菜单 ----------
await page.evaluate(() => document.querySelector('.cm-toolbar [data-id="more"]').click());
const menuTitles = await page.evaluate(() => window.__menu.items.map((i) => i.title));
ok("settings menu lists positions", ["顶部", "底部", "左侧", "右侧", "悬浮（可拖动）", "隐藏"].every((t) => menuTitles.includes(t)), JSON.stringify(menuTitles));
ok("settings menu has more settings entry", menuTitles.includes("更多设置…"));

// ---------- 14. 空导图提示 ----------
await page.evaluate((t) => window.__view.setViewData(t, true), "---\ncloudmind: true\n---\n# 只有根\n");
await page.waitForTimeout(500);
ok("empty map shows hint", await page.evaluate(() => document.querySelector(".cm-empty").classList.contains("is-show")));

// ---------- 15. 快捷条会避开其它节点 ----------
{
  await page.evaluate((t) => window.__view.setViewData(t, true), `---
cloudmind: true
---
# 中心
## 甲
- 甲一
- 甲二
- 甲三
## 乙
- 乙一
- 乙二
## 丙
- 丙一
`);
  await page.waitForTimeout(800);
  const overlapAll = async () => {
    return page.evaluate(() => {
      const bar = document.querySelector(".cm-nodebar.is-show");
      if (!bar) return { shown: false };
      const b = bar.getBoundingClientRect();
      const c = document.querySelector(".cm-canvas").getBoundingClientRect();
      const sel = window.mm().renderer.activeNodeList[0];
      let worst = 0, hit = null;
      const walk = (n) => {
        if (n !== sel) {
          const r = n.getRectInSvg();
          const L = c.left + r.left, T = c.top + r.top;
          const w = Math.min(b.right, L + r.width) - Math.max(b.left, L);
          const h = Math.min(b.bottom, T + r.height) - Math.max(b.top, T);
          if (w > 0 && h > 0 && w * h > worst) { worst = w * h; hit = n.getData("text"); }
        }
        n.children.forEach(walk);
      };
      walk(window.mm().renderer.root);
      return { shown: true, worst, hit };
    });
  };
  const names = ["中心", "甲", "乙", "丙", "甲一", "甲二", "甲三", "乙一", "乙二", "丙一"];
  const measure = async () => {
    let n = 0, area = 0;
    for (const nm of names) {
      await page.evaluate((nm) => {
        let f = null;
        const walk = (x) => { if (x.getData("text") === nm) f = x; x.children.forEach(walk); };
        walk(window.mm().renderer.root);
        window.mm().execCommand("CLEAR_ACTIVE_NODE");
        f.active();
      }, nm);
      await page.waitForTimeout(180);
      const o = await overlapAll();
      if (o.shown && o.worst > 0) { n++; area += o.worst; }
    }
    return { n, area };
  };
  const avoid = await measure();
  await page.evaluate(() => { window.__realRects = window.__view.otherNodeRects; window.__view.otherNodeRects = () => null; });
  const fixed = await measure(); // 旧做法：固定放在节点上方
  await page.evaluate(() => { window.__view.otherNodeRects = window.__realRects; });
  console.log(`  quick bar overlap: avoiding ${avoid.n}/10 (${avoid.area}px²)  vs fixed-above ${fixed.n}/10 (${fixed.area}px²)`);
  ok("quick bar overlaps fewer nodes than always-above", avoid.n < fixed.n, JSON.stringify({ avoid, fixed }));
  ok("quick bar covers at least 50% less node area than always-above", avoid.area <= fixed.area * 0.5, JSON.stringify({ avoid, fixed }));  await page.screenshot({ path: path.join(dir, "ui-nodebar-avoid.png") });
}
console.log("page errors:", errors.length ? errors : "none");
ok("no page errors", errors.length === 0);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nUI PASSED");
process.exit(failed ? 1 : 0);
