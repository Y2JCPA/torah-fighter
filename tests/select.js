/* Drives the character select: picks heroes, drags a token, checks the Ready banner, and screenshots desktop + phone. Usage: node tests/select.js <outDir> */
const { chromium, devices } = require('playwright');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(e.stack));
  await p.goto((process.env.TF_URL || 'http://localhost:8123') + '/index.html'); await p.waitForFunction(() => window.TF && TF.ready, null, { timeout: 60000 }); await p.evaluate(() => TF.ready); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForFunction(() => window.TF && TF.ready, null, { timeout: 60000 }); await p.evaluate(() => TF.ready); await p.waitForTimeout(800);
  await p.evaluate(() => TF.versusScreen()); await p.waitForTimeout(500);
  await p.hover('[data-hero="shimshon"]'); await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/css1.png' });
  await p.click('[data-hero="shimshon"]'); await p.waitForTimeout(150);
  await p.click('[data-hero="moshe"]'); await p.waitForTimeout(150);
  await p.click('.pnl:nth-child(3)'); await p.click('[data-hero="maharal"]'); await p.waitForTimeout(100);
  await p.click('.pnl:nth-child(4) [data-type]'); await p.click('[data-hero="yael"]');
  await p.waitForTimeout(600);
  await p.screenshot({ path: out + '/css2.png' });
  // drag P1 token from shimshon to david
  const tk = await p.$('.token[data-slot="0"]'); const bb = await tk.boundingBox(); const tgt = await (await p.$('[data-hero="david"]')).boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(tgt.x + 40, tgt.y + 30, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(300);
  console.log('P1 hero after drag:', await p.evaluate(() => JSON.parse(localStorage.getItem('tf_slots'))[0].hero));
  await p.click('#ready'); await p.waitForTimeout(400); console.log('after ready:', await p.evaluate(() => document.querySelector('.hdr h2')?.textContent));
  const m = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); m.on('pageerror', e => errs.push(e.stack));
  await m.goto((process.env.TF_URL || 'http://localhost:8123') + '/index.html'); await m.waitForFunction(() => window.TF && TF.ready, null, { timeout: 60000 }); await m.evaluate(() => TF.ready); await m.waitForTimeout(800);
  await m.evaluate(() => TF.versusScreen()); await m.waitForTimeout(400); await m.tap('[data-hero="benaya"]'); await m.tap('[data-hero="pinchas"]'); await m.waitForTimeout(500);
  await m.screenshot({ path: out + '/css_m.png' });
  await m.evaluate(() => TF.classicPick()); await m.waitForTimeout(400); await m.tap('[data-hero="yonatan"]'); await m.waitForTimeout(500);
  await m.screenshot({ path: out + '/css_m_classic.png' });
  console.log('errors', errs); await b.close();
})();
