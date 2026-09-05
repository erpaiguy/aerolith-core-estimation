import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../alt/node_modules/playwright-core/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
const screens = [
  "login",
  "owner",
  "home",
  "dashboard",
  "source",
  "takeoff",
  "estimate",
  "analysis",
  "queries",
  "buy",
  "compare",
  "submit",
  "masters",
  "settings",
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const s of screens) {
  const url = `http://127.0.0.1:8766/north/index.html?s=${s}&embed=1`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".app");
  await page.waitForFunction(() => document.querySelector(".app")?.children.length > 0);
  await page.waitForTimeout(450);
  const app = await page.$(".app");
  await app.screenshot({ path: join(outDir, `${s}.png`) });
  console.log("saved", s);
}
await browser.close();
