'use strict';

// Wiki : parcourt les données du jeu (data/coc-data.js) — niveaux, coûts, durées et prérequis.
// Chargé avant app.js : il n'utilise window.COC_UI (formatage, images, menus) qu'au moment d'afficher.
(function () {
  const $ = (sel) => document.querySelector(sel);

  const HALL = { home: 1000001, bb: 1000034 };
  const B = { LAB: 1000007, HERO_HALL: 1000071, BLACKSMITH: 1000070, PET_HOUSE: 1000068, STAR_LAB: 1000046, SQUAD_BARRACKS: 1000106 };
  const PROSPECTOR = '93000003';
  const VILLAGE = {
    home: { name: 'Village principal', short: 'HDV', the: 'l\'HDV', hall: 'Hôtel de ville' },
    bb: { name: 'Base des ouvriers', short: 'MDO', the: 'la MDO', hall: 'Maison des ouvriers' },
  };
  // catégories, dans l'ordre d'affichage
  const CATS = [
    ['hall', 'Hôtel de ville'], ['bld', 'Bâtiments'], ['traps', 'Pièges'], ['troop', 'Troupes'], ['squad', 'Brigades'], ['spell', 'Sorts'],
    ['siege', 'Engins de siège'], ['heroes', 'Héros'], ['guardians', 'Gardiens'], ['pets', 'Familiers'],
    ['equip', 'Équipements'], ['helpers', 'Assistants'],
  ];
  const catLabel = (cat, village) => (cat === 'hall' ? VILLAGE[village].hall : CATS.find((c) => c[0] === cat)[1]);
  // image du titre de chaque catégorie : le bâtiment qui s'en occupe (caserne, usine de sorts, atelier, forge…),
  // sinon le premier élément de la catégorie
  const CAT_PIC = {
    home: { hall: 1000001, bld: 1000015, traps: 12000000, troop: 1000006, squad: 1000106, spell: 1000020, siege: 1000059, heroes: 1000071, pets: 1000068, equip: 1000070 },
    bb: { hall: 1000034, bld: 1000078, traps: 12000013, troop: 1000040 },
  };

  let ui = null;            // window.COC_UI
  let D = null;             // données du jeu
  let index = null;         // tous les éléments du wiki
  let ready = false;
  let listScroll = 0;       // position de la liste, pour y revenir après une fiche
  let thMenu = null;
  let gpBox = null, gpMenu = null;   // menu « Pass d'or » des fiches (placé dans la barre du tableau d'amélioration)
  const state = { village: 'home', cat: 'all', hero: '', q: '', th: 0 };   // hero : sous-catégorie des équipements
  // tableau affiché sur une fiche : statistiques (PV, dégâts…) ou amélioration (coûts, durées) ; retenu d'une visite à l'autre
  const VIEW_KEY = 'avancement-hdv:wiki-tableau';
  try { state.view = localStorage.getItem(VIEW_KEY) === 'cost' ? 'cost' : 'stats'; } catch (e) { state.view = 'stats'; }
  let current = '';         // identifiant de la fiche affichée
  const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });   // 0,128 s : vitesse de la Tour de l'enfer

  // Statistiques par niveau (data/coc-stats.js, 115 Ko) : chargées à la première visite du wiki,
  // pas avec le reste du site.
  let statsLoad = null;
  function loadStats() {
    if (window.COC_STATS) return Promise.resolve(true);
    if (!statsLoad) {
      statsLoad = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'data/coc-stats.js';
        s.onload = () => resolve(!!window.COC_STATS);
        s.onerror = () => { statsLoad = null; s.remove(); resolve(false); };
        document.head.appendChild(s);
      });
    }
    return statsLoad;
  }

  const tables = (village) => (village === 'bb' ? D.bb : D);
  const unlocks = (village) => (village === 'bb' ? D.bb.hall : D.th);
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- Index des éléments ----------
  function buildIndex() {
    index = [];
    const add = (village, cat, kind, id, e, extra) => {
      if (!e || !e.lv || !e.lv.length) return;           // B.O.B, cabane des assistants… : aucun niveau à montrer
      index.push({ village, cat, kind, id: String(id), e, name: e.n, en: e.en || '', key: norm(`${e.n} ${e.en || ''}`), ...extra });
    };
    // héros de chaque équipement (les données ne donnent que son nom)
    const heroByName = Object.fromEntries(Object.entries(D.heroes).map(([id, h]) => [h.n, id]));
    for (const village of D.bb ? ['home', 'bb'] : ['home']) {
      const t = tables(village);
      const home = village === 'home';
      add(village, 'hall', 'hall', HALL[village], t.buildings[HALL[village]]);
      for (const [id, e] of Object.entries(t.buildings)) if (+id !== HALL[village]) add(village, 'bld', 'struct', id, e);
      for (const [id, e] of Object.entries(t.traps)) add(village, 'traps', 'struct', id, e);
      // labo : le niveau dépend du laboratoire, le déblocage de la caserne (ou de l'usine de sorts, de l'atelier)
      for (const [id, e] of Object.entries(t.lab)) {
        // brigades (débloquées par la caserne des brigades) : leur propre catégorie, séparée des troupes
        const cat = e.pb === B.SQUAD_BARRACKS ? 'squad' : e.c;
        add(village, cat, 'unit', id, e, { req: home ? B.LAB : B.STAR_LAB, unlock: e.pb ? { b: e.pb, lvl: e.pbl } : null });
      }
      for (const [id, e] of Object.entries(t.heroes)) add(village, 'heroes', 'unit', id, e, { req: home ? B.HERO_HALL : 0 });
      if (!home) continue;
      for (const [id, e] of Object.entries(D.guardians)) add(village, 'guardians', 'unit', id, e, { req: 0 });
      for (const [id, e] of Object.entries(D.pets)) add(village, 'pets', 'unit', id, e, { req: B.PET_HOUSE, unlock: { b: B.PET_HOUSE, lvl: e.pbl } });
      for (const [id, e] of Object.entries(D.equipment)) {
        // le nom du héros entre dans la recherche : « reine » trouve la Reine des archères et ses équipements
        add(village, 'equip', 'equip', id, e, { hero: heroByName[e.h] || '', key: norm(`${e.n} ${e.en || ''} ${e.h || ''}`) });
      }
      for (const [id, e] of Object.entries(D.helpers)) add(village, 'helpers', 'helper', id, e);
    }
    const order = Object.fromEntries(CATS.map((c, i) => [c[0], i]));
    const byRank = (a, b) => order[a.cat] - order[b.cat] || a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]
      || a.name.localeCompare(b.name, 'fr');
    const rank = (it) => {                                // ordre du jeu quand il existe, sinon alphabétique
      if (it.kind === 'unit' && it.unlock) return [it.unlock.b, it.unlock.lvl];
      if (it.cat === 'helpers') return [+it.id, 0];
      if (it.cat === 'heroes' || it.cat === 'guardians') return [levelsOf(it)[0].th, +it.id];
      return [0, 0];
    };
    for (const it of index) it.rank = rank(it);
    // équipements : regroupés par héros (dans l'ordre des héros), les communs puis les épiques, par HDV de déblocage
    const heroRank = Object.fromEntries(index.filter((x) => x.cat === 'heroes' && x.village === 'home').sort(byRank).map((x, i) => [x.id, i]));
    for (const it of index) {
      if (it.cat === 'equip') it.rank = [it.hero in heroRank ? heroRank[it.hero] : 99, (it.e.rar === 'Epic' ? 100 : 0) + levelsOf(it)[0].th];
    }
    index.sort(byRank);
  }
  // nom et image du héros d'un équipement
  const heroOf = (it) => {
    const h = it.hero && D.heroes[it.hero];
    return { id: it.hero, name: h ? h.n : it.e.h || 'Autres', src: it.hero ? ui.imgSrc(it.hero) : '' };
  };

  // Niveaux d'un élément, avec l'HDV (ou la MDO) à partir duquel chaque niveau devient réellement accessible :
  // le plus haut entre l'HDV demandé par le niveau, celui du bâtiment prérequis et celui du déblocage.
  function levelsOf(it) {
    if (it._lv) return it._lv;
    const t = tables(it.village);
    const hallFor = (id, lvl) => {                        // HDV qui donne accès au niveau lvl du bâtiment id
      const b = t.buildings[id];
      const r = b && b.lv.find((x) => x[0] === lvl);
      return r ? r[3] : 0;
    };
    const unlockTH = it.unlock ? hallFor(it.unlock.b, it.unlock.lvl) : 0;
    const out = [];
    let run = 0;
    for (const r of it.e.lv) {
      let o;
      if (it.kind === 'equip') o = { lvl: r[0], ores: [r[1], r[2], r[3]], req: r[5], th: Math.max(r[4], hallFor(B.BLACKSMITH, r[5])) };
      else if (it.kind === 'helper') o = { lvl: r[0], th: r[1], mult: r[2], gems: r[3] || 0 };
      else if (it.kind === 'hall') o = { lvl: r[0], cost: r[1], time: r[2], th: r[0] };
      else if (it.kind === 'struct') o = { lvl: r[0], cost: r[1], time: r[2], th: r[3] || 1 };
      else {
        const req = it.req ? r[4] || 0 : 0;
        o = { lvl: r[0], cost: r[1], time: r[2], req, th: Math.max(r[3] || 0, it.req ? hallFor(it.req, req) : 0, unlockTH, 1) };
      }
      run = Math.max(run, o.th);
      o.th = run;
      out.push(o);
    }
    it._lv = out;
    return out;
  }
  // nombre de ce bâtiment (ou piège) débloqué à chaque HDV : [[hdv, total], …]
  function countsOf(it) {
    if (it.kind !== 'struct') return [];
    const U = unlocks(it.village), out = [];
    let total = 0;
    for (const L of Object.keys(U).map(Number).sort((a, b) => a - b)) {
      const q = (U[L].u || []).filter(([id]) => String(id) === it.id).reduce((s, [, n]) => s + n, 0);
      if (q) { total += q; out.push([L, total]); }
    }
    return out;
  }
  const sinceOf = (it) => {
    const c = countsOf(it);
    return Math.max(levelsOf(it)[0].th, c.length ? c[0][0] : 0);
  };
  const maxAt = (it, th) => {
    let m = 0;
    for (const l of levelsOf(it)) if (l.th <= th) m = l.lvl;
    return m;
  };
  const maxLevel = (it) => { const l = levelsOf(it); return l[l.length - 1].lvl; };

  // niveaux du joueur pour cet élément, si un village est importé : [[niveau, nombre], …]
  function mineOf(it) {
    const v = ui.village();
    if (!v) return [];
    const bb = it.village === 'bb';
    const secs = {
      hall: [bb ? 'buildings2' : 'buildings'], bld: [bb ? 'buildings2' : 'buildings'], traps: [bb ? 'traps2' : 'traps'],
      troop: bb ? ['units2'] : ['units'], squad: ['units', 'squads'], spell: ['spells'], siege: ['siege_machines'], heroes: [bb ? 'heroes2' : 'heroes'],
      guardians: ['guardians'], pets: ['pets'], equip: ['equipment'], helpers: ['helpers'],
    }[it.cat];
    const m = new Map();
    for (const sec of secs) {
      for (const x of v[sec] || []) {
        if (String(x.data) !== it.id || !x.lvl) continue;
        m.set(x.lvl, (m.get(x.lvl) || 0) + (x.cnt || 1));
      }
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }

  // ---------- Affichage commun ----------
  const pic = (it, lvl, cls) => {
    const src = ui.imgSrc(it.id, lvl);
    return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : `<span class="${cls} wiki-nopic" aria-hidden="true"></span>`;
  };
  const cost = (n, res) => (n ? `<span class="cost">${ui.nf.format(n)} ${ui.icon(res)}</span>` : '<span class="muted">—</span>');

  // petites icônes du jeu dans les tableaux : PV (cœur), dégâts (explosion), durées (chronomètre)
  const STAT_IC = { hp: 'img/ui/hp.png', dmg: 'img/ui/damage.png', time: 'img/ui/time.png' };
  const statIc = (kind) => (kind ? ` <img class="stat-ic" src="${STAT_IC[kind]}" alt="">` : '');
  // type d'icône d'une colonne de statistiques, d'après sa clé (« multiTarget.dps » -> « dps »)
  function statKind(key) {
    const k = String(key).split('.').pop();
    if (/radius|range/i.test(k)) return '';                  // rayon des dégâts : une distance, pas des dégâts
    if (/duration|time|cooldown|lifetime|seconds/i.test(k)) return 'time';
    if (/hitpoint|health|heal|hp/i.test(k)) return 'hp';
    if (/dps|damage/i.test(k) && !/reduction/i.test(k)) return 'dmg';
    return '';
  }
  // même chose pour les colonnes de capacité des héros de la base des ouvriers, nommées en français
  const labelKind = (label) => (/^PV/.test(label) ? 'hp' : /^DPS|^Dégâts/.test(label) ? 'dmg' : '');

  // durée : en secondes sous la minute (les premiers niveaux se construisent en quelques secondes)
  const time = (s) => (!s ? '<span class="muted">—</span>' : `<span class="cost">${s < 60 ? `${s} s` : ui.dur(s)}${statIc('time')}</span>`);
  const hall = (village, n) => `${VILLAGE[village].short} ${n}`;

  // cellule « HDV requis » d'un tableau : le texte puis la petite image de l'HDV (ou de la MDO) de ce niveau
  const hallCell = (village, n) => {
    const src = ui.imgSrc(HALL[village], n);
    return `<span class="th-cell">${hall(village, n)}${src ? `<img class="th-ic" src="${src}" alt="" loading="lazy">` : ''}</span>`;
  };

  const catPic = (cat, village) => {
    const id = CAT_PIC[village][cat];
    let src = id ? ui.imgSrc(id, 999) : null;                // 999 : dernière image disponible, celle du niveau max
    if (!src) {
      const first = index.find((x) => x.village === village && x.cat === cat);
      src = first && ui.imgSrc(first.id, maxLevel(first));
    }
    return src ? `<img class="wiki-cat-ic" src="${src}" alt="" loading="lazy">` : '';
  };

  // ---------- Liste ----------
  function matches(it) {
    if (it.village !== state.village) return false;
    if (state.q && !it.key.includes(state.q)) return false;
    if (state.th && sinceOf(it) > state.th) return false;
    return true;
  }

  function renderChips(found) {
    const n = {};
    for (const it of found) n[it.cat] = (n[it.cat] || 0) + 1;
    const chip = (key, label, count) => `<button type="button" class="chip-btn" data-cat="${key}" aria-pressed="${state.cat === key}">${ui.esc(label)} <small>${count}</small></button>`;
    $('#wiki-chips').innerHTML = chip('all', 'Tout', found.length)
      + CATS.filter(([key]) => n[key]).map(([key]) => chip(key, catLabel(key, state.village), n[key])).join('');
  }

  // sous-catégories des équipements : une puce par héros, visibles quand « Équipements » est choisi
  function renderHeroChips(equip) {
    const box = $('#wiki-heroes');
    box.hidden = state.cat !== 'equip';
    if (box.hidden) return;
    const heroes = heroGroups(equip);
    const chip = (key, html, count) => `<button type="button" class="chip-btn" data-hero="${key}" aria-pressed="${state.hero === key}">${html} <small>${count}</small></button>`;
    const x = box.scrollLeft;                             // sur téléphone la ligne défile : on garde sa position
    box.innerHTML = chip('', 'Tous les héros', equip.length)
      + heroes.map(([h, list]) => chip(h.id, `${h.src ? `<img class="chip-ic" src="${h.src}" alt="">` : ''}${ui.esc(h.name)}`, list.length)).join('');
    box.scrollLeft = x;
  }
  // [[héros, équipements], …] dans l'ordre de la liste (déjà triée par héros)
  function heroGroups(list) {
    const out = [];
    for (const it of list) {
      const last = out[out.length - 1];
      if (last && last[0].id === it.hero) last[1].push(it);
      else out.push([heroOf(it), [it]]);
    }
    return out;
  }

  // carte de la liste : l'image (au niveau max, ou au niveau max de l'HDV filtré) et le nom ;
  // un équipement garde son étiquette de rareté
  function card(it) {
    const lvl = state.th ? maxAt(it, state.th) : maxLevel(it);
    const extra = it.cat === 'equip' ? rarity(it) : '';
    return `<a class="wiki-card" href="#wiki/${it.id}">${pic(it, lvl, 'wiki-pic')}<span class="wiki-name">${ui.esc(it.name)}</span>${extra}</a>`;
  }
  // étiquette de rareté d'un équipement, celle du jeu (« Commun » bleue, « Épique » violette)
  function rarity(it, cls = 'rarity') {
    const epic = it.e.rar === 'Epic';
    return `<img class="${cls}" src="img/ui/rarity-${epic ? 'epic' : 'common'}.webp" width="${epic ? 183 : 186}" height="${epic ? 68 : 69}" alt="${epic ? 'Épique' : 'Commun'}">`;
  }
  // équipement sur la fiche de son héros : image, nom et rareté
  const gearCard = (it) => `<a class="wiki-card" href="#wiki/${it.id}">${pic(it, maxLevel(it), 'wiki-pic')}<span class="wiki-name">${ui.esc(it.name)}</span>${rarity(it)}</a>`;

  function renderList() {
    const found = index.filter(matches);
    if (state.cat !== 'all' && !found.some((it) => it.cat === state.cat)) state.cat = 'all';
    renderChips(found);
    const equip = found.filter((it) => it.cat === 'equip');
    if (state.hero && !equip.some((it) => it.hero === state.hero)) state.hero = '';
    renderHeroChips(equip);
    let shown = state.cat === 'all' ? found : found.filter((it) => it.cat === state.cat);
    if (state.cat === 'equip' && state.hero) shown = shown.filter((it) => it.hero === state.hero);
    const groups = CATS.map(([key]) => [key, shown.filter((it) => it.cat === key)]).filter(([, list]) => list.length);
    const grid = (list) => `<div class="wiki-grid">${list.map((x) => card(x)).join('')}</div>`;
    // équipements : une sous-section par héros
    const content = (key, list) => (key !== 'equip' ? grid(list) : heroGroups(list).map(([h, items]) => `
          <div class="wiki-sub">
            <h3>${h.src ? `<img class="wiki-sub-ic" src="${h.src}" alt="">` : ''}${h.id ? `<a href="#wiki/${h.id}">${ui.esc(h.name)}</a>` : ui.esc(h.name)} <small>${items.length}</small></h3>
            ${grid(items)}
          </div>`).join(''));
    $('#wiki-results').innerHTML = groups.length
      ? groups.map(([key, list]) => `
        <section class="wiki-cat">
          <h2>${catPic(key, state.village)}<span>${ui.esc(catLabel(key, state.village))}</span><small>${list.length}</small></h2>
          ${content(key, list)}
        </section>`).join('')
      : `<p class="empty wiki-empty">Aucun élément ne correspond à cette recherche. <button type="button" class="link" data-clear>Effacer les filtres</button></p>`;
  }

  function syncToolbar() {
    for (const b of document.querySelectorAll('#wiki-village [data-village]')) b.setAttribute('aria-pressed', String(b.dataset.village === state.village));
    const V = VILLAGE[state.village];
    const top = maxLevel(index.find((it) => it.village === state.village && it.cat === 'hall'));
    const opts = [{ value: 0, label: `Tous les ${V.short}`, html: `<span>Tous les ${V.short}</span>` }];
    for (let n = 1; n <= top; n++) {
      const src = ui.imgSrc(HALL[state.village], n);
      opts.push({ value: n, label: `${V.short} ${n}`, html: `${src ? `<img class="dd-th" src="${src}" alt="" loading="lazy">` : ''}<span>${V.short} ${n}</span>` });
    }
    if (state.th > top) state.th = 0;
    thMenu.set(opts, state.th);
    $('#lbl-wiki-th').textContent = `Filtrer par niveau de ${V.the}`;
  }

  // ---------- Fiche d'un élément ----------
  function renderItem(it) {
    const V = VILLAGE[it.village];
    const lv = levelsOf(it);
    const mine = mineOf(it);
    const mineSet = new Set(mine.map(([l]) => l));
    const top = lv[lv.length - 1];
    const res = it.e.r;                                   // ressource des améliorations (bâtiments, troupes, héros)
    const reqName = it.req ? tables(it.village).buildings[it.req].n : '';
    const leveled = it.kind === 'struct' || it.kind === 'hall';   // une image par niveau
    const yours = (l) => (mineSet.has(l) ? ' <span class="chip prog">ton niveau</span>' : '');
    const lvlCell = (l) => `<td class="name"><span class="nm">${leveled ? pic(it, l, 'thumb') : ''}<span>Niveau ${l}${yours(l)}</span></span></td>`;
    // niveaux déjà passés (en vert) : sous le niveau le plus bas du joueur, donc faits pour tous ses exemplaires
    const doneBelow = mine.length ? Math.min(...mine.map(([l]) => l)) : 0;
    const rowCls = (l) => (mineSet.has(l) ? 'is-mine' : l < doneBelow ? 'is-past' : '');
    const row = (l, cells) => `<tr class="${rowCls(l)}">${lvlCell(l)}${cells}</tr>`;

    let head, body, foot = '', note = '';
    const sum = (f) => lv.reduce((s, l) => s + (f(l) || 0), 0);
    // Pass d'or choisi dans Mon village (−10, −15 ou −20 %) : coût et durée réduits, chacun à côté de la colonne normale
    // (pas de colonne réduite quand l'élément n'a pas de durée, comme les remparts)
    const gp = ui.goldPass ? ui.goldPass(it.village) : 0;
    const gpF = 1 - gp / 100;
    const gpHas = { cost: gp > 0 && lv.some((l) => l.cost), time: gp > 0 && lv.some((l) => l.time) };
    const gpTh = (k, label) => (gpHas[k] ? `<th class="num gp-col" title="Avec la réduction de ${gp} % du Pass d'or"><img class="th-gp" src="img/gold_pass.webp" alt="">${label}</th>` : '');
    const gpCost = (n) => (gpHas.cost ? `<td class="num gp-col">${cost(Math.round(n * gpF), res)}</td>` : '');
    const gpTime = (t) => (gpHas.time ? `<td class="num gp-col">${time(Math.round(t * gpF))}</td>` : '');
    if (it.kind === 'equip') {
      head = `<th>Niveau</th><th class="num">Minerai brillant</th><th class="num">Minerai luisant</th><th class="num">Minerai étoilé</th><th class="num">${ui.esc(tables('home').buildings[B.BLACKSMITH].n)} requis</th><th class="num">HDV requis</th>`;
      body = lv.map((l) => row(l.lvl, l.ores.map((o, i) => `<td class="num">${cost(o, `O${i + 1}`)}</td>`).join('')
        + `<td class="num">niv. ${l.req}</td><td class="num">${hallCell(it.village, l.th)}</td>`)).join('');
      foot = `<tr><td>Total</td>${[0, 1, 2].map((i) => `<td class="num">${cost(sum((l) => l.ores[i]), `O${i + 1}`)}</td>`).join('')}<td></td><td></td></tr>`;
    } else if (it.kind === 'helper') {
      const gold = it.id === PROSPECTOR;                  // l'Orpailleur s'obtient avec le Pass d'or
      const boost = lv.some((l) => l.mult);
      head = `<th>Niveau</th>${gold ? '' : '<th class="num">Gemmes</th>'}${boost ? '<th class="num">Heures gagnées par jour</th>' : ''}<th class="num">HDV requis</th>`;
      body = lv.map((l) => row(l.lvl, (gold ? '' : `<td class="num">${l.gems ? cost(l.gems, 'GEM') : '<span class="muted">gratuit</span>'}</td>`)
        + (boost ? `<td class="num"><span class="cost">${l.mult} h${statIc('time')}</span></td>` : '') + `<td class="num">${hallCell(it.village, l.th)}</td>`)).join('');
      if (!gold) foot = `<tr><td>Total</td><td class="num">${cost(sum((l) => l.gems), 'GEM')}</td>${boost ? '<td></td>' : ''}<td></td></tr>`;
      if (gold) note = 'Depuis la refonte du Pass d\'or (2026), l\'Orpailleur s\'obtient avec le Pass d\'or et non avec des gemmes.';
    } else if (it.kind === 'hall') {
      const U = unlocks(it.village), t = tables(it.village);
      const known = new Set(index.map((x) => x.id));
      const gives = (L) => {
        const parts = ((U[L] && U[L].u) || []).map(([id, q]) => {
          const e = t.buildings[id] || t.traps[id];
          if (!e) return '';
          const label = known.has(String(id)) ? `<a href="#wiki/${id}">${ui.esc(e.n)}</a>` : ui.esc(e.n);
          return `${label}${q > 1 ? ` ×${q}` : ''}`;
        }).filter(Boolean);
        if (U[L] && U[L].w) parts.push(`arme : ${ui.esc(U[L].w.n)}`);
        return parts.join(', ') || '<span class="muted">—</span>';
      };
      head = `<th>Niveau</th><th class="num">Coût</th>${gpTh('cost', "Coût Pass d'or")}<th class="num">Durée</th>${gpTh('time', "Durée Pass d'or")}<th>Débloque</th>`;
      body = lv.map((l) => row(l.lvl, `<td class="num">${cost(l.cost, res)}</td>${gpCost(l.cost)}<td class="num">${time(l.time)}</td>${gpTime(l.time)}<td class="wrap-cell">${gives(l.lvl)}</td>`)).join('');
      foot = `<tr><td>Total</td><td class="num">${cost(sum((l) => l.cost), res)}</td>${gpCost(sum((l) => l.cost))}<td class="num">${time(sum((l) => l.time))}</td>${gpTime(sum((l) => l.time))}<td></td></tr>`;
    } else {
      const withReq = it.kind === 'unit' && it.req;
      head = `<th>Niveau</th><th class="num">Coût</th>${gpTh('cost', "Coût Pass d'or")}<th class="num">Durée</th>${gpTh('time', "Durée Pass d'or")}${withReq ? `<th class="num">${ui.esc(reqName)} requis</th>` : ''}<th class="num">${V.short} requis${it.village === 'bb' ? 'e' : ''}</th>`;
      body = lv.map((l) => row(l.lvl, `<td class="num">${cost(l.cost, res)}</td>${gpCost(l.cost)}<td class="num">${time(l.time)}</td>${gpTime(l.time)}`
        + (withReq ? `<td class="num">${l.req ? `niv. ${l.req}` : '<span class="muted">—</span>'}</td>` : '')
        + `<td class="num">${hallCell(it.village, l.th)}</td>`)).join('');
      foot = `<tr><td>Total${it.cat === 'bld' && +it.id === (it.village === 'bb' ? 1000033 : 1000010) ? ' (par rempart)' : ''}</td><td class="num">${cost(sum((l) => l.cost), res)}</td>${gpCost(sum((l) => l.cost))}<td class="num">${time(sum((l) => l.time))}</td>${gpTime(sum((l) => l.time))}${withReq ? '<td></td>' : ''}<td></td></tr>`;
      if (it.e.alt) note = `À partir du niveau ${it.e.alt}, l'amélioration peut aussi se payer en ${ui.ICONS[it.e.ar || 'E'][1]}.`;
      else if (it.kind === 'unit' && lv[0].lvl > 1) note = `Se débloque directement au niveau ${lv[0].lvl}.`;
    }

    // en-tête : image, nom, faits marquants
    const facts = [`<span class="fact"><b>${ui.esc(catLabel(it.cat, it.village))}</b> · ${V.name}</span>`];
    if (it.cat !== 'hall') facts.push(`<span class="fact">Disponible dès <b>${hall(it.village, sinceOf(it))}</b></span>`);
    facts.push(`<span class="fact">Niveau max <b>${top.lvl}</b>${it.cat !== 'hall' ? ` à ${V.the} ${top.th}` : ''}</span>`);
    if (it.cat === 'equip') {
      const h = heroOf(it);
      facts.push(`<span class="fact">Héros : ${h.id ? `<a href="#wiki/${h.id}">${ui.esc(h.name)}</a>` : ui.esc(h.name)}</span>`);
    }
    if (res && ui.ICONS[res]) facts.push(`<span class="fact">${ui.icon(res, 'ic', null)} ${ui.ICONS[res][1]}</span>`);
    if (it.kind === 'unit' && it.unlock) {
      const b = tables(it.village).buildings[it.unlock.b];
      if (b) facts.push(`<span class="fact">Débloqué par : <a href="#wiki/${it.unlock.b}">${ui.esc(b.n)}</a> niv. ${it.unlock.lvl}</span>`);
    }
    if (mine.length) {
      facts.push(`<span class="fact is-mine">Ton village : <b>${mine.map(([l, n]) => (n > 1 ? `${n}× niv. ${l}` : `niv. ${l}`)).join(' · ')}</b></span>`);
    }
    // statistiques par niveau (PV, dégâts, capacité, production…) et caractéristiques fixes (portée, cible…)
    const S = window.COC_STATS && window.COC_STATS.items[it.id];
    if (S && S.t) facts.push(`<span class="fact">Capacité <b>${S.t}</b></span>`);
    if (S && S.sup) facts.push(`<span class="fact">Version super : <b>${ui.esc(S.sup.n || S.sup.en)}</b></span>`);

    // fiche d'un héros du village principal : ses équipements (communs puis épiques), qui lui donnent ses capacités
    const gear = it.cat === 'heroes' ? index.filter((x) => x.cat === 'equip' && x.hero === it.id) : [];
    let gearHtml = gear.length ? `
      <section class="wiki-gear" aria-labelledby="wiki-gear-title">
        <h3 id="wiki-gear-title">Équipements <small>${gear.length}</small></h3>
        <p class="muted wiki-gear-note">Les capacités du héros viennent de ses équipements, à améliorer chez le forgeron.</p>
        <div class="wiki-grid">${gear.map(gearCard).join('')}</div>
      </section>` : '';
    // héros de la base des ouvriers : sa capacité, par niveau de capacité et par niveau de charge
    if (S && S.ab) {
      const A = S.ab;
      const abCol = S.c.indexOf('abilityLevel');
      const myLvl = mine.length ? mine[mine.length - 1][0] : 0;
      const myRow = abCol >= 0 && S.r.find((r) => r[0] === myLvl);
      const myAb = myRow ? myRow[abCol + 1] : 0;
      const span = (gi) => A.c.filter(([g]) => g === gi).length;
      const grp = (ci) => (ci === 0 || A.c[ci - 1][0] !== A.c[ci][0] ? ' grp-start' : '');   // trait entre deux charges
      const rows = A.r.map(([lvl, heroLv, ...vals]) => `
        <tr class="${lvl === myAb ? 'is-mine' : lvl < myAb ? 'is-past' : ''}">
          <td class="name">Niveau ${lvl}${lvl === myAb ? ' <span class="chip prog">ton niveau</span>' : ''}</td>
          <td class="num">${heroLv ? `niv. ${ui.esc(heroLv)}` : '—'}</td>
          ${vals.map((x, ci) => `<td class="num${grp(ci)}">${x == null ? '—' : `<span class="cost">${nf2.format(x)}${statIc(labelKind(A.c[ci][1]))}</span>`}</td>`).join('')}
        </tr>`).join('');
      gearHtml = `
        <section class="wiki-gear" aria-labelledby="wiki-ab-title">
          <h3 id="wiki-ab-title">Capacité : ${ui.esc(A.n)}</h3>
          <dl class="wiki-ab-specs">${A.s.map(([k, x]) => `<div><dt>${ui.esc(k)}</dt><dd>${ui.esc(x)}</dd></div>`).join('')}</dl>
          <div class="wiki-table-wrap">
            <table class="wiki-table wiki-stats wiki-ab-table">
              <thead>
                <tr><th rowspan="2">Capacité</th><th rowspan="2" class="num">Niveaux du héros</th>${A.g.map((g, gi) => (span(gi) ? `<th colspan="${span(gi)}" class="grp">${ui.esc(g)}</th>` : '')).join('')}</tr>
                <tr>${A.c.map(([, lbl], ci) => `<th class="num${grp(ci)}">${ui.esc(lbl)}</th>`).join('')}</tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>`;
    }
    let statsHtml = '', specsHtml = '', weaponsHtml = '';
    if (S) {
      const labels = window.COC_STATS.labels;
      // valeur d'une cellule, avec l'icône de sa colonne (key) : cœur, explosion ou chronomètre
      const val = (v, key) => (v == null || v === '' ? '<span class="muted">—</span>'
        : `<span class="cost">${typeof v === 'number' ? nf2.format(v) : ui.esc(v)}${statIc(statKind(key))}</span>`);
      const rows = S.r.map(([key, ...vals]) => {
        const sc = typeof key === 'string';               // « S1 » : niveau de surcharge, après le niveau max
        const first = sc
          ? `<td class="name"><span class="nm">${leveled ? pic(it, top.lvl, 'thumb') : ''}<span>Surcharge ${key.slice(1)}</span></span></td>`
          : lvlCell(key);
        return `<tr class="${sc ? 'is-sc' : rowCls(key)}">${first}${vals.map((v, ci) => `<td class="num">${val(v, S.c[ci])}</td>`).join('')}</tr>`;
      }).join('');
      statsHtml = `
        <table class="wiki-table wiki-stats">
          <thead><tr><th>Niveau</th>${S.c.map((k) => `<th class="num">${ui.esc(labels[k] || k)}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      // hôtel de ville : ses armes (HDV 12 à 17), une ligne par HDV et par niveau de l'arme
      if (S.w) {
        const W = S.w;
        const several = (th) => W.r.filter((r) => r[0] === th).length > 1;
        const v = ui.village();
        const hallIt = v && (v.buildings || []).find((x) => String(x.data) === it.id);
        const isMine = (th, lvl) => hallIt && hallIt.lvl === th && (!several(th) || (hallIt.weapon || 1) === lvl);
        const isDone = (th, lvl) => hallIt && (th < hallIt.lvl || (th === hallIt.lvl && several(th) && lvl < (hallIt.weapon || 1)));
        const wrows = W.r.map(([th, name, lvl, ...vals]) => `
          <tr class="${isMine(th, lvl) ? 'is-mine' : isDone(th, lvl) ? 'is-past' : ''}">
            <td class="name"><span class="nm">${pic(it, th, 'thumb')}<span>${ui.esc(name)}${several(th) ? ` niv. ${lvl}` : ''}<small class="wiki-row-sub">${hall(it.village, th)}${isMine(th, lvl) ? ' <span class="chip prog">ton arme</span>' : ''}</small></span></span></td>
            ${vals.map((x, i) => (W.c[i] === 'weapon.effects'
              ? `<td class="wrap-cell">${x ? ui.esc(x) : '<span class="muted">—</span>'}</td>`
              : `<td class="num">${val(x, W.c[i])}</td>`)).join('')}
          </tr>`).join('');
        weaponsHtml = `
          <section class="wiki-weapons" aria-labelledby="wiki-weapons-title">
            <h3 id="wiki-weapons-title">Armes de l'hôtel de ville</h3>
            <p class="muted wiki-weapons-note">${W.n ? `${ui.esc(W.n)}. ` : ''}Chaque arme équipe l'hôtel de ville du niveau indiqué.</p>
            <div class="wiki-table-wrap">
              <table class="wiki-table wiki-stats">
                <thead><tr><th>Arme</th>${W.c.map((k) => `<th${k === 'weapon.effects' ? '' : ' class="num"'}>${ui.esc(labels[k] || k)}</th>`).join('')}</tr></thead>
                <tbody>${wrows}</tbody>
              </table>
            </div>
          </section>`;
      }
      // troupe qui a une version super : ses statistiques (son niveau est celui de la troupe de base)
      if (S.sup) {
        const P = S.sup;
        const withTh = P.r.some((r) => r[1]);
        const src = ui.imgSrc(P.id);
        const prows = P.r.map(([lvl, th, ...vals]) => `
          <tr class="${rowCls(lvl)}">
            <td class="name">Niveau ${lvl}${yours(lvl)}</td>
            ${vals.map((x, ci) => `<td class="num">${val(x, P.c[ci])}</td>`).join('')}
            ${withTh ? `<td class="num">${th ? hallCell(it.village, th) : '—'}</td>` : ''}
          </tr>`).join('');
        weaponsHtml += `
          <section class="wiki-weapons wiki-super" aria-labelledby="wiki-super-title">
            <div class="wiki-super-head">
              ${src ? `<img class="wiki-super-pic" src="${src}" alt="" loading="lazy">` : ''}
              <div>
                <h3 id="wiki-super-title">Super troupe : ${ui.esc(P.n || P.en)}</h3>
                ${P.d ? P.d.split('\n').map((p) => `<p class="wiki-desc">${ui.esc(p)}</p>`).join('') : ''}
              </div>
            </div>
            <dl class="wiki-ab-specs">${P.s.map(([k, x]) => `<div><dt>${ui.esc(k)}</dt><dd>${ui.esc(x)}</dd></div>`).join('')}</dl>
            <div class="wiki-table-wrap">
              <table class="wiki-table wiki-stats">
                <thead><tr><th>Niveau</th>${P.c.map((k) => `<th class="num">${ui.esc(labels[k] || k)}</th>`).join('')}${withTh ? '<th class="num">HDV requis</th>' : ''}</tr></thead>
                <tbody>${prows}</tbody>
              </table>
            </div>
          </section>`;
      }
      if (S.s && S.s.length) {
        specsHtml = `
          <section class="card wiki-specs" aria-labelledby="wiki-specs-title">
            <h3 id="wiki-specs-title">Caractéristiques</h3>
            <dl>${S.s.map(([k, v]) => `<div${v.length > 60 ? ' class="wide"' : ''}><dt>${ui.esc(k)}</dt><dd>${ui.esc(v)}</dd></div>`).join('')}</dl>
          </section>`;
      }
    }
    const view = S && state.view !== 'cost' ? 'stats' : 'cost';
    const toggle = S ? `
      <div class="village-switch wiki-view" role="group" aria-label="Tableau affiché">
        <button type="button" class="vs-btn" data-view="stats" aria-pressed="${view === 'stats'}">Statistiques</button>
        <button type="button" class="vs-btn" data-view="cost" aria-pressed="${view === 'cost'}">Amélioration</button>
      </div>` : '';
    // menu « Pass d'or » : avec le tableau d'amélioration, quand le Pass d'or réduit ses coûts ou ses durées
    // (pas les équipements, payés en minerais, ni les assistants, payés en gemmes)
    const gpOk = it.kind !== 'equip' && it.kind !== 'helper' && lv.some((l) => l.cost || l.time);
    const gpSlot = gpOk ? `<div class="wiki-gp-slot" data-panel="cost"${view === 'cost' ? '' : ' hidden'}></div>` : '';
    const bar = gearHtml || toggle || gpSlot
      ? `<div class="wiki-table-bar">${gearHtml ? '<h3 class="wiki-levels-title">Niveaux</h3>' : ''}${toggle}${gpSlot}</div>` : '';
    // héros : niveau max à chaque HDV (ou MDO) où il augmente, l'HDV du joueur mis en avant
    let capsHtml = '';
    if (it.cat === 'heroes') {
      const hallIt = index.find((x) => x.village === it.village && x.cat === 'hall');
      const myHall = ui.village() ? (mineOf(hallIt)[0] || [])[0] : 0;
      const caps = [];
      for (let th = sinceOf(it), last = 0; th <= maxLevel(hallIt); th++) {
        const m = maxAt(it, th);
        if (m !== last) caps.push([th, m]);
        last = m;
      }
      // l'HDV du joueur : la dernière étape atteinte
      const mineStep = myHall ? caps.filter(([th]) => th <= myHall).pop() : null;
      capsHtml = `<p class="wiki-counts"><span class="ig-label">Niveau max par ${V.short} :</span> ${caps.map(([th, m]) => `<span class="fact${mineStep && mineStep[0] === th ? ' is-mine' : ''}"><b>${m}</b> à ${V.the} ${th}</span>`).join('')}</p>`;
    }
    const counts = countsOf(it);
    const countsHtml = counts.length > 1 || (counts.length === 1 && counts[0][1] > 1)
      ? `<p class="wiki-counts"><span class="ig-label">Nombre disponible :</span> ${counts.map(([L, n]) => `<span class="fact"><b>${n}</b> dès ${hall(it.village, L)}</span>`).join('')}</p>`
      : '';

    $('#wiki-item').innerHTML = `
      <p class="wiki-crumb"><a class="link" href="#wiki" data-back>← Retour au wiki</a></p>
      <div class="card wiki-head">
        ${pic(it, top.lvl, 'wiki-hero')}
        <div class="wiki-title">
          <h2>${ui.esc(it.name)}${it.cat === 'equip' ? rarity(it, 'rarity rarity-lg') : ''}</h2>
          ${it.en && norm(it.en) !== norm(it.name) ? `<p class="muted wiki-en">${ui.esc(it.en)}</p>` : ''}
          ${S && S.d ? S.d.split('\n').map((p) => `<p class="wiki-desc">${ui.esc(p)}</p>`).join('') : ''}
          <div class="wiki-facts">${facts.join('')}</div>
          ${countsHtml}${capsHtml}
        </div>
      </div>
      ${note ? `<p class="banner info">${ui.esc(note)}</p>` : ''}
      ${specsHtml}
      ${gearHtml}
      ${bar}
      ${S ? `<div data-panel="stats"${view === 'stats' ? '' : ' hidden'}><div class="wiki-table-wrap">${statsHtml}</div>${weaponsHtml}</div>` : ''}
      <div class="wiki-table-wrap" data-panel="cost"${view === 'cost' ? '' : ' hidden'}>
        <table class="wiki-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
          ${foot ? `<tfoot>${foot}</tfoot>` : ''}
        </table>
      </div>
      ${S ? `<p class="muted wiki-source">Statistiques : <a class="link" href="https://github.com/chiefpansancolt/clash-of-clans-data" rel="noopener">clash-of-clans-data</a>, données du jeu mises en forme par la communauté, complétées par <a class="link" href="https://github.com/ClashKingInc/clashy.py" rel="noopener">clashy.py</a> et les <a class="link" href="https://supercell.com/en/games/clashofclans/blog/release-notes/the-clash-of-titans-update-is-rolling-out/" rel="noopener">notes de mise à jour</a> de l'HDV 19.</p>` : ''}`;
    const slot = $('#wiki-item .wiki-gp-slot');
    if (slot && gpBox) {
      gpMenu.set(ui.gpOptions(), ui.goldPass(it.village));
      gpBox.hidden = false;
      slot.appendChild(gpBox);
    }
  }

  // ---------- Mise en place ----------
  function setup() {
    ready = true;
    buildIndex();
    const tops = { home: maxLevel(index.find((it) => it.village === 'home' && it.cat === 'hall')) };
    const bbHall = index.find((it) => it.village === 'bb' && it.cat === 'hall');
    for (const b of document.querySelectorAll('#wiki-village [data-village]')) {
      const key = b.dataset.village;
      if (key === 'bb' && !bbHall) { b.hidden = true; continue; }
      b.querySelector('img').src = ui.imgSrc(HALL[key], key === 'bb' ? maxLevel(bbHall) : tops.home) || '';
    }
    thMenu = ui.makeMenu('wiki-th', (v) => { state.th = Number(v); syncToolbar(); renderList(); });
    // Pass d'or choisi sur une fiche : le même réglage que dans Mon village (retenu, et repris par les deux onglets)
    gpBox = $('#wiki-gp');
    gpMenu = ui.makeMenu('wiki-gp', (v) => {
      const it = index.find((x) => x.id === current);
      if (!it) return;
      ui.setGoldPass(it.village, v);
      renderItem(it);
      gpBox.querySelector('.dd-btn').focus({ preventScroll: true });   // la fiche est redessinée : on garde le focus sur le menu
    });

    $('#wiki-village').addEventListener('click', (e) => {
      const b = e.target.closest('[data-village]');
      if (!b || b.dataset.village === state.village) return;
      state.village = b.dataset.village;
      state.cat = 'all';
      state.hero = '';
      syncToolbar();
      renderList();
      ui.refreshHeader();                                 // thème bleu nuit pour la base des ouvriers
    });
    $('#wiki-q').addEventListener('input', (e) => { state.q = norm(e.target.value.trim()); renderList(); });
    $('#wiki-chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (b && b.dataset.cat !== state.cat) { state.cat = b.dataset.cat; state.hero = ''; renderList(); }
    });
    $('#wiki-heroes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hero]');
      if (b) { state.hero = b.dataset.hero; renderList(); }
    });
    $('#wiki-results').addEventListener('click', (e) => {
      if (e.target.closest('[data-clear]')) {
        state.q = ''; state.th = 0; state.cat = 'all'; state.hero = '';
        $('#wiki-q').value = '';
        syncToolbar();
        renderList();
      } else if (e.target.closest('a[href^="#wiki/"]')) listScroll = window.scrollY;   // carte ou nom d'un héros
    });
    // fiche : bascule entre le tableau des statistiques et celui des améliorations
    $('#wiki-item').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      state.view = b.dataset.view;
      try { localStorage.setItem(VIEW_KEY, state.view); } catch (err) { /* stockage indisponible */ }
      for (const x of document.querySelectorAll('#wiki-item [data-view]')) x.setAttribute('aria-pressed', String(x === b));
      for (const p of document.querySelectorAll('#wiki-item [data-panel]')) p.hidden = p.dataset.panel !== state.view;
    });
  }

  // route : '' = liste, sinon identifiant de l'élément à afficher
  function show(route) {
    ui = window.COC_UI;
    D = ui.D;
    if (!ready) setup();
    const it = route ? index.find((x) => x.id === route) : null;
    current = it ? it.id : '';
    if (route && !it) {
      $('#wiki-item').innerHTML = '<p class="wiki-crumb"><a class="link" href="#wiki">← Retour au wiki</a></p><p class="empty">Cet élément n\'existe pas dans les données du site.</p>';
    } else if (it) {
      state.village = it.village;
      renderItem(it);
    }
    // statistiques pas encore chargées : la fiche est réaffichée dès leur arrivée
    if (!window.COC_STATS) {
      loadStats().then((ok) => {
        if (!ok) return;
        // la recherche trouve aussi les super troupes : « super chevaucheur » mène au chevaucheur de cochon
        for (const x of index) {
          const sup = window.COC_STATS.items[x.id] && window.COC_STATS.items[x.id].sup;
          if (sup) x.key += ` ${norm(`${sup.n || ''} ${sup.en || ''}`)}`;
        }
        if (it && current === it.id) renderItem(it);
        else if (!it && state.q) renderList();
      });
    }
    $('#wiki-list').hidden = !!route;
    $('#wiki-item').hidden = !route;
    if (route) { window.scrollTo(0, 0); return; }
    syncToolbar();
    renderList();
    const y = listScroll;
    listScroll = 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  // l'élément a-t-il une fiche ? (liens depuis le détail de l'onglet Mon village)
  function has(id) {
    if (!index) { ui = window.COC_UI; D = ui.D; buildIndex(); }
    return index.some((x) => x.id === String(id));
  }

  window.COC_WIKI = { show, has, village: () => state.village };
})();
