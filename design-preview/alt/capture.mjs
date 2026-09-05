import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
const themes = ["forge", "ledger"];
const screens = ["login", "home", "bill", "takeoff", "buy", "submit"];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const theme of themes) {
  for (const s of screens) {
    const url = `http://127.0.0.1:8766/alt/index.html?theme=${theme}&s=${s}&embed=1`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector(".app");
    await page.waitForFunction(() => document.querySelector(".app")?.children.length > 0);
    await page.waitForTimeout(400);
    const app = await page.$(".app");
    await app.screenshot({ path: join(outDir, `${theme}-${s}.png`) });
    console.log("saved", theme, s);
  }
}
await browser.close();
