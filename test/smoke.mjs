import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");

const sample = `---
cloudmind: true
---
# 学习计划
## 语言
- 英语 <!--mm:{"fillColor":"#FFE9A8"}-->
  - 单词
  - 听力
- 日语
## 技术
### Obsidian
- 插件开发
## 生活
`;

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra);
  if (!cond) failed++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));

await page.evaluate((t) => window.boot(t), sample);
await page.waitForFunction(() => window.hasMM(), null, { timeout: 8000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(dir, "shot1.png") });
ok("mindmap created", await page.evaluate(() => window.hasMM()));

// 初次渲染后不应触发保存
ok("no save on open", (await page.evaluate(() => window.__saves)) === 0);
// 序列化往返：原样输出
const t0 = await page.evaluate(() => window.getText());
ok("serialize equals source on open", t0 === sample, "\n" + t0);

// 选中“语言”节点 → Tab 新子节点 → 输入文字 → Enter 完成
await page.evaluate(() => {
  const root = window.mm().renderer.root;
  root.children[0].active();
});
await page.waitForTimeout(200);
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
await page.keyboard.type("韩语");
await page.keyboard.press("Enter"); // 结束编辑
await page.waitForTimeout(500);
const t1 = await page.evaluate(() => window.getText());
console.log("--- after Tab+type:\n" + t1);
ok("child inserted with text", t1.includes("韩语"));
ok("save requested after edit", (await page.evaluate(() => window.__saves)) > 0);

// Enter 插入同级
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.type("法语");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const t2 = await page.evaluate(() => window.getText());
ok("sibling inserted", t2.includes("法语"), t2);

// 撤销
await page.keyboard.press("Control+z");
await page.waitForTimeout(400);
const t3 = await page.evaluate(() => window.getText());
console.log("--- after undo:\n" + t3);
ok("undo removed last change", !t3.includes("法语") || t3.length < t2.length);

// 折叠 "/"
await page.evaluate(() => {
  const root = window.mm().renderer.root;
  root.children[0].active();
});
await page.keyboard.press("/");
await page.waitForTimeout(400);
const t4 = await page.evaluate(() => window.getText());
ok("collapse persisted as meta", /"expand":false/.test(t4), t4);

// 概要 Ctrl+G
await page.evaluate(() => {
  const root = window.mm().renderer.root;
  root.children[2].active();
});
await page.keyboard.press("Control+g");
await page.waitForTimeout(300);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const t5 = await page.evaluate(() => window.getText());
console.log("--- after summary:\n" + t5);
ok("generalization persisted", /generalization/.test(t5));

// 往返：保存的文本重新载入后结构一致
const reload = await page.evaluate(async (t) => {
  window.__view.setViewData(t + "\n", true);
  await new Promise((r) => setTimeout(r, 500));
  return window.getText();
}, t5);
ok("reload stable", reload.trim() === t5.trim(), "\n" + reload);

// 布局切换 + 主题
for (const l of ["logicalStructure", "organizationStructure", "mindMap"]) {
  await page.evaluate((l) => window.mm().setLayout(l), l);
  await page.waitForTimeout(300);
}
await page.screenshot({ path: path.join(dir, "shot2.png") });

// 工具栏/右键菜单
await page.evaluate(() => {
  const root = window.mm().renderer.root;
  root.children[1].active();
});
const menuCount = await page.evaluate(() => {
  window.__view.showNodeMenu({ clientX: 10, clientY: 10 });
  return window.__menu.items.length;
});
ok("node context menu built", menuCount > 15, String(menuCount));

// —— 预览一篇没有标记的普通笔记：不改动原文 ——
{
  const plain = "# 普通笔记\n\n随便写点\n\n## 小节一\n- a\n- b\n\n\n## 小节二\n正文一段\n";
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  p2.on("pageerror", (e) => errors.push(String(e)));
  await p2.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
  await p2.evaluate((t) => window.boot(t), plain);
  await p2.waitForFunction(() => window.hasMM(), null, { timeout: 8000 });
  await p2.waitForTimeout(700);
  ok("plain note renders as mindmap", await p2.evaluate(() => window.mm().renderer.root.children.length === 2));
  ok("plain preview returns original text", (await p2.evaluate(() => window.getText())) === plain);
  ok("plain preview requests no save", (await p2.evaluate(() => window.__saves)) === 0);
  // 真正编辑后才写回，并补上标记
  await p2.evaluate(() => window.mm().renderer.root.children[0].active());
  await p2.keyboard.press("Tab");
  await p2.waitForTimeout(300);
  await p2.keyboard.type("新增");
  await p2.keyboard.press("Enter");
  await p2.waitForTimeout(500);
  const after = await p2.evaluate(() => window.getText());
  ok("edit writes back with mark", after.includes("新增") && after.includes("cloudmind: true"), after);
  await p2.close();
}

console.log("page errors:", errors.length ? errors : "none");
ok("no page errors", errors.length === 0);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nSMOKE PASSED");
process.exit(failed ? 1 : 0);
