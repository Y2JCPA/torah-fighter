/* Smoke test: loads the game in headless Chromium, checks for errors, simulates CPU matches on every
   stage with every hero, and saves screenshots.  Usage: node tests/smoke.js [outDir]  (needs a server on :8123) */
const { chromium, devices } = require('playwright');
const out = process.argv[2] || 'tests/shots';
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto((process.env.TF_URL || 'http://localhost:8123') + '/index.html');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/title.png` });

  // Headless simulation of many matches
  const sim = await page.evaluate(() => {
    const res = [];
    const H = HEROES;
    for (let s = 0; s < STAGES.length; s++) {
      const pick = [H[(s * 3) % H.length], H[(s * 3 + 1) % H.length], H[(s * 3 + 2) % H.length], H[(s * 3 + 5) % H.length]];
      const W = ENG.createWorld({ stage: STAGES[s], players: pick.map(h => ({ hero: h, cpu: 7 })), stocks: 2, items: 'high', hazards: true, finals: true, mode: 'versus', noCountdown: true });
      let i = 0, finals = 0, maxProj = 0;
      for (; i < 60 * 60 * 6 && !W.over; i++) {
        for (const f of W.fighters) f.inp = AI.think(f, W);
        ENG.step(W);
        finals += W.finals.filter(F => F.t === 1).length;
        maxProj = Math.max(maxProj, W.projectiles.length);
      }
      res.push({ stage: STAGES[s].id, frames: i, over: W.over, finals, maxProj, f: W.fighters.map(f => `${f.hero.id}:${f.stats.kos}k/${f.stats.falls}f/${f.stats.sds}sd ${Math.round(f.stats.dealt)}dmg`) });
    }
    // boss
    const W = ENG.createWorld({ stage: STAGE_BY_ID.elah, players: [{ hero: HERO_BY_ID.shimshon, cpu: 9, team: 0 }, { hero: BOSS, cpu: 6, team: 1 }], stocks: 3, teams: true, items: 'medium', mode: 'classic', noCountdown: true });
    let i = 0; for (; i < 60 * 60 * 6 && !W.over; i++) { for (const f of W.fighters) f.inp = AI.think(f, W); ENG.step(W); }
    res.push({ stage: 'BOSS', frames: i, over: W.over, f: W.fighters.map(f => `${f.hero.id}:${f.stocks}st hp${Math.round(f.hp)} ${f.stats.falls}f`) });
    return res;
  });
  console.table(sim.map(r => ({ ...r, f: r.f.join(' | ') })));

  // Live match screenshots
  await page.evaluate(() => { const H = TF.HEROES; TF.startMatch({ stage: TF.STAGES[0], players: [{ hero: H[1], cpu: 7 }, { hero: H[3], cpu: 7 }, { hero: H[6], cpu: 7 }, { hero: H[5], cpu: 7 }], stocks: 3, items: 'high', hazards: true, finals: true, mode: 'versus' }); });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${out}/match.png` });
  await page.evaluate(() => TF.versusScreen()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/select.png` });
  await page.evaluate(() => TF.seferScreen('heroes')); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/sefer.png` });

  // Mobile
  const ctxM = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const pm = await ctxM.newPage();
  pm.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await pm.goto((process.env.TF_URL || 'http://localhost:8123') + '/index.html'); await pm.waitForTimeout(800);
  await pm.screenshot({ path: `${out}/m_title.png` });
  await pm.evaluate(() => { const H = TF.HEROES; TF.startMatch({ stage: TF.STAGES[6], players: [{ hero: H[6], cpu: 0, device: 'any' }, { hero: H[2], cpu: 5 }], stocks: 3, items: 'high', hazards: true, finals: true, mode: 'versus' }); });
  await pm.waitForTimeout(5000);
  await pm.screenshot({ path: `${out}/m_match.png` });
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
