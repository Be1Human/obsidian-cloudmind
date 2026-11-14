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
