import { launch } from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
const screens = [
  "login",
  "home",
  "bill",
  "takeoff",
  "rate",
  "closed",
  "all",
  "buy",
  "compare",
  "queries",
  "submit",
  "briefing",
  "source",
  "masters",
  "settings",
];

await mkdir(outDir, { recursive: true });
const browser = await launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
for (const s of screens) {
  const url = `http://127.0.0.1:8765/index.html?s=${s}&embed=1`;
  await page.goto(url, { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForSelector(".app");
  await page.waitForFunction(() => document.querySelector(".app")?.children.length > 0);
  await new Promise((r) => setTimeout(r, 250));
  const app = await page.$(".app");
  await app.screenshot({ path: join(outDir, `${s}.png`) });
  console.log("saved", s);
}
await browser.close();
