// 截取 GitHub 上渲染后的 README（整页），用于检查排版
import { chromium } from "playwright-core";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const which = process.argv[2] || "README.md";
const local = process.argv[3]; // 可选：本地 html 预览
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
if (local) {
  await p.goto("file:///" + local.replace(/\\/g, "/"));
} else {
  await p.goto(`https://github.com/Be1Human/obsidian-cloudmind/blob/main/${encodeURIComponent(which)}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.locator("article.markdown-body").first().waitFor({ timeout: 60000 });
}
await p.waitForTimeout(2500);
const el = p.locator("article.markdown-body, .markdown-body").first();
const out = path.join(dir, `.gh-${which.replace(/[^\w.-]/g, "_")}.png`);
await el.screenshot({ path: out });
const h = await el.evaluate((e) => e.getBoundingClientRect().height);
console.log("saved", out, "height", Math.round(h));
// 分段截图，便于逐屏检查
const box = await el.boundingBox();
const CH = 1300;
for (let i = 0, y = 0; y < box.height; i++, y += CH) {
  await p.screenshot({ path: out.replace(/\.png$/, `-${i + 1}.png`), clip: { x: box.x, y: box.y + y, width: box.width, height: Math.min(CH, box.height - y) }, fullPage: true });
}
console.log("parts:", Math.ceil(box.height / CH));
await b.close();
