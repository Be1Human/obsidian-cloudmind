// 截取 GitHub Release 页面的真实下载区（main.js / manifest.json / styles.css），用于安装教程卡片
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "..", "marketing", "xiaohongshu", "shots");
const exe = process.env.CHROME_PATH || path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe");
const tag = process.env.TAG || "0.4.2";

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 2, locale: "zh-CN" });
await page.goto(`https://github.com/Be1Human/obsidian-cloudmind/releases/tag/${tag}`, { waitUntil: "domcontentloaded", timeout: 90000 });
// 资源列表是懒加载的
await page.getByText("manifest.json", { exact: true }).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
// 关掉可能出现的 cookie / 登录横幅
await page.evaluate(() => document.querySelectorAll("cookie-consent-banner, .js-notice, [data-testid='cookie-banner']").forEach((e) => e.remove()));

// 整个 release 卡片（标题 + 说明 + Assets）
const box = await page.evaluate(() => {
  const name = [...document.querySelectorAll("a, span")].find((e) => e.textContent.trim() === "manifest.json");
  let card = name;
  for (let i = 0; i < 25 && card; i++) {
    card = card.parentElement;
    if (!card) break;
    if (card.matches("section, .Box, [data-test-selector='release-card'], .release-entry")) {
      const r = card.getBoundingClientRect();
      if (r.height > 250) break;
    }
  }
  const r = (card || name).getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
});
console.log("release card box", JSON.stringify(box));
await page.screenshot({ path: path.join(out, "github-release.png"), clip: { x: Math.max(0, box.x - 2), y: Math.max(0, box.y - 2), width: Math.min(1100, box.w + 4), height: Math.min(1300, box.h + 4) } });
console.log("saved github-release.png");

// 只要 Assets 那一块
const assets = await page.evaluate(() => {
  const h = [...document.querySelectorAll("summary, h2, h3, span")].find((e) => /^Assets\s*\d*$/.test(e.textContent.trim()));
  const last = [...document.querySelectorAll("a, span")].filter((e) => /^Source code/.test(e.textContent.trim())).pop();
  if (!h || !last) return null;
  const a = h.getBoundingClientRect(), b = last.getBoundingClientRect();
  return { x: a.left + scrollX, y: a.top + scrollY, bottom: b.bottom + scrollY };
});
console.log("assets", JSON.stringify(assets));
if (assets) {
  await page.screenshot({ path: path.join(out, "github-assets.png"), clip: { x: Math.max(0, assets.x - 22), y: Math.max(0, assets.y - 14), width: 1100 - Math.max(0, assets.x - 22) - 18 > 0 ? Math.min(1060, 1100 - Math.max(0, assets.x - 22)) : 1060, height: assets.bottom - assets.y + 32 } });
  console.log("saved github-assets.png");
}
await browser.close();
