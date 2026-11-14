// 双链测试：输入 [[ 弹出搜索 / 过滤 / 键盘选择 / 写回 md / 链接高亮 / Ctrl+点击打开 / 工具栏引用
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const sample = `---
cloudmind: true
---
# 资产治理
## 参考
- 看这个 [[资产治理周报]] 就行
- 同时参考 [[Agent 评测]] 和 [[Agent 系统设计题库|题库]]
- 没有链接的节点
`;

let failed = 0;
const ok = (n, c, x = "") => {
  console.log(c ? "PASS" : "FAIL", n, c ? "" : x);
  if (!c) failed++;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("file:///" + path.join(dir, "harness.html").replace(/\\/g, "/"));
await page.evaluate((t) => window.boot(t), sample);
await page.waitForFunction(() => window.hasMM());
await page.waitForTimeout(700);

const items = () => page.evaluate(() => [...document.querySelectorAll(".cm-suggest-item .cm-suggest-name")].map((e) => e.textContent));
const popOpen = () => page.locator(".cm-suggest").count();
const editing = () => page.evaluate(() => window.mm().renderer.textEdit.isShowTextEdit());
const editText = () => page.evaluate(() => (document.querySelector(".smm-node-edit-wrap") || {}).textContent);
const nodeByText = (t) =>
  page.evaluate((t) => {
    let found = null;
    const walk = (n) => {
      if (n.getData("text") === t) found = n;
      n.children.forEach(walk);
    };
    walk(window.mm().renderer.root);
    return !!found;
  }, t);
const activate = (t) =>
  page.evaluate((t) => {
    let found = null;
    const walk = (n) => {
      if (n.getData("text").includes(t)) found = found || n;
      n.children.forEach(walk);
    };
    walk(window.mm().renderer.root);
    window.mm().execCommand("CLEAR_ACTIVE_NODE");
    found.active();
    return found.getData("text");
  }, t);

// ---------- 1. 已有链接的节点：高亮 + 状态提示 + “打开”按钮 ----------
await page.waitForTimeout(300);
const hl = await page.evaluate(() => document.querySelectorAll(".cm-wikilink").length);
ok("nodes with [[links]] are highlighted (2 of 3)", hl === 2, String(hl));
await activate("资产治理周报");
await page.waitForTimeout(400);
ok("open-link button visible on linked node", (await page.evaluate(() => getComputedStyle(document.querySelector('.cm-nodebar [data-id="openlink"]')).display)) !== "none");
ok("status hint mentions Ctrl+click", /Ctrl\+点击 打开「资产治理周报」/.test(await page.evaluate(() => document.querySelector(".cm-seg-hint").textContent)));
await activate("没有链接");
await page.waitForTimeout(400);
ok("open-link button hidden on plain node", (await page.evaluate(() => getComputedStyle(document.querySelector('.cm-nodebar [data-id="openlink"]')).display)) === "none");

// ---------- 2. Ctrl+点击打开 ----------
await page.evaluate(() => (window.__opened = []));
const pos = await page.evaluate(() => {
  let found = null;
  const walk = (n) => {
    if (n.getData("text").includes("资产治理周报")) found = n;
    n.children.forEach(walk);
  };
  walk(window.mm().renderer.root);
  const r = found.getRectInSvg();
  const c = document.querySelector(".cm-canvas").getBoundingClientRect();
  return { x: c.x + r.left + r.width / 2, y: c.y + r.top + r.height / 2 };
});
await page.keyboard.down("Control");
await page.mouse.click(pos.x, pos.y);
await page.keyboard.up("Control");
await page.waitForTimeout(300);
const opened = await page.evaluate(() => window.__opened);
ok("Ctrl+click opens the linked note in a new tab", opened.length === 1 && opened[0][0] === "资产治理周报" && opened[0][1] === "测试导图.md" && opened[0][2] === "tab", JSON.stringify(opened));
// 没按 Ctrl 的普通点击只是选中，不跳转
await page.evaluate(() => (window.__opened = []));
await page.mouse.click(pos.x, pos.y);
await page.waitForTimeout(300);
ok("plain click only selects (no navigation)", (await page.evaluate(() => window.__opened.length)) === 0);

// ---------- 3. 多个链接：菜单选择 ----------
await activate("同时参考");
await page.waitForTimeout(300);
await page.evaluate(() => (window.__opened = []));
await page.evaluate(() => document.querySelector('.cm-nodebar [data-id="openlink"]').click());
const menuTitles = await page.evaluate(() => window.__menu.items.map((i) => i.title));
ok("multi-link node offers a picker with both links (alias shown)", menuTitles.length === 2 && menuTitles.includes("Agent 评测") && menuTitles.includes("题库"), JSON.stringify(menuTitles));

// ---------- 4. 输入 [[ 弹出搜索 ----------
await activate("没有链接");
await page.waitForTimeout(300);
await page.keyboard.press("F2");
await page.waitForTimeout(300);
ok("F2 enters editing", await editing());
await page.keyboard.press("End");
await page.keyboard.type("，见 [[");
await page.waitForTimeout(250);
ok("typing [[ opens the note picker", (await popOpen()) === 1);
let list = await items();
ok("empty query lists recent notes first (by mtime)", list[0] === "2026-11-12" && list.length === 5, JSON.stringify(list));
await page.screenshot({ path: path.join(dir, "wiki-popup.png") });

await page.keyboard.type("agent");
await page.waitForTimeout(250);
list = await items();
ok("typing filters (case-insensitive)", list.length === 2 && list.every((x) => /Agent/.test(x)), JSON.stringify(list));
await page.keyboard.type(" 评");
await page.waitForTimeout(250);
list = await items();
ok("filter narrows to one note", list.length === 1 && list[0] === "Agent 评测", JSON.stringify(list));
await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.waitForTimeout(250);
list = await items();
ok("backspacing widens the list again", list.length === 2, JSON.stringify(list));

// ---------- 5. 键盘选择：↓ 选第二项，Enter 确认且不结束编辑 ----------
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(100);
const activeName = await page.evaluate(() => document.querySelector(".cm-suggest-item.is-active .cm-suggest-name").textContent);
ok("ArrowDown moves the highlight", activeName === "Agent 系统设计题库", activeName);
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
ok("Enter picks the note, closes the picker", (await popOpen()) === 0);
ok("Enter did NOT finish editing (consumed by the picker)", await editing());
ok("link inserted into the text", /，见 \[\[Agent 系统设计题库\]\]$/.test((await editText()) || ""), await editText());
// 继续输入应接在链接后面
await page.keyboard.type("了解");
await page.keyboard.press("Enter"); // 这次回车才是结束编辑
await page.waitForTimeout(500);
ok("second Enter finishes editing", !(await editing()));
const md = await page.evaluate(() => window.getText());
ok("md contains the double link, followed by typed text", /- 没有链接的节点，见 \[\[Agent 系统设计题库\]\]了解/.test(md), md);
ok("saved flag set (will be written)", (await page.evaluate(() => window.__saves)) > 0);
await page.waitForTimeout(300);
ok("edited node now highlighted as link", (await page.evaluate(() => document.querySelectorAll(".cm-wikilink").length)) === 3);

// ---------- 6. Esc 只关闭列表，不退出编辑 ----------
await activate("了解");
await page.keyboard.press("F2");
await page.waitForTimeout(250);
await page.keyboard.press("End");
await page.keyboard.type(" [[资");
await page.waitForTimeout(250);
ok("picker open again", (await popOpen()) === 1);
list = await items();
ok("Chinese query filters", list.length === 2 && list.every((x) => x.includes("资产治理")), JSON.stringify(list));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok("Esc closes picker only", (await popOpen()) === 0 && (await editing()));
// 光标移走（输入了 ]）后不应再弹
await page.keyboard.type("]]");
await page.waitForTimeout(200);
ok("manually closed [[x]] does not reopen picker", (await popOpen()) === 0);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

// ---------- 7. 没有候选时回车照常结束编辑 ----------
await activate("了解");
await page.keyboard.press("F2");
await page.waitForTimeout(250);
await page.keyboard.press("End");
await page.keyboard.type(" [[zzzz不存在");
await page.waitForTimeout(250);
ok("no match shows an empty hint", /没有匹配/.test(await page.evaluate(() => (document.querySelector(".cm-suggest") || {}).textContent || "")));
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
ok("Enter with no candidates finishes editing normally", !(await editing()) && (await popOpen()) === 0);

// ---------- 8. 点击候选项 ----------
await activate("没有链接");
await page.keyboard.press("F2");
await page.waitForTimeout(250);
await page.keyboard.press("End");
await page.keyboard.type(" [[");
await page.waitForTimeout(250);
await page.locator(".cm-suggest-item", { hasText: "Agent 评测" }).click();
await page.waitForTimeout(250);
ok("clicking an item inserts it and keeps editing", (await editing()) && /\[\[Agent 评测\]\]$/.test((await editText()) || ""), await editText());
await page.keyboard.press("Enter");
await page.waitForTimeout(400);

// ---------- 9. 工具栏“引用”：自动进入编辑 + 弹出列表 ----------
await activate("看这个");
await page.waitForTimeout(300);
await page.click('.cm-toolbar [data-id="wikilink"]');
await page.waitForTimeout(500);
ok("toolbar 引用 enters edit mode", await editing());
ok("toolbar 引用 opens the note picker", (await popOpen()) === 1);
ok("existing text is kept (caret at end, not replaced)", /看这个 \[\[资产治理周报\]\] 就行\[\[$/.test((await editText()) || ""), await editText());
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ---------- 10. 未选中时点“引用”：按钮是灰的 ----------
await page.evaluate(() => window.mm().execCommand("CLEAR_ACTIVE_NODE"));
await page.waitForTimeout(300);
ok("引用 disabled when nothing selected", await page.evaluate(() => document.querySelector('.cm-toolbar [data-id="wikilink"]').disabled));

// ---------- 节点上显示链接名，不显示 [[ ]]；编辑时显示原文；文件里保存原文 ----------
{
  await page.evaluate((t) => window.__view.setViewData(t, true), "---\ncloudmind: true\n---\n# 根\n## 看 [[读书清单 2026]]\n## [[原子习惯|别名]]\n## [[原子习惯#四大定律]]\n## 普通 [ 方括号 ]\n");
  await page.waitForTimeout(700);
  const shown = await page.evaluate(() => window.mm().renderer.root.children.map((n) => n.group.node.querySelector("text")?.textContent));
  ok("link shown without brackets", shown[0] === "看 读书清单 2026", JSON.stringify(shown));
  ok("alias shown instead of target", shown[1] === "别名", JSON.stringify(shown));
  ok("heading link shown as 'note > heading'", shown[2] === "原子习惯 > 四大定律", JSON.stringify(shown));
  ok("plain brackets untouched", shown[3] === "普通 [ 方括号 ]", JSON.stringify(shown));
  ok("data keeps the raw link", await page.evaluate(() => window.mm().renderer.root.children[0].getData("text")) === "看 [[读书清单 2026]]");
  await page.evaluate(() => { const n = window.mm().renderer.root.children[0]; window.mm().execCommand("CLEAR_ACTIVE_NODE"); n.active(); window.mm().renderer.textEdit.show({ node: n }); });
  await page.waitForTimeout(300);
  ok("editing shows the raw [[link]]", (await page.evaluate(() => document.querySelector(".smm-node-edit-wrap")?.innerText)) === "看 [[读书清单 2026]]");
  await page.keyboard.press("Escape");
}
console.log("page errors:", errors.length ? errors : "none");
ok("no page errors", errors.length === 0);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nWIKI PASSED");
process.exit(failed ? 1 : 0);
