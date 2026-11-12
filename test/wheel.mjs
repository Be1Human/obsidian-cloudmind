// 滚轮 / 触控板手感测试：新旧实现对比
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const sample = "---\ncloudmind: true\n---\n# 根\n" + Array.from({ length: 12 }, (_, i) => `## 分支 ${i}\n- a\n- b\n`).join("");

let failed = 0;
const ok = (n, c, x = "") => {
  console.log(c ? "PASS" : "FAIL", n, c ? "" : x);
  if (!c) failed++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
await page.evaluate((t) => window.boot(t), sample);
await page.waitForFunction(() => window.hasMM());
await page.waitForTimeout(800);
await page.mouse.move(600, 400);

/** 在 action 期间逐帧记录视图位置，并统计 translateXY / setScale 调用次数 */
async function trace(mode, action) {
  await page.evaluate((mode) => {
    const mm = window.mm();
    window.__saved = window.__saved || mm.opt.customHandleMousewheel;
    mm.opt.customHandleMousewheel = mode === "old" ? null : window.__saved;
    mm.view.reset();
    window.__calls = { t: 0, s: 0 };
    if (!mm.view.__wrapped) {
      mm.view.__wrapped = true;
      const t = mm.view.translateXY.bind(mm.view);
      const s = mm.view.setScale.bind(mm.view);
      mm.view.translateXY = (...a) => ((window.__calls.t++), t(...a));
      mm.view.setScale = (...a) => ((window.__calls.s++), s(...a));
    }
    window.__fr = [];
    window.__stop = false;
    const loop = () => {
      window.__fr.push({ x: mm.view.x, y: mm.view.y, s: mm.view.scale, t: window.__calls.t, z: window.__calls.s });
      if (!window.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, mode);
  await action();
  await page.waitForTimeout(700); // 让缓动跑完
  return page.evaluate(() => {
    window.__stop = true;
    const f = window.__fr;
    const steps = f.slice(1).map((b, i) => ({ dy: b.y - f[i].y, dx: b.x - f[i].x, ds: b.s / f[i].s, calls: b.t - f[i].t + (b.z - f[i].z) }));
    const last = f[f.length - 1];
    return {
      x: last.x, y: last.y, s: last.s,
      maxStepY: Math.max(...steps.map((s) => Math.abs(s.dy))),
      maxStepX: Math.max(...steps.map((s) => Math.abs(s.dx))),
      maxScaleStep: Math.max(...steps.map((s) => Math.abs(s.ds - 1))),
      maxCallsPerFrame: Math.max(...steps.map((s) => s.calls)),
      movingFrames: steps.filter((s) => s.dy !== 0 || s.dx !== 0 || s.ds !== 1).length,
      totalCalls: last.t + last.z,
    };
  });
}

const burst = async (n, dx, dy, gap = 6) => {
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(gap);
  }
};

// ---------- A. 触控板滑动：40 个事件，每个 deltaY=15（>10，库会误判成鼠标滚轮）----------
const aOld = await trace("old", () => burst(40, 0, 15));
const aNew = await trace("new", () => burst(40, 0, 15));
console.log(`A 触控板 40×15px  旧: 位移 ${aOld.y.toFixed(0)}px, 单帧最大 ${aOld.maxStepY.toFixed(0)}px | 新: 位移 ${aNew.y.toFixed(0)}px, 单帧最大 ${aNew.maxStepY.toFixed(0)}px`);
ok("A old: library jumps ~100px per event (the bug)", Math.abs(aOld.y) > 2500, JSON.stringify(aOld));
ok("A new: follows the fingers (total ≈ 600px)", Math.abs(aNew.y + 600) < 30, `y=${aNew.y}`);
ok("A new: no big jump in any frame (<=120px)", aNew.maxStepY <= 120, String(aNew.maxStepY));
ok("A new: at most one update per frame", aNew.maxCallsPerFrame <= 1, String(aNew.maxCallsPerFrame));

// ---------- B. 更细的触控板：80 个事件 deltaY=3, deltaX=1 ----------
const bNew = await trace("new", () => burst(80, 1, 3, 4));
ok("B new: tiny fractional deltas still add up (≈ -240, -80)", Math.abs(bNew.y + 240) < 12 && Math.abs(bNew.x + 80) < 12, `x=${bNew.x} y=${bNew.y}`);

// ---------- C. 鼠标滚轮一格：deltaY=100 ----------
const cOld = await trace("old", () => burst(1, 0, 100));
const cNew = await trace("new", () => burst(1, 0, 100));
console.log(`C 滚轮一格 100  旧: 单帧最大 ${cOld.maxStepY.toFixed(0)}px 动了 ${cOld.movingFrames} 帧 | 新: 单帧最大 ${cNew.maxStepY.toFixed(0)}px 动了 ${cNew.movingFrames} 帧`);
ok("C old: jumps in a single frame", cOld.movingFrames <= 1 && cOld.maxStepY >= 99, JSON.stringify(cOld));
ok("C new: same distance in the end (100px)", Math.abs(cNew.y + 100) < 1, `y=${cNew.y}`);
ok("C new: eased over several frames", cNew.movingFrames >= 5 && cNew.maxStepY <= 45, JSON.stringify(cNew));

// ---------- D. 连续滚 5 格 ----------
const dNew = await trace("new", () => burst(5, 0, 100, 30));
ok("D new: 5 notches = 500px total", Math.abs(dNew.y + 500) < 1, `y=${dNew.y}`);

// ---------- E. 方向：向上滚 / 横向 / Shift+滚轮 ----------
const eUp = await trace("new", () => burst(3, 0, -100, 20));
ok("E up-scroll moves content down (+300)", Math.abs(eUp.y - 300) < 1, `y=${eUp.y}`);
const eH = await trace("new", () => burst(3, 100, 0, 20));
ok("E horizontal scroll moves content left (-300)", Math.abs(eH.x + 300) < 1, `x=${eH.x}`);
await page.keyboard.down("Shift");
const eS = await trace("new", () => burst(2, 0, 100, 20));
await page.keyboard.up("Shift");
ok("E Shift+wheel scrolls horizontally (-200 x, 0 y)", Math.abs(eS.x + 200) < 1 && Math.abs(eS.y) < 1, `x=${eS.x} y=${eS.y}`);

// ---------- F. 行模式（deltaMode=1，部分设备/Firefox）----------
const fLine = await trace("new", () =>
  page.evaluate(() => {
    const el = document.querySelector(".cm-canvas");
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true, clientX: 600, clientY: 400 }));
  })
);
ok("F deltaMode=lines is converted (3 lines ≈ 120px)", Math.abs(fLine.y + 120) < 1, `y=${fLine.y}`);

// ---------- G. Ctrl+滚轮缩放 ----------
await page.keyboard.down("Control");
const gIn = await trace("new", () => burst(5, 0, -100, 30));
const gOut = await trace("new", () => burst(5, 0, 100, 30));
await page.keyboard.up("Control");
ok("G zoom in 5 notches ≈ ×2.1", gIn.s > 1.9 && gIn.s < 2.3, `s=${gIn.s}`);
ok("G zoom out never goes below the minimum (0.2)", gOut.s >= 0.2 && gOut.s < 0.6, `s=${gOut.s}`);
ok("G zoom is smooth: no frame changes scale by >12%", gIn.maxScaleStep < 0.12 && gOut.maxScaleStep < 0.12, `${gIn.maxScaleStep} ${gOut.maxScaleStep}`);
const gOld = await trace("old", async () => {
  await page.keyboard.down("Control");
  await burst(2, 0, 100, 30);
  await page.keyboard.up("Control");
});
console.log(`G 缩小 2 格  旧: 缩放到 ${gOld.s.toFixed(2)}（线性 -0.2/格）`);
// 捏合：ctrlKey + 很小的 deltaY（浏览器对触控板捏合就是这样发的）
await page.keyboard.down("Control");
const gPinch = await trace("new", () => burst(20, 0, -4, 8));
await page.keyboard.up("Control");
ok("G pinch (small deltas) zooms in gently (×1.1–×1.4)", gPinch.s > 1.1 && gPinch.s < 1.4, `s=${gPinch.s}`);

// ---------- H. 缩放以鼠标位置为中心：鼠标下的内容点保持不动 ----------
const anchor = await page.evaluate(() => {
  const mm = window.mm();
  mm.view.reset();
  return { x: mm.view.x, y: mm.view.y, s: mm.view.scale };
});
await page.mouse.move(800, 300);
const before = await page.evaluate(() => {
  const mm = window.mm(), v = mm.view;
  const r = document.querySelector(".cm-canvas").getBoundingClientRect();
  const px = 800 - r.left, py = 300 - r.top;
  return { cx: (px - v.x) / v.scale, cy: (py - v.y) / v.scale };
});
await page.keyboard.down("Control");
await trace("new", () => burst(3, 0, -100, 30));
await page.keyboard.up("Control");
const after = await page.evaluate(() => {
  const mm = window.mm(), v = mm.view;
  const r = document.querySelector(".cm-canvas").getBoundingClientRect();
  const px = 800 - r.left, py = 300 - r.top;
  return { cx: (px - v.x) / v.scale, cy: (py - v.y) / v.scale };
});
ok("H zoom keeps the point under the cursor fixed", Math.abs(before.cx - after.cx) < 1.5 && Math.abs(before.cy - after.cy) < 1.5, JSON.stringify([before, after]));

// ---------- I. 滚轮后选中的节点快捷条 / 状态栏仍然正常，且不触发整图重绘 ----------
await page.evaluate(() => {
  window.mm().view.reset();
  window.mm().renderer.root.children[2].active();
  window.__renders = 0;
  window.mm().on("node_tree_render_end", () => window.__renders++);
});
await page.waitForTimeout(400);
await burst(6, 0, 20, 8); // 小幅平移 120px：选中的节点仍在画布内
await page.waitForTimeout(500);
ok("panning does not re-render the whole map", (await page.evaluate(() => window.__renders)) === 0);
const barPos = () =>
  page.evaluate(() => {
    const bar = document.querySelector(".cm-nodebar");
    const n = window.mm().renderer.activeNodeList[0];
    const r = n.getRectInSvg();
    const c = document.querySelector(".cm-canvas").getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    return { shown: bar.classList.contains("is-show"), nodeCx: c.left + r.left + r.width / 2, nodeTop: c.top + r.top, barCx: b.left + b.width / 2, barBottom: b.bottom };
  });
const p1 = await barPos();
ok("quick bar follows the node while it stays in view", p1.shown && Math.abs(p1.barCx - p1.nodeCx) < 2 && p1.barBottom <= p1.nodeTop + 1, JSON.stringify(p1));
await burst(20, 0, 20, 8); // 再平移 400px：节点滚出画布
await page.waitForTimeout(500);
const p2 = await barPos();
ok("quick bar hides when the node scrolls out of view", !p2.shown, JSON.stringify(p2));

// ---------- J. 编辑文字时滚动：编辑框应关闭（和之前行为一致），不崩 ----------
await page.evaluate(() => window.mm().renderer.root.children[0].active());
await page.keyboard.press("F2");
await page.waitForTimeout(250);
await burst(3, 0, 100, 20);
await page.waitForTimeout(300);
ok("no errors after scrolling while editing", errors.length === 0, errors.join("\n"));

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nWHEEL PASSED");
process.exit(failed ? 1 : 0);
