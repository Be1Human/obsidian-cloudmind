// 平移 / 缩放性能测试：大图 + 每帧耗时 + CPU 采样
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const N1 = Number(process.env.N1 || 10); // 二级节点数
const N2 = Number(process.env.N2 || 8); // 每个二级下三级节点数
const N3 = Number(process.env.N3 || 5); // 每个三级下四级节点数

let md = "---\ncloudmind: true\n---\n# 根\n";
for (let i = 0; i < N1; i++) {
  md += `## 分支 ${i}\n`;
  for (let j = 0; j < N2; j++) {
    md += `### 子 ${i}-${j}\n`;
    for (let k = 0; k < N3; k++) md += `- 叶子 ${i}-${j}-${k} 一些文字内容\n`;
  }
}
const total = 1 + N1 + N1 * N2 + N1 * N2 * N3;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const VW = Number(process.env.VW || 1200);
const VH = Number(process.env.VH || 800);
const DPR = Number(process.env.DPR || 1);
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
const t0 = Date.now();
await page.evaluate((t) => window.boot(t), md);
await page.waitForFunction(() => window.hasMM(), null, { timeout: 60000 });
await page.waitForTimeout(1500);
console.log(`nodes=${total}  viewport=${VW}x${VH}@${DPR}x  first render ≈ ${Date.now() - t0}ms`);
// 把 host 撑满视口，模拟全屏的 Obsidian 窗口
await page.addStyleTag({ content: `#host{width:${VW}px!important;height:${VH}px!important}` });
await page.waitForTimeout(400);

// 选中一个节点（快捷条会随平移更新位置，这是真实使用场景）
if (!process.env.NOSEL) {
  await page.evaluate(() => window.mm().renderer.root.children[1].active());
  await page.waitForTimeout(300);
}

async function measure(label, action, prof) {
  const cdp = prof ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      window.__frames.push(now - last);
      last = now;
      if (!window.__stopFrames) requestAnimationFrame(loop);
    };
    window.__stopFrames = false;
    requestAnimationFrame(loop);
  });
  await action();
  await page.waitForTimeout(150);
  const frames = await page.evaluate(() => {
    window.__stopFrames = true;
    return window.__frames.slice(2);
  });
  let top = [];
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const cf = n.callFrame;
      const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber}`;
      self.set(key, (self.get(key) || 0) + (dt[i] || 0));
    });
    top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }
  frames.sort((a, b) => a - b);
  const avg = frames.reduce((s, x) => s + x, 0) / Math.max(1, frames.length);
  const p95 = frames[Math.floor(frames.length * 0.95)] || 0;
  const max = frames[frames.length - 1] || 0;
  const slow = frames.filter((f) => f > 34).length;
  console.log(`[${label}] frames=${frames.length} avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms  slow(>34ms)=${slow}`);
  if (top.length) {
    console.log("  CPU top (self ms):");
    top.forEach(([k, v]) => console.log(`   ${(v / 1000).toFixed(0).padStart(5)}  ${k}`));
  }
  return { avg, p95, max, slow };
}

const prof = !!process.env.PROF;
const results = {};

results.drag = await measure("拖动平移", async () => {
  await page.mouse.move(300, 300);
  await page.mouse.down();
  for (let i = 0; i < 80; i++) {
    await page.mouse.move(300 + i * 6, 300 + Math.sin(i / 5) * 60);
  }
  await page.mouse.up();
}, prof);

results.wheel = await measure("滚轮平移", async () => {
  for (let i = 0; i < 60; i++) {
    await page.mouse.move(600, 400);
    await page.mouse.wheel(0, 40);
  }
}, prof);

results.zoom = await measure("Ctrl+滚轮缩放", async () => {
  await page.keyboard.down("Control");
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, i % 2 ? 100 : -100);
  }
  await page.keyboard.up("Control");
}, prof);

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
console.log("RESULT " + JSON.stringify(results));
