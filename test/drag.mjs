// 拖拽换位置的灵敏度测试：用真实鼠标事件拖动，统计落点是否符合预期
// 用法：node test/drag.mjs          （新规则）
//       node test/drag.mjs legacy   （修复前的库规则，用来对比）
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const LEGACY = process.argv[2] === "legacy";

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra);
  if (!cond) failed++;
};

const MD = (layout) => `---\ncloudmind: true\ncloudmind-layout: ${layout}\n---\n# 根\n## 甲\n## 乙\n## 丙\n## 丁\n## 戊\n`;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
if (LEGACY) await page.evaluate(() => (window.__CM_DRAG_LEGACY = true));

const rectOf = (t) =>
  page.evaluate((t) => {
    let f;
    const w = (x) => {
      if (x.getData("text") === t) f = x;
      x.children.forEach(w);
    };
    w(window.mm().renderer.root);
    const r = f.getRectInSvg();
    const c = document.querySelector(".cm-canvas").getBoundingClientRect();
    return { left: c.left + r.left, top: c.top + r.top, width: r.width, height: r.height };
  }, t);
const tree = () =>
  page.evaluate(() => {
    const s = (n) => n.getData("text") + (n.children.length ? "(" + n.children.map(s).join(",") + ")" : "");
    return s(window.mm().renderer.root);
  });

async function drag(from, to, { steps = 14, hold = 0 } = {}) {
  const a = await rectOf(from);
  await page.mouse.move(a.left + a.width / 2, a.top + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.up(); // 不等待：模拟拖到位立刻松手
  await page.waitForTimeout(500);
}

const results = [];
for (const layout of ["logicalStructure", "mindMap"]) {
  // 每个用例：把“戊”拖到“乙”附近的某个位置
  const cases = [
    { name: "乙的上部 → 插到乙上面", at: (r) => ({ x: r.left + r.width / 2, y: r.top + r.height * 0.15 }), want: "before" },
    { name: "乙的下部 → 插到乙下面", at: (r) => ({ x: r.left + r.width / 2, y: r.top + r.height * 0.85 }), want: "after" },
    { name: "乙的正中 → 成为乙的子节点", at: (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }), want: "child" },
    { name: "乙和丙之间的缝 → 插到乙下面", at: (r) => ({ x: r.left + r.width / 2, y: r.top + r.height + 2 }), want: "after" },
    { name: "乙上部、横向偏出右侧 35px → 插到乙上面", at: (r) => ({ x: r.left + r.width + 35, y: r.top + r.height * 0.2 }), want: "before" },
    { name: "乙下部、横向偏出左侧 30px → 插到乙下面", at: (r) => ({ x: r.left - 30, y: r.top + r.height * 0.8 }), want: "after" },
  ];
  for (const c of cases) {
    await page.evaluate((t) => window.boot(t), MD(layout));
    await page.waitForFunction(() => window.hasMM());
    await page.waitForTimeout(700);
    const r = await rectOf("乙");
    for (const hold of [0, 400]) {
      if (hold) {
        await page.evaluate((t) => window.__view.setViewData(t, true), MD(layout));
        await page.waitForTimeout(700);
      }
      const rr = await rectOf("乙");
      await drag("戊", c.at(rr), { hold });
      const t = await tree();
      const got = /乙\(戊\)/.test(t) ? "child" : /甲,戊,乙/.test(t) ? "before" : /乙,戊,丙/.test(t) ? "after" : "other:" + t;
      results.push({ layout, name: c.name, hold, want: c.want, got });
    }
  }
}

const tag = LEGACY ? "修复前" : "修复后";
let hit = 0;
for (const r of results) {
  const good = r.got === r.want;
  if (good) hit++;
  console.log(`${good ? "✓" : "✗"} [${r.layout}] ${r.name}  ${r.hold ? "停留 0.4s 再松手" : "到位立刻松手"}  → ${r.got}`);
}
console.log(`\n${tag}：${hit}/${results.length} 次落到预期位置`);
if (!LEGACY) {
  ok("every drop lands where expected", hit === results.length, `${hit}/${results.length}`);
  // 回归：拖到远离所有节点的空白处，不应改变结构
  await page.evaluate((t) => window.boot(t), MD("logicalStructure"));
  await page.waitForFunction(() => window.hasMM());
  await page.waitForTimeout(700);
  const before = await tree();
  await drag("戊", { x: 60, y: 820 });
  ok("dropping on empty canvas changes nothing", (await tree()) === before, await tree());
  // 回归：拖动后保存到 Markdown 的顺序正确
  await page.evaluate((t) => window.__view.setViewData(t, true), MD("logicalStructure"));
  await page.waitForTimeout(700);
  const r = await rectOf("甲");
  await drag("戊", { x: r.left + r.width / 2, y: r.top + r.height * 0.15 });
  await page.waitForTimeout(600);
  const md = await page.evaluate(() => window.getText());
  ok("reorder is saved to the note", /## 戊\n## 甲\n## 乙/.test(md), md);
  // 回归：组织结构图（未接管）仍能拖动成为子节点
  await page.evaluate((t) => window.__view.setViewData(t, true), MD("organizationStructure"));
  await page.waitForTimeout(800);
  const rb = await rectOf("乙");
  await drag("戊", { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 }, { hold: 400 });
  ok("organization chart: drop on a node still makes a child", /乙\(戊\)/.test(await tree()), await tree());
  console.log("page errors:", errors.length ? errors : "none");
  ok("no page errors", errors.length === 0);
  console.log(failed === 0 ? "\nDRAG PASSED" : `\n${failed} FAILED`);
}
await browser.close();
process.exit(LEGACY ? 0 : failed ? 1 : 0);
