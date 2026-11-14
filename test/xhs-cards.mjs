// 小红书图文卡片：1080×1440（3:4），2 倍清晰度导出
// 先运行 xhs-shots.mjs（插件截图）和 xhs-github.mjs（Release 真实截图）
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "url";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const base = path.join(root, "marketing", "xiaohongshu");
const shots = path.join(base, "shots");
mkdirSync(base, { recursive: true });
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const VER = manifest.version;
const MIN = manifest.minAppVersion;
const REPO = "github.com/Be1Human/obsidian-cloudmind";

const img = (n) => pathToFileURL(path.join(shots, n)).href;
const TOTAL = 7;

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;width:1080px;height:1440px;overflow:hidden}
body{font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;color:#1d1830;
  background:
    radial-gradient(620px 520px at 92% -6%, rgba(120,82,238,.20), transparent 70%),
    radial-gradient(560px 480px at -10% 104%, rgba(255,190,90,.22), transparent 70%),
    #f8f6ff;}
.page{position:absolute;inset:0;padding:70px 64px 0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
.brand{display:flex;align-items:center;gap:14px;font-size:28px;font-weight:700;color:#5b3fd9}
.logo{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#8b6cff,#5b3fd9);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(91,63,217,.35)}
.logo svg{width:28px;height:28px}
.num{font-size:26px;color:#8b84a8;font-weight:600;letter-spacing:1px}
h1{margin:0;font-size:74px;line-height:1.16;font-weight:900;letter-spacing:1px}
h1 .hl{background:linear-gradient(transparent 58%, #ffe27a 58%, #ffe27a 92%, transparent 92%);padding:0 4px}
h2{margin:0;font-size:60px;line-height:1.2;font-weight:900}
h2 .hl{color:#5b3fd9}
.sub{margin-top:18px;font-size:32px;line-height:1.5;color:#4b4562}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:26px}
.chip{padding:10px 22px;border-radius:999px;background:#fff;border:2px solid #e4ddff;font-size:27px;font-weight:700;color:#4a33c4}
.chip.y{background:#fff7d6;border-color:#ffe38a;color:#8a5a00}
.shot{border-radius:20px;box-shadow:0 22px 50px rgba(40,20,110,.20),0 0 0 1px rgba(0,0,0,.06);display:block;width:100%}
.foot{position:absolute;left:64px;right:64px;bottom:44px;display:flex;justify-content:space-between;align-items:center;font-size:24px;color:#8b84a8}
.foot b{color:#5b3fd9;font-weight:700}
.list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:16px}
.list li{font-size:30px;line-height:1.45;padding-left:46px;position:relative;color:#2c2640}
.list li:before{content:"";position:absolute;left:6px;top:12px;width:22px;height:22px;border-radius:7px;background:#7852ee;box-shadow:0 3px 8px rgba(120,82,238,.35)}
.list li b{color:#1d1830}
.list.tight{gap:10px}
.list.tight li{font-size:28px;line-height:1.42}
.list.tight li:before{top:10px}
.kbd{display:inline-block;padding:2px 12px;margin:0 2px;border-radius:8px;background:#fff;border:2px solid #d8d2ee;border-bottom-width:4px;font-family:Consolas,"Cascadia Mono",monospace;font-size:25px;font-weight:700;color:#3a2f73;line-height:1.4}
.code{background:#fff;border-radius:20px;box-shadow:0 18px 40px rgba(40,20,110,.14),0 0 0 1px rgba(0,0,0,.05);padding:18px 0 18px;font-family:Consolas,"Cascadia Mono","Microsoft YaHei",monospace;font-size:24px;line-height:33px}
.code .bar{display:flex;align-items:center;gap:9px;padding:0 26px 12px;border-bottom:1px solid #eee;margin-bottom:10px;font-family:"Microsoft YaHei",sans-serif;font-size:22px;color:#8b84a8}
.code .bar i{width:13px;height:13px;border-radius:50%;display:block}
.ln{display:flex;justify-content:space-between;align-items:center;padding:0 26px}
.ln .t{white-space:pre}
.ln .tag{font-family:"Microsoft YaHei",sans-serif;font-size:21px;font-weight:700;padding:1px 12px;border-radius:8px;white-space:nowrap}
.fm{color:#a29cbb}.h{color:#6a3fe6;font-weight:700}.li{color:#e07b00;font-weight:700}.lk{color:#2f6fe4;text-decoration:underline}.cm{color:#b6b1c8;font-style:italic}
.tag.a{background:#efe9ff;color:#5b3fd9}.tag.b{background:#fff0d9;color:#a86200}.tag.c{background:#e3eeff;color:#2a5fc4}.tag.d{background:#f1f1f4;color:#8a86a0}
.arrow{display:flex;align-items:center;justify-content:center;gap:16px;margin:14px 0;font-size:30px;font-weight:800;color:#5b3fd9}
.arrow svg{width:44px;height:44px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid2 figure{margin:0}
.grid2 figcaption{text-align:center;font-size:25px;font-weight:700;color:#3a3452;margin-top:10px}
.small{border-radius:14px;box-shadow:0 12px 28px rgba(40,20,110,.16),0 0 0 1px rgba(0,0,0,.06);display:block;width:100%}
.steps{display:flex;flex-direction:column;gap:20px;margin-top:6px}
.step{display:flex;gap:20px;align-items:flex-start}
.step .n{flex:0 0 52px;height:52px;border-radius:50%;background:#7852ee;color:#fff;font-size:28px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(120,82,238,.35)}
.step .c{font-size:29px;line-height:1.5;color:#2c2640;padding-top:5px}
.step .c b{color:#1d1830}
.mono{font-family:Consolas,"Cascadia Mono",monospace;background:#efe9ff;color:#4a2fc0;padding:1px 10px;border-radius:7px;font-size:26px;font-weight:700;white-space:nowrap}
.tree{font-family:Consolas,"Cascadia Mono","Microsoft YaHei",monospace;font-size:24px;line-height:34px;background:#1f1b2e;color:#e6e1ff;border-radius:16px;padding:16px 24px;margin-top:10px;white-space:pre}
.tree .d{color:#9c93c9}.tree .f{color:#ffd166;font-weight:700}
.note{margin-top:20px;padding:18px 24px;border-radius:16px;background:#fff7d6;border:2px solid #ffe38a;font-size:26px;line-height:1.5;color:#6b4a00}
.note b{color:#4a3200}
.read{background:#fff;border-radius:14px;box-shadow:0 12px 28px rgba(40,20,110,.14),0 0 0 1px rgba(0,0,0,.06);padding:14px 22px 16px;font-size:19px;line-height:1.5;color:#2c2640}
.read .rcap{font-size:16px;color:#9a94b5;margin-bottom:6px}
.read .rh1{font-size:27px;font-weight:900;margin:2px 0 4px}
.read .rh2{font-size:21px;font-weight:800;margin-top:6px}
.read .rli{padding-left:18px;position:relative}
.read .rli:before{content:"";position:absolute;left:4px;top:12px;width:6px;height:6px;border-radius:50%;background:#7a7495}
.read .rlk{color:#5b3fd9;text-decoration:underline}
`;

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="16" width="6" height="6" rx="1.5"/><rect x="16" y="16" width="6" height="6" rx="1.5"/><path d="M5 16v-3h14v3M12 8v5"/></svg>`;
const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="#5b3fd9" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M5 13l7 7 7-7"/></svg>`;

function page(n, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page">
  <div class="top"><div class="brand"><div class="logo">${LOGO}</div>CloudMind · Obsidian 插件</div><div class="num">${n} / ${TOTAL}</div></div>
  ${body}
  </div><div class="foot"><span>开源免费 · MIT</span><span><b>${REPO}</b></span></div></body></html>`;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cards = [];

// 1 封面
cards.push(page(1, `
  <h1>Obsidian 笔记<br>一键变成 <span class="hl">思维导图</span></h1>
  <div class="sub">像 XMind 一样编辑，数据却还是你的 <b>.md 文件</b><br>不导出、不转换，导图就是笔记本身</div>
  <div class="chips"><span class="chip y">基于 Markdown</span><span class="chip">方块主题</span><span class="chip">[[双链]]</span><span class="chip">中文界面</span></div>
  <div style="margin-top:40px"><img class="shot" src="${img("cover.png")}"></div>
`));

// 2 基于 md（真实的源码 ↔ 渲染）
const lines = [
  ["fm", "---", null],
  ["fm", "cloudmind: true", ["d", "加这一行，打开就是导图"]],
  ["fm", "---", null],
  ["h", "# 周末计划", ["a", "中心主题"]],
  ["h", "## 学习", ["a", "分支"]],
  ["li", "- 读完《原子习惯》", ["b", "子主题"]],
  ["lk", "- 整理 [[读书清单 2026]]", ["c", "双链"]],
  ["cm", '## 运动 <!--mm:{"fillColor":"#C9F0DE"}-->', ["d", "颜色藏在注释里"]],
  ["li", "- 跑步 5 公里", null],
  ["h", "## 生活", null],
  ["li", "- 大扫除", null],
  ["li", "- 买菜做饭", null],
];
const codeHtml = lines
  .map(([k, t, tag]) => {
    let s = esc(t);
    if (k === "h") s = `<span class="h">${s}</span>`;
    else if (k === "li") s = s.replace(/^- /, '<span class="li">- </span>');
    else if (k === "lk") s = s.replace(/^- /, '<span class="li">- </span>').replace(/(\[\[[^\]]+\]\])/, '<span class="lk">$1</span>');
    else if (k === "cm") s = s.replace(/^(## [^&]+)(.*)$/, '<span class="h">$1</span><span class="cm">$2</span>');
    else if (k === "fm") s = `<span class="fm">${s}</span>`;
    return `<div class="ln"><span class="t">${s}</span>${tag ? `<span class="tag ${tag[0]}">${tag[1]}</span>` : ""}</div>`;
  })
  .join("");
cards.push(page(2, `
  <h2>核心卖点：<span class="hl">就是 Markdown</span></h2>
  <div class="sub" style="margin-top:12px;font-size:29px">标题和列表的层级 = 导图的层级，改导图就是改这份 .md</div>
  <div class="code" style="margin-top:24px"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span style="margin-left:10px">周末计划.md（原文，一字未改）</span></div>${codeHtml}</div>
  <div class="arrow">${ARROW}CloudMind 打开后</div>
  <img class="shot" style="width:880px;margin:0 auto" src="${img("small-map.png")}">
`));

// 3 不锁数据
cards.push(page(3, `
  <h2>为什么坚持用 <span class="hl">.md</span> 存？</h2>
  <div class="sub" style="font-size:29px">很多导图工具用私有格式，换软件就迁不走。CloudMind 反过来：</div>
  <ul class="list tight" style="margin-top:24px">
    <li><b>关掉插件，笔记照样能读</b>：就是普通的标题和列表</li>
    <li><b>Obsidian 自带能力全保留</b>：全文搜索、反向链接、关系图谱都认得节点里的 [[双链]]</li>
    <li><b>同步、备份、版本管理随你</b>：iCloud / 坚果云 / Git 都只是在同步一个 .md</li>
    <li><b>样式不污染正文</b>：颜色、折叠等存在行尾 <span class="mono">&lt;!--mm:…--&gt;</span> 注释里，阅读模式看不见</li>
    <li><b>只预览不改动</b>：普通笔记也能点一下看成导图，不编辑就不会写回文件</li>
    <li><b>想要原版也行</b>：可导出 PNG / SVG / <span class="mono">.xmind</span></li>
  </ul>
  <div class="note"><b>怎么让笔记默认用导图打开？</b><br>在笔记开头的属性（frontmatter）里加一行 <span class="mono">cloudmind: true</span>，新建的导图会自动带上。</div>
  <div style="margin-top:26px;font-size:27px;font-weight:800;color:#3a3452">同一份 周末计划.md，两种看法 ↓</div>
  <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1.25fr;gap:18px;align-items:stretch">
    <div class="read">
      <div class="rcap">阅读模式（示意）</div>
      <div class="rh1">周末计划</div>
      <div class="rh2">学习</div>
      <div class="rli">读完《原子习惯》</div>
      <div class="rli">整理 <span class="rlk">读书清单 2026</span></div>
      <div class="rh2">运动</div>
      <div class="rli">跑步 5 公里</div>
      <div class="rh2">生活</div>
      <div class="rli">大扫除 · 买菜做饭</div>
    </div>
    <div style="display:flex;flex-direction:column;justify-content:center"><img class="small" src="${img("small-map.png")}"><div style="text-align:center;font-size:22px;font-weight:700;color:#5b3fd9;margin-top:10px">CloudMind 导图模式</div></div>
  </div>
`));

// 4 编辑体验
cards.push(page(4, `
  <h2>编辑手感 <span class="hl">对齐 XMind</span></h2>
  <div class="sub" style="font-size:29px">选中节点，上方自动浮出快捷条；底部状态栏随时提示快捷键</div>
  <div style="margin-top:26px"><img class="shot" src="${img("edit.png")}"></div>
  <div style="margin-top:34px;display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;font-size:28px;color:#2c2640">
    <div><span class="kbd">Tab</span> 加子主题</div><div><span class="kbd">Enter</span> 加同级主题</div>
    <div><span class="kbd">F2</span> / 直接打字 编辑</div><div><span class="kbd">Del</span> / <span class="kbd">⌫</span> 删除</div>
    <div><span class="kbd">/</span> 折叠展开</div><div><span class="kbd">Ctrl</span>+<span class="kbd">G</span> 加概要</div>
    <div><span class="kbd">Ctrl</span>+<span class="kbd">Z</span> 撤销</div><div>拖动节点 调整层级</div>
  </div>
`));

// 5 双链
cards.push(page(5, `
  <h2>节点里也能 <span class="hl">[[双链]]</span></h2>
  <div class="sub" style="font-size:29px">编辑节点时输入 <span class="mono">[[</span>，直接搜你库里的笔记</div>
  <div style="margin-top:26px"><img class="shot" src="${img("wiki.png")}"></div>
  <ul class="list" style="margin-top:34px">
    <li><span class="kbd">↑</span><span class="kbd">↓</span> 选择，<span class="kbd">Enter</span> 插入，<span class="kbd">Esc</span> 取消</li>
    <li>含链接的节点显示为下划线，<b>Ctrl + 点击</b> 在新标签页打开</li>
    <li>写进文件的就是标准 <span class="mono">[[笔记名]]</span>，反链和图谱都能识别</li>
  </ul>
`));

// 6 主题与工具栏
cards.push(page(6, `
  <h2>10 套主题，<span class="hl">4 套方块风</span></h2>
  <div class="sub" style="font-size:29px">每个节点都有方框围住，打印、截图分享都很清楚</div>
  <div class="grid2" style="margin-top:26px">
    <figure><img class="small" src="${img("theme-cloudBox.png")}"><figcaption>方块</figcaption></figure>
    <figure><img class="small" src="${img("theme-cloudBoxDark.png")}"><figcaption>方块·深色</figcaption></figure>
    <figure><img class="small" src="${img("theme-cloudBoxBlue.png")}"><figcaption>方块·蓝图</figcaption></figure>
    <figure><img class="small" src="${img("theme-cloudMacaron.png")}"><figcaption>马卡龙</figcaption></figure>
  </div>
  <ul class="list" style="margin-top:34px">
    <li><b>8 种结构</b>：思维导图、逻辑图、组织结构图、目录图、时间轴、鱼骨图…</li>
    <li><b>工具栏随你放</b>：顶部 / 底部 / 左右两侧，或悬浮拖动，也能隐藏</li>
    <li>主题点一下就换，<b>自动记在这篇笔记里</b>，每篇可以不同</li>
  </ul>
`));

// 7 安装教程（真实步骤 + 真实 Release 截图）
cards.push(page(7, `
  <h2>安装教程 <span class="hl">3 分钟</span></h2>
  <div class="sub" style="font-size:27px;margin-top:10px">还没上架官方市场，先手动装 · 需 Obsidian 桌面版 ${MIN}+</div>
  <div class="steps" style="margin-top:22px">
    <div class="step"><div class="n">1</div><div class="c">打开 <span class="mono">${REPO}</span> → 右侧 <b>Releases</b> → 最新版 <b>${VER}</b>，下载这 <b>3 个文件</b>（不用下 Source code）</div></div>
  </div>
  <img class="small" style="margin:14px 0 0 72px;width:calc(100% - 72px)" src="${img("github-assets.png")}">
  <div class="steps" style="margin-top:22px">
    <div class="step"><div class="n">2</div><div class="c">在你的库里新建文件夹，把 3 个文件放进去：
      <div class="tree"><span class="d">你的库/</span>
<span class="d">└─ .obsidian/plugins/</span><span class="f">cloudmind/</span>
<span class="d">     ├─</span> main.js
<span class="d">     ├─</span> manifest.json
<span class="d">     └─</span> styles.css</div></div></div>
    <div class="step"><div class="n">3</div><div class="c">Obsidian <b>设置 → 第三方插件</b>，在已安装插件里点刷新，打开 <b>CloudMind</b>，看到“CloudMind ${VER} 已加载”就成功了</div></div>
    <div class="step"><div class="n">4</div><div class="c"><b>开始用</b>：点笔记右上角的导图图标预览；左侧栏 CloudMind 图标 → 新建思维导图</div></div>
  </div>
  <div class="note" style="margin-top:18px;font-size:24px"><b>小提示</b>　Mac 上 .obsidian 是隐藏文件夹，Finder 里按 ⌘⇧. 显示 · 文件夹名必须是 <b>cloudmind</b> · 想自动更新，可以用 BRAT 插件添加 <b style="white-space:nowrap">Be1Human/obsidian-cloudmind</b></div>
`));

const browser = await chromium.launch({ executablePath: exe, headless: true });
const names = ["01-封面", "02-基于Markdown", "03-数据不锁定", "04-编辑手感", "05-双链", "06-主题与工具栏", "07-安装教程"];
for (let i = 0; i < cards.length; i++) {
  const p = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 2 });
  const htmlPath = path.join(base, `.card-${i + 1}.html`);
  writeFileSync(htmlPath, cards[i]);
  await p.goto(pathToFileURL(htmlPath).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  // 检查内容有没有溢出画布（被 footer 挡住）
  const overflow = await p.evaluate(() => {
    const footTop = document.querySelector(".foot").getBoundingClientRect().top;
    let maxBottom = 0;
    document.querySelectorAll(".page *").forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height > 0) maxBottom = Math.max(maxBottom, r.bottom);
    });
    return { maxBottom: Math.round(maxBottom), footTop: Math.round(footTop) };
  });
  await p.screenshot({ path: path.join(base, `${names[i]}.png`) });
  console.log(`saved ${names[i]}.png   content bottom=${overflow.maxBottom}px, footer top=${overflow.footTop}px ${overflow.maxBottom > overflow.footTop - 10 ? "  <-- OVERFLOW" : ""}`);
  await p.close();
}
await browser.close();
