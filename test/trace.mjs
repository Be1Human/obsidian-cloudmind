// 用 Chrome 追踪量“绘制 / 光栅化 / 布局 / 样式”耗时，对比不同优化手段
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const N1 = Number(process.env.N1 || 6), N2 = Number(process.env.N2 || 5), N3 = Number(process.env.N3 || 4);
const VW = Number(process.env.VW || 1900), VH = Number(process.env.VH || 1000), DPR = Number(process.env.DPR || 2);

let md = "---\ncloudmind: true\n---\n# 根\n";
for (let i = 0; i < N1; i++) {
  md += `## 分支 ${i}\n`;
  for (let j = 0; j < N2; j++) {
    md += `### 子 ${i}-${j}\n`;
    for (let k = 0; k < N3; k++) md += `- 叶子 ${i}-${j}-${k} 资产治理相关的一段较长的文字描述内容用来撑开节点\n`;
  }
}
const total = 1 + N1 + N1 * N2 + N1 * N2 * N3;

const variants = {
  baseline: "",
  "no-nodebar": ".cm-nodebar{display:none!important}",
  "speed-render": ".cm-canvas svg, .cm-canvas svg *{text-rendering:optimizeSpeed!important;shape-rendering:optimizeSpeed!important}",
  "no-pointer": ".cm-canvas svg *{pointer-events:none!important}",
  "all-three": ".cm-nodebar{display:none!important}.cm-canvas svg, .cm-canvas svg *{text-rendering:optimizeSpeed!important;shape-rendering:optimizeSpeed!important;pointer-events:none!important}",
};

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--enable-gpu-rasterization"] });

async function run(name, css) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
  await page.evaluate((t) => window.boot(t), md);
  await page.waitForFunction(() => window.hasMM(), null, { timeout: 60000 });
  await page.addStyleTag({ content: `#host{width:${VW}px!important;height:${VH}px!important}` + css });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.mm().renderer.root.children[1].active());
  await page.waitForTimeout(300);

  await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "gpu", "viz", "benchmark"] });
  const t0 = Date.now();
  await page.mouse.move(400, 400);
  await page.mouse.down();
  for (let i = 0; i < 120; i++) {
    await page.mouse.move(400 + i * 5, 400 + Math.sin(i / 6) * 80);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(8);
  }
  const wall = Date.now() - t0;
  const buf = await browser.stopTracing();
  const ev = JSON.parse(buf.toString()).traceEvents;

  const sum = new Map();
  const cnt = new Map();
  for (const e of ev) {
    if (e.ph !== "X" || !e.dur) continue;
    sum.set(e.name, (sum.get(e.name) || 0) + e.dur);
    cnt.set(e.name, (cnt.get(e.name) || 0) + 1);
  }
  const ms = (n) => ((sum.get(n) || 0) / 1000);
  const names = ["Paint", "PrePaint", "Layout", "UpdateLayoutTree", "FunctionCall", "UpdateLayer", "RasterTask", "Layerize", "Commit", "DrawFrame", "FireAnimationFrame", "EventDispatch"];
  const row = names.map((n) => `${n}=${ms(n).toFixed(0)}ms/${cnt.get(n) || 0}`).join("  ");
  console.log(`[${name.padEnd(13)}] wall=${wall}ms  ${row}`);
  await page.close();
  return { name, paint: ms("Paint"), raster: ms("RasterTask"), layout: ms("Layout") + ms("UpdateLayoutTree"), script: ms("FunctionCall") };
}

console.log(`nodes=${total} viewport=${VW}x${VH}@${DPR}x`);
const out = [];
for (const [k, v] of Object.entries(variants)) out.push(await run(k, v));
await browser.close();
console.log("SUMMARY " + JSON.stringify(out.map((o) => ({ n: o.name, paint: Math.round(o.paint), raster: Math.round(o.raster), layout: Math.round(o.layout), script: Math.round(o.script) }))));
