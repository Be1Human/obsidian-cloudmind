// 用独立的临时配置启动真实的 Obsidian（不影响用户正在用的 Obsidian / 库），打开演示库并截图
// Obsidian 关闭了 Node 调试入口，所以用 Chromium 远程调试端口连接
import { chromium } from "playwright-core";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(os.homedir(), "AppData/Local/Programs/Obsidian/Obsidian.exe");
const root = path.join(os.homedir(), "AppData/Local/Temp/cm-real");
const userData = path.join(root, "userdata");
const out = path.join(dir, "..", "docs", "images", "obsidian");
mkdirSync(out, { recursive: true });
const MODE = process.argv[2] || "probe";
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(exe, [`--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`, "--lang=zh-CN"], { stdio: "ignore" });
let browser = null;
for (let i = 0; i < 40 && !browser; i++) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 3000 });
  } catch {
    await sleep(1000);
  }
}
if (!browser) {
  console.log("could not connect to Obsidian debug port");
  child.kill();
  process.exit(1);
}
const app = {
  windows: () => browser.contexts().flatMap((c) => c.pages()),
  close: async () => {
    try {
      await browser.close();
    } catch {}
    child.kill();
  },
};

// 找到打开了库的主窗口（不是启动页）
let win = null;
for (let i = 0; i < 60 && !win; i++) {
  for (const w of app.windows()) {
    try {
      const ok = await w.evaluate(() => !!(window.app && window.app.vault && window.app.workspace));
      if (ok) win = w;
    } catch {}
  }
  if (!win) await sleep(1000);
}
if (!win) {
  console.log("no vault window; windows:", await Promise.all(app.windows().map((w) => w.title())));
  for (const [i, w] of app.windows().entries()) await w.screenshot({ path: path.join(out, `_probe-${i}.png`) });
  await app.close();
  process.exit(1);
}
await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
await win.waitForFunction(() => window.app.workspace.layoutReady, null, { timeout: 60000 });

// 界面语言：中文（Obsidian 把语言存在 localStorage，改完要重载）
const lang = await win.evaluate(() => localStorage.getItem("language"));
if (lang !== "zh") {
  await win.evaluate(() => {
    localStorage.setItem("language", "zh");
    window.location.reload();
  });
  await sleep(2500);
  await win.waitForFunction(() => window.app && window.app.workspace && window.app.workspace.layoutReady, null, { timeout: 60000 });
}
// 关闭“安全模式”，启用 CloudMind
const st = await win.evaluate(async () => {
  const p = window.app.plugins;
  if (!p.isEnabled()) await p.setEnable(true);
  await p.loadManifests();
  if (!p.plugins["cloudmind"]) await p.enablePluginAndSave("cloudmind");
  return {
    restricted: !p.isEnabled(),
    loaded: !!p.plugins["cloudmind"],
    version: p.manifests["cloudmind"]?.version,
    obsidian: window.require?.("electron")?.ipcRenderer ? "electron" : "?",
    lang: localStorage.getItem("language"),
    appVersion: (window.app.vault.adapter && navigator.userAgent.match(/obsidian\/([\d.]+)/i)?.[1]) || "?",
  };
});
console.log("state:", JSON.stringify(st));
await sleep(1500);
await win.screenshot({ path: path.join(out, `_probe-main.png`) });
console.log("saved probe");
if (MODE === "probe") {
  await app.close();
  process.exit(0);
}

/* ======================= 正式截图 ======================= */
const W = 1280, H = 800;
const cdp = await win.context().newCDPSession(win);
const resized = await win.evaluate(([w, h]) => {
  try {
    const remote = window.require("@electron/remote");
    const bw = remote.getCurrentWindow();
    if (bw.isMaximized()) bw.unmaximize();
    bw.setContentSize(w, h);
    return "electron:" + bw.getContentSize().join("x");
  } catch (e) {
    try {
      const bw = window.require("electron").remote.getCurrentWindow();
      bw.setContentSize(w, h);
      return "electron-legacy";
    } catch (e2) {
      return "none: " + String(e);
    }
  }
}, [W, H]);
console.log("resize:", resized);
await sleep(800);

// 信任提示框：选“信任仓库作者并启用插件”
const trust = win.getByText("信任仓库作者并启用插件");
if (await trust.count()) {
  await trust.first().click();
  await sleep(1500);
}
await win.evaluate(() => document.querySelectorAll(".modal-container .modal-close-button").forEach((b) => b.click()));
// 浅色主题，打开一篇普通笔记
await win.evaluate(async () => {
  window.app.changeTheme?.("moonstone");
  // 关掉“内联标题”，否则笔记标题会和正文的一级标题重复显示
  window.app.vault.setConfig?.("showInlineTitle", false);
  const f = window.app.vault.getAbstractFileByPath("读书/原子习惯.md");
  await window.app.workspace.getLeaf(false).openFile(f);
  // 文件列表展开“读书”
  const t = document.querySelector('.nav-folder-title[data-path="读书"]');
  if (t && t.parentElement.classList.contains("is-collapsed")) t.click();
});
await sleep(1200);

// 在页面上画标注框（不影响 Obsidian 本身，截完就删）
async function mark(items, font = 15) {
  await win.evaluate(([items, font]) => {
    document.querySelectorAll(".cmshot-mark").forEach((e) => e.remove());
    for (const it of items) {
      const el = typeof it.sel === "string" ? [...document.querySelectorAll(it.sel)].find((e) => !it.text || e.textContent.includes(it.text)) : null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const pad = it.pad ?? 4;
      const box = document.createElement("div");
      box.className = "cmshot-mark";
      Object.assign(box.style, {
        position: "fixed", left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px",
        border: "3px solid #ff4d4f", borderRadius: "8px", boxShadow: "0 0 0 4px rgba(255,77,79,.18)", zIndex: 99999, pointerEvents: "none",
      });
      document.body.appendChild(box);
      if (it.label) {
        const tag = document.createElement("div");
        tag.className = "cmshot-mark";
        tag.textContent = it.label;
        const side = it.side || "right";
        const st = {
          position: "fixed", zIndex: 99999, pointerEvents: "none", background: "#ff4d4f", color: "#fff", font: `700 ${font}px/1.35 'Microsoft YaHei',sans-serif`,
          padding: font > 15 ? "7px 14px" : "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(255,77,79,.35)",
        };
        if (side === "right") Object.assign(st, { left: r.right + pad + 12 + "px", top: r.top + r.height / 2 - 16 + "px" });
        if (side === "left") Object.assign(st, { right: innerWidth - (r.left - pad - 12) + "px", top: r.top + r.height / 2 - 16 + "px" });
        if (side === "below") Object.assign(st, { left: r.left - pad + "px", top: r.bottom + pad + 10 + "px" });
        if (side === "above") Object.assign(st, { right: innerWidth - (r.right + pad) + "px", top: r.top - pad - (font > 15 ? 54 : 44) + "px" });
        Object.assign(tag.style, st);
        document.body.appendChild(tag);
      }
    }
  }, [items, font]);
  await sleep(200);
}
const clearMarks = () => win.evaluate(() => document.querySelectorAll(".cmshot-mark").forEach((e) => e.remove()));
const closeMenus = async () => {
  await win.keyboard.press("Escape");
  await win.keyboard.press("Escape");
  await sleep(300);
};
const shot = async (name) => {
  await win.screenshot({ path: path.join(out, name + ".png") });
  console.log("saved", name);
};
// 小红书卡片用的局部图：裁出所有红框 + 标签所在的区域（再加上指定元素），四周留白
const xhs = path.join(dir, "..", "marketing", "xiaohongshu", "shots");
mkdirSync(xhs, { recursive: true });
const crop = async (name, { pad = 36, extra = [], minW = 0, minH = 0 } = {}) => {
  const r = await win.evaluate(
    ([extra, pad, minW, minH]) => {
      const els = [...document.querySelectorAll(".cmshot-mark")];
      for (const s of extra) els.push(...document.querySelectorAll(s));
      let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
      for (const e of els) {
        const b = e.getBoundingClientRect();
        if (!b.width) continue;
        L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom);
      }
      L -= pad; T -= pad; R += pad; B += pad;
      if (R - L < minW) { const c = (L + R) / 2; L = c - minW / 2; R = c + minW / 2; }
      if (B - T < minH) { const c = (T + B) / 2; T = c - minH / 2; B = c + minH / 2; }
      const W = innerWidth, H = innerHeight;
      if (L < 0) { R -= L; L = 0; }
      if (T < 0) { B -= T; T = 0; }
      if (R > W) { L -= R - W; R = W; }
      if (B > H) { T -= B - H; B = H; }
      L = Math.max(0, L); T = Math.max(0, T);
      return { x: Math.round(L), y: Math.round(T), width: Math.round(R - L), height: Math.round(B - T) };
    },
    [extra, pad, minW, minH]
  );
  // 裁剪时临时隐藏笔记正文，让菜单 / 按钮落在干净的背景上
  await win.evaluate(() => {
    const s = document.createElement("style");
    s.id = "cmshot-clean";
    s.textContent = ".workspace-split.mod-root .view-content{visibility:hidden !important}";
    document.head.appendChild(s);
  });
  await sleep(150);
  await win.screenshot({ path: path.join(xhs, name + ".png"), clip: r });
  await win.evaluate(() => document.getElementById("cmshot-clean")?.remove());
  console.log("cropped", name, JSON.stringify(r));
};

// 编辑框开着时焦点离开导图，回来再点别的节点
if (MODE === "away") {
  const MD = "---\ncloudmind: true\ncloudmind-layout: logicalStructure\n---\n# 根\n## 甲\n- 甲1\n- 甲2\n## 乙\n- 乙1\n- 乙2\n## 丙\n";
  let k = 0;
  const open = async () => {
    k++;
    await win.keyboard.press("Escape");
    await win.evaluate(async ([md, k]) => {
      const p = `读书/离开-${k}.md`; await window.app.vault.create(p, md);
      const keep = window.app.workspace.getLeaf(true); await keep.openFile(window.app.vault.getAbstractFileByPath(p));
      ["markdown", "cloudmind-view", "empty"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => { if (l !== keep) l.detach(); }));
    }, [MD, k]);
    await win.waitForFunction(() => !!window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.mm?.renderer?.root?.group?.node?.isConnected, null, { timeout: 15000 });
    await sleep(700);
  };
  const pt = (t) => win.evaluate((t) => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root); const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect(); return { x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2 }; }, t);
  const st = () => win.evaluate(() => window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.debugState());
  const has = (t) => win.evaluate((t) => { let f = false; const w = (x) => { if (x.getData("text") === t) f = true; x.children.forEach(w); }; w(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.renderer.root); return f; }, t);
  const away = {
    "点文件列表": async () => { await win.locator(".nav-folder-title").first().click(); },
    "点笔记标题栏": async () => { await win.locator(".workspace-leaf.mod-active .view-header-title").first().click().catch(() => {}); },
    "Ctrl+P 再 Esc": async () => { await win.keyboard.press("Control+p"); await sleep(300); await win.keyboard.press("Escape"); },
    "窗口失焦再回来": async () => { await win.evaluate(() => { window.dispatchEvent(new Event("blur")); document.activeElement?.blur?.(); }); await sleep(300); await win.evaluate(() => window.dispatchEvent(new Event("focus"))); },
    "点侧边栏搜索框": async () => { await win.evaluate(() => window.app.commands.executeCommandById("global-search:open")); await sleep(400); },
  };
  for (const [name, fn] of Object.entries(away)) {
    await open();
    const a = await pt("甲1"); await win.mouse.dblclick(a.x, a.y); await sleep(300);
    await win.keyboard.press("End"); await win.keyboard.type("改");
    await fn(); await sleep(400);
    const mid = await st();
    const b = await pt("乙2"); await win.mouse.click(b.x, b.y); await sleep(300);
    const s = await st();
    await win.keyboard.press("Backspace"); await sleep(500);
    const ok = !(await has("乙2"));
    console.log(`${ok ? "✓" : "✗"} 编辑「甲1」时 ${name} → 回来点「乙2」→ Backspace：${ok ? "删掉了乙2" : "没删"}\n   离开后: editBox=${mid.editBox} focus=${mid.focus}\n   点回来后: sel=${JSON.stringify(s.sel)} editBox=${s.editBox} focus=${s.focus}   甲1现在=${JSON.stringify(await win.evaluate(() => { let f; const w = (x) => { if (String(x.getData("text")).startsWith("甲1")) f = x.getData("text"); x.children.forEach(w); }; w(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.renderer.root); return f; }))}`);
  }
  await app.close();
  process.exit(0);
}
// 长时间随机操作：每做一个操作就检查 Backspace 还能不能删，第一次删不掉时打印完整状态
if (MODE === "soak") {
  const cdp = await win.context().newCDPSession(win);
  const N = Number(process.argv[3] || 120);
  let seed = Number(process.argv[4] || 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pickOne = (a) => a[Math.floor(rnd() * a.length)];
  const src = await win.evaluate(async () => window.app.vault.read(window.app.vault.getAbstractFileByPath("读书/真实导图.md")));
  const extra = "\n## 链接 [[图B]]\n## 另一个 [[读书清单 2026]]\n";
  let n = 0;
  const V = () => win.evaluate(() => !!window.app.workspace.getActiveViewOfType(window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.constructor ?? Object));
  const openFresh = async () => {
    n++;
    await win.keyboard.press("Escape");
    await win.evaluate(async ([text, n]) => {
      const p = `读书/压测-${n}.md`;
      await window.app.vault.create(p, text);
      const keep = window.app.workspace.getLeaf(true);
      await keep.openFile(window.app.vault.getAbstractFileByPath(p));
      ["markdown", "cloudmind-view", "empty"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => { if (l !== keep) l.detach(); }));
      window.__soakFile = p;
    }, [src + extra, n]);
    await win.waitForFunction(() => { const v = window.app.workspace.getActiveViewOfType(window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.constructor ?? Object); return !!v?.mm?.renderer?.root?.group?.node?.isConnected; }, null, { timeout: 15000 });
    await sleep(700);
  };
  const cur = 'window.app.workspace.getLeavesOfType("cloudmind-view").map(l=>l.view).find(v=>v.file?.path===window.__soakFile)';
  const ev = (body) => win.evaluate(new Function(`const v = ${cur}; ${body}`));
  const visibleNodes = () => ev(`if (!v || !v.isShownNow()) return []; const c = v.mm.el.getBoundingClientRect(); const out = []; const w = (x) => { if (!x.isRoot && !x.isGeneralization) { const r = x.getRectInSvg(); if (r.width > 4 && r.left > 4 && r.top > 4 && r.left + r.width < c.width - 4 && r.top + r.height < c.height - 4) out.push({ t: x.getData("text"), x: c.left + r.left + Math.min(r.width / 2, 24), y: c.top + r.top + r.height / 2 }); } x.children.forEach(w); }; w(v.mm.renderer.root); return out;`);
  const count = () => ev(`if (!v) return -1; let k = 0; const w = (x) => { k++; x.children.forEach(w); }; w(v.mm.renderer.root); return k;`);
  const centre = () => ev(`const r = v.mm.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top };`);
  const focusMap = async () => {
    // 回到导图标签页（有的操作会切走）
    await win.evaluate(() => { const l = window.app.workspace.getLeavesOfType("cloudmind-view").find((l) => l.view.file?.path === window.__soakFile); if (l) window.app.workspace.setActiveLeaf(l, { focus: true }); });
    await sleep(300);
  };
  const wheel = async (dy, mods = 0, k = 4) => { const c = await centre(); for (let i = 0; i < k; i++) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: dy, modifiers: mods }); await sleep(40); } await sleep(300); };
  const someNode = async () => { const l = await visibleNodes(); return l.length ? pickOne(l) : null; };
  const actions = {
    "滚轮平移": () => wheel(pickOne([-80, 80])),
    "Ctrl+滚轮缩放": () => wheel(pickOne([-100, 100]), 2, 2),
    "适应画布": () => ev("v.mm.view.fit(undefined, true, 40)"),
    "双击编辑→打字→Enter": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); await win.keyboard.press("End"); await win.keyboard.type("z"); await win.keyboard.press("Enter"); await sleep(300); },
    "双击编辑→Esc": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); await win.keyboard.press("Escape"); await sleep(250); },
    "双击编辑→点空白": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); const c = await centre(); await win.mouse.click(c.l + 8, c.t + c.h - 8); await sleep(300); },
    "双击编辑→滚轮": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); await wheel(60); },
    "双击编辑→Ctrl+滚轮": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); await wheel(-100, 2, 2); },
    "选中→直接打字→Enter": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.keyboard.type("q"); await win.keyboard.press("Enter"); await sleep(300); },
    "F2→Esc": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.keyboard.press("F2"); await sleep(200); await win.keyboard.press("Escape"); await sleep(200); },
    "Tab 新建→打字→Enter": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.keyboard.press("Tab"); await sleep(300); await win.keyboard.type("n"); await win.keyboard.press("Enter"); await sleep(300); },
    "Enter 新建同级→Esc": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.keyboard.press("Enter"); await sleep(300); await win.keyboard.press("Escape"); await sleep(250); },
    "拖动节点": async () => { const l = await visibleNodes(); if (l.length < 3) return; const a = pickOne(l), b = pickOne(l); await win.mouse.move(a.x, a.y); await win.mouse.down(); await win.mouse.move(b.x + 10, b.y + 8, { steps: 8 }); await win.mouse.up(); await sleep(500); },
    "颜色面板→点空白": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="fill"]', { timeout: 2000 }).catch(() => {}); await sleep(250); const c = await centre(); await win.mouse.click(c.l + 8, c.t + c.h - 8); await sleep(250); },
    "颜色面板→选颜色": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="fill"]', { timeout: 2000 }).catch(() => {}); await sleep(250); await win.click(".cm-pop-color .cm-swatch", { timeout: 2000 }).catch(() => {}); await sleep(300); },
    "图标面板→点图标→Esc": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="icon"]', { timeout: 2000 }).catch(() => {}); await sleep(250); await win.click(".cm-pop-icon .cm-icon-btn", { timeout: 2000 }).catch(() => {}); await sleep(200); await win.keyboard.press("Escape"); await sleep(200); },
    "主题面板→Esc": async () => { await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="theme"]', { timeout: 2000 }).catch(() => {}); await sleep(300); await win.keyboard.press("Escape"); await sleep(200); },
    "右键菜单→Esc": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y, { button: "right" }); await sleep(250); await win.keyboard.press("Escape"); await sleep(200); },
    "右键菜单→加粗": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y, { button: "right" }); await sleep(250); await win.locator(".menu .menu-item", { hasText: "加粗" }).first().click({ timeout: 2000 }).catch(() => win.keyboard.press("Escape")); await sleep(300); },
    "备注弹窗→确定": async () => { const p = await someNode(); if (!p) return; await win.mouse.click(p.x, p.y); await sleep(200); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="note"]', { timeout: 2000 }).catch(() => {}); await sleep(300); await win.locator(".modal textarea").first().fill("备注").catch(() => {}); await win.locator(".modal button", { hasText: "确定" }).first().click({ timeout: 2000 }).catch(() => win.keyboard.press("Escape")); await sleep(400); },
    "编辑时输入[[→选一篇": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); await win.keyboard.press("End"); await win.keyboard.type("[["); await sleep(400); await win.keyboard.press("Enter"); await sleep(250); await win.keyboard.press("Enter"); await sleep(300); },
    "Ctrl+点击链接节点→回来": async () => { const l = (await visibleNodes()).filter((x) => x.t.includes("[[")); if (!l.length) return; const p = pickOne(l); await win.keyboard.down("Control"); await win.mouse.click(p.x, p.y); await win.keyboard.up("Control"); await sleep(900); await focusMap(); },
    "点文件列表→点回节点": async () => { await win.locator(".nav-folder-title").first().click({ timeout: 2000 }).catch(() => {}); await sleep(250); },
    "命令面板→Esc": async () => { await win.keyboard.press("Control+p"); await sleep(400); await win.keyboard.press("Escape"); await sleep(250); },
    "快速切换→Esc": async () => { await win.keyboard.press("Control+o"); await sleep(400); await win.keyboard.press("Escape"); await sleep(250); },
    "撤销": async () => { await win.keyboard.press("Control+z"); await sleep(350); },
    "重做": async () => { await win.keyboard.press("Control+y"); await sleep(350); },
    "外部改写文件(模拟同步)": async () => { await win.evaluate(async () => { const f = window.app.vault.getAbstractFileByPath(window.__soakFile); const t = await window.app.vault.read(f); await window.app.vault.modify(f, t + "\n## 同步来的\n"); }); await sleep(900); },
    "编辑中被外部改写": async () => { const p = await someNode(); if (!p) return; await win.mouse.dblclick(p.x, p.y); await sleep(250); await win.keyboard.type("y"); await win.evaluate(async () => { const f = window.app.vault.getAbstractFileByPath(window.__soakFile); const t = await window.app.vault.read(f); await window.app.vault.modify(f, t + "\n## 同步2\n"); }); await sleep(900); },
    "切到文本再切回": async () => { await win.evaluate(() => window.app.commands.executeCommandById("cloudmind:open-as-text")); await sleep(800); await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn", { timeout: 3000 }).catch(() => {}); await sleep(1300); },
    "新开标签页再关掉": async () => { await win.evaluate(async () => { const l = window.app.workspace.getLeaf(true); await l.openFile(window.app.vault.getAbstractFileByPath("读书/读书清单 2026.md")); }); await sleep(600); await win.evaluate(() => window.app.workspace.getLeavesOfType("markdown").forEach((l) => l.detach())); await sleep(400); await focusMap(); },
    "在另一篇笔记里打字再回来": async () => { await win.evaluate(async () => { const l = window.app.workspace.getLeaf("split"); await l.openFile(window.app.vault.getAbstractFileByPath("读书/读书清单 2026.md")); window.app.workspace.setActiveLeaf(l, { focus: true }); }); await sleep(600); await win.keyboard.press("Control+End"); await win.keyboard.type("a"); await win.keyboard.press("Backspace"); await sleep(200); await focusMap(); await sleep(200); },
    "鼠标移出画布": async () => { await win.mouse.move(3, 300); await sleep(200); },
    "空闲 3 秒": () => sleep(3000),
  };
  const names = Object.keys(actions);
  await openFresh();
  const fails = [];
  const tally = {};
  for (let i = 1; i <= N; i++) {
    if ((await count()) < 25) await openFresh();
    const name = pickOne(names);
    tally[name] = (tally[name] || 0) + 1;
    (globalThis.__hist ??= []).push(`[${i}] ${name}`);
    try { await actions[name](); } catch (e) { console.log(`  [${i}] (操作出错) ${name}: ${String(e).split("\n")[0].slice(0, 100)}`); }
    // 检查：在当前导图里点一个节点，按 Backspace
    const shown = await ev("return !!v && v.isShownNow()");
    if (!shown) await focusMap();
    let p = await someNode();
    if (!p) { await win.evaluate(() => { ["markdown"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach())); }); await focusMap(); await ev("v.mm.view.fit(undefined, true, 40)"); await sleep(400); }
    const p2 = p || (await someNode());
    if (!p2) { console.log(`  [${i}] ${name} → 没有可点的节点，跳过`); continue; }
    p = p2;
    await win.mouse.click(p.x, p.y); await sleep(220);
    const before = await count();
    const st = await ev("return v.debugState()");
    st.atPoint = await win.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + (e.getAttribute("class") || "").split(" ")[0] + " in " + (e.closest(".modal-container,.prompt,.cm-popover,.workspace-leaf-content,.smm-node-edit-wrap")?.className?.toString().split(" ")[0] || "?") : null; }, [p.x, p.y]);
    st.inputs = await win.evaluate(() => [...document.querySelectorAll("input")].filter((i) => i === document.activeElement).map((i) => ({ type: i.type, ph: i.placeholder, cls: i.className, parent: i.parentElement?.className, visible: i.getClientRects().length > 0 })));
    await win.keyboard.press("Backspace"); await sleep(380);
    const after = await count();
    if (after < before) { if (i % 10 === 0) console.log(`  [${i}] 正常（最近一步：${name}）`); continue; }
    console.log(`✗ [${i}] 操作「${name}」之后删不掉「${p.t}」\n   最近几步: ${globalThis.__hist.slice(-5).join(" / ")}\n   按键前状态: ${JSON.stringify(st)}`);
    fails.push({ i, name, st });
    if (fails.length >= 3) break;
  }
  const log = await win.evaluate(async () => { const p = ".obsidian/plugins/cloudmind/delete-debug.log"; return (await window.app.vault.adapter.exists(p)) ? window.app.vault.adapter.read(p) : ""; });
  console.log(`\n压测：共 ${N} 步，失败 ${fails.length} 次`);
  console.log("操作分布:", JSON.stringify(tally));
  if (log) console.log("delete-debug.log 最后 2 条:\n" + log.trim().split("\n").slice(-2).join("\n"));
  await app.close();
  process.exit(0);
}
// 截图场景：新建子主题（Enter / Tab）后直接按 Backspace，以及点一下别处再按
if (MODE === "newnode") {
  const P = "多图/启动耗时.md";
  let k = 0;
  const open = async () => {
    k++;
    await win.keyboard.press("Escape");
    await win.evaluate(async ([P, k]) => {
      const text = await window.app.vault.read(window.app.vault.getAbstractFileByPath(P));
      const p = `多图/新建-${k}.md`; await window.app.vault.create(p, text);
      const keep = window.app.workspace.getLeaf(true); await keep.openFile(window.app.vault.getAbstractFileByPath(p));
      ["markdown", "cloudmind-view", "empty"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => { if (l !== keep) l.detach(); }));
    }, [P, k]);
    await win.waitForFunction(() => !!window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.mm?.renderer?.root?.group?.node?.isConnected, null, { timeout: 15000 });
    await sleep(800);
  };
  const V = 'window.app.workspace.getLeavesOfType("cloudmind-view")[0].view';
  const pt = (t) => win.evaluate((t) => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; let f; const w = (x) => { if (String(x.getData("text")).startsWith(t)) f = x; x.children.forEach(w); }; w(v.mm.renderer.root); v.mm.renderer.moveNodeToCenter?.(f); return new Promise((res) => setTimeout(() => { const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect(); res({ x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2 }); }, 500)); }, t);
  const kids = (t) => win.evaluate((t) => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; let f; const w = (x) => { if (String(x.getData("text")) === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root); return f ? f.children.map((c) => c.getData("text")) : null; }, t);
  const st = () => win.evaluate(() => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; const s = v.debugState ? v.debugState() : {}; const b = document.querySelector(".smm-node-edit-wrap"); return { sel: v.mm.renderer.activeNodeList.map((n) => n.getData("text")), editFlag: v.mm.renderer.textEdit.isShowTextEdit(), boxShown: !!b && b.style.display !== "none", boxText: b?.innerText, focusInBox: !!document.activeElement?.closest?.(".smm-node-edit-wrap"), focus: (document.activeElement?.className?.toString?.() || document.activeElement?.tagName).slice(0, 30), selText: String(window.getSelection()) }; });
  const cases = [
    ["选「追溯」→ Tab 新建 → Backspace", "追溯", "Tab", null],
    ["选「追溯处理人」→ Enter 新建同级 → Backspace", "追溯处理人", "Enter", null],
    ["Tab 新建 → Enter 确认 → Backspace", "追溯", "Tab", "Enter"],
    ["Tab 新建 → 点一下新节点 → Backspace", "追溯", "Tab", "click"],
    ["Tab 新建 → Esc → Backspace", "追溯", "Tab", "Escape"],
    ["Tab 新建 → 滚轮 → Backspace", "追溯", "Tab", "wheel"],
  ];
  const cdp = await win.context().newCDPSession(win);
  for (const [name, target, key, then] of cases) {
    await open();
    const p = await pt(target); await win.mouse.click(p.x, p.y); await sleep(500);
    const parentName = key === "Tab" ? "追溯" : "追溯";
    const k0 = await kids(parentName);
    await win.keyboard.press(key); await sleep(600);
    const s1 = await st();
    if (then === "Enter" || then === "Escape") { await win.keyboard.press(then); await sleep(400); }
    if (then === "click") { const q = await pt("子主题"); await win.mouse.click(q.x, q.y); await sleep(500); }
    if (then === "wheel") { const c = await win.evaluate(() => { const r = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); for (let i = 0; i < 5; i++) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: 40 }); await sleep(40); } await sleep(500); }
    const s2 = await st();
    const k1 = await kids(parentName);
    await win.keyboard.press("Backspace"); await sleep(600);
    const k2 = await kids(parentName);
    const s3 = await st();
    console.log(`\n【${name}】\n  新建后: ${JSON.stringify(s1)}\n  按键前: ${JSON.stringify(s2)}\n  追溯的子节点: 新建前 ${JSON.stringify(k0)} → 按 Backspace 前 ${JSON.stringify(k1)} → 按后 ${JSON.stringify(k2)}\n  按后状态: ${JSON.stringify(s3)}`);
  }
  await app.close();
  process.exit(0);
}
// 和用户一样同时开 4 张导图标签页：在当前标签页点节点按 Backspace，检查删的是不是当前这张、后台的有没有被误删
if (MODE === "multi") {
  const files = ["多图/鸿蒙版本.md", "多图/资产治理.md", "多图/启动耗时.md", "多图/乐元素面试.md"];
  await win.evaluate(async (files) => {
    const leaves = [];
    for (const p of files) { const l = window.app.workspace.getLeaf(true); await l.openFile(window.app.vault.getAbstractFileByPath(p)); leaves.push(l); }
    ["markdown", "empty"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach()));
    window.__ml = leaves;
  }, files);
  await win.waitForFunction(() => window.app.workspace.getLeavesOfType("cloudmind-view").length === 4, null, { timeout: 20000 });
  await sleep(1500);
  const counts = () => win.evaluate(() => Object.fromEntries(window.app.workspace.getLeavesOfType("cloudmind-view").map((l) => { let n = 0; const w = (x) => { n++; x.children.forEach(w); }; if (l.view.mm) w(l.view.mm.renderer.root); return [l.view.file.basename, n]; })));
  const activate = async (base) => {
    // 像用户一样点标签页标题
    const ok = await win.evaluate((base) => { const l = window.app.workspace.getLeavesOfType("cloudmind-view").find((l) => l.view.file.basename === base); const h = l.tabHeaderEl; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, base);
    await win.mouse.click(ok.x, ok.y); await sleep(900);
  };
  const nodes = () => win.evaluate(() => { const v = window.app.workspace.getActiveViewOfType(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.constructor); if (!v?.mm) return []; v.mm.view.fit(undefined, true, 40); const c = v.mm.el.getBoundingClientRect(); const out = []; const w = (x) => { if (!x.isRoot) { const r = x.getRectInSvg(); if (r.left > 4 && r.top > 4 && r.left + r.width < c.width - 4 && r.top + r.height < c.height - 4) out.push({ t: x.getData("text"), x: c.left + r.left + Math.min(r.width / 2, 20), y: c.top + r.top + r.height / 2 }); } x.children.forEach(w); }; w(v.mm.renderer.root); return out; });
  const order = ["启动耗时", "资产治理", "乐元素面试", "鸿蒙版本", "启动耗时", "资产治理", "启动耗时"];
  let bad = 0;
  for (const [i, base] of order.entries()) {
    await activate(base);
    await sleep(500);
    const l = await nodes();
    if (!l.length) { console.log("  (没有可点节点)", base); continue; }
    const p = l[(i * 3) % l.length];
    await win.mouse.click(p.x, p.y); await sleep(300);
    // 有一半的情况：点完节点后用键盘切走再切回（鼠标不动）
    if (i % 2 === 1) { await win.keyboard.press("Control+Tab"); await sleep(500); await win.keyboard.press("Control+Shift+Tab"); await sleep(500); }
    const c0 = await counts();
    await win.keyboard.press("Backspace"); await sleep(600);
    const c1 = await counts();
    const changed = Object.keys(c0).filter((k) => c0[k] !== c1[k]);
    const ok = changed.length === 1 && changed[0] === base;
    if (!ok) bad++;
    console.log(`${ok ? "✓" : "✗"} 当前「${base}」点「${String(p.t).slice(0, 10)}」→ Backspace：${changed.length ? "变化的导图 " + changed.map((k) => `${k}(${c0[k]}→${c1[k]})`).join("、") : "没有任何导图被删"}`);
  }
  console.log(`\n多标签页：${order.length - bad}/${order.length} 正确`);
  await app.close();
  process.exit(0);
}
// 多个导图标签页：Ctrl+点击双链打开另一张导图后，在新导图里按 Backspace，看删的是哪张图
if (MODE === "tabs") {
  const A = "---\ncloudmind: true\ncloudmind-layout: logicalStructure\n---\n# 图A\n## A甲\n## 去 [[图B]]\n## A丙\n";
  const B = "---\ncloudmind: true\ncloudmind-layout: logicalStructure\n---\n# 图B\n## B甲\n## B乙\n## B丙\n";
  await win.evaluate(async ([A, B]) => {
    for (const [p, t] of [["读书/图A.md", A], ["读书/图B.md", B]]) { const f = window.app.vault.getAbstractFileByPath(p); if (f) await window.app.vault.modify(f, t); else await window.app.vault.create(p, t); }
    const keep = window.app.workspace.getLeaf(true);
    await keep.openFile(window.app.vault.getAbstractFileByPath("读书/图A.md"));
    ["markdown", "cloudmind-view", "empty"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => { if (l !== keep) l.detach(); }));
  }, [A, B]);
  await win.waitForFunction(() => !!window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.mm?.renderer?.root?.group?.node?.isConnected, null, { timeout: 15000 });
  await sleep(800);
  const viewOf = (file) => `window.app.workspace.getLeavesOfType("cloudmind-view").map(l=>l.view).find(v=>v.file?.basename===${JSON.stringify(file)})`;
  const pt = (file, t) => win.evaluate(([file, t]) => { const v = window.app.workspace.getLeavesOfType("cloudmind-view").map((l) => l.view).find((v) => v.file?.basename === file); let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root); const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect(); return { x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2 }; }, [file, t]);
  const kids = (file) => win.evaluate((file) => { const v = window.app.workspace.getLeavesOfType("cloudmind-view").map((l) => l.view).find((v) => v.file?.basename === file); return v ? v.mm.renderer.root.children.map((n) => n.getData("text")) : null; }, file);
  const p = await pt("图A", "去 [[图B]]");
  await win.keyboard.down("Control"); await win.mouse.click(p.x, p.y); await win.keyboard.up("Control");
  await win.waitForFunction(() => window.app.workspace.getLeavesOfType("cloudmind-view").length === 2 && window.app.workspace.getActiveFile()?.basename === "图B", null, { timeout: 15000 });
  await win.waitForFunction(() => { const v = window.app.workspace.getLeavesOfType("cloudmind-view").map((l) => l.view).find((v) => v.file?.basename === "图B"); return !!v?.mm?.renderer?.root?.group?.node?.isConnected; }, null, { timeout: 15000 });
  await sleep(900);
  console.log("图A 状态:", JSON.stringify(await win.evaluate(() => { const v = window.app.workspace.getLeavesOfType("cloudmind-view").map((l) => l.view).find((v) => v.file?.basename === "图A"); return { mouseIn: v.mouseIn, visible: v.contentEl.offsetParent !== null, sel: v.mm.renderer.activeNodeList.map((n) => n.getData("text")) }; })));
  const q = await pt("图B", "B乙");
  await win.mouse.click(q.x, q.y); await sleep(300);
  await win.keyboard.press("Backspace"); await sleep(600);
  const a = await kids("图A"), b = await kids("图B");
  console.log("按 Backspace 后  图A:", JSON.stringify(a), " 图B:", JSON.stringify(b));
  console.log(b && !b.includes("B乙") && a.length === 3 ? "✓ 删的是当前导图的节点" : "✗ 当前导图没删" + (a.length < 3 ? "，而是删了后台标签页「图A」里的节点！" : ""));
  await app.close();
  process.exit(0);
}
// 文件被外部改写（同步 / 另一个标签页编辑）之后还能不能删
if (MODE === "extdel") {
  const MD = "---\ncloudmind: true\ncloudmind-layout: logicalStructure\n---\n# 根\n## 甲\n- 甲1\n- 甲2\n- 甲3\n## 乙\n- 乙1\n- 乙2\n";
  let k = 0;
  const open = async () => {
    await win.keyboard.press("Escape");
    await win.evaluate(() => { ["markdown", "cloudmind-view"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach())); });
    await sleep(300);
    k++;
    await win.evaluate(async ([md, k]) => {
      const p = `读书/外部修改-${k}.md`;
      await window.app.vault.create(p, md);
      await window.app.workspace.getLeaf(true).openFile(window.app.vault.getAbstractFileByPath(p));
    }, [MD, k]);
    await win.waitForFunction(() => !!window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.mm?.renderer?.root?.group?.node?.isConnected, null, { timeout: 15000 });
    await sleep(700);
    return `读书/外部修改-${k}.md`;
  };
  const extModify = (p, add) => win.evaluate(async ([p, add]) => { const f = window.app.vault.getAbstractFileByPath(p); const t = await window.app.vault.read(f); await window.app.vault.modify(f, t + add); }, [p, add]);
  const pt = (t) => win.evaluate((t) => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root); if (!f) return null; const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect(); return { x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2 }; }, t);
  const count = () => win.evaluate(() => { let n = 0; const w = (x) => { n++; x.children.forEach(w); }; w(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.renderer.root); return n; });
  const state = () => win.evaluate(() => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; const b = v.mm.renderer.textEdit.textEditNode; return { editing: v.editing, textEdit: v.mm.renderer.textEdit.isShowTextEdit(), boxVisible: !!b && b.style.display !== "none" && b.isConnected, pop: !!v.popEl, popConnected: !!v.popEl?.isConnected, sel: v.mm.renderer.activeNodeList.map((n) => n.getData("text")) }; });
  const del = async (label, target) => {
    const p = await pt(target); await win.mouse.click(p.x, p.y); await sleep(250);
    const st = await state(); const n0 = await count();
    await win.keyboard.press("Backspace"); await sleep(450);
    const ok = (await count()) < n0;
    console.log(`${ok ? "✓" : "✗"} ${label} → 删「${target}」${ok ? "成功" : "失败"}`, ok ? "" : JSON.stringify(st));
    return ok;
  };
  const res = [];
  let p = await open();
  await extModify(p, "## 丙\n"); await sleep(1200);
  res.push(await del("没在编辑时文件被外部改写", "甲1"));
  p = await open();
  { const q = await pt("甲2"); await win.mouse.dblclick(q.x, q.y); await sleep(300); await win.keyboard.type("x"); }
  await extModify(p, "## 丙\n"); await sleep(1200);
  console.log("   编辑中被改写后状态:", JSON.stringify(await state()));
  res.push(await del("编辑节点文字时文件被外部改写", "甲3"));
  p = await open();
  { const q = await pt("乙1"); await win.mouse.click(q.x, q.y); await sleep(250); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="fill"]').catch(() => {}); await sleep(300); }
  await extModify(p, "## 丙\n"); await sleep(1200);
  console.log("   颜色面板开着时被改写后状态:", JSON.stringify(await state()));
  res.push(await del("颜色面板开着时文件被外部改写", "乙2"));
  p = await open();
  { const q = await pt("甲2"); await win.mouse.dblclick(q.x, q.y); await sleep(300); await win.keyboard.type("[["); await sleep(400); }
  await extModify(p, "## 丙\n"); await sleep(1200);
  res.push(await del("[[ 笔记列表开着时文件被外部改写", "甲1"));
  console.log(`\n外部改写：${res.filter(Boolean).length}/${res.length} 删除成功`);
  await app.close();
  process.exit(0);
}
// 用用户真实导图的副本：逐个节点点击 + Backspace，并穿插编辑 / 缩放 / 滚动，记录删不掉的情况
if (MODE === "realdel") {
  const cdp = await win.context().newCDPSession(win);
  const src = process.argv[3] || "读书/真实导图.md";
  const V = () => 'window.app.workspace.getLeavesOfType("cloudmind-view")[0].view';
  const open = async () => {
    await win.keyboard.press("Escape");
    await win.evaluate(() => { ["markdown", "cloudmind-view"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach())); });
    await sleep(300);
    await win.evaluate(async (src) => {
      window.__rn = (window.__rn || 0) + 1;
      const text = await window.app.vault.read(window.app.vault.getAbstractFileByPath(src));
      const p = `读书/真实副本-${window.__rn}.md`;
      await window.app.vault.create(p, text);
      await window.app.workspace.getLeaf(true).openFile(window.app.vault.getAbstractFileByPath(p));
    }, src);
    await win.waitForFunction(() => !!window.app.workspace.getLeavesOfType("cloudmind-view")[0]?.view?.mm?.renderer?.root?.group?.node?.isConnected, null, { timeout: 15000 });
    await sleep(700);
    await win.evaluate(() => window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.view.fit(undefined, true, 40));
    await sleep(500);
  };
  const state = () => win.evaluate(() => {
    const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view;
    return { editing: v.editing, textEdit: v.mm.renderer.textEdit.isShowTextEdit(), pop: !!v.popEl, popConnected: !!v.popEl?.isConnected, wiki: !!v.wiki?.isOpen, sel: v.mm.renderer.activeNodeList.map((n) => n.getData("text")), mouseIn: v.mouseIn, activeIsMe: window.app.workspace.getActiveViewOfType(v.constructor) === v, focus: (document.activeElement?.className?.toString?.() || document.activeElement?.tagName || "").slice(0, 30) };
  });
  const leaves = () => win.evaluate(() => {
    const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; const c = v.mm.el.getBoundingClientRect(); const out = [];
    const w = (x) => { if (!x.isRoot && !x.isGeneralization) { const r = x.getRectInSvg(); if (r.left > 0 && r.top > 0 && r.left + r.width < c.width && r.top + r.height < c.height) out.push({ t: x.getData("text"), x: c.left + r.left + Math.min(r.width / 2, 30), y: c.top + r.top + r.height / 2 }); } x.children.forEach(w); };
    w(v.mm.renderer.root); return out;
  });
  const count = () => win.evaluate(() => { let n = 0; const w = (x) => { n++; x.children.forEach(w); }; w(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.renderer.root); return n; });
  const c = await (async () => { await open(); return win.evaluate(() => { const r = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); })();
  const fails = [];
  const tryDelete = async (label) => {
    const list = await leaves();
    if (!list.length) return;
    const p = list[Math.floor(list.length / 2)];
    await win.mouse.click(p.x, p.y); await sleep(250);
    const st = await state();
    const n0 = await count();
    await win.keyboard.press("Backspace"); await sleep(450);
    const n1 = await count();
    const ok = n1 < n0;
    console.log(`${ok ? "✓" : "✗"} ${label}  点「${p.t}」→ 选中 ${JSON.stringify(st.sel)} → ${ok ? "删除" : "没删"}`, ok ? "" : JSON.stringify(st));
    if (!ok) fails.push(label);
  };
  const steps = [
    ["直接删", async () => {}],
    ["双击编辑→Enter", async () => { const p = (await leaves())[3]; await win.mouse.dblclick(p.x, p.y); await sleep(300); await win.keyboard.press("Enter"); await sleep(300); }],
    ["编辑中 Ctrl+滚轮缩放→点空白", async () => { const p = (await leaves())[4]; await win.mouse.dblclick(p.x, p.y); await sleep(300); for (let i = 0; i < 4; i++) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: -100, modifiers: 2 }); await sleep(80); } await sleep(400); await win.mouse.click(c.x + 5, c.y + 300); await sleep(300); }],
    ["编辑中滚轮平移", async () => { const p = (await leaves())[2]; await win.mouse.dblclick(p.x, p.y); await sleep(300); for (let i = 0; i < 6; i++) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: 60 }); await sleep(30); } await sleep(400); }],
    ["编辑中点另一个节点", async () => { const l = await leaves(); await win.mouse.dblclick(l[1].x, l[1].y); await sleep(300); await win.mouse.click(l[5].x, l[5].y); await sleep(300); }],
    ["编辑中点工具栏按钮", async () => { const p = (await leaves())[1]; await win.mouse.dblclick(p.x, p.y); await sleep(300); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="bold"]').catch(() => {}); await sleep(300); }],
    ["直接打字→Enter", async () => { const p = (await leaves())[2]; await win.mouse.click(p.x, p.y); await sleep(200); await win.keyboard.type("ab"); await win.keyboard.press("Enter"); await sleep(300); }],
    ["打字中输入 [[ → Esc → Esc", async () => { const p = (await leaves())[2]; await win.mouse.dblclick(p.x, p.y); await sleep(300); await win.keyboard.type("[["); await sleep(400); await win.keyboard.press("Escape"); await sleep(200); await win.keyboard.press("Escape"); await sleep(300); }],
    ["打开颜色面板→点空白", async () => { const p = (await leaves())[2]; await win.mouse.click(p.x, p.y); await sleep(250); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="fill"]').catch(() => {}); await sleep(300); await win.mouse.click(c.x - 200, c.y + 250); await sleep(300); }],
    ["打开图标面板→Esc", async () => { const p = (await leaves())[2]; await win.mouse.click(p.x, p.y); await sleep(250); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="icon"]').catch(() => {}); await sleep(300); await win.keyboard.press("Escape"); await sleep(300); }],
    ["备注弹窗→取消", async () => { const p = (await leaves())[2]; await win.mouse.click(p.x, p.y); await sleep(250); await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="note"]').catch(() => {}); await sleep(400); await win.locator(".modal button", { hasText: "取消" }).first().click().catch(() => {}); await sleep(300); }],
    ["Tab 新建→打字→Enter", async () => { const p = (await leaves())[2]; await win.mouse.click(p.x, p.y); await sleep(250); await win.keyboard.press("Tab"); await sleep(400); await win.keyboard.type("新"); await win.keyboard.press("Enter"); await sleep(400); }],
    ["拖动节点", async () => { const l = await leaves(); await win.mouse.move(l[6].x, l[6].y); await win.mouse.down(); await win.mouse.move(l[2].x, l[2].y + 20, { steps: 10 }); await win.mouse.up(); await sleep(600); }],
    ["切到文本再切回", async () => { await win.evaluate(() => window.app.commands.executeCommandById("cloudmind:open-as-text")); await sleep(900); await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn"); await sleep(1500); }],
    ["Ctrl+Z 撤销", async () => { await win.keyboard.press("Control+z"); await sleep(400); }],
    ["连续删 5 个", async () => { for (let i = 0; i < 4; i++) { const l = await leaves(); await win.mouse.click(l[0].x, l[0].y); await sleep(200); await win.keyboard.press("Backspace"); await sleep(350); } }],
  ];
  await open();
  for (const [name, fn] of steps) {
    try { await fn(); } catch (e) { console.log("  (setup error)", name, String(e).slice(0, 120)); }
    await tryDelete(name);
  }
  console.log(`\n真实导图：${steps.length - fails.length}/${steps.length} 删除成功`, fails.length ? "失败: " + fails.join(" / ") : "");
  await app.close();
  process.exit(0);
}
// Backspace / Delete 删除节点：各种操作顺序之后都要能删
if (MODE === "backspace") {
  const cdp = await win.context().newCDPSession(win);
  const MD = "---\ncloudmind: true\ncloudmind-layout: logicalStructure\n---\n# 根\n## 甲\n- 甲1\n  - 甲1a\n  - 甲1b\n- 甲2\n## 乙 [[读书清单 2026]]\n- 乙1\n- 乙2\n## 丙\n- 丙1\n";
  const fresh = async () => {
    await win.keyboard.press("Escape");
    await win.evaluate(() => { ["markdown", "cloudmind-view"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach())); });
    await sleep(300);
    await win.evaluate(async (md) => {
      window.__delN = (window.__delN || 0) + 1;
      const p = `读书/删除测试-${window.__delN}.md`;
      const f = window.app.vault.getAbstractFileByPath(p);
      if (f) await window.app.vault.modify(f, md); else await window.app.vault.create(p, md);
      await window.app.workspace.getLeaf(true).openFile(window.app.vault.getAbstractFileByPath(p));
    }, MD);
    await sleep(800);
    await win.waitForFunction(() => { const l = window.app.workspace.getLeavesOfType("cloudmind-view")[0]; return !!l?.view?.mm?.renderer?.root?.group?.node?.isConnected; }, null, { timeout: 15000 });
    await sleep(600);
  };
  const pt = (t) => win.evaluate((t) => {
    const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view;
    let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root);
    if (!f) return null;
    const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect();
    return { x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2 };
  }, t);
  const count = () => win.evaluate(() => { let n = 0; const w = (x) => { n++; x.children.forEach(w); }; w(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.renderer.root); return n; });
  const exists = (t) => win.evaluate((t) => { let f = false; const w = (x) => { if (x.getData("text") === t) f = true; x.children.forEach(w); }; w(window.app.workspace.getLeavesOfType("cloudmind-view")[0].view.mm.renderer.root); return f; }, t);
  const info = () => win.evaluate(() => {
    const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view;
    return { sel: v.mm.renderer.activeNodeList.map((n) => n.getData("text")), editing: v.editing, textEdit: v.mm.renderer.textEdit.isShowTextEdit(), focus: document.activeElement?.className?.toString().slice(0, 40) || document.activeElement?.tagName, active: window.app.workspace.getActiveViewOfType(v.constructor) === v };
  });
  const click = async (t) => { const p = await pt(t); await win.mouse.click(p.x, p.y); await sleep(250); };
  const imeBackspace = () => cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Process", code: "Backspace", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 }).then(() => cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }));
  const results = [];
  const run = async (name, target0, setup, press = () => win.keyboard.press("Backspace")) => {
    await fresh();
    await setup();
    const before = await info();
    let target = target0;
    if (before.sel.length === 1) target = before.sel[0];
    const n0 = await count();
    await press();
    await sleep(500);
    const gone = !(await exists(target)) && (await count()) < n0;
    results.push(gone);
    console.log(`${gone ? "✓" : "✗"} ${name}  删「${target}」→ ${gone ? "已删除" : "没删掉"}`, gone ? "" : JSON.stringify(before));
  };
  if (process.argv.includes("--f2")) {
    for (const how of ["F2", "dblclick", "直接打字"]) {
      await fresh();
      const tree = () => win.evaluate(() => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; const s = (n) => JSON.stringify(n.getData("text")) + (n.children.length ? "(" + n.children.map(s).join(",") + ")" : ""); return s(v.mm.renderer.root.children[0]); });
      const file = () => win.evaluate(() => window.app.workspace.getActiveFile()?.path);
      await click("甲2");
      const p = await pt("甲2");
      if (how === "F2") await win.keyboard.press("F2"); else if (how === "dblclick") await win.mouse.dblclick(p.x, p.y);
      await sleep(400);
      const st1 = await info();
      if (how !== "直接打字") await win.keyboard.press("End");
      await win.keyboard.type("x"); await sleep(150);
      const st2 = await info();
      await win.keyboard.press("Enter"); await sleep(600);
      console.log(`[${how}] 进入后:`, JSON.stringify(st1), "\n   打字后:", JSON.stringify(st2), "\n   Enter 后 甲分支:", await tree(), "选中:", JSON.stringify((await info()).sel), "文件:", await file());
    }
    await app.close();
    process.exit(0);
  }
  await run("单击子节点 → Backspace", "甲1", () => click("甲1"));
  await run("单击三级节点 → Backspace", "甲1a", () => click("甲1a"));
  await run("单击子节点 → Delete", "甲2", () => click("甲2"), () => win.keyboard.press("Delete"));
  await run("中文输入法开着 → Backspace", "乙1", () => click("乙1"), imeBackspace);
  await run("选中、F2 改字、Enter → Backspace", "甲2", async () => { await click("甲2"); await win.keyboard.press("F2"); await sleep(300); await win.keyboard.press("End"); await win.keyboard.type("x"); await win.keyboard.press("Enter"); await sleep(400); await win.evaluate(() => { const v = window.app.workspace.getLeavesOfType("cloudmind-view")[0].view; let f; const w = (x) => { if (x.getData("text") === "甲2x") f = x; x.children.forEach(w); }; w(v.mm.renderer.root); }); }, async () => { await win.keyboard.press("Backspace"); });
  await run("双击编辑、改字、Esc → Backspace", "甲1", async () => { const p = await pt("甲1"); await win.mouse.dblclick(p.x, p.y); await sleep(400); await win.keyboard.press("End"); await win.keyboard.type("改"); await win.keyboard.press("Escape"); await sleep(300); });
  await run("双击编辑、Esc → Backspace", "甲1", async () => { const p = await pt("甲1"); await win.mouse.dblclick(p.x, p.y); await sleep(400); await win.keyboard.press("Escape"); await sleep(300); });
  await run("F2 编辑后 Esc → Backspace", "丙1", async () => { await click("丙1"); await win.keyboard.press("F2"); await sleep(300); await win.keyboard.press("Escape"); await sleep(300); });
  await run("Tab 新建子节点、输入、Enter → 选回再 Backspace", "乙2", async () => { await click("乙2"); await win.keyboard.press("Tab"); await sleep(400); await win.keyboard.type("新子"); await win.keyboard.press("Enter"); await sleep(400); await click("乙2"); });
  await run("拖动别的节点后 → 单击 → Backspace", "甲1b", async () => {
    const a = await pt("丙1"), b = await pt("乙1");
    await win.mouse.move(a.x, a.y); await win.mouse.down(); await win.mouse.move(b.x, b.y + 25, { steps: 10 }); await win.mouse.up(); await sleep(600);
    await click("甲1b");
  });
  await run("右键菜单打开后 Esc → Backspace", "乙1", async () => { const p = await pt("乙1"); await win.mouse.click(p.x, p.y, { button: "right" }); await sleep(300); await win.keyboard.press("Escape"); await sleep(200); });
  await run("方向键选到子节点 → Backspace", "甲1", async () => { await click("甲"); await win.keyboard.press("ArrowRight"); await sleep(300); });
  await run("先点文件列表、再点回节点 → Backspace", "丙1", async () => { await win.locator(".nav-folder-title").first().click(); await sleep(300); await click("丙1"); });
  await run("鼠标移出画布后 → Backspace", "甲2", async () => { await click("甲2"); await win.mouse.move(5, 400); await sleep(200); });
  await run("编辑带链接节点后 → 选子节点 Backspace", "乙1", async () => { const p = await pt("乙 [[读书清单 2026]]"); await win.mouse.dblclick(p.x, p.y); await sleep(300); await win.keyboard.press("Escape"); await sleep(300); await click("乙1"); });
  await run("快捷条“删除”按钮", "甲1", async () => { await click("甲1"); }, async () => { await win.click('.workspace-leaf.mod-active .cm-nodebar [data-id="delete"]'); });
  const ok = results.filter(Boolean).length;
  console.log(`\n结果：${ok}/${results.length} 删除成功`);
  await app.close();
  process.exit(0);
}
// 性能：打开耗时 + 滚轮平移 / 缩放的帧耗时 + CPU 热点
if (MODE === "perf") {
  const target = process.argv[3] || "读书/性能测试.md";
  const cdp = await win.context().newCDPSession(win);
  const openOnce = async () => {
    await win.evaluate(() => { ["markdown", "cloudmind-view"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach())); });
    await sleep(500);
    return win.evaluate(async (target) => {
      const t0 = performance.now();
      const f = window.app.vault.getAbstractFileByPath(target);
      await window.app.workspace.getLeaf(true).openFile(f);
      // 等到导图渲染完成
      for (let i = 0; i < 400; i++) {
        const v = window.app.workspace.activeLeaf?.view;
        if (v?.getViewType?.() === "cloudmind-view" && v.mm?.renderer?.root?.group?.node?.isConnected) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      const t1 = performance.now();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { ready: Math.round(t1 - t0), painted: Math.round(performance.now() - t0) };
    }, target);
  };
  const opens = [];
  for (let i = 0; i < 3; i++) opens.push(await openOnce());
  console.log("open times:", JSON.stringify(opens));
  const nodes = await win.evaluate(() => { let n = 0; const w = (x) => { n++; x.children.forEach(w); }; w(window.app.workspace.activeLeaf.view.mm.renderer.root); return n; });
  console.log("nodes:", nodes);
  const c = await win.evaluate(() => { const r = window.app.workspace.activeLeaf.view.mm.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  // 帧计时：在页面里记录每帧间隔
  const startFrames = () => win.evaluate(() => {
    window.__ft = []; let last = performance.now();
    const loop = (t) => { window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(loop); };
    window.__ftOn = true; requestAnimationFrame(loop);
  });
  const stopFrames = () => win.evaluate(() => {
    window.__ftOn = false;
    const a = window.__ft.slice(2).sort((x, y) => x - y);
    const q = (p) => Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 10) / 10;
    return { frames: a.length, p50: q(0.5), p95: q(0.95), max: Math.round(a[a.length - 1]), over33: a.filter((x) => x > 33).length, over50: a.filter((x) => x > 50).length };
  });
  const wheel = async (n, dx, dy, mods = 0, gap = 16) => {
    for (let i = 0; i < n; i++) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: dx, deltaY: dy, modifiers: mods });
      await sleep(gap);
    }
  };
  const scenario = async (name, fn) => {
    await startFrames();
    await fn();
    await sleep(400);
    console.log(name.padEnd(28), JSON.stringify(await stopFrames()));
  };
  const clearSel = () => win.evaluate(() => window.app.workspace.activeLeaf.view.mm.execCommand("CLEAR_ACTIVE_NODE"));
  const selectSome = () => win.evaluate(() => { const v = window.app.workspace.activeLeaf.view; const n = v.mm.renderer.root.children[0]; v.mm.execCommand("CLEAR_ACTIVE_NODE"); n.active(); });

  // 拖动节点：帧耗时 + 吸附预览跳动次数
  const dragScenario = async (label) => {
    await clearSel(); await sleep(300);
    await win.evaluate(() => window.app.workspace.activeLeaf.view.mm.view.fit(undefined, true, 40));
    await sleep(500);
    const pts = await win.evaluate(() => {
      const v = window.app.workspace.activeLeaf.view;
      const c = v.mm.el.getBoundingClientRect();
      // 找一个有至少 4 个兄弟的分支
      let par = null; const w = (x) => { if (!par && x.children.length >= 4 && !x.isRoot) par = x; x.children.forEach(w); }; w(v.mm.renderer.root);
      if (!par) par = v.mm.renderer.root;
      const kids = par.children.map((k) => { const r = k.getRectInSvg(); return { t: k.getData("text"), x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2, h: r.height }; });
      return kids;
    });
    const from = pts[pts.length - 1], first = pts[0];
    await win.evaluate(() => {
      const d = window.app.workspace.activeLeaf.view.mm.drag;
      window.__ph = []; window.__checks = 0;
      const orig = d.setPlaceholderRect.bind(d);
      d.setPlaceholderRect = (o) => { window.__ph.push(`${(d.prevNode || d.nextNode || d.overlapNode)?.getData("text")}|${d.prevNode ? "after" : d.nextNode ? "before" : "child"}`); return orig(o); };
      const oc = d.cmCheckNow?.bind(d);
      if (oc) d.cmCheckNow = () => { window.__checks++; return oc(); };
    });
    await startFrames();
    await win.mouse.move(from.x, from.y); await win.mouse.down();
    // 慢慢往上拖过所有兄弟，再拖回来
    const steps = 120;
    for (let i = 0; i <= steps; i++) { const t = i / steps; await win.mouse.move(from.x + 6 * Math.sin(i / 5), from.y + (first.y - first.h - from.y) * t); await sleep(16); }
    for (let i = 0; i <= 40; i++) { await win.mouse.move(first.x + 3, first.y - first.h * 0.35); await sleep(16); }
    await win.mouse.up();
    await sleep(400);
    const fr = await stopFrames();
    const ph = await win.evaluate(() => window.__ph);
    let changes = 0, flips = 0;
    for (let i = 1; i < ph.length; i++) { if (ph[i] !== ph[i - 1]) { changes++; if (i >= 2 && ph[i] === ph[i - 2]) flips++; } }
    const result = await win.evaluate(() => { const v = window.app.workspace.activeLeaf.view; return v.mm.renderer.root.children.map((x) => x.getData("text")).length; });
    console.log(label.padEnd(28), JSON.stringify(fr), "| 预览重绘次数", ph.length, "| 位置变化", changes, "| 来回跳", flips, "| 判定次数", await win.evaluate(() => window.__checks));
    await win.evaluate(() => window.app.workspace.activeLeaf.view.mm.execCommand("BACK"));
    await sleep(500);
  };
  await dragScenario("拖动节点经过兄弟节点");
  if (process.argv.includes("--drag-only")) { await app.close(); process.exit(0); }

  await clearSel(); await sleep(300);
  await scenario("触控板平移(未选中)", () => wheel(90, 3, 9));
  await scenario("鼠标滚轮平移(未选中)", () => wheel(20, 0, 100, 0, 60));
  await scenario("Ctrl+滚轮缩放(未选中)", () => wheel(20, 0, -100, 2, 60));
  await selectSome(); await sleep(300);
  await scenario("触控板平移(已选中节点)", () => wheel(90, 3, 9));
  await scenario("Ctrl+滚轮缩放(已选中节点)", () => wheel(20, 0, 100, 2, 60));
  // 拖动画布平移
  await clearSel(); await sleep(200);
  await scenario("鼠标拖动画布", async () => {
    await win.mouse.move(c.x + 300, c.y + 250); await win.mouse.down();
    for (let i = 0; i < 60; i++) { await win.mouse.move(c.x + 300 - i * 4, c.y + 250 - i * 2); await sleep(16); }
    await win.mouse.up();
  });

  // CPU 热点：触控板平移期间
  if (process.argv.includes("--profile")) {
    await selectSome();
    await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start");
    await wheel(120, 3, 9);
    await sleep(300);
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; let total = 0;
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} @${(n.callFrame.url.split("/").pop() || "").slice(0, 40)}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); total += dt[i] || 0; });
    console.log("CPU top self-time (ms) during trackpad pan, total", Math.round(total / 1000));
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log("  ", (v / 1000).toFixed(1).padStart(7), k));
  }
  await app.close();
  process.exit(0);
}
// 双链跳转：Ctrl+点击 / 快捷条“打开” / 右键菜单 / 普通单击 / 双击
if (MODE === "links") {
  const openMap = async () => {
    await win.evaluate(async () => {
      const f = window.app.vault.getAbstractFileByPath("读书/链接测试.md");
      await window.app.workspace.getLeaf(false).openFile(f);
    });
    await sleep(1800);
  };
  const state = () => win.evaluate(() => ({
    active: window.app.workspace.getActiveFile()?.path,
    view: window.app.workspace.activeLeaf?.view?.getViewType?.(),
    tabs: window.app.workspace.getLeavesOfType("markdown").length + window.app.workspace.getLeavesOfType("cloudmind-view").length,
    menu: [...document.querySelectorAll(".menu .menu-item")].map((e) => e.textContent.trim()),
    notice: [...document.querySelectorAll(".notice")].map((e) => e.textContent.trim()).slice(-1)[0] ?? null,
  }));
  const rectOf = (t) => win.evaluate((t) => {
    const v = window.app.workspace.activeLeaf.view;
    let f; const w = (x) => { if (x.getData("text").includes(t)) f = x; x.children.forEach(w); }; w(v.mm.renderer.root);
    const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect();
    return { x: c.left + r.left + r.width / 2, y: c.top + r.top + r.height / 2 };
  }, t);
  const reset = async () => {
    await win.keyboard.press("Escape");
    await win.evaluate(() => { ["markdown", "cloudmind-view"].forEach((t) => window.app.workspace.getLeavesOfType(t).forEach((l) => l.detach())); document.querySelectorAll(".notice").forEach((n) => n.remove()); });
    await openMap();
  };
  await openMap();
  console.log("start:", JSON.stringify(await state()));
  const cases = ["读书清单 2026", "项目周报", "别名", "不存在的笔记", "标题锚点"];
  for (const key of cases) {
    // A. Ctrl+点击
    await reset();
    let p = await rectOf(key);
    await win.keyboard.down("Control");
    await win.mouse.click(p.x, p.y);
    await win.keyboard.up("Control");
    await sleep(1200);
    console.log(`[${key}] Ctrl+点击 →`, JSON.stringify(await state()));
    // B. 选中后快捷条“打开”
    await reset();
    p = await rectOf(key);
    await win.mouse.click(p.x, p.y);
    await sleep(500);
    const bar = await win.evaluate(() => !!document.querySelector('.cm-nodebar [data-id="openlink"]'));
    if (bar) await win.click('.cm-nodebar [data-id="openlink"]');
    await sleep(1200);
    console.log(`[${key}] 快捷条“打开”(存在=${bar}) →`, JSON.stringify(await state()));
    // C. 右键 → 打开引用的笔记
    await reset();
    p = await rectOf(key);
    await win.mouse.click(p.x, p.y);
    await win.mouse.click(p.x, p.y, { button: "right" });
    await sleep(500);
    const item = win.locator(".menu .menu-item", { hasText: "打开引用的笔记" });
    const has = await item.count();
    if (has) await item.first().click();
    await sleep(1200);
    console.log(`[${key}] 右键菜单(有该项=${has > 0}) →`, JSON.stringify(await state()));
  }
  // D. 普通单击 / 双击（预期：单击=选中，双击=编辑文字，都不跳转）
  await reset();
  let p = await rectOf("读书清单 2026");
  await win.mouse.click(p.x, p.y);
  await sleep(800);
  console.log("[普通单击] →", JSON.stringify(await state()));
  await win.mouse.dblclick(p.x, p.y);
  await sleep(800);
  console.log("[双击] →", JSON.stringify(await state()), "编辑框:", await win.evaluate(() => !!document.querySelector(".smm-node-edit-wrap")));
  await win.screenshot({ path: path.join(out, "_links.png") });
  await app.close();
  process.exit(0);
}
// 备注：添加 / 修改 / 显示 / 拖动后跟随 / 切文本再切回 / 清空
if (MODE === "note") {
  const view = () => "window.app.workspace.activeLeaf.view";
  await win.evaluate(async () => {
    const f = window.app.vault.getAbstractFileByPath("读书/原子习惯.md");
    await window.app.workspace.getLeaf(false).openFile(f);
  });
  await sleep(800);
  await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn");
  await sleep(1800);
  const find = (t) => win.evaluate((t) => {
    const v = window.app.workspace.activeLeaf.view;
    let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root);
    return f ? { note: f.getData("note") ?? null, parent: f.parent?.getData("text") } : null;
  }, t);
  const select = (t) => win.evaluate((t) => {
    const v = window.app.workspace.activeLeaf.view;
    let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root);
    v.mm.execCommand("CLEAR_ACTIVE_NODE"); f.active();
  }, t);
  const md = () => win.evaluate(() => window.app.workspace.activeLeaf.view.getViewData());
  const fileText = () => win.evaluate(async () => window.app.vault.read(window.app.vault.getAbstractFileByPath("读书/原子习惯.md")));
  const openNoteDialog = async (t) => {
    await select(t);
    await sleep(300);
    await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="note"]');
    await sleep(500);
  };
  // 1. 添加多行、带列表的备注
  await openNoteDialog("每天进步 1%");
  const ta = win.locator(".modal textarea").first();
  console.log("dialog shown:", await ta.count() > 0);
  await ta.fill("一年就是 37 倍\n- 复利效应\n- 坚持比强度重要");
  await win.locator(".modal button", { hasText: "确定" }).click();
  await sleep(1500);
  console.log("1 after add:", JSON.stringify(await find("每天进步 1%")));
  // 节点上是否显示备注图标
  const iconShown = await win.evaluate(() => {
    const v = window.app.workspace.activeLeaf.view;
    let f; const w = (x) => { if (x.getData("text") === "每天进步 1%") f = x; x.children.forEach(w); }; w(v.mm.renderer.root);
    return !!f._noteData || f.group.node.querySelectorAll(".smm-node-note, [class*=note]").length;
  });
  console.log("1 note icon on node:", iconShown);
  await win.screenshot({ path: path.join(out, "_note-1.png") });
  // 2. 再打开：内容是否回填，修改
  await openNoteDialog("每天进步 1%");
  console.log("2 prefilled:", JSON.stringify(await win.locator(".modal textarea").first().inputValue()));
  await win.locator(".modal textarea").first().fill("一年就是 37 倍\n- 复利效应\n- 坚持比强度重要\n# 小结：系统 > 目标");
  await win.locator(".modal button", { hasText: "确定" }).click();
  await sleep(1500);
  console.log("2 after edit:", JSON.stringify(await find("每天进步 1%")));
  // 3. 拖动这个节点到另一个分支下，备注跟着走
  const rectOf = (t) => win.evaluate((t) => {
    const v = window.app.workspace.activeLeaf.view;
    let f; const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); }; w(v.mm.renderer.root);
    const r = f.getRectInSvg(); const c = v.mm.el.getBoundingClientRect();
    return { left: c.left + r.left, top: c.top + r.top, width: r.width, height: r.height };
  }, t);
  await win.evaluate(() => window.app.workspace.activeLeaf.view.mm.execCommand("CLEAR_ACTIVE_NODE"));
  const a = await rectOf("每天进步 1%"), b = await rectOf("睡前复盘");
  await win.mouse.move(a.left + a.width / 2, a.top + a.height / 2);
  await win.mouse.down();
  await win.mouse.move(b.left + b.width / 2, b.top + b.height * 0.85, { steps: 12 });
  await win.mouse.up();
  await sleep(1500);
  console.log("3 after drag:", JSON.stringify(await find("每天进步 1%")));
  // 4. 文件内容
  await sleep(1500);
  const ft = await fileText();
  console.log("4 file:\n" + ft);
  // 5. 切到文本再切回
  await win.evaluate(() => window.app.commands.executeCommandById("cloudmind:open-as-text"));
  await sleep(1200);
  await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn");
  await sleep(1800);
  console.log("5 after text→map:", JSON.stringify(await find("每天进步 1%")), "| 节点数:", await win.evaluate(() => { let n = 0; const w = (x) => { n++; x.children.forEach(w); }; w(window.app.workspace.activeLeaf.view.mm.renderer.root); return n; }));
  // 6. 清空备注
  await openNoteDialog("每天进步 1%");
  await win.locator(".modal textarea").first().fill("");
  await win.locator(".modal button", { hasText: "确定" }).click();
  await sleep(600);
  console.log("6 save state right after:", await win.evaluate(() => document.querySelector(".workspace-leaf.mod-active .cm-seg-save")?.textContent));
  await sleep(3400);
  console.log("6 save state after 4s:", await win.evaluate(() => document.querySelector(".workspace-leaf.mod-active .cm-seg-save")?.textContent));
  console.log("6 after clear:", JSON.stringify(await find("每天进步 1%")));
  const ft2 = await fileText();
  console.log("6 file section:\n" + ft2.split("## 我的行动")[1]);
  await app.close();
  process.exit(0);
}
// 拖拽换位置（真实鼠标）
if (MODE === "drag") {
  await win.evaluate(async () => {
    const f = window.app.vault.getAbstractFileByPath("读书/原子习惯.md");
    await window.app.workspace.getLeaf(false).openFile(f);
  });
  await sleep(800);
  await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn");
  await sleep(1800);
  const rectOf = (t) =>
    win.evaluate((t) => {
      const v = window.app.workspace.activeLeaf.view;
      let f;
      const w = (x) => { if (x.getData("text") === t) f = x; x.children.forEach(w); };
      w(v.mm.renderer.root);
      const r = f.getRectInSvg();
      const c = v.mm.el.getBoundingClientRect();
      return { left: c.left + r.left, top: c.top + r.top, width: r.width, height: r.height };
    }, t);
  const order = () => win.evaluate(() => {
    const v = window.app.workspace.activeLeaf.view;
    const s = (n) => n.getData("text") + (n.children.length ? "(" + n.children.map(s).join(",") + ")" : "");
    return s(v.mm.renderer.root.children.find((n) => n.getData("text") === "四大定律"));
  });
  console.log("before:", await order());
  const drag = async (from, to, y) => {
    const a = await rectOf(from), b = await rectOf(to);
    await win.mouse.move(a.left + a.width / 2, a.top + a.height / 2);
    await win.mouse.down();
    await win.mouse.move(b.left + b.width / 2, b.top + b.height * y, { steps: 12 });
    await win.mouse.up();
    await sleep(700);
    console.log(`drag ${from} → ${to} @${y}:`, await order());
  };
  await drag("让它令人愉悦", "让它显而易见", 0.15); // 期望：移到最前
  await drag("让它简便易行", "让它显而易见", 0.85); // 期望：成为第 2 个
  await drag("让它有吸引力", "让它令人愉悦", 0.5); // 期望：成为“让它令人愉悦”的子节点
  const md = await win.evaluate(() => window.app.workspace.activeLeaf.view.getViewData());
  console.log("saved md excerpt:\n" + md.split("## 四大定律")[1].split("## 我的行动")[0]);
  await app.close();
  process.exit(0);
}
// 图标面板
if (MODE === "icons") {
  await win.evaluate(async () => {
    const f = window.app.vault.getAbstractFileByPath("读书/原子习惯.md");
    await window.app.workspace.getLeaf(false).openFile(f);
  });
  await sleep(800);
  await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn");
  await sleep(1800);
  await win.evaluate(() => {
    const v = window.app.workspace.activeLeaf.view;
    const n = v.mm.renderer.root.children[0];
    v.mm.execCommand("CLEAR_ACTIVE_NODE");
    n.active();
  });
  await sleep(400);
  await win.click('.workspace-leaf.mod-active .cm-toolbar [data-id="icon"]');
  await sleep(500);
  await win.click('.cm-pop-icon [data-icon="priority_1"]');
  await win.click('.cm-pop-icon [data-icon="expression_1"]');
  await sleep(500);
  const st = await win.evaluate(() => ({
    buttons: document.querySelectorAll(".cm-pop-icon .cm-icon-btn").length,
    visible: [...document.querySelectorAll(".cm-pop-icon .cm-icon-btn svg")].filter((s) => s.getBoundingClientRect().width >= 16).length,
    nodeIcons: window.app.workspace.activeLeaf.view.mm.renderer.root.children[0].getData("icon"),
  }));
  console.log("real obsidian icon panel:", JSON.stringify(st));
  await win.screenshot({ path: path.join(out, "_icons.png") });
  console.log("saved _icons");
  await app.close();
  process.exit(0);
}
// 文件右键菜单的全部条目（核对“在系统资源管理器中显示”之类的文字）
if (MODE === "filemenu") {
  await win.locator(".nav-file-title").first().click({ button: "right" });
  await sleep(600);
  console.log("file menu:", JSON.stringify(await win.evaluate(() => [...document.querySelectorAll(".menu .menu-item")].map((e) => e.textContent.trim()))));
  await app.close();
  process.exit(0);
}
// 安装相关：设置 → 第三方插件（“打开插件文件夹”按钮、CloudMind 开关）
if (MODE === "settings") {
  const gear = await win.evaluate(() => {
    const c = [...document.querySelectorAll(".clickable-icon")].filter((e) => /设置|Settings/.test(e.getAttribute("aria-label") || ""));
    return c.map((e) => e.getAttribute("aria-label") + " @ " + e.closest("[class]")?.className);
  });
  console.log("gear candidates:", JSON.stringify(gear));
  const dbg = await win.evaluate(async () => {
    const s = window.app.setting;
    s.open();
    await new Promise((r) => setTimeout(r, 1200));
    const el = s.containerEl || s.modalEl;
    return {
      keys: Object.keys(s).slice(0, 30),
      connected: !!el?.isConnected,
      cls: el?.className,
      inWindow: el?.ownerDocument === document,
      navItems: el ? el.querySelectorAll("[class*=nav-item]").length : -1,
      sample: el ? [...el.querySelectorAll("[class*=nav-item]")].slice(0, 30).map((e) => e.className + ":" + e.textContent.trim()).join(" | ") : "",
    };
  });
  console.log("setting dbg:", JSON.stringify(dbg));
  await sleep(500);
  // 设置开在单独的窗口里：找到它
  let sw = null;
  for (let i = 0; i < 20 && !sw; i++) {
    for (const p of app.windows()) {
      if (p === win) continue;
      try {
        if (await p.evaluate(() => document.querySelectorAll(".vertical-tab-nav-item").length > 0)) sw = p;
      } catch {}
    }
    if (!sw) await sleep(500);
  }
  console.log("settings window found:", !!sw);
  if (!sw) {
    await app.close();
    process.exit(1);
  }
  await sw.evaluate(([w, h]) => {
    try {
      const bw = window.require("@electron/remote").getCurrentWindow();
      bw.setContentSize(w, h);
    } catch {}
  }, [1000, 720]);
  await sleep(800);
  const tabs = await sw.evaluate(() => [...document.querySelectorAll(".vertical-tab-nav-item")].map((e) => e.textContent.trim()));
  console.log("tabs:", JSON.stringify(tabs));
  await sw.locator(".vertical-tab-nav-item", { hasText: "第三方插件" }).first().click();
  await sleep(1200);
  const info = await sw.evaluate(() =>
    [...document.querySelectorAll(".setting-item")].map((s) => ({
      name: s.querySelector(".setting-item-name")?.textContent?.trim(),
      buttons: [...s.querySelectorAll(".clickable-icon, button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()),
    }))
  );
  console.log("community-plugins items:", JSON.stringify(info));
  const folderLabel = await sw.evaluate(() => {
    const b = [...document.querySelectorAll(".clickable-icon")].find((e) => /文件夹|folder/i.test(e.getAttribute("aria-label") || ""));
    if (b) b.classList.add("cmshot-folderbtn");
    return b?.getAttribute("aria-label") ?? null;
  });
  console.log("folder button:", folderLabel);
  const refreshLabel = await sw.evaluate(() => {
    const b = [...document.querySelectorAll(".clickable-icon")].find((e) => /刷新|重新加载|reload/i.test(e.getAttribute("aria-label") || ""));
    if (b) b.classList.add("cmshot-refresh");
    return b?.getAttribute("aria-label") ?? null;
  });
  console.log("refresh button:", refreshLabel);
  await sw.evaluate(() => {
    const row = [...document.querySelectorAll(".setting-item")].find((s) => /CloudMind/.test(s.querySelector(".setting-item-name")?.textContent || ""));
    row?.querySelector(".checkbox-container")?.classList.add("cmshot-cmtoggle");
  });
  // 标注画在设置窗口里
  const markIn = (page, items, font) =>
    page.evaluate(([items, font]) => {
      for (const it of items) {
        const el = document.querySelector(it.sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const pad = it.pad ?? 4;
        const box = document.createElement("div");
        box.className = "cmshot-mark";
        Object.assign(box.style, { position: "fixed", left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px", border: "3px solid #ff4d4f", borderRadius: "8px", boxShadow: "0 0 0 4px rgba(255,77,79,.18)", zIndex: 99999, pointerEvents: "none" });
        document.body.appendChild(box);
        const tag = document.createElement("div");
        tag.className = "cmshot-mark";
        tag.textContent = it.label;
        const st = { position: "fixed", zIndex: 99999, pointerEvents: "none", background: "#ff4d4f", color: "#fff", font: `700 ${font}px/1.35 'Microsoft YaHei',sans-serif`, padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(255,77,79,.35)" };
        if (it.side === "below") Object.assign(st, { right: innerWidth - (r.right + pad) + "px", top: r.bottom + pad + 10 + "px" });
        if (it.side === "left") Object.assign(st, { right: innerWidth - (r.left - pad - 12) + "px", top: r.top + r.height / 2 - 16 + "px" });
        Object.assign(tag.style, st);
        document.body.appendChild(tag);
      }
    }, [items, font]);
  await markIn(
    sw,
    [
      { sel: ".cmshot-folderbtn", label: "① 打开插件文件夹，放入 3 个文件", side: "below", pad: 4 },
      { sel: ".cmshot-refresh", label: "② 刷新", side: "left", pad: 4 },
      { sel: ".cmshot-cmtoggle", label: "③ 打开 CloudMind 开关", side: "left", pad: 4 },
    ],
    18
  );
  await sleep(300);
  await sw.screenshot({ path: path.join(out, "07-plugins-folder.png") });
  console.log("saved 07-plugins-folder");
  const files = await win.evaluate(async () => (await window.app.vault.adapter.list(".obsidian/plugins/cloudmind")).files);
  console.log("plugin folder files:", JSON.stringify(files));
  await app.close();
  process.exit(0);
}
if (false) {
  console.log("windows:", app.windows().length, "modals:", await win.evaluate(() => document.querySelectorAll(".modal-container").length));
  const tabs = await win.evaluate(() => [...document.querySelectorAll(".vertical-tab-nav-item")].map((e) => e.textContent.trim()));
  console.log("tabs:", JSON.stringify(tabs));
  await win.locator(".vertical-tab-nav-item", { hasText: "第三方插件" }).first().click();
  await sleep(1200);
  const info = await win.evaluate(() =>
    [...document.querySelectorAll(".modal .setting-item")].map((s) => ({
      name: s.querySelector(".setting-item-name")?.textContent?.trim(),
      buttons: [...s.querySelectorAll(".clickable-icon, button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()),
    }))
  );
  console.log("community-plugins items:", JSON.stringify(info));
  const folderLabel = await win.evaluate(() => {
    const b = [...document.querySelectorAll(".modal .clickable-icon")].find((e) => /文件夹|folder/i.test(e.getAttribute("aria-label") || ""));
    if (b) b.classList.add("cmshot-folderbtn");
    return b?.getAttribute("aria-label") ?? null;
  });
  console.log("folder button:", folderLabel);
  await win.evaluate(() => {
    const row = [...document.querySelectorAll(".modal .setting-item")].find((s) => /CloudMind/.test(s.querySelector(".setting-item-name")?.textContent || ""));
    row?.querySelector(".checkbox-container")?.classList.add("cmshot-cmtoggle");
  });
  await sleep(400);
  await mark(
    [
      { sel: ".cmshot-folderbtn", label: "① 点这里打开插件文件夹", side: "below", pad: 4 },
      { sel: ".cmshot-cmtoggle", label: "③ 放好文件后点刷新，打开开关", side: "left", pad: 4 },
    ],
    20
  );
  await win.screenshot({ path: path.join(out, "07-plugins-folder.png") });
  console.log("saved 07-plugins-folder");
  await clearMarks();
  // 系统文件夹里应该是什么样：用 Obsidian 自己的 API 列出插件文件夹内容
  const files = await win.evaluate(async () => (await window.app.vault.adapter.list(".obsidian/plugins/cloudmind")).files);
  console.log("plugin folder files:", JSON.stringify(files));
  await app.close();
  process.exit(0);
}

// ① 左侧栏图标 → 菜单
await win.click('.side-dock-ribbon-action[aria-label="CloudMind 思维导图"]');
await sleep(500);
await mark([
  { sel: '.side-dock-ribbon-action[aria-label="CloudMind 思维导图"]', pad: 3 },
  { sel: ".menu .menu-item", text: "新建思维导图", label: "① 左侧栏 CloudMind 图标 → 新建思维导图", pad: 2 },
]);
await shot("01-ribbon-menu");
await mark([
  { sel: '.side-dock-ribbon-action[aria-label="CloudMind 思维导图"]', pad: 3 },
  { sel: ".menu .menu-item", text: "新建思维导图", label: "① 左侧栏图标 → 新建思维导图", pad: 2 },
], 22);
await crop("obs-ribbon", { extra: [".menu"], pad: 22 });
await clearMarks();
await closeMenus();

// ② 文件夹右键
await win.click('.nav-folder-title[data-path="读书"]', { button: "right" });
await sleep(500);
await mark([
  { sel: '.nav-folder-title[data-path="读书"]', pad: 2 },
  { sel: ".menu .menu-item", text: "CloudMind：新建思维导图", label: "② 文件夹右键 → 在这里新建导图", pad: 2 },
]);
await shot("02-folder-menu");
await mark([{ sel: ".menu .menu-item", text: "CloudMind：新建思维导图", label: "② 文件夹右键 → 在这里新建", pad: 2 }], 22);
await crop("obs-folder", { pad: 22, minH: 150 });
await clearMarks();
await closeMenus();

// ③ 笔记右上角按钮 + 底部状态栏（把已有笔记预览成导图）
await mark([
  { sel: ".workspace-leaf.mod-active .view-action.cm-header-btn", label: "④ 已有笔记：点右上角一键预览成导图", side: "left", pad: 4 },
  { sel: ".status-bar-item.cm-appstatus", label: "⑤ 或点底部状态栏", side: "above", pad: 3 },
]);
await shot("03-header-button");
await mark([{ sel: ".workspace-leaf.mod-active .view-action.cm-header-btn", label: "④ 笔记右上角：一键预览成导图", side: "left", pad: 4 }], 22);
await crop("obs-header", { pad: 22, minW: 640 });
await mark([{ sel: ".status-bar-item.cm-appstatus", label: "⑤ 或点底部状态栏", side: "above", pad: 3 }], 22);
await crop("obs-status", { pad: 22 });
await clearMarks();

// ④ 命令面板
await win.evaluate(() => window.app.commands.executeCommandById("command-palette:open"));
await sleep(500);
await win.keyboard.type("CloudMind");
await sleep(600);
await mark([{ sel: ".prompt .suggestion-item", text: "新建思维导图", label: "③ Ctrl+P 命令面板搜 CloudMind", side: "right", pad: 2 }]);
await shot("04-command-palette");
await mark([{ sel: ".prompt .suggestion-item", text: "新建思维导图", label: "③ Ctrl+P 搜 CloudMind", side: "above", pad: 2 }], 22);
await crop("obs-palette", { extra: [".prompt-input-container", ".prompt .suggestion-item"], pad: 18 });
await clearMarks();
await closeMenus();

// ⑤ 新建后的样子：用左侧栏菜单真的新建一张
await win.click('.side-dock-ribbon-action[aria-label="CloudMind 思维导图"]');
await sleep(400);
await win.locator(".menu .menu-item", { hasText: "新建思维导图" }).first().click();
await sleep(2500);
const created = await win.evaluate(() => {
  const f = window.app.workspace.getActiveFile();
  return { path: f?.path, view: window.app.workspace.activeLeaf?.view?.getViewType?.() };
});
console.log("created:", JSON.stringify(created));
await win.evaluate(() => {
  const v = window.app.workspace.activeLeaf.view;
  v.mm.execCommand("CLEAR_ACTIVE_NODE");
  v.mm.view.setScale(1.6);
  v.mm.renderer.root.group && v.mm.renderer.moveNodeToCenter?.(v.mm.renderer.root);
});
await sleep(800);
await mark([
  { sel: ".nav-file-title", text: "未命名导图", label: "新建后自动生成「未命名导图.md」并以导图打开", pad: 2 },
]);
await shot("05-new-mindmap");
await clearMarks();

// ⑥ 已有笔记预览成导图
await win.evaluate(async () => {
  const f = window.app.vault.getAbstractFileByPath("读书/原子习惯.md");
  await window.app.workspace.getLeaf(false).openFile(f);
});
await sleep(1000);
await win.click(".workspace-leaf.mod-active .view-action.cm-header-btn");
await sleep(2000);
const pv = await win.evaluate(() => window.app.workspace.activeLeaf?.view?.getViewType?.());
await win.evaluate(() => {
  const v = window.app.workspace.activeLeaf.view;
  v.mm.execCommand("CLEAR_ACTIVE_NODE");
  v.mm.view.fit(undefined, true, 60);
});
await sleep(800);
console.log("preview view:", pv);
await shot("06-preview-existing");


await app.close();
console.log("done");
