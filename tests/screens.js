/* Renders the title, character select and several stages mid-fight to PNGs. Usage: node tests/screens.js <outDir> (server on :8123) */
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.stack));
  await p.goto((process.env.TF_URL || 'http://localhost:8123') + '/index.html'); await p.waitForTimeout(1200);
  await p.screenshot({ path: out + '/title.png' });
  await p.evaluate(() => TF.versusScreen()); await p.waitForTimeout(400); await p.screenshot({ path: out + '/select.png' });
  // a stage screenshot per stage with 4 CPUs mid-fight
  for (const i of [1, 2, 3, 4, 5, 7]) {
    await p.evaluate((i) => { const H = TF.HEROES; TF.startMatch({ stage: TF.STAGES[i], players: [0, 1, 2, 3].map(k => ({ hero: H[(i * 4 + k) % H.length], cpu: 7 })), stocks: 3, items: 'high', hazards: true, finals: true, mode: 'versus', noCountdown: true }); }, i);
    await p.waitForTimeout(4500); await p.screenshot({ path: `${out}/stage${i}.png` });
  }
  console.log('errors', errs); await b.close();
})();
