/* Verifies that every Sefaria ref in js/data.js resolves. Usage: node tools/check-sources.js */
const { HEROES, BOSS, ITEMS, STAGES } = require('../js/data.js');
const refs = new Set();
for (const h of HEROES) { for (const k in h.specials) refs.add(h.specials[k].src); refs.add(h.final.src); }
refs.add(BOSS.src); Object.values(ITEMS).forEach(i => refs.add(i.src)); STAGES.forEach(s => refs.add(s.src));
(async () => {
  let bad = 0;
  for (const r of refs) {
    const res = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(r) + '?version=english');
    const d = res.ok ? await res.json() : {};
    const ok = res.ok && d.versions && d.versions.length && String(d.versions[0].text).length > 0;
    if (!ok) bad++;
    console.log(ok ? 'ok ' : 'BAD', r, ok ? '' : res.status);
  }
  process.exit(bad ? 1 : 0);
})();
