import fs from "node:fs";
import { chromium } from "playwright";

const dir = "output/web-game-diplomacy-status";
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push({ type: "console.error", text: msg.text() });
});
page.on("pageerror", (err) => errors.push({ type: "pageerror", text: String(err) }));

const waitForIdle = async () => {
  for (let i = 0; i < 80; i += 1) {
    const text = await page.evaluate(() => window.render_game_to_text?.() ?? null);
    if (!text) {
      await page.waitForTimeout(100);
      continue;
    }
    const state = JSON.parse(text);
    if (!state.actionAnimationBusy) return state;
    await page.waitForTimeout(80);
  }
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
};

const getSprites = async () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("svg image"))
      .map((img) => {
        const box = img.getBoundingClientRect();
        const href = img.getAttribute("href") || img.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
        return { href, x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
      })
      .filter((img) => img.width > 20 && img.width < 40 && img.height > 20 && img.height < 40)
  );

const getBoardCenter = async () =>
  page.evaluate(() => {
    const svg = document.querySelector("svg");
    const box = svg?.getBoundingClientRect();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 700, y: 360 };
  });

const neighborOffsets = [
  { x: 46.8, y: 0 },
  { x: 23.4, y: 40.5 },
  { x: -23.4, y: 40.5 },
  { x: -46.8, y: 0 },
  { x: -23.4, y: -40.5 },
  { x: 23.4, y: -40.5 }
];

const chooseStep = (from, to) =>
  neighborOffsets
    .map((offset) => ({
      ...offset,
      score: Math.hypot(from.x + offset.x - to.x, from.y + offset.y - to.y)
    }))
    .sort((a, b) => a.score - b.score)[0];

const readDiplomacyPanel = async () =>
  page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h4"));
    const diplomacyHeading = headings.find((el) => el.textContent?.includes("Diplomacy Status"));
    const reinforcementHeading = headings.find((el) => el.textContent?.includes("Reinforcement Log"));
    const collect = (heading) => {
      if (!heading) return [];
      const section = heading.nextElementSibling;
      if (!section) return [];
      return Array.from(section.children)
        .map((el) => el.textContent?.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    };
    return {
      diplomacy: collect(diplomacyHeading),
      reinforcement: collect(reinforcementHeading)
    };
  });

const save = async (name) => {
  const state = await page.evaluate(() => window.render_game_to_text?.() ?? null);
  if (state) fs.writeFileSync(`${dir}/${name}.json`, state);
  const panel = await readDiplomacyPanel();
  fs.writeFileSync(`${dir}/${name}-panel.json`, JSON.stringify(panel, null, 2));
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
};

await page.goto("http://127.0.0.1:3001/setup", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Start a Game/i }).click();
await page.waitForSelector("text=Configure local match settings before deployment.", { timeout: 10000 });
await page.getByRole("button", { name: "Small" }).click();
await page.getByRole("button", { name: "Start Match" }).click();
await page.waitForURL("**/game", { timeout: 15000 });
await page.waitForTimeout(1000);
await save("shot-0-start");

let attacked = false;

for (let turn = 1; turn <= 14 && !attacked; turn += 1) {
  const state = await waitForIdle();
  const currentColor = state.players.find((player) => player.id === state.currentPlayerId)?.color;
  const sprites = await getSprites();
  const mine = sprites.find((sprite) => sprite.href.includes(currentColor));
  const enemy = sprites.find((sprite) => !sprite.href.includes(currentColor));
  if (!mine) break;

  await page.mouse.click(mine.x, mine.y);
  await page.waitForTimeout(100);

  if (enemy) {
    const distance = Math.hypot(mine.x - enemy.x, mine.y - enemy.y);
    if (distance <= 58) {
      await page.mouse.click(enemy.x, enemy.y);
      await page.waitForTimeout(80);
      await waitForIdle();
      await page.waitForTimeout(220);
      await save("shot-1-war");
      attacked = true;
      break;
    }
  }

  const target = enemy ?? (await getBoardCenter());
  const step = chooseStep(mine, target);
  await page.mouse.click(mine.x + step.x, mine.y + step.y);
  await page.waitForTimeout(70);
  await waitForIdle();
  await page.waitForTimeout(140);

  const endTurnButton = page.getByRole("button", { name: "End Turn" });
  if (await endTurnButton.isEnabled()) {
    await endTurnButton.click();
    await page.waitForTimeout(240);
  }
}

for (let i = 0; i < 8; i += 1) {
  const endTurnButton = page.getByRole("button", { name: "End Turn" });
  if (await endTurnButton.isEnabled()) {
    await endTurnButton.click();
    await page.waitForTimeout(260);
  }
  await waitForIdle();
  const panel = await readDiplomacyPanel();
  if (panel.diplomacy.some((row) => row.includes("○"))) {
    break;
  }
}

await save("shot-2-neutral");

if (errors.length > 0) {
  fs.writeFileSync(`${dir}/errors.json`, JSON.stringify(errors, null, 2));
}

await browser.close();
