/* Lines up heroes at close zoom on a few stages for checking model detail. Usage: node tests/closeups.js <outDir> (server on :8123) */
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.stack));
  await p.goto('http://localhost:8123/index.html'); await p.waitForTimeout(600);
  const shot = async (stage, ids, name, z = 2.2) => {
    await p.evaluate(([stage, ids]) => { const H = TF.HEROES; TF.startMatch({ stage: TF.STAGES[stage], players: ids.map(i => ({ hero: H[i], cpu: 0, device: 'none' })), stocks: 3, items: 'off', mode: 'versus', noCountdown: true }); }, [stage, ids]);
    await p.waitForTimeout(400);
    await p.evaluate((z) => { const W = TF.state.W; W.fighters.forEach((f, i) => { f.x = -150 + i * 100; f.facing = 1; }); W.cam.z = z; W.cam.x = W.fighters.reduce((a, f) => a + f.x, 0) / W.fighters.length; W.cam.y = -60; TF.ENG.updateCamera = () => {}; }, z);
    await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${name}.png` });
  };
  await shot(0, [0, 1, 2, 3], 'close_a');
  await shot(0, [4, 5, 6, 7], 'close_b');
  await shot(3, [8, 9, 10, 11], 'close_c');
  console.log('errors', errs); await b.close();
})();
