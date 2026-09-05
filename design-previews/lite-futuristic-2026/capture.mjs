import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "screenshots");
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = join(root, decodeURIComponent(url));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await mkdir(out, { recursive: true });
await new Promise((resolve) => server.listen(8765, resolve));

let browser;
for (const channel of ["msedge", "chrome", "chromium"]) {
  try {
    browser = await chromium.launch({ channel: channel === "chromium" ? undefined : channel });
    process.stdout.write(`browser: ${channel}\n`);
    break;
  } catch {
    browser = null;
  }
}
if (!browser) {
  browser = await chromium.launch();
  process.stdout.write("browser: bundled chromium\n");
}
const page = await browser.newPage({ viewport: { width: 1560, height: 980 } });
page.setDefaultTimeout(60000);

const options = [
  ["a", "option-a.html"],
  ["b", "option-b.html"],
  ["c", "option-c.html"],
];

for (const [id, file] of options) {
  await page.goto(`http://127.0.0.1:8765/${file}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector(".artboard");
  const boards = page.locator(".artboard");
  const n = await boards.count();
  for (let i = 0; i < n; i++) {
    const board = boards.nth(i);
    const screen = await board.getAttribute("data-screen");
    const path = join(out, `option-${id}-${screen}.png`);
    await board.screenshot({ path, type: "png" });
    process.stdout.write(`wrote option-${id}-${screen}.png\n`);
  }
}

await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "networkidle" });
await page.screenshot({ path: join(out, "index-hero.png"), fullPage: false });

await browser.close();
server.close();
