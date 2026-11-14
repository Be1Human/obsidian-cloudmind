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
async function mark(items) {
  await win.evaluate((items) => {
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
          position: "fixed", zIndex: 99999, pointerEvents: "none", background: "#ff4d4f", color: "#fff", font: "600 15px/1.35 'Microsoft YaHei',sans-serif",
          padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(255,77,79,.35)",
        };
        if (side === "right") Object.assign(st, { left: r.right + pad + 12 + "px", top: r.top + r.height / 2 - 16 + "px" });
        if (side === "left") Object.assign(st, { right: innerWidth - (r.left - pad - 12) + "px", top: r.top + r.height / 2 - 16 + "px" });
        if (side === "below") Object.assign(st, { left: r.left - pad + "px", top: r.bottom + pad + 10 + "px" });
        if (side === "above") Object.assign(st, { right: innerWidth - (r.right + pad) + "px", top: r.top - pad - 44 + "px" });
        Object.assign(tag.style, st);
        document.body.appendChild(tag);
      }
    }
  }, items);
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

// ① 左侧栏图标 → 菜单
await win.click('.side-dock-ribbon-action[aria-label="CloudMind 思维导图"]');
await sleep(500);
await mark([
  { sel: '.side-dock-ribbon-action[aria-label="CloudMind 思维导图"]', pad: 3 },
  { sel: ".menu .menu-item", text: "新建思维导图", label: "① 左侧栏 CloudMind 图标 → 新建思维导图", pad: 2 },
]);
await shot("01-ribbon-menu");
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
await clearMarks();
await closeMenus();

// ③ 笔记右上角按钮 + 底部状态栏（把已有笔记预览成导图）
await mark([
  { sel: ".workspace-leaf.mod-active .view-action.cm-header-btn", label: "④ 已有笔记：点右上角一键预览成导图", side: "left", pad: 4 },
  { sel: ".status-bar-item.cm-appstatus", label: "⑤ 或点底部状态栏", side: "above", pad: 3 },
]);
await shot("03-header-button");
await clearMarks();

// ④ 命令面板
await win.evaluate(() => window.app.commands.executeCommandById("command-palette:open"));
await sleep(500);
await win.keyboard.type("CloudMind");
await sleep(600);
await mark([{ sel: ".prompt .suggestion-item", text: "新建思维导图", label: "③ Ctrl+P 命令面板搜 CloudMind", side: "right", pad: 2 }]);
await shot("04-command-palette");
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
