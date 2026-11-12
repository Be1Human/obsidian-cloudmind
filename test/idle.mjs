// 稳定性测试：空闲不重绘；外部事件（css-change / 尺寸抖动 / 重复载入同一文件）不引发重绘
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const sample = "---\ncloudmind: true\n---\n# Agent 研发\n## 系统设计\n### 核心循环\n- 感知\n- 规划\n## 评测\n- 离线\n## 工程化\n- 排障\n";

let failed = 0;
const ok = (n, c, x = "") => {
  console.log(c ? "PASS" : "FAIL", n, c ? "" : x);
  if (!c) failed++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
await page.evaluate((t) => window.boot(t), sample);
await page.waitForFunction(() => window.hasMM());
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.__renders = 0;
  window.window.mm().on("node_tree_render_end", () => window.__renders++);
});
const renders = () => page.evaluate(() => window.__renders);

// 1. 空闲
await page.waitForTimeout(2000);
ok("idle: no re-render", (await renders()) === 0, String(await renders()));

// 2. 外部反复触发 css-change（其它插件/主题常见）
await page.evaluate(() => {
  for (let i = 0; i < 30; i++) window.__fire("css-change");
});
await page.waitForTimeout(800);
ok("css-change x30: no re-render when theme unchanged", (await renders()) === 0, String(await renders()));

// 3. 同一份文件被 Obsidian 反复重新载入
await page.evaluate((t) => {
  for (let i = 0; i < 20; i++) window.__view.setViewData(t, false);
}, sample);
await page.waitForTimeout(800);
ok("reload same text x20: no re-render", (await renders()) === 0, String(await renders()));

// 4. 容器尺寸反复小幅抖动（滚动条出现/消失、面板拖动）不应级联重绘
await page.evaluate(() => {
  const h = document.getElementById("host");
  let i = 0;
  const t = setInterval(() => {
    h.style.width = i++ % 2 ? "1100px" : "1099px";
    if (i > 12) clearInterval(t);
  }, 30);
});
await page.waitForTimeout(1200);
const afterJitter = await renders();
ok("1px jitter x12: bounded re-render (<=2)", afterJitter <= 2, String(afterJitter));
await page.waitForTimeout(1500);
ok("after jitter: settles (no further renders)", (await renders()) === afterJitter, `${afterJitter} -> ${await renders()}`);

// 5. svg 不能撑开容器
const geo = await page.evaluate(() => {
  const c = document.querySelector(".cm-canvas");
  const s = c.querySelector("svg");
  const cs = getComputedStyle(s);
  return { disp: cs.display, pos: cs.position, ch: c.clientHeight, sh: s.clientHeight };
});
ok("svg is block/absolute (cannot grow its container)", geo.disp === "block" && geo.pos === "absolute", JSON.stringify(geo));

// 6. 主题真的变了才重绘一次
await page.evaluate(() => document.body.classList.add("theme-dark"));
await page.evaluate(() => window.__fire("css-change"));
await page.waitForTimeout(600);
const th = await page.evaluate(() => window.mm().getTheme());
ok("real dark-mode switch is applied", th === "xmindDark", th);

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nSTABILITY PASSED");
process.exit(failed ? 1 : 0);
