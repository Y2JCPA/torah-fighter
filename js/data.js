/* Torah Fighter — game data: heroes, items, stages, sources.
   Every special move points at the passuk / gemara it comes from (researched on Sefaria).
   The Sefer screen fetches the live text from the Sefaria API. */
'use strict';

const SEFARIA = 'https://www.sefaria.org/';

/* ---------- Heroes ----------
   h/w: body size in px (base fighter is 44x90).  weight: heavier = harder to launch.
   arch: archetype for normal attacks (fists, staff, sword, club, spear, mallet).
   look: drawing parameters for js/art.js. */
const HEROES = [
  {
    id: 'avraham', name: 'Avraham Avinu', he: 'אַבְרָהָם אָבִינוּ', title: 'The Father of Nations',
    color: '#3f7fd8', h: 96, w: 46, weight: 104, walk: 2.6, run: 5.0, air: 4.2, jump: 13.5, jumps: 1, grav: 0.55,
    arch: 'staff', power: 1.0,
    look: { skin: '#e2b48c', robe: '#f4efe2', robe2: '#3f7fd8', beard: '#f5f5f5', hair: '#f5f5f5', head: 'turban', headColor: '#3f7fd8', weapon: 'staff', beardLen: 1.0 },
    bio: 'At 75 he left everything for Hashem. When four kings captured Lot he chased them through the night with 318 men, and Chazal say the dust he threw became swords and the straw became arrows.',
    specials: {
      neutral: { name: 'Dust to Swords', he: 'עָפָר לַחֲרָבוֹת', kind: 'shoot', startup: 12, end: 18,
        proj: { type: 'dustsword', vx: 9, vy: -1, grav: 0.05, dmg: 6, bkb: 25, kbg: 60, ang: 35, life: 50, w: 30, h: 14 }, count: 3, spread: 0.18,
        src: 'Taanit.21a.12', note: 'Eliyahu tells the Caesar: perhaps this dust is from the dust of Avraham, which turned into swords when he threw it.' },
      side: { name: 'Sand & Straw to Arrows', he: 'קַשׁ לְחִצִּים', kind: 'shoot', startup: 14, end: 20,
        proj: { type: 'arrow', vx: 13, vy: -4, grav: 0.18, dmg: 4, bkb: 18, kbg: 45, ang: 30, life: 80, w: 26, h: 6 }, count: 5, spread: 0.1, stagger: 3,
        src: 'Sanhedrin.108b.21', note: 'Eliezer tells Shem: in the war of the four kings, we threw dust and it became swords, straw and it became arrows (Isaiah 41:2).' },
      up: { name: 'Count the Stars', he: 'הַבֶּט נָא הַשָּׁמַיְמָה', kind: 'rise', startup: 6, vy: -17, vx: 2.5, dur: 22,
        hit: { dmg: 9, bkb: 40, kbg: 70, ang: 80 }, fx: 'stars',
        src: 'Genesis.15.5', note: 'Hashem takes Avraham outside: look up at the heavens and count the stars.' },
      down: { name: 'Plant the Eshel', he: 'אֵשֶׁל בִּבְאֵר שָׁבַע', kind: 'summon', minion: 'eshel', startup: 16, end: 16, max: 1,
        src: 'Genesis.21.33', note: 'Avraham planted an eshel in Be\'er Sheva, a place of hospitality. Stand under it to heal.' }
    },
    final: { name: '318 Servants', he: 'שְׁמֹנָה עָשָׂר וּשְׁלֹשׁ מֵאוֹת', kind: 'sweep', sprite: 'army', dmg: 30, src: 'Genesis.14.14', note: 'Avraham musters his 318 trained men and chases the four kings at night.' }
  },
  {
    id: 'moshe', name: 'Moshe Rabbeinu', he: 'מֹשֶׁה רַבֵּנוּ', title: 'Ten Amos Tall',
    color: '#8a5a2b', h: 150, w: 50, weight: 116, walk: 2.4, run: 4.4, air: 3.8, jump: 14.5, jumps: 1, grav: 0.58,
    arch: 'staff', power: 1.05,
    look: { skin: '#d9a57c', robe: '#7a4e2a', robe2: '#e8dcc0', beard: '#d6d6d6', hair: '#d6d6d6', head: 'none', weapon: 'bigstaff', beardLen: 1.2, glow: true },
    bio: 'The Gemara says Moshe was ten amos tall. He took an axe ten amos long, jumped ten amos and struck Og in the ankle. With his mateh he brought the makkos, split the sea and drew water from the rock.',
    specials: {
      neutral: { name: 'Staff to Serpent', he: 'וַיְהִי לְנָחָשׁ', kind: 'summon', minion: 'snake', startup: 14, end: 18, max: 2,
        src: 'Exodus.4.3', note: '"Throw it on the ground." He threw it and it became a snake.' },
      side: { name: 'Strike the Rock', he: 'וַיַּךְ אֶת הַסֶּלַע', kind: 'shoot', startup: 16, end: 22,
        proj: { type: 'geyser', vx: 7, vy: 0, grav: 0, dmg: 11, bkb: 40, kbg: 80, ang: 60, life: 40, w: 50, h: 80, pierce: true, ground: true, multi: 8 }, count: 1,
        src: 'Numbers.20.11', note: 'Moshe raised his hand and struck the rock twice, and a lot of water came out.' },
      up: { name: 'Leap at Og', he: 'קָפַץ עֶשֶׂר אַמּוֹת', kind: 'rise', startup: 8, vy: -19, vx: 2, dur: 20,
        hit: { dmg: 12, bkb: 45, kbg: 85, ang: 85 }, fx: 'axe',
        src: 'Berakhot.54b.6', note: 'Moshe was ten amos tall. He took an axe ten amos long, jumped ten amos and hit Og in the ankle.' },
      down: { name: 'Raised Hands', he: 'וְהָיוּ יָדָיו אֱמוּנָה', kind: 'counter', window: [4, 28], frames: 40, mult: 1.4,
        src: 'Exodus.17.11', note: 'When Moshe held up his hand Yisrael prevailed. Get hit while his hands are up and he strikes back.' }
    },
    final: { name: 'The Sea Returns', he: 'וַיָּשֻׁבוּ הַמַּיִם', kind: 'flood', dmg: 34, src: 'Exodus.14.28', note: 'The waters came back and covered the chariots and riders.' }
  },
  {
    id: 'david', name: 'David HaMelech', he: 'דָּוִד הַמֶּלֶךְ', title: 'The Shepherd King',
    color: '#c0392b', h: 84, w: 42, weight: 88, walk: 3.0, run: 6.2, air: 4.8, jump: 14.0, jumps: 1, grav: 0.6,
    arch: 'staff', power: 0.95,
    look: { skin: '#f0c49a', robe: '#e9d9a8', robe2: '#c0392b', beard: '#b5502a', hair: '#c4572b', head: 'crown', headColor: '#f1c40f', weapon: 'shepherd', beardLen: 0.35 },
    bio: 'A red-haired shepherd who fought a lion and a bear to save one lamb. He brought down Golyat with one smooth stone, and his kinnor drove the bad spirit away from Shaul.',
    specials: {
      neutral: { name: 'Smooth Stone', he: 'אֶבֶן מִן הַנַּחַל', kind: 'shoot', startup: 10, end: 14, chargeable: 60,
        proj: { type: 'stone', vx: 12, vy: -1, grav: 0.12, dmg: 7, bkb: 20, kbg: 70, ang: 30, life: 90, w: 14, h: 14 }, count: 1,
        src: 'I_Samuel.17.49', note: 'David took a stone from his bag and slung it. It hit the Philistine in the forehead. Hold to charge.' },
      side: { name: 'Lion & Bear', he: 'הֶחֱזַקְתִּי בִּזְקָנוֹ', kind: 'dash', startup: 8, dur: 20, speed: 9, grab: true,
        hit: { dmg: 12, bkb: 45, kbg: 75, ang: 45 },
        src: 'I_Samuel.17.35', note: 'If it attacked me I grabbed it by the beard and struck it down. A running command grab.' },
      up: { name: 'Dance Before Hashem', he: 'מְכַרְכֵּר בְּכָל עֹז', kind: 'rise', startup: 4, vy: -15, vx: 3, dur: 26, spin: true,
        hit: { dmg: 3, bkb: 10, kbg: 20, ang: 80, rehit: 5 }, fx: 'spin',
        src: 'II_Samuel.6.14', note: 'David danced with all his strength before Hashem. A spinning multi-hit recovery.' },
      down: { name: 'Kinnor', he: 'וְלָקַח דָּוִד אֶת הַכִּנּוֹר', kind: 'reflect', frames: 34, radius: 70, heal: 2,
        src: 'I_Samuel.16.23', note: 'David played the kinnor and the bad spirit left Shaul. Reflects projectiles and heals a little.' }
    },
    final: { name: 'The Giant Falls', he: 'וַתִּטְבַּע הָאֶבֶן בְּמִצְחוֹ', kind: 'beam', sprite: 'megastone', dmg: 38, src: 'I_Samuel.17.49', note: 'The stone sank into his forehead and he fell on his face.' }
  },
  {
    id: 'shimshon', name: 'Shimshon HaGibor', he: 'שִׁמְשׁוֹן הַגִּבּוֹר', title: 'The Mighty Nazir',
    color: '#d35400', h: 108, w: 62, weight: 130, walk: 2.5, run: 5.2, air: 3.9, jump: 13.2, jumps: 1, grav: 0.62,
    arch: 'fists', power: 1.25,
    look: { skin: '#c98f65', robe: '#8e5b2e', robe2: '#d35400', beard: '#3b2314', hair: '#3b2314', head: 'locks', weapon: 'none', beardLen: 0.7, buff: true },
    bio: 'A nazir from birth whose strength was in his seven locks. Chazal say his shoulders were sixty amos wide. He tore a lion with bare hands and carried off the gates of Aza.',
    specials: {
      neutral: { name: 'Jawbone of a Donkey', he: 'לְחִי הַחֲמוֹר', kind: 'melee', frames: 40, anim: 'overhead', weapon: 'jawbone',
        hits: [{ s: 14, e: 20, x: 0.4, y: -1.1, w: 1.5, h: 1.2, dmg: 17, bkb: 40, kbg: 98, ang: 40 }],
        src: 'Judges.15.15', note: 'He found a fresh jawbone of a donkey and struck down a thousand men with it.' },
      side: { name: 'Tear the Lion', he: 'וַיְשַׁסְּעֵהוּ כְּשַׁסַּע הַגְּדִי', kind: 'dash', startup: 10, dur: 18, speed: 10, grab: true,
        hit: { dmg: 15, bkb: 50, kbg: 85, ang: 40 },
        src: 'Judges.14.6', note: 'The ruach of Hashem came on him and he tore the lion apart with nothing in his hands.' },
      up: { name: 'Gates of Aza', he: 'דַּלְתוֹת שַׁעַר הָעִיר', kind: 'rise', startup: 8, vy: -16, vx: 1.8, dur: 22,
        hit: { dmg: 11, bkb: 45, kbg: 75, ang: 85 }, fx: 'gates', armor: true,
        src: 'Judges.16.3', note: 'He grabbed the doors of the city gate with both posts and carried them up the mountain. The gates block hits on the way up.' },
      down: { name: 'Foxes & Torches', he: 'שׁוּעָלִים וְלַפִּדִים', kind: 'summon', minion: 'fox', startup: 12, end: 18, max: 2, pair: true,
        src: 'Judges.15.4', note: 'Shimshon caught foxes, tied torches between their tails and sent them into the Philistines\' fields.' }
    },
    final: { name: 'The Two Pillars', he: 'עַמּוּדֵי הַתָּוֶךְ', kind: 'pillars', dmg: 40, src: 'Judges.16.29', note: 'Shimshon took hold of the two middle pillars and pushed with all his strength.' }
  },
  {
    id: 'benaya', name: 'Benaya ben Yehoyada', he: 'בְּנָיָהוּ בֶּן יְהוֹיָדָע', title: 'Captain of the Guard',
    color: '#16a085', h: 94, w: 46, weight: 106, walk: 2.8, run: 5.6, air: 4.4, jump: 13.8, jumps: 1, grav: 0.57,
    arch: 'club', power: 1.08,
    look: { skin: '#d8a273', robe: '#2c5f55', robe2: '#16a085', beard: '#2d1b0e', hair: '#2d1b0e', head: 'helmet', headColor: '#b0b8bc', weapon: 'bow', beardLen: 0.6 },
    bio: 'David\'s captain of the guard. He killed a lion in a pit on a snowy day and fought a giant Egyptian with only a stick, pulling the spear from his hand.',
    specials: {
      neutral: { name: 'Mighty Bow', he: 'קֶשֶׁת גִּבּוֹרִים', kind: 'shoot', startup: 12, end: 12, chargeable: 50,
        proj: { type: 'arrow', vx: 15, vy: -0.5, grav: 0.1, dmg: 8, bkb: 25, kbg: 70, ang: 25, life: 100, w: 32, h: 6 }, count: 1,
        src: 'II_Samuel.23.20', note: 'Benaya son of Yehoyada, a brave man who did great things. Hold to draw the bow further.' },
      side: { name: 'Snatch the Spear', he: 'וַיִּגְזֹל אֶת הַחֲנִית', kind: 'dash', startup: 8, dur: 16, speed: 9.5, steal: true,
        hit: { dmg: 10, bkb: 40, kbg: 70, ang: 45 },
        src: 'II_Samuel.23.21', note: 'He went down against the Egyptian with a stick and pulled the spear from his hand. Steals the item an opponent is holding.' },
      up: { name: 'Out of the Pit', he: 'וַיֵּרֶד... בְּתוֹךְ הַבּוֹר', kind: 'rise', startup: 6, vy: -17, vx: 2.2, dur: 20,
        hit: { dmg: 8, bkb: 40, kbg: 70, ang: 80 }, fx: 'snow',
        src: 'II_Samuel.23.20', note: 'He went down into a pit on a snowy day and killed a lion. This time he leaps out of it.' },
      down: { name: 'Snowy Day', he: 'בְּיוֹם הַשָּׁלֶג', kind: 'field', field: 'snow', startup: 14, end: 14, dur: 360,
        src: 'Berakhot.18b.2', note: 'The Gemara reads it as breaking up hail to go down and immerse on a snowy day. Leaves a patch of ice that freezes whoever slips on it.' }
    },
    final: { name: 'Lion in the Pit', he: 'הָאֲרִי בְּתוֹךְ הַבּוֹר', kind: 'giant', sprite: 'lion', dmg: 32, src: 'II_Samuel.23.20', note: 'The lion from the pit charges across the battlefield.' }
  },
  {
    id: 'yonatan', name: 'Yonatan ben Shaul', he: 'יְהוֹנָתָן בֶּן שָׁאוּל', title: 'The Bow That Never Turned Back',
    color: '#2980b9', h: 90, w: 42, weight: 92, walk: 3.0, run: 6.0, air: 4.8, jump: 14.2, jumps: 2, grav: 0.56,
    arch: 'sword', power: 0.98,
    look: { skin: '#e8b88f', robe: '#1f4e79', robe2: '#f1c40f', beard: '#5a3a1c', hair: '#5a3a1c', head: 'circlet', headColor: '#f1c40f', weapon: 'bow2', beardLen: 0.3 },
    bio: 'The prince who climbed the cliff at Michmash on his hands and feet with only his armor-bearer and routed the Philistine garrison. "The bow of Yonatan never turned back."',
    specials: {
      neutral: { name: 'Three Arrows', he: 'שְׁלֹשֶׁת הַחִצִּים', kind: 'shoot', startup: 10, end: 16,
        proj: { type: 'arrow', vx: 14, vy: -1, grav: 0.1, dmg: 5, bkb: 20, kbg: 55, ang: 30, life: 90, w: 28, h: 6 }, count: 3, spread: 0.14,
        src: 'I_Samuel.20.20', note: 'I will shoot three arrows to the side, as if at a target.' },
      side: { name: 'Hands and Feet', he: 'וַיַּעַל עַל יָדָיו וְעַל רַגְלָיו', kind: 'dash', startup: 6, dur: 22, speed: 10.5, low: true,
        hit: { dmg: 9, bkb: 35, kbg: 65, ang: 55 },
        src: 'I_Samuel.14.13', note: 'Yonatan climbed up on his hands and feet, and the Philistines fell before him.' },
      up: { name: 'Climb at Michmash', he: 'מַעֲבַר מִכְמָשׂ', kind: 'rise', startup: 4, vy: -18, vx: 2.6, dur: 24,
        hit: { dmg: 7, bkb: 35, kbg: 60, ang: 80 }, fx: 'climb',
        src: 'I_Samuel.14.4', note: 'Between the passes were two sharp rocks, Botzetz and Seneh. A long, fast climb.' },
      down: { name: 'Taste of Honey', he: 'וַתָּאֹרְנָה עֵינָיו', kind: 'heal', frames: 36, amount: 6, buff: 'speed', buffDur: 360,
        src: 'I_Samuel.14.27', note: 'He dipped his staff in the honeycomb and his eyes lit up. Heals and gives a burst of speed.' }
    },
    final: { name: 'The Earth Trembles', he: 'וַתִּרְגַּז הָאָרֶץ', kind: 'quake', dmg: 30, src: 'I_Samuel.14.15', note: 'There was trembling in the camp and the earth shook. Everyone on the ground gets launched.' }
  },
  {
    id: 'maharal', name: 'The Maharal of Prague', he: 'מַהַרַ"ל מִפְּרָאג', title: 'Master of the Golem (guest)',
    color: '#5b4b8a', h: 96, w: 44, weight: 94, walk: 2.5, run: 4.8, air: 4.0, jump: 13.4, jumps: 1, grav: 0.55,
    arch: 'staff', power: 0.9, golem: true, guest: true,
    look: { skin: '#e6c3a0', robe: '#1d1d2b', robe2: '#5b4b8a', beard: '#ececec', hair: '#ececec', head: 'biret', headColor: '#111', weapon: 'cane', beardLen: 1.3 },
    bio: 'Our only non-Tanach fighter, a special guest. Rabbi Yehuda Loew of Prague. Prague tradition says he formed a golem out of river clay to protect the Jews of the city. The idea goes back to the Gemara: "Rava created a man."',
    specials: {
      neutral: { name: 'Golem: Strike!', he: 'גּוֹלֶם, הַכֵּה', kind: 'golem', cmd: 'punch', frames: 20,
        src: 'Sanhedrin.65b.17', note: 'Rava created a man and sent him to Rabbi Zeira. The golem throws a heavy punch.' },
      side: { name: 'Golem: Charge!', he: 'גּוֹלֶם, רוּץ', kind: 'golem', cmd: 'charge', frames: 20,
        src: 'Sanhedrin.65b.17', note: 'The golem rushes forward and hits whoever is in its way.' },
      up: { name: 'Golem: Lift Me', he: 'גּוֹלֶם, הָרֵם', kind: 'golem', cmd: 'toss', frames: 14, vy: -18,
        src: 'Sanhedrin.65b.17', note: 'The golem throws the Maharal high into the air. Without a golem he gets a smaller jump.' },
      down: { name: 'Emet / Met', he: 'אֱמֶת / מֵת', kind: 'golem', cmd: 'rebuild', frames: 46,
        src: 'Sanhedrin.65b.17', note: 'Rabbi Zeira said "return to your dust." Erasing the aleph turns EMET into MET. Rebuilds a broken golem, or makes the golem stomp.' }
    },
    final: { name: 'Giant Golem', he: 'גּוֹלֶם עֲנָק', kind: 'giant', sprite: 'golem', dmg: 34, src: 'Sanhedrin.65b.17', note: 'The golem grows huge and stomps across the stage.' }
  },
  {
    id: 'yehoshua', name: 'Yehoshua bin Nun', he: 'יְהוֹשֻׁעַ בִּן נוּן', title: 'He Who Stopped the Sun',
    color: '#c9a227', h: 98, w: 48, weight: 110, walk: 2.6, run: 5.4, air: 4.2, jump: 13.6, jumps: 1, grav: 0.58,
    arch: 'spear', power: 1.02,
    look: { skin: '#d9a57c', robe: '#6d5a2e', robe2: '#c9a227', beard: '#9a9a9a', hair: '#9a9a9a', head: 'helmet', headColor: '#c9a227', weapon: 'spear', beardLen: 0.8, armor: true },
    bio: 'Moshe\'s student, who led Yisrael into the land. The walls of Yericho fell at the shofar, and at Givon he told the sun to stand still.',
    specials: {
      neutral: { name: 'Shofar of Yericho', he: 'וַיִּתְקְעוּ בַּשֹּׁפָרוֹת', kind: 'shoot', startup: 16, end: 18,
        proj: { type: 'sound', vx: 8, vy: 0, grav: 0, dmg: 6, bkb: 50, kbg: 60, ang: 20, life: 45, w: 40, h: 70, pierce: true, wind: true }, count: 1,
        src: 'Joshua.6.20', note: 'The people heard the shofar and gave a great shout, and the wall fell. The blast pushes fighters and breaks shields.' },
      side: { name: 'Outstretched Kidon', he: 'נְטֵה בַּכִּידוֹן', kind: 'melee', frames: 36, anim: 'thrust', lunge: 6,
        hits: [{ s: 10, e: 18, x: 0.4, y: -0.62, w: 2.2, h: 0.35, dmg: 13, bkb: 35, kbg: 92, ang: 35 }],
        src: 'Joshua.8.18', note: 'Hashem said: stretch out the spear in your hand toward Ai. A long lunging thrust.' },
      up: { name: 'Ascent of Beit Choron', he: 'מַעֲלֵה בֵית חוֹרֹן', kind: 'rise', startup: 7, vy: -17, vx: 2.4, dur: 22,
        hit: { dmg: 10, bkb: 40, kbg: 75, ang: 82 }, fx: 'spear',
        src: 'Joshua.10.10', note: 'He chased them on the road up to Beit Choron. A rising spear vault.' },
      down: { name: 'Sun, Stand Still', he: 'שֶׁמֶשׁ בְּגִבְעוֹן דּוֹם', kind: 'field', field: 'sun', startup: 18, end: 16, dur: 300,
        src: 'Joshua.10.12', note: 'Sun, stand still at Givon. Enemies inside the light move in slow motion.' }
    },
    final: { name: 'Hailstones of Beit Choron', he: 'אַבְנֵי הַבָּרָד', kind: 'rain', sprite: 'hail', dmg: 9, count: 40, src: 'Joshua.10.11', note: 'Hashem threw huge stones from heaven on them. More died from the hail than from the sword.' }
  },
  {
    id: 'eliyahu', name: 'Eliyahu HaNavi', he: 'אֵלִיָּהוּ הַנָּבִיא', title: 'The Zealous Prophet',
    color: '#e74c3c', h: 94, w: 44, weight: 96, walk: 2.7, run: 5.3, air: 4.6, jump: 13.6, jumps: 1, grav: 0.52,
    arch: 'staff', power: 0.98,
    look: { skin: '#cf9a6e', robe: '#6b4a2b', robe2: '#3e2a17', beard: '#2b2b2b', hair: '#2b2b2b', head: 'none', weapon: 'mantle', beardLen: 1.1, hairy: true },
    bio: '"A hairy man with a leather belt around his waist." On Har HaCarmel he called down fire from heaven, he split the Yarden with his mantle, and went up to heaven in a chariot of fire.',
    specials: {
      neutral: { name: 'Fire from Heaven', he: 'וַתֵּרֶד אֵשׁ מִן הַשָּׁמַיִם', kind: 'skyfall', startup: 18, end: 16, dist: 170,
        proj: { type: 'firebolt', vx: 0, vy: 16, grav: 0, dmg: 13, bkb: 35, kbg: 80, ang: 75, life: 60, w: 34, h: 60, pierce: true },
        src: 'II_Kings.1.10', note: 'If I am a man of God, let fire come down from heaven. Calls fire down a short way in front of him.' },
      side: { name: 'Rolled Mantle', he: 'וַיִּגְלֹם אֶת אַדַּרְתּוֹ', kind: 'melee', frames: 32, anim: 'whip',
        hits: [{ s: 8, e: 14, x: 0.3, y: -0.8, w: 2.0, h: 0.5, dmg: 10, bkb: 30, kbg: 85, ang: 30 }],
        src: 'II_Kings.2.8', note: 'Eliyahu rolled up his mantle and struck the water, and it split. A long whip of cloth.' },
      up: { name: 'Chariot of Fire', he: 'רֶכֶב אֵשׁ וְסוּסֵי אֵשׁ', kind: 'rise', startup: 10, vy: -19, vx: 3, dur: 26,
        hit: { dmg: 4, bkb: 10, kbg: 30, ang: 85, rehit: 6 }, fx: 'chariot',
        src: 'II_Kings.2.11', note: 'A chariot of fire with horses of fire, and Eliyahu went up in a storm wind.' },
      down: { name: 'Ravens Bring Bread', he: 'וְהָעֹרְבִים מְבִיאִים לוֹ', kind: 'heal', frames: 44, amount: 10,
        src: 'I_Kings.17.6', note: 'The ravens brought him bread and meat morning and evening.' }
    },
    final: { name: 'Fire on Carmel', he: 'אֵשׁ ה\' עַל הַכַּרְמֶל', kind: 'rain', sprite: 'fire', dmg: 10, count: 34, src: 'I_Kings.18.38', note: 'Fire from Hashem fell and burned up the offering, the wood, the stones and the dust.' }
  },
  {
    id: 'gideon', name: 'Gideon ben Yoash', he: 'גִּדְעוֹן בֶּן יוֹאָשׁ', title: 'Mighty Man of Valor',
    color: '#27ae60', h: 92, w: 46, weight: 100, walk: 2.8, run: 5.6, air: 4.4, jump: 13.8, jumps: 1, grav: 0.57,
    arch: 'sword', power: 1.02,
    look: { skin: '#dcaa80', robe: '#3b5e2b', robe2: '#27ae60', beard: '#4a3020', hair: '#4a3020', head: 'kerchief', headColor: '#27ae60', weapon: 'torch', beardLen: 0.7 },
    bio: 'A farmer threshing wheat in hiding when the malach called him "mighty man of valor." With 300 men, shofros, jars and torches he routed the whole camp of Midyan.',
    specials: {
      neutral: { name: 'Break the Jars', he: 'וַיִּשְׁבְּרוּ הַכַּדִּים', kind: 'melee', frames: 34, anim: 'flash',
        hits: [{ s: 10, e: 14, x: 0.2, y: -1.4, w: 2.0, h: 1.6, dmg: 6, bkb: 30, kbg: 40, ang: 50, stun: 50 }],
        src: 'Judges.7.20', note: 'They blew the shofros and broke the jars and held up the torches. The flash of light stuns.' },
      side: { name: 'Thrown Torch', he: 'לַפִּידִים', kind: 'shoot', startup: 10, end: 16,
        proj: { type: 'torch', vx: 10, vy: -5, grav: 0.35, dmg: 9, bkb: 30, kbg: 65, ang: 40, life: 90, w: 18, h: 18, fire: true }, count: 1,
        src: 'Judges.7.16', note: 'He gave them all shofros and empty jars with torches inside.' },
      up: { name: 'A Sword for Hashem!', he: 'חֶרֶב לַה\' וּלְגִדְעוֹן', kind: 'rise', startup: 6, vy: -17, vx: 2.4, dur: 22,
        hit: { dmg: 10, bkb: 40, kbg: 75, ang: 80 }, fx: 'sword',
        src: 'Judges.7.20', note: 'They shouted: "A sword for Hashem and for Gideon!"' },
      down: { name: 'The Fleece', he: 'גִּזַּת הַצֶּמֶר', kind: 'counter', window: [4, 24], frames: 36, mult: 1.3,
        src: 'Judges.6.38', note: 'He squeezed the fleece and wrung out a bowl full of dew. Absorbs a hit and pays it back.' }
    },
    final: { name: '300 Shofros', he: 'שְׁלֹשׁ מֵאוֹת הַשּׁוֹפָרוֹת', kind: 'sweep', sprite: 'shofars', dmg: 30, src: 'Judges.7.22', note: 'The 300 blew their shofros and Hashem turned each man\'s sword against his fellow throughout the camp.' }
  },
  {
    id: 'pinchas', name: 'Pinchas ben Elazar', he: 'פִּינְחָס בֶּן אֶלְעָזָר', title: 'The Zealous Kohen',
    color: '#ecf0f1', h: 94, w: 44, weight: 100, walk: 2.8, run: 5.8, air: 4.4, jump: 13.8, jumps: 1, grav: 0.57,
    arch: 'spear', power: 1.0,
    look: { skin: '#e0b088', robe: '#f6f6f6', robe2: '#3b5bdb', beard: '#3a2618', hair: '#3a2618', head: 'kohen', headColor: '#ffffff', weapon: 'spear', beardLen: 0.6 },
    bio: 'Grandson of Aharon, a kohen who acted with zeal and stopped the plague. Rabbi Yochanan says six miracles were done for him that day. Hashem gave him the "covenant of peace."',
    specials: {
      neutral: { name: 'Romach', he: 'וַיִּקַּח רֹמַח בְּיָדוֹ', kind: 'melee', frames: 30, anim: 'thrust',
        hits: [{ s: 6, e: 9, x: 0.4, y: -0.6, w: 1.9, h: 0.3, dmg: 3, bkb: 10, kbg: 20, ang: 30 }, { s: 12, e: 14, x: 0.4, y: -0.6, w: 1.9, h: 0.3, dmg: 3, bkb: 10, kbg: 20, ang: 30 }, { s: 18, e: 21, x: 0.4, y: -0.6, w: 2.1, h: 0.35, dmg: 7, bkb: 40, kbg: 85, ang: 38 }],
        src: 'Numbers.25.7', note: 'Pinchas saw, got up from among the congregation and took a spear in his hand. A three-hit thrust.' },
      side: { name: 'Zealous Charge', he: 'בְּקַנְאוֹ אֶת קִנְאָתִי', kind: 'dash', startup: 8, dur: 18, speed: 11, grab: true, lift: true,
        hit: { dmg: 13, bkb: 50, kbg: 80, ang: 75 },
        src: 'Sanhedrin.82b.2', note: 'One miracle: an angel lifted the lintel so Pinchas could come out holding them up on the spear. Skewers and lifts.' },
      up: { name: 'Raised Lintel', he: 'הִגְבִּיהַּ אֶת הַמַּשְׁקוֹף', kind: 'rise', startup: 6, vy: -18, vx: 2, dur: 22,
        hit: { dmg: 10, bkb: 40, kbg: 75, ang: 88 }, fx: 'spear',
        src: 'Sanhedrin.82b.2', note: 'An angel came and raised the lintel of the doorway.' },
      down: { name: 'Covenant of Peace', he: 'בְּרִיתִי שָׁלוֹם', kind: 'reflect', frames: 40, radius: 66, absorb: true, heal: 0,
        src: 'Numbers.25.12', note: 'I give him My covenant of peace. A bubble that soaks up projectiles.' }
    },
    final: { name: 'The Plague is Stopped', he: 'וַתֵּעָצַר הַמַּגֵּפָה', kind: 'beam', sprite: 'holylight', dmg: 36, src: 'Numbers.25.8', note: 'And the plague stopped among the Children of Israel.' }
  },
  {
    id: 'yael', name: 'Yael', he: 'יָעֵל אֵשֶׁת חֶבֶר', title: 'Most Blessed of Women in the Tent',
    color: '#9b59b6', h: 84, w: 40, weight: 82, walk: 3.1, run: 6.4, air: 5.0, jump: 14.4, jumps: 2, grav: 0.55,
    arch: 'mallet', power: 1.0,
    look: { skin: '#e8bb93', robe: '#6c3483', robe2: '#d7bde2', beard: null, hair: '#2b1a10', head: 'scarf', headColor: '#9b59b6', weapon: 'mallet', beardLen: 0 },
    bio: 'Yael, wife of Chever the Keini. When Sisera fled from Devorah and Barak she took a tent peg and a hammer and finished the war. Devorah\'s song calls her "most blessed of women in the tent."',
    specials: {
      neutral: { name: 'Tent Peg', he: 'יְתַד הָאֹהֶל', kind: 'shoot', startup: 9, end: 12,
        proj: { type: 'peg', vx: 14, vy: -2, grav: 0.2, dmg: 8, bkb: 25, kbg: 70, ang: 30, life: 80, w: 24, h: 8 }, count: 1,
        src: 'Judges.4.21', note: 'Yael took a tent peg and put the hammer in her hand.' },
      side: { name: 'Bowl of Milk', he: 'בְּסֵפֶל אַדִּירִים', kind: 'shoot', startup: 12, end: 16,
        proj: { type: 'milk', vx: 8, vy: -6, grav: 0.4, dmg: 4, bkb: 10, kbg: 10, ang: 50, life: 80, w: 20, h: 14, sleep: 90 }, count: 1,
        src: 'Judges.5.25', note: 'He asked for water and she gave him milk in a fine bowl. Puts the target to sleep.' },
      up: { name: 'Tent Pole Vault', he: 'עַמּוּד הָאֹהֶל', kind: 'rise', startup: 5, vy: -18, vx: 3, dur: 22,
        hit: { dmg: 8, bkb: 35, kbg: 70, ang: 80 }, fx: 'pole',
        src: 'Judges.4.18', note: 'Yael went out to meet Sisera and brought him into the tent. A pole vault.' },
      down: { name: 'Hammer Down', he: 'וְהַלְמָה סִיסְרָא', kind: 'melee', frames: 38, anim: 'slam', fall: 14,
        hits: [{ s: 12, e: 18, x: -0.8, y: -0.4, w: 1.8, h: 0.6, dmg: 14, bkb: 30, kbg: 90, ang: 70, bury: true }],
        src: 'Judges.5.26', note: 'She hammered Sisera and struck through his head. In the air it meteor-falls.' }
    },
    final: { name: 'The Stars Fought', he: 'הַכּוֹכָבִים מִמְּסִלּוֹתָם', kind: 'rain', sprite: 'star', dmg: 9, count: 44, src: 'Judges.5.20', note: 'From heaven they fought; the stars from their courses fought against Sisera.' }
  }
];

/* The Classic-mode final boss. Not playable. */
const BOSS = {
  id: 'golyat', name: 'Golyat of Gat', he: 'גָּלְיָת הַפְּלִשְׁתִּי', title: 'Six Amos and a Span',
  color: '#7f8c8d', h: 230, w: 96, weight: 220, walk: 1.6, run: 2.6, air: 2.6, jump: 13, jumps: 0, grav: 0.7,
  arch: 'club', power: 1.3, boss: true, hp: 260,
  look: { skin: '#b07a54', robe: '#5d4a37', robe2: '#95a5a6', beard: '#1b1b1b', hair: '#1b1b1b', head: 'bosshelm', headColor: '#a8814a', weapon: 'busters', beardLen: 1.0, armor: true },
  bio: 'The Philistine champion from Gat, "six amos and a span" tall, in bronze scale armor, with a spear shaft like a weaver\'s beam.',
  src: 'I_Samuel.17.4'
};

/* ---------- Items ---------- */
const ITEMS = {
  jawbone: { name: 'Jawbone of a Donkey', he: 'לְחִי חֲמוֹר', type: 'melee', power: 1.45, reach: 1.25, uses: 0, weight: 3,
    src: 'Judges.15.15', note: 'Shimshon\'s weapon against a thousand Philistines. A strong club.' },
  goliath: { name: 'Sword of Golyat', he: 'חֶרֶב גָּלְיָת', type: 'melee', power: 1.9, reach: 2.0, slow: 1.35, uses: 0, weight: 1,
    src: 'I_Samuel.21.10', note: '"There is none like it, give it to me." A huge broad blade. Slow and devastating.' },
  sling: { name: 'Sling & Stones', he: 'קֶלַע וַאֲבָנִים', type: 'shooter', ammo: 5, weight: 3,
    proj: { type: 'stone', vx: 14, vy: -1, grav: 0.12, dmg: 8, bkb: 25, kbg: 65, ang: 30, life: 90, w: 14, h: 14 },
    src: 'I_Samuel.17.40', note: 'David took five smooth stones from the stream. Five shots.' },
  shofar: { name: 'Shofar', he: 'שׁוֹפָר', type: 'shooter', ammo: 3, weight: 2,
    proj: { type: 'sound', vx: 9, vy: 0, grav: 0, dmg: 5, bkb: 60, kbg: 50, ang: 15, life: 40, w: 40, h: 70, pierce: true, wind: true },
    src: 'Joshua.6.20', note: 'The blast that brought down the walls of Yericho. It pushes fighters away.' },
  jar: { name: 'Jar & Torch', he: 'כַּד וְלַפִּיד', type: 'throw', weight: 3, explode: { dmg: 14, bkb: 40, kbg: 85, r: 70, fire: true },
    src: 'Judges.7.16', note: 'Gideon\'s jars with torches hidden inside. Bursts into flame when thrown.' },
  peg: { name: 'Tent Peg', he: 'יְתַד', type: 'throw', weight: 3, throwDmg: 12,
    src: 'Judges.4.21', note: 'Yael\'s tent peg. Thrown hard, it flies straight.' },
  hail: { name: 'Hailstone', he: 'אֶבֶן בָּרָד', type: 'throw', weight: 3, throwDmg: 15, heavy: true,
    src: 'Joshua.10.11', note: 'Huge stones from heaven at Beit Choron. Heavy, so you move slowly while carrying it.' },
  staff: { name: 'Staff of Aharon', he: 'מַטֵּה אַהֲרֹן', type: 'throw', weight: 2, summon: 'snake',
    src: 'Exodus.7.10', note: 'Aharon threw down his staff and it became a serpent. Throw it and a snake attacks your rivals.' },
  manna: { name: 'Manna', he: 'מָן', type: 'food', heal: 18, weight: 3,
    src: 'Exodus.16.15', note: '"What is it?" Bread from heaven. Heals 18%.' },
  honey: { name: 'Honeycomb', he: 'יַעְרַת הַדְּבַשׁ', type: 'food', heal: 5, buff: 'speed', buffDur: 480, weight: 2,
    src: 'I_Samuel.14.27', note: 'Yonatan tasted the honey and his eyes lit up. Speed boost.' },
  ruach: { name: 'Ruach Orb', he: 'רוּחַ גְּבוּרָה', type: 'orb', hp: 3, weight: 0.5,
    src: 'Judges.14.6', note: '"The spirit of Hashem came upon him." Break the orb, then press SPECIAL for your Final Strike.' }
};

/* ---------- Stages ----------
   ground: solid platforms {x,y,w,h} (can't pass from below, have ledges)
   plats: soft platforms {x,y,w} (jump through, drop with down)
   blast: KO bounds.  sky: gradient.  deco: art.js scene key. */
const STAGES = [
  { id: 'elah', name: 'Valley of Elah', he: 'עֵמֶק הָאֵלָה', src: 'I_Samuel.17.2',
    note: 'Shaul and the men of Yisrael camped in the Valley of Elah and lined up for battle against the Philistines.',
    ground: [{ x: -460, y: 0, w: 920, h: 80 }], plats: [{ x: -300, y: -150, w: 200 }, { x: 100, y: -150, w: 200 }, { x: -100, y: -290, w: 200 }],
    blast: { l: -1300, r: 1300, t: -1050, b: 650 }, sky: ['#7ec8f2', '#d7f0ff'], deco: 'elah', music: 0 },
  { id: 'sinai', name: 'Har Sinai', he: 'הַר סִינַי', src: 'Exodus.19.18',
    note: 'Har Sinai was all in smoke because Hashem came down on it in fire, and the whole mountain shook.',
    ground: [{ x: -380, y: 0, w: 760, h: 300, slope: true }], plats: [{ x: -360, y: -170, w: 180 }, { x: 180, y: -170, w: 180 }, { x: -90, y: -320, w: 180, cloud: true }],
    blast: { l: -1250, r: 1250, t: -1100, b: 700 }, sky: ['#2c2440', '#8a6d8f'], deco: 'sinai', hazard: 'lightning', music: 1 },
  { id: 'yericho', name: 'Walls of Yericho', he: 'חוֹמוֹת יְרִיחוֹ', src: 'Joshua.6.20',
    note: 'The shofar blew, the people gave a great shout, and the wall fell down where it stood.',
    ground: [{ x: -520, y: 0, w: 1040, h: 80 }], plats: [{ x: -480, y: -190, w: 220, wall: true }, { x: 260, y: -190, w: 220, wall: true }, { x: -110, y: -150, w: 220 }],
    blast: { l: -1350, r: 1350, t: -1050, b: 650 }, sky: ['#f39c5a', '#fde3a7'], deco: 'yericho', hazard: 'walls', music: 2 },
  { id: 'carmel', name: 'Har HaCarmel', he: 'הַר הַכַּרְמֶל', src: 'I_Kings.18.38',
    note: 'Fire from Hashem fell and burned up the offering and the wood and licked up the water in the trench.',
    ground: [{ x: -420, y: 0, w: 840, h: 90 }], plats: [{ x: -80, y: -110, w: 160, altar: true }, { x: -360, y: -230, w: 170 }, { x: 190, y: -230, w: 170 }],
    blast: { l: -1250, r: 1250, t: -1050, b: 650 }, sky: ['#5d3a6e', '#f5b041'], deco: 'carmel', hazard: 'fire', music: 1 },
  { id: 'michmash', name: 'Pass of Michmash', he: 'מַעֲבַר מִכְמָשׂ', src: 'I_Samuel.14.4',
    note: 'Between the passes was a sharp rock on one side and a sharp rock on the other. One was called Botzetz and the other Seneh.',
    ground: [{ x: -560, y: 0, w: 400, h: 400 }, { x: 160, y: -40, w: 400, h: 440 }], plats: [{ x: -110, y: -170, w: 220 }],
    blast: { l: -1350, r: 1350, t: -1100, b: 650 }, sky: ['#a9cce3', '#f9e79f'], deco: 'michmash', music: 2 },
  { id: 'yamsuf', name: 'Splitting of the Sea', he: 'קְרִיעַת יַם סוּף', src: 'Exodus.14.22',
    note: 'Bnei Yisrael walked on dry land in the middle of the sea, with the water a wall on their right and on their left.',
    ground: [{ x: -440, y: 0, w: 880, h: 80 }], plats: [{ x: -330, y: -160, w: 160 }, { x: 170, y: -160, w: 160 }, { x: -80, y: -270, w: 160 }],
    blast: { l: -1250, r: 1250, t: -1050, b: 650 }, sky: ['#1b4f72', '#76d7ea'], deco: 'yamsuf', music: 0 },
  { id: 'prague', name: 'Prague Rooftops', he: 'אַלְטְנוֹי שׁוּל', src: 'Sanhedrin.65b.17',
    note: 'The Altneuschul roof, where Prague tradition says the golem still sleeps in the attic.',
    ground: [{ x: -480, y: 0, w: 960, h: 80, roof: true }], plats: [{ x: -360, y: -150, w: 150 }, { x: 210, y: -150, w: 150 }, { x: -75, y: -250, w: 150 }],
    blast: { l: -1300, r: 1300, t: -1050, b: 650 }, sky: ['#0b1a33', '#34495e'], deco: 'prague', music: 3 },
  { id: 'midbar', name: 'The Midbar', he: 'הַמִּדְבָּר', src: 'Deuteronomy.8.15',
    note: 'The great and awesome wilderness. Flat ground, no platforms, no excuses.',
    ground: [{ x: -500, y: 0, w: 1000, h: 90 }], plats: [],
    blast: { l: -1300, r: 1300, t: -1050, b: 650 }, sky: ['#e59866', '#fdebd0'], deco: 'midbar', music: 3 }
];

const HERO_BY_ID = Object.fromEntries(HEROES.map(h => [h.id, h]));
const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));

if (typeof module !== 'undefined') module.exports = { HEROES, BOSS, ITEMS, STAGES, HERO_BY_ID, STAGE_BY_ID, SEFARIA };
