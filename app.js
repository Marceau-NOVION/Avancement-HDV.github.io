'use strict';

(function () {
  const D = window.COC_DATA;
  const $ = (sel) => document.querySelector(sel);

  const ID = {
    TH: 1000001, LAB: 1000007, HH: 1000071, BS: 1000070, PH: 1000068,
    HUT: 1000015, BOB: 1000064, WALL: 1000010, APP: 93000000, LAB_ASSIST: 93000001, PROSPECTOR: 93000003,
  };
  // prix en gemmes de la 1re à la 5e cabane d'ouvrier (absent de la table de jeu : il dépend du numéro de la cabane)
  const HUT_GEMS = [0, 250, 500, 1000, 2000];
  const STORE_KEY = 'avancement-hdv:village';
  const LAB_KEY = 'avancement-hdv:labo-compte';
  const PETS_KEY = 'avancement-hdv:familiers-comptes';
  // interrupteurs « compter / ne pas compter » une catégorie entière
  const SWITCHES = [
    { sel: '#opt-labon', key: 'labOn', store: LAB_KEY, on: 'Compté', off: 'Non compté' },
    { sel: '#opt-petson', key: 'petsOn', store: PETS_KEY, on: 'Comptés', off: 'Non comptés' },
  ];
  const IGN_KEY = 'avancement-hdv:ignores';
  const HIDEMAX_KEY = 'avancement-hdv:masquer-max';
  // Icônes officielles du jeu (img/, extraites par ClashKingAssets) : [fichier, nom lu par les lecteurs d'écran]
  const ICONS = {
    G: ['gold', 'or'], E: ['elixir', 'élixir'], D: ['dark_elixir', 'élixir noir'],
    O1: ['shiny_ore', 'minerai brillant'], O2: ['glowy_ore', 'minerai luisant'], O3: ['starry_ore', 'minerai étoilé'],
    BG: ['builder_gold', 'or ouvrier'], BE: ['builder_elixir', 'élixir ouvrier'], GEM: ['gems', 'gemmes'],
  };
  // alt = null : icône décorative (le nom est déjà écrit à côté)
  const icon = (k, cls = 'ic', alt = ICONS[k][1]) => {
    const name = ICONS[k][1];
    return `<img class="${cls}" src="img/${ICONS[k][0]}.webp" alt="${alt == null ? '' : esc(alt)}" title="${esc(name[0].toUpperCase() + name.slice(1))}">`;
  };
  // remparts : deux ressources au choix (or ou élixir ; or ouvrier ou élixir ouvrier dans la MDO)
  const wallRes = () => { const w = V.t.buildings[V.wall]; return [w.r || 'G', w.ar || 'E']; };
  const wallIcons = (cls = 'ic') => {
    const [a, b] = wallRes();
    const txt = `${ICONS[a][1]} ou ${ICONS[b][1]}`;
    return `<span class="ic-pair" title="${esc(txt[0].toUpperCase() + txt.slice(1))}">${icon(a, cls, txt)}${icon(b, cls, null)}</span>`;
  };

  // Images du jeu (data/coc-images.js) : id -> [dossier dans img/, niveaux] (bâtiments, pièges)
  // ou [fichier dans img/] (héros, troupes, sorts, familiers, équipements)
  const IMG = window.COC_IMAGES || {};
  // chemin de l'image d'un élément ; lvl : niveau à montrer pour les images par niveau (null si aucune image)
  function imgSrc(id, lvl) {
    const im = IMG[id];
    if (!im) return null;
    if (!im[1]) return `img/${im[0]}`;
    // dernière image disponible jusqu'à ce niveau (au moins le niveau 1)
    const lv = im[1].filter((l) => l <= Math.max(1, lvl || 0));
    return `img/${im[0]}/level_${lv.length ? lv[lv.length - 1] : im[1][0]}.webp`;
  }
  // title : infobulle au survol (images par niveau seulement)
  function thumb(id, lvl, title) {
    const src = imgSrc(id, lvl);
    if (!src) return '<span class="thumb" aria-hidden="true"></span>';   // garde l'alignement des noms
    return `<img class="thumb" src="${src}" alt="" loading="lazy"${title && IMG[id][1] ? ` title="${esc(title)}"` : ''}>`;
  }
  const CATS = [
    { key: 'bld', label: 'Bâtiments', missing: 'à construire' },
    { key: 'walls', label: 'Remparts', missing: 'à construire' },
    { key: 'traps', label: 'Pièges', missing: 'à construire' },
    { key: 'heroes', label: 'Héros', missing: 'à débloquer' },
    { key: 'lab', label: 'Laboratoire', missing: 'à débloquer' },
    { key: 'pets', label: 'Familiers', missing: 'à débloquer' },
  ];
  const LAB_SUB = [['troop', 'Troupes'], ['spell', 'Sorts'], ['siege', 'Engins de siège']];

  let village = null;
  let opts = null;
  let tick = null;
  let ignored = new Set();          // identifiants exclus du calcul (persistés)
  let hideMax = true;               // masquer les lignes déjà au max dans le détail (persisté)
  const openState = {};             // sections du détail ouvertes/fermées par l'utilisateur

  // ---------- Les deux villages ----------
  // Tout ce qui change entre le village principal et la base des ouvriers (MDO). V = village affiché.
  const BB = { HALL: 1000034, STAR_LAB: 1000046, WALL: 1000033, OTTO: 1000078, MINE: 12000013, MACHINE: 28000003 };
  const VILLAGES = {
    home: {
      key: 'home', t: D, hallUnlocks: D.th, hall: ID.TH, lab: ID.LAB, wall: ID.WALL, hut: ID.HUT,
      sec: { buildings: 'buildings', traps: 'traps', heroes: 'heroes', lab: ['units', 'siege_machines', 'spells'] },
      short: 'HDV', the: 'l\'HDV', this: 'cet HDV', hallName: 'hôtel de ville', your: 'Ton hôtel de ville',
      labName: 'Laboratoire', labShort: 'labo', buildersNote: 'cabanes + B.O.B', maxBuilders: 7,
      tagline: 'Où en est ton village, et combien de temps avant de maxer ton hôtel de ville\u00a0?',
      res: [['G', 'Or'], ['E', 'Élixir'], ['D', 'Élixir noir']],
      catPic: { bld: ID.HUT, walls: ID.WALL, traps: 12000000, heroes: 28000000, lab: ID.LAB, pets: ID.PH, equip: ID.BS },
      builders: (v) => {
        let huts = 0;
        for (const it of v.buildings) if (it.data === ID.HUT) huts += it.cnt || 1;
        return Math.max(1, huts + (v.buildings.some((it) => it.data === ID.BOB) ? 1 : 0));
      },
    },
    bb: {
      key: 'bb', t: D.bb, hallUnlocks: (D.bb && D.bb.hall) || {}, hall: BB.HALL, lab: BB.STAR_LAB, wall: BB.WALL, hut: BB.OTTO,
      sec: { buildings: 'buildings2', traps: 'traps2', heroes: 'heroes2', lab: ['units2'] },
      short: 'MDO', the: 'la MDO', this: 'cette MDO', hallName: 'maison des ouvriers', your: 'Ta maison des ouvriers',
      labName: 'Labo stellaire', labShort: 'labo stellaire', buildersNote: 'maître ouvrier + O.T.T.O', maxBuilders: 3,
      tagline: 'Où en est ta base des ouvriers, et combien de temps avant de maxer ta maison des ouvriers\u00a0?',
      res: [['BG', 'Or ouvrier'], ['BE', 'Élixir ouvrier']],
      catPic: { bld: BB.OTTO, walls: BB.WALL, traps: BB.MINE, heroes: BB.MACHINE, lab: BB.STAR_LAB },
      // le maître ouvrier, plus O.T.T.O une fois son avant-poste construit
      builders: (v) => ((v.buildings2 || []).some((it) => it.data === BB.OTTO) ? 2 : 1),
    },
  };
  for (const x of Object.values(VILLAGES)) if (x.t) x.maxHall = Math.max(...x.t.buildings[x.hall].lv.map((r) => r[0]));
  let V = VILLAGES.home;
  let optsBy = {};                  // hypothèses de chaque village ; opts = celles du village affiché
  const MODE_KEY = 'avancement-hdv:village-affiche';
  const hasBB = (v) => !!(D.bb && v && Array.isArray(v.buildings2) && v.buildings2.some((b) => b.data === BB.HALL));
  const cap = (txt) => txt[0].toUpperCase() + txt.slice(1);

  // ---------- Formatage ----------
  const nf = new Intl.NumberFormat('fr-FR');
  const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const dtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dtLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dtFull = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function big(n) {
    if (n >= 1e9) return nf2.format(n / 1e9) + ' Md';
    if (n >= 1e6) return nf1.format(n / 1e6) + ' M';
    if (n >= 1e4) return nf.format(Math.round(n / 1e3)) + ' k';
    return nf.format(Math.round(n));
  }
  function dur(sec) {
    sec = Math.max(0, Math.round(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d >= 1) return h ? `${d} j ${h} h` : `${d} j`;
    if (h >= 1) return `${h} h ${String(m).padStart(2, '0')}`;
    return `${m} min`;
  }
  function durLong(sec) {
    const days = sec / 86400;
    if (days < 2) return dur(sec);
    if (days < 60) return `${Math.round(days)} j`;
    return `${nf1.format(days / 30.44)} mois`;
  }
  function ago(ms) {
    const s = ms / 1000;
    if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return `il y a ${Math.round(s / 86400)} j`;
  }
  function fmtPct(p) {
    if (p >= 99.995) return '100 %';
    if (p >= 99) return nf1.format(Math.floor(p * 10) / 10) + ' %';
    return Math.floor(p) + ' %';
  }
  const ratio = (done, left) => (done + left > 0 ? (done / (done + left)) * 100 : 100);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // label : nom lu par les lecteurs d'écran. Sans label, la barre est décorative (la valeur est écrite à côté).
  const bar = (p, ok, label) => {
    const a11y = label
      ? `role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(p)}"`
      : 'aria-hidden="true"';
    return `<div class="bar${ok ? ' ok' : ''}" ${a11y}><span style="width:${Math.min(100, Math.max(0, p)).toFixed(2)}%"></span></div>`;
  };

  // ---------- Données de jeu ----------
  // Lignes de niveaux : [niveau, coût pour l'atteindre, durée pour l'atteindre, HDV requis, prérequis bâtiment]
  function rows(e) {
    if (!e._m) { e._m = {}; for (const r of e.lv) e._m[r[0]] = r; }
    return e._m;
  }
  function maxLv(e, th, req) {
    let m = 0;
    for (const r of e.lv) if (r[3] <= th && (req == null || (r[4] || 0) <= req) && r[0] > m) m = r[0];
    return m;
  }
  // niveau max d'un bâtiment du village affiché à l'HDV (ou à la MDO) th
  const bMax = (id, th) => (V.t.buildings[id] ? maxLv(V.t.buildings[id], th) : 0);
  const caps = (T) => ({ lab: bMax(V.lab, T), hh: bMax(ID.HH, T), ph: bMax(ID.PH, T), bs: bMax(ID.BS, T) });

  // Nombre de chaque bâtiment/piège attendu à l'HDV (ou la MDO) T : déblocages cumulés, moins les fusions
  function expectedCounts(T) {
    const c = {}, U = V.hallUnlocks;
    for (let L = 1; L <= T; L++) for (const [id, q] of (U[L] && U[L].u) || []) c[id] = (c[id] || 0) + q;
    for (const [id, n] of Object.entries({ ...c })) {
      const e = V.t.buildings[id] || V.t.traps[id];
      if (e && e.mg) for (const src of e.mg) c[src] = (c[src] || 0) - n;
    }
    for (let L = 1; L <= T; L++) for (const src of (U[L] && U[L].mg) || []) c[src] = (c[src] || 0) - 1;
    return c;
  }

  // Travail restant entre le niveau actuel et le max, et travail déjà fait depuis le max de l'HDV précédent.
  // metric = 'time' (durée) ou 'cost' (remparts, qui n'ont pas de durée).
  function chain(e, cur, max, base, rem, metric) {
    const m = rows(e);
    const val = (r) => (r ? (metric === 'cost' ? r[1] : r[2]) : 0);
    let time = 0, cost = 0, done = 0, left = 0, steps = 0, k = cur + 1;
    if (rem != null && cur < max) {
      const r = m[cur + 1];
      time += rem;
      steps++;
      if (metric === 'cost') { if (cur + 1 > base) done += val(r); }
      else { left += rem; if (cur + 1 > base) done += Math.max(0, val(r) - rem); }
      k = cur + 2;
    }
    for (; k <= max; k++) {
      const r = m[k];
      if (r) { time += r[2]; cost += r[1]; left += val(r); if (r[2] > 0) steps++; }
    }
    for (let j = Math.max(0, base) + 1; j <= Math.min(cur, max); j++) done += val(m[j]);
    return { time, cost, done, left, steps };
  }

  // ---------- Analyse du village ----------
  function analyze(v, now, o) {
    const ts = v.timestamp * 1000;
    const st = (it) => {
      let lvl = it.lvl || 0, rem = null, end = null;
      if (it.timer != null) {
        end = ts + it.timer * 1000;
        if (now >= end) lvl += 1; else rem = (end - now) / 1000;
      }
      return { lvl, rem, end };
    };
    const NEW = { lvl: 0, rem: null, end: null, missing: true };
    const unknown = new Set();
    const recs = [];
    const push = (cat, id, e, s, max, base, metric, extra) => recs.push({
      cat, id, e, name: e.n, lvl: s.lvl, rem: s.rem, end: s.end, missing: !!s.missing, max,
      ...chain(e, s.lvl, max, base, s.rem, metric), ...extra,
    });

    const B = V.t, home = V.key === 'home';
    const hallIt = (v[V.sec.buildings] || []).find((b) => b.data === V.hall) || { lvl: 1 };
    const th = st(hallIt);
    const curTH = th.lvl;
    const T = Math.min(V.maxHall, Math.max(curTH, (o && o.target) || curTH));
    const C = caps(T), C0 = caps(T - 1);

    // Hôtel de ville (ou maison des ouvriers) et son arme
    push('bld', V.hall, B.buildings[V.hall], th, T, T - 1, 'time');
    const w = V.hallUnlocks[T] && V.hallUnlocks[T].w;
    if (w) {
      const wl = curTH === T ? (hallIt.weapon || 1) : 1;
      push('bld', 'weapon', w, { lvl: wl, rem: null, end: null }, Math.max(...w.lv.map((r) => r[0])), 1, 'time');
    }

    // Bâtiments, remparts, pièges
    const exp = expectedCounts(T);
    const structs = (list, table, isTrap) => {
      const have = new Map();
      for (const it of list || []) {
        if (it.lvl == null) continue;
        const key = String(it.data);
        const e = table[key];
        if (!e) { unknown.add(it.data); continue; }
        if (!e.lv.length || it.data === V.hall) continue;
        if (!have.has(key)) have.set(key, []);
        const s = st(it);
        for (let i = 0; i < (it.cnt || 1); i++) have.get(key).push(s);
      }
      for (const [key, n] of Object.entries(exp)) {
        if (n > 0 && table[key] && table[key].lv.length && +key !== V.hall && !have.has(key)) have.set(key, []);
      }
      for (const [key, arr] of have) {
        const e = table[key];
        const n = exp[key] != null ? Math.max(0, exp[key]) : arr.length;
        // au-delà du nombre attendu (bâtiments destinés à une fusion), on garde les plus hauts niveaux
        const list2 = arr.slice().sort((a, b) => b.lvl - a.lvl).slice(0, n);
        while (list2.length < n) list2.push(NEW);
        const max = maxLv(e, T), base = maxLv(e, T - 1);
        const cat = isTrap ? 'traps' : (+key === V.wall ? 'walls' : 'bld');
        for (const s of list2) push(cat, +key, e, s, max, base, cat === 'walls' ? 'cost' : 'time');
      }
    };
    structs(v[V.sec.buildings], B.buildings, false);
    structs(v[V.sec.traps], B.traps, true);

    // Héros, gardiens, familiers, laboratoire
    const units = (list, table, cat, maxFn, baseFn, unlockedFn, extraFn) => {
      const have = new Set();
      for (const it of list || []) {
        const e = table[it.data];
        if (!e) { unknown.add(it.data); continue; }
        have.add(String(it.data));
        push(cat, it.data, e, st(it), maxFn(e), baseFn(e), 'time', extraFn && extraFn(e));
      }
      for (const [key, e] of Object.entries(table)) {
        if (have.has(key) || !unlockedFn(e)) continue;
        const max = maxFn(e);
        if (max > 0) push(cat, +key, e, NEW, max, baseFn(e), 'time', extraFn && extraFn(e));
      }
    };
    if (home) {
      units(v.heroes, D.heroes, 'heroes', (e) => maxLv(e, T, C.hh), (e) => maxLv(e, T - 1, C0.hh), () => true);
      units(v.guardians, D.guardians, 'heroes', (e) => maxLv(e, T), (e) => maxLv(e, T - 1), () => true);
      units(v.pets, D.pets, 'pets', (e) => maxLv(e, T, C.ph), (e) => (e.pbl > C0.ph ? 0 : maxLv(e, T - 1, C0.ph)), (e) => e.pbl <= C.ph);
    } else {
      // MDO : les héros ne dépendent que du niveau de la maison des ouvriers
      units(v.heroes2, B.heroes, 'heroes', (e) => maxLv(e, T), (e) => maxLv(e, T - 1), () => true);
    }
    // laboratoire (labo stellaire dans la MDO) : niveau max selon le labo et la caserne qui débloque la troupe
    const labUnlocked = (e, t) => !!e.pb && e.pbl > 0 && e.pbl <= bMax(e.pb, t);
    units(V.sec.lab.flatMap((sec) => v[sec] || []), B.lab, 'lab',
      (e) => maxLv(e, T, C.lab),
      (e) => (labUnlocked(e, T - 1) ? maxLv(e, T - 1, C0.lab) : 0),
      (e) => labUnlocked(e, T),
      (e) => ({ sub: e.c }));

    // Équipement (limité par les minerais, pas par le temps)
    const eqMax = (e, t, bs) => { let x = 0; for (const r of e.lv) if (r[4] <= t && r[5] <= bs && r[0] > x) x = r[0]; return x; };
    const eq = [];
    for (const it of (home && v.equipment) || []) {
      const e = D.equipment[it.data];
      if (!e) { unknown.add(it.data); continue; }
      const m = rows(e), lvl = it.lvl || 1;
      // les plafonds d'équipement ne bougent pas à chaque HDV : on mesure l'avancement depuis le niveau 1
      const max = eqMax(e, T, C.bs), base = 1;
      const ore = [0, 0, 0];
      for (let k = lvl + 1; k <= max; k++) if (m[k]) { ore[0] += m[k][1]; ore[1] += m[k][2]; ore[2] += m[k][3]; }
      eq.push({ id: it.data, e, name: e.n, hero: e.h, rar: e.rar, lvl, max, ore,
        done: Math.max(0, Math.min(lvl, max) - base), left: Math.max(0, max - lvl) });
    }

    // Assistants (village principal), y compris ceux pas encore débloqués mais disponibles à l'HDV cible
    const helpers = [];
    if (home) {
      const have = new Map((v.helpers || []).map((it) => [it.data, it]));
      for (const [key, e] of Object.entries(D.helpers)) {
        const id = +key, it = have.get(id);
        const lvl = (it && it.lvl) || 0;                   // 0 : pas encore débloqué
        const avail = e.lv.filter((r) => r[1] <= T);
        if (!lvl && !avail.length) continue;               // pas encore disponible à l'HDV cible
        // l'Orpailleur s'obtient avec le Pass d'or (refonte de 2026) : ni déblocage ni amélioration en gemmes
        const gold = id === ID.PROSPECTOR;
        const max = gold ? lvl : Math.max(lvl, ...avail.map((r) => r[0]));
        // gemmes jusqu'au max de l'HDV cible (r[3] = coût pour atteindre le niveau r[0] ; le niveau 1 = déblocage)
        const gems = gold ? 0 : e.lv.filter((r) => r[0] > lvl && r[0] <= max).reduce((s, r) => s + (r[3] || 0), 0);
        const unlock = !lvl && !gold && e.lv[0] ? e.lv[0][3] : 0;
        // niveau suivant, bloqué par l'HDV : affiché pour expliquer le plafond
        const nx = gold ? null : e.lv.find((r) => r[0] === max + 1);
        const row = lvl ? e.lv[lvl - 1] : null;
        helpers.push({ id, name: e.n, lvl, max, mult: row ? row[2] : 0, gems, unlock, gold, locked: !lvl,
          next: nx ? { lvl: nx[0], th: nx[1] } : null });
      }
    }

    const builders = V.builders(v);
    // cabanes d'ouvrier pas encore achetées (village principal) : elles se paient en gemmes
    let huts = 0;
    if (home) for (const it of v.buildings) if (it.data === ID.HUT) huts += it.cnt || 1;
    const hutGems = home ? HUT_GEMS.slice(huts).reduce((s, g) => s + g, 0) : 0;

    // Chantiers en cours (regroupés quand ils finissent ensemble)
    const prog = new Map();
    const SECS = [[V.sec.buildings, B.buildings], [V.sec.traps, B.traps], [V.sec.heroes, B.heroes],
      ...(home ? [['guardians', D.guardians], ['pets', D.pets]] : []), ...V.sec.lab.map((sec) => [sec, B.lab])];
    for (const [sec, table] of SECS) {
      for (const it of v[sec] || []) {
        if (it.timer == null) continue;
        const e = table[it.data];
        const end = ts + it.timer * 1000;
        const key = `${it.data}:${it.lvl}:${Math.round(end / 600000)}`;
        const g = prog.get(key) || { id: it.data, name: e ? e.n : `#${it.data}`, from: it.lvl, end, n: 0, lab: V.sec.lab.includes(sec) };
        g.n++;
        prog.set(key, g);
      }
    }
    const inprog = [...prog.values()].sort((a, b) => a.end - b.end);

    return { ts, now, curTH, th, T, recs, eq, helpers, builders, hutGems, inprog, unknown: [...unknown] };
  }

  // ---------- Estimation du temps ----------
  function estimate(A, o) {
    const B = Math.max(1, Math.round(o.builders) || 1);
    const gp = (o.gp || 0) / 100;
    // chaque bâtiment/héros est une chaîne séquentielle ; on les répartit sur les ouvriers (plus longues d'abord)
    const counted = A.recs.filter((r) => !r.ignored);
    const chains = counted.filter((r) => (r.cat === 'bld' || r.cat === 'traps' || r.cat === 'heroes') && r.time > 0)
      .sort((a, b) => b.time - a.time);
    const loads = new Array(B).fill(0);
    for (const c of chains) {
      let i = 0;
      for (let j = 1; j < B; j++) if (loads[j] < loads[i]) i = j;
      loads[i] += c.time;
    }
    const makespan = Math.max(0, ...loads);
    const work = chains.reduce((s, c) => s + c.time, 0);
    const bSpeed = (1 + (o.app || 0) / (24 * B)) / (1 - gp);
    const builders = makespan / bSpeed;
    const labItems = counted.filter((r) => r.cat === 'lab' && r.time > 0);
    const lab = labItems.reduce((s, r) => s + r.time, 0) * (1 - gp) / (1 + (o.lab || 0) / 24);
    const petItems = counted.filter((r) => r.cat === 'pets' && r.time > 0);
    const pets = petItems.reduce((s, r) => s + r.time, 0);
    const labOn = o.labOn !== false, petsOn = o.petsOn !== false;
    const total = Math.max(builders, labOn ? lab : 0, petsOn ? pets : 0);
    const which = total <= 0 ? null : total === builders ? 'builders' : labOn && total === lab ? 'lab' : 'pets';
    const longest = chains[0];
    const steps = (list) => list.reduce((s, r) => s + r.steps, 0);
    return {
      B, builders, lab, pets, total, which, labOn, petsOn, work, nChains: steps(chains), nLab: steps(labItems), nPets: steps(petItems),
      longest: longest ? { name: longest.name, raw: longest.time, t: longest.time / bSpeed, bound: makespan === longest.time && B > 1 } : null,
      hasPets: counted.some((r) => r.cat === 'pets'),
    };
  }

  // ---------- Éléments ignorés ----------
  function readIgnored() {
    try {
      const v = JSON.parse(localStorage.getItem(IGN_KEY) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch (e) { return []; }
  }
  function saveIgnored() {
    try { localStorage.setItem(IGN_KEY, JSON.stringify([...ignored])); } catch (e) { /* stockage indisponible */ }
  }
  function nameOf(id) {
    if (id === 'weapon') return 'Arme de l\'HDV';
    const bb = D.bb ? [D.bb.buildings, D.bb.traps, D.bb.heroes, D.bb.lab] : [];
    for (const t of [D.buildings, D.traps, D.heroes, D.guardians, D.pets, D.lab, D.equipment, ...bb]) if (t[id]) return t[id].n;
    return `#${id}`;
  }
  function markIgnored(A) {
    const present = new Set();
    for (const x of [...A.recs, ...A.eq]) {
      x.ignored = ignored.has(String(x.id));
      if (x.ignored) present.add(String(x.id));
    }
    A.nIgnored = present.size;
  }

  // ---------- Rendu ----------
  const which = (k) => (k === 'lab' ? V.labName : { builders: 'Ouvriers', pets: 'Familiers' }[k]);
  const catLabel = (c) => (c.key === 'lab' ? V.labName : c.label);

  // list = tous les éléments de la catégorie ; les stats ne comptent que ceux qui ne sont pas ignorés
  function catStats(A, key) {
    const list = A.recs.filter((r) => r.cat === key);
    let done = 0, left = 0, nMax = 0, n = 0;
    for (const r of list) {
      if (r.ignored) continue;
      n++; done += r.done; left += r.left;
      if (r.lvl >= r.max) nMax++;
    }
    return { list, all: list.length, n, nMax, done, left, p: ratio(done, left) };
  }
  function eqStats(A) {
    let done = 0, left = 0, nMax = 0, n = 0;
    for (const q of A.eq) {
      if (q.ignored) continue;
      n++; done += q.done; left += q.left;
      if (q.lvl >= q.max) nMax++;
    }
    return { n, nMax, p: ratio(done, left) };
  }

  // catégories exclues par les interrupteurs « Laboratoire » et « Familiers »
  const isOff = (cat) => (cat === 'lab' && !opts.labOn) || (cat === 'pets' && !opts.petsOn);
  const offWord = (cat) => (cat === 'pets' ? 'non comptés' : 'non compté');
  const joinFr = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l.join(''));
  function offNames(A) {
    const l = [];
    if (!opts.labOn) l.push(V.labShort);
    if (!opts.petsOn && A.recs.some((r) => r.cat === 'pets')) l.push('familiers');
    return l;
  }

  function renderSummary(A, E) {
    let done = 0, left = 0, n = 0, nMax = 0;
    for (const r of A.recs) {
      if (r.ignored || r.cat === 'walls' || isOff(r.cat)) continue;
      done += r.done; left += r.left; n++;
      if (r.lvl >= r.max) nMax++;
    }
    const p = ratio(done, left);
    const thSub = A.th.rem != null
      ? `→ ${A.curTH + 1} en cours · fin ${esc(dtShort.format(A.th.end))}`
      : (A.T > A.curTH ? `objectif : ${V.short} ${A.T}` : 'aucune amélioration en cours');
    const off = offNames(A);
    const offLbl = off.length ? ` · hors ${joinFr(off)}` : '';
    const rest = Math.max(E.labOn ? 0 : E.lab, E.petsOn ? 0 : E.pets);
    const finish = E.total > 0
      ? `<div class="sub">vers le ${esc(dtLong.format(A.now + E.total * 1000))}</div><span class="bottleneck">Goulot : ${which(E.which)}</span>`
      : (rest > 0
        ? `<div class="sub">Sans compter ${off.map((x) => (x === V.labShort ? `le ${V.labShort}` : 'les familiers')).join(' et ')}, où il reste ≈ ${durLong(rest)}.</div>`
        : `<div class="sub">Tout est au max pour ${V.this}.</div>`);

    // ce que l'anneau ne compte pas, écrit en clair (l'équipement dépend des minerais, pas du temps)
    const outside = ['remparts', ...(A.eq.length ? ['équipement'] : []), ...off];

    // image de l'hôtel de ville (ou de la maison des ouvriers) à un niveau donné (décorative : le niveau est écrit)
    const thPic = (lvl) => {
      const src = imgSrc(V.hall, lvl);
      return src ? `<img class="th-pic" src="${src}" alt="" title="${cap(V.hallName)} niveau ${lvl}">` : '';
    };

    // ordre : la réponse principale d'abord (elle passe aussi en premier sur téléphone)
    $('#summary').innerHTML = `
      <div class="stat stat-main has-pic">
        <div class="stat-text">
          <div class="label">Temps pour maxer ${V.the} ${A.T}${offLbl}</div>
          <div class="value">${E.total > 0 ? '≈ ' + durLong(E.total) : 'Terminé'}</div>
          ${finish}
        </div>
        ${thPic(A.T)}
      </div>
      <div class="stat">
        <div class="label">Avancement ${V.short} ${A.T}${offLbl}</div>
        <div class="hero">
          <div class="ring" style="--p:${Math.floor(p * 10) / 10}"><span>${fmtPct(p)}</span></div>
          <div class="sub"><span class="ring-cap">du temps d'amélioration fait</span><br>${nMax} / ${n} éléments au max<br>hors ${joinFr(outside)}${A.nIgnored ? `<br>${A.nIgnored} ignoré${A.nIgnored > 1 ? 's' : ''}` : ''}</div>
        </div>
      </div>
      <div class="stat has-pic">
        <div class="stat-text">
          <div class="label">Village ${esc(village.tag || '')}</div>
          <div class="value">${V.short} ${A.curTH}</div>
          <div class="sub">${thSub}</div>
        </div>
        ${thPic(A.curTH)}
      </div>`;
  }

  function renderTiming(A, E) {
    const items = [['builders', E.builders], ['lab', E.lab]];
    if (E.hasPets) items.push(['pets', E.pets]);
    const top = Math.max(1, ...items.map((i) => i[1]));
    const rowsHtml = items.map(([k, t]) => {
      const off = isOff(k);
      return `
      <div class="time-row${k === E.which ? ' is-max' : ''}${off ? ' is-off' : ''}">
        <span class="name">${which(k)}${off ? `<small>${offWord(k)}</small>` : ''}</span>
        ${bar((t / top) * 100)}
        <span class="val">${t > 0 ? durLong(t) : '—'}</span>
      </div>`;
    }).join('');
    const notes = [];
    notes.push(`<li><strong>${E.nChains}</strong> améliorations, soit <strong>${durLong(E.work)}</strong> de travail cumulé répartis sur <strong>${E.B}</strong> ouvriers${opts.app ? ' + l\'apprenti' : ''}.</li>`);
    if (E.longest && E.longest.bound) {
      // même durée que dans le tableau du détail, puis la durée réelle avec les accélérations
      const boosts = [];
      if (opts.app) boosts.push('l\'apprenti');
      if (opts.gp) boosts.push('le pass d\'or');
      const len = boosts.length
        ? `${dur(E.longest.raw)} de chantier, soit ${durLong(E.longest.t)} avec ${joinFr(boosts)}`
        : dur(E.longest.raw);
      notes.push(`<li>La chaîne la plus longue (<strong>${esc(E.longest.name)}</strong>, ${len}) limite les ouvriers&nbsp;: impossible de la répartir.</li>`);
    }
    notes.push(E.labOn
      ? `<li><strong>${E.nLab}</strong> recherches au ${V.labShort}, faites une par une${opts.lab ? ' (avec l\'assistant)' : ''}.</li>`
      : `<li>${V.labName} exclu&nbsp;: <strong>${E.nLab}</strong> recherches restantes ne sont pas comptées dans le temps total.</li>`);
    if (E.hasPets) notes.push(E.petsOn
      ? `<li><strong>${E.nPets}</strong> améliorations de familiers, une par une.</li>`
      : `<li>Familiers exclus&nbsp;: <strong>${E.nPets}</strong> améliorations restantes ne sont pas comptées dans le temps total.</li>`);
    if (A.nIgnored) notes.push(`<li><strong>${A.nIgnored}</strong> élément${A.nIgnored > 1 ? 's ignorés ne sont pas comptés' : ' ignoré n\'est pas compté'}.</li>`);
    notes.push(V.key === 'bb'
      ? '<li>Sans compter le farm des ressources, la tour de l\'horloge ni l\'ordre imposé (ex. labo stellaire à améliorer avant certaines recherches).</li>'
      : '<li>Sans compter le farm des ressources, les potions, les livres ni l\'ordre imposé (ex. labo à améliorer avant certaines recherches).</li>');
    $('#timing').innerHTML = rowsHtml + `<ul class="time-notes">${notes.join('')}</ul>`;
  }

  function renderCats(A) {
    const out = [];
    // image représentative de chaque catégorie : le bâtiment qui s'en occupe (cabane d'ouvrier, labo,
    // animalerie, forge), un rempart, une bombe ou le Roi ; au niveau max de l'HDV cible
    const picFor = (key) => {
      const id = V.catPic[key], e = V.t.buildings[id] || V.t.traps[id];
      return thumb(id, e ? maxLv(e, A.T) : 0);
    };
    const row = (key, label, s, offLabel) => `
        <div class="cat-row${offLabel ? ' is-off' : ''}">
          <span class="name nm">${picFor(key)}<span>${label}<small>${offLabel ? offLabel + ' · ' : ''}${s.nMax} / ${s.n} au max</small></span></span>
          ${bar(s.p, s.p >= 99.995, label)}
          <span class="pct">${s.n ? fmtPct(s.p) : '—'}</span>
        </div>`;
    for (const c of CATS) {
      const s = catStats(A, c.key);
      if (!s.all) continue;
      out.push(row(c.key, catLabel(c), s, !s.n ? 'ignoré' : (isOff(c.key) ? offWord(c.key) : '')));
    }
    if (A.eq.length) {
      const s = eqStats(A);
      out.push(row('equip', 'Équipement', s, s.n ? '' : 'ignoré'));
    }
    $('#categories').innerHTML = out.join('');
  }

  function renderInprog(A) {
    $('#prog-sub').textContent = `Export du ${dtFull.format(A.ts)} (${ago(A.now - A.ts)})`;
    if (!A.inprog.length) {
      $('#inprogress').innerHTML = '<p class="empty">Aucune amélioration en cours dans cet export.</p>';
      return;
    }
    // les chantiers actifs d'abord ; ceux qui ont fini depuis l'export passent dans une liste compacte
    const active = A.inprog.filter((g) => A.now < g.end);
    const finished = A.inprog.filter((g) => A.now >= g.end);
    const times = (g) => (g.n > 1 ? ` <span class="muted">×${g.n}</span>` : '');
    // image du niveau en cours de construction (celui qu'on obtient à la fin du chantier)
    const pic = (g) => thumb(g.id, g.from + 1, `Niveau ${g.from + 1}`);
    let html = active.length
      ? `<div class="prog-list">${active.map((g) => `
        <div class="prog-item">
          ${pic(g)}
          <div class="prog-body">
            <div class="t">${esc(g.name)}${times(g)}</div>
            <div class="lv">niv. ${g.from} → ${g.from + 1}${g.lab ? ' · labo' : ''}</div>
            <div class="when"><span class="left">reste ${dur((g.end - A.now) / 1000)}</span><span class="muted">${esc(dtShort.format(g.end))}</span></div>
          </div>
        </div>`).join('')}</div>`
      : '<p class="empty">Plus rien en cours&nbsp;: tout ce qui était lancé dans l\'export est terminé.</p>';
    if (finished.length) {
      html += `<h3 class="done-title">Terminés depuis l'export</h3><ul class="done-list">${finished.map((g) => `
        <li>${pic(g)}<span><strong>${esc(g.name)}</strong>${times(g)} · niv. ${g.from} → ${g.from + 1} · <span class="when">${esc(dtShort.format(g.end))}</span></span></li>`).join('')}</ul>`;
    }
    $('#inprogress').innerHTML = html;
  }

  // Le Pass d'or réduit aussi les coûts (or, élixirs) du même pourcentage que les durées ; pas les minerais.
  const costFactor = () => 1 - (opts.gp || 0) / 100;

  function renderRes(A) {
    const res = {};
    const f = costFactor();
    let walls = 0;
    for (const r of A.recs) {
      if (r.ignored) continue;
      if (r.cat === 'walls') walls += r.cost * f;
      else res[r.e.r || 'G'] = (res[r.e.r || 'G'] || 0) + r.cost * f;
    }
    const note = $('#res-note');
    note.hidden = !opts.gp;
    note.textContent = opts.gp ? `Avec la réduction du Pass d'or (−${opts.gp} %)${A.eq.length ? ', sauf sur les minerais' : ''}.` : '';
    // exact : nombre entier (gemmes) au lieu de l'arrondi « 11 k »
    const card = (img, amt, lbl, exact) => `<div class="res">${img}<div><div class="amt">${exact ? nf.format(amt) : big(amt)}</div><div class="lbl">${lbl}</div></div></div>`;
    const [wa, wb] = wallRes();
    const cards = V.res.map(([k, lbl]) => card(icon(k, 'res-ic', null), res[k] || 0, lbl));
    cards.push(card(`<span class="res-pair" aria-hidden="true">${icon(wa, 'res-ic', null)}${icon(wb, 'res-ic', null)}</span>`, walls,
      `Remparts (${ICONS[wa][1]} ou ${ICONS[wb][1]})`));
    if (A.eq.length) {                 // minerais : équipements du village principal
      const ore = [0, 0, 0];
      for (const q of A.eq) if (!q.ignored) for (let i = 0; i < 3; i++) ore[i] += q.ore[i];
      cards.push(card(icon('O1', 'res-ic', null), ore[0], 'Minerai brillant'),
        card(icon('O2', 'res-ic', null), ore[1], 'Minerai luisant'),
        card(icon('O3', 'res-ic', null), ore[2], 'Minerai étoilé'));
    }
    // gemmes : cabanes d'ouvrier manquantes et assistants (pas de réduction du Pass d'or)
    const hutGems = A.recs.some((r) => r.id === ID.HUT && r.ignored) ? 0 : A.hutGems;
    const helperGems = A.helpers.reduce((s, h) => s + h.gems, 0);
    if (A.helpers.length || hutGems) {
      const what = [...(hutGems ? ['cabanes'] : []), ...(A.helpers.length ? ['assistants'] : [])];
      cards.push(card(icon('GEM', 'res-ic', null), hutGems + helperGems, `Gemmes (${joinFr(what)})`, true));
    }
    $('#resources').innerHTML = cards.join('');
  }

  function groupRecs(list) {
    const g = new Map();
    for (const r of list) {
      if (!g.has(r.id)) g.set(r.id, { id: r.id, ignored: r.ignored, name: r.name, max: r.max, res: r.e.r || 'G', sub: r.sub, n: 0, lv: new Map(), todo: 0, prog: 0, miss: 0, time: 0, cost: 0 });
      const x = g.get(r.id);
      x.n++;
      x.lv.set(r.lvl, (x.lv.get(r.lvl) || 0) + 1);
      if (r.lvl < r.max) {
        x.todo++;
        if (r.rem != null) x.prog++;
        if (r.missing) x.miss++;
      }
      x.time += r.time; x.cost += r.cost;
    }
    return [...g.values()];
  }

  // gems : prix en gemmes en plus du coût en ressources (cabanes d'ouvrier à acheter)
  function groupRow(x, cat, missingLabel, gems = 0) {
    const lv = [...x.lv.entries()].sort((a, b) => a[0] - b[0]);
    const lvTxt = x.n === 1
      ? (lv[0][0] === 0 ? '—' : `niv. ${lv[0][0]}`)
      : lv.map(([l, c]) => (l === 0 ? `${c}× nouveau` : `${c}× niv. ${l}`)).join(' · ');
    const chips = [];
    if (x.ignored) chips.push('<span class="chip off">Ignoré</span>');
    else if (!x.todo) chips.push('<span class="chip ok">Max</span>');
    else {
      const plain = x.todo - x.prog - x.miss;
      if (plain) chips.push(`<span class="chip todo">${x.n > 1 ? `${plain} / ${x.n} à faire` : 'À faire'}</span>`);
      if (x.prog) chips.push(`<span class="chip prog">${x.n > 1 ? `${x.prog} en cours` : 'En cours'}</span>`);
      if (x.miss) chips.push(`<span class="chip new">${x.n > 1 ? `${x.miss} ${missingLabel}` : missingLabel[0].toUpperCase() + missingLabel.slice(1)}</span>`);
    }
    const costs = [];
    if (x.cost) costs.push(`<span class="cost">${big(x.cost * costFactor())} ${cat === 'walls' ? wallIcons() : icon(x.res)}</span>`);
    if (gems) costs.push(`<span class="cost" title="Achat des cabanes manquantes">${nf.format(gems)} ${icon('GEM')}</span>`);
    const costTxt = costs.join(' ') || '—';
    const label = `${esc(x.name)}${x.n > 1 ? ` <span class="muted">×${x.n}</span>` : ''}`;
    // vignette au niveau le plus haut atteint parmi les exemplaires
    // au max : image du niveau actuel ; sinon (à faire, en cours, à construire) : aperçu au niveau max visé
    const cur = Math.max(...x.lv.keys());
    const pic = x.todo ? thumb(x.id, x.max, `Aperçu au niveau max (${x.max})`) : thumb(x.id, cur, `Niveau ${cur}`);
    const nameHtml = `<span class="nm">${pic}<span>${label}</span></span>`;
    // classes c-* : sur téléphone, la ligne devient une carte (nom + statut, puis niveau · temps · coût)
    return `<tr class="has-chk${x.ignored ? ' is-ignored' : x.todo ? '' : ' is-done'}">
      ${countCell(x)}
      <td class="name">${nameHtml}</td>
      <td class="lvls c-meta${lvTxt === '—' ? ' is-empty' : ''}">${lvTxt}</td>
      <td class="num c-meta c-max">${x.max}</td>
      <td class="c-st">${chips.join('')}</td>
      <td class="num c-meta c-sep${x.time ? '' : ' is-empty'}">${x.time ? dur(x.time) : '—'}</td>
      <td class="num c-meta c-sep${x.cost || gems ? '' : ' is-empty'}">${costTxt}</td>
    </tr>`;
  }

  // case « Compter » : décochée = élément ignoré. Le label rend toute la cellule cliquable.
  const countCell = (x) => `<td class="chk"><label class="hit" title="Décocher pour ignorer cet élément"><input type="checkbox" data-ignore="${esc(x.id)}"${x.ignored ? '' : ' checked'} aria-label="Compter ${esc(x.name)}"></label></td>`;

  function sortGroups(arr, cat) {
    return arr.sort((a, b) => (!!b.todo - !!a.todo)
      || (cat === 'walls' ? b.cost - a.cost : b.time - a.time)
      || a.name.localeCompare(b.name, 'fr'));
  }

  function renderDetails(A) {
    const head = '<thead><tr><th class="chk">Compter</th><th>Élément</th><th>Niveau actuel</th><th class="num">Max</th><th>Statut</th><th class="num">Temps restant</th><th class="num">Coût restant</th></tr></thead>';
    const section = (key, title, sub, s, defaultOpen, table) => {
      const open = key in openState ? openState[key] : defaultOpen;
      return `
        <details class="cat" data-key="${key}"${open ? ' open' : ''}>
          <summary><span class="t">${title}<small>${sub}</small></span>${bar(s.p, s.p >= 99.995)}</summary>
          <div class="table-wrap"><table>${table}</table></div>
        </details>`;
    };
    // « Masquer les éléments au max » : on garde les lignes à faire et les lignes ignorées,
    // et une ligne de fin indique combien d'éléments sont masqués.
    const shown = (x) => !hideMax || x.todo || x.ignored;
    const moreRow = (n, cols, all) => (n
      ? `<tr class="more-row"><td colspan="${cols}">${all ? 'Tout est au max&nbsp;: ' : ''}${n} élément${n > 1 ? 's' : ''} au max masqué${n > 1 ? 's' : ''}. <button type="button" class="link" data-showmax>Afficher</button></td></tr>`
      : '');
    const out = [];
    for (const c of CATS) {
      const s = catStats(A, c.key);
      if (!s.all) continue;
      let body = '', hidden = 0, visible = 0;
      const rowsOf = (gs) => {
        const vis = gs.filter(shown);
        for (const x of gs) if (!shown(x)) hidden += x.n;
        visible += vis.length;
        return vis.map((x) => groupRow(x, c.key, c.missing, x.id === ID.HUT && V.key === 'home' ? A.hutGems : 0)).join('');
      };
      if (c.key === 'lab') {
        for (const [k, label] of LAB_SUB) {
          const html = rowsOf(sortGroups(groupRecs(s.list.filter((r) => r.sub === k)), c.key));
          if (html) body += `<tr class="hero-row"><td colspan="7">${label}</td></tr>` + html;
        }
      } else {
        body = rowsOf(sortGroups(groupRecs(s.list), c.key));
      }
      const sub = `${s.nMax} / ${s.n} au max${s.all > s.n ? ` · ${s.all - s.n} ignoré${s.all - s.n > 1 ? 's' : ''}` : ''}${isOff(c.key) ? ` · ${offWord(c.key)}` : ''}`;
      out.push(section(c.key, catLabel(c), sub, s, s.p < 99.995, `${visible ? head : ''}<tbody>${body}${moreRow(hidden, 7, !visible)}</tbody>`));
    }
    if (A.eq.length) {
      const byHero = new Map();
      for (const q of A.eq) {
        if (!byHero.has(q.hero)) byHero.set(q.hero, []);
        byHero.get(q.hero).push(q);
      }
      const s = eqStats(A);
      const eqShown = (q) => !hideMax || q.lvl < q.max || q.ignored;
      let hidden = 0, visible = 0;
      const body = [...byHero.entries()].map(([hero, list]) => {
        const vis = list.filter(eqShown);
        hidden += list.length - vis.length;
        visible += vis.length;
        if (!vis.length) return '';
        return `<tr class="hero-row"><td colspan="6">${esc(hero || '—')}</td></tr>` +
          vis.sort((a, b) => b.lvl / b.max - a.lvl / a.max || a.name.localeCompare(b.name, 'fr')).map((q) => {
            const ore = q.ore.map((o, i) => (o ? `<span class="cost">${big(o)} ${icon(`O${i + 1}`)}</span>` : '')).filter(Boolean).join(' ') || '—';
            return `<tr class="has-chk${q.ignored ? ' is-ignored' : q.lvl >= q.max ? ' is-done' : ''}">
              ${countCell(q)}
              <td class="name"><span class="nm">${thumb(q.id)}<span>${esc(q.name)}</span></span></td>
              <td class="c-meta c-rar">${q.rar === 'Epic' ? 'Épique' : 'Commun'}</td>
              <td class="num c-meta c-lvnum">${q.lvl}</td>
              <td class="num c-meta c-max">${q.max}</td>
              <td class="num c-meta c-sep c-ores${ore === '—' ? ' is-empty' : ''}">${ore}</td>
            </tr>`;
          }).join('');
      }).join('');
      const nIgn = A.eq.length - s.n;
      out.push(section('equip', 'Équipement', `${s.nMax} / ${s.n} au max${nIgn ? ` · ${nIgn} ignoré${nIgn > 1 ? 's' : ''}` : ''} · limité par les minerais`, s, false,
        `${visible ? '<thead><tr><th class="chk">Compter</th><th>Équipement</th><th>Rareté</th><th class="num">Niveau</th><th class="num">Max</th><th class="num">Minerais restants</th></tr></thead>' : ''}
         <tbody>${body}${moreRow(hidden, 6, !visible)}</tbody>`));
    }
    if (A.helpers.length) {
      const vis = A.helpers.filter((h) => !hideMax || (h.lvl < h.max && !h.gold));
      const gemsTxt = (n) => `<span class="cost">${nf.format(n)} ${icon('GEM')}</span>`;
      const status = (h) => {
        if (h.gold) return `<span class="chip prog">Pass d'or</span><small class="next">${h.locked ? 'à débloquer avec le Pass d\'or' : 'pas de gemmes'}</small>`;
        if (h.locked) return `<span class="chip new">À débloquer</span><small class="next">${h.unlock ? `${nf.format(h.unlock)} gemmes` : 'gratuit'}</small>`;
        if (h.lvl < h.max) return '<span class="chip todo">À améliorer</span>';
        // au max de l'HDV cible : on indique ce que demande le niveau suivant
        return `<span class="chip ok">Max</span>${h.next ? `<small class="next">niv. ${h.next.lvl} à ${V.the} ${h.next.th}</small>` : ''}`;
      };
      const body = vis.map((h) => `<tr class="${h.lvl >= h.max ? 'is-done' : ''}">
          <td class="name"><span class="nm">${thumb(h.id)}<span>${esc(h.name)}</span></span></td><td class="num c-meta c-lvnum${h.lvl ? '' : ' is-empty'}">${h.lvl || '—'}</td><td class="num c-meta c-max${h.gold ? ' is-empty' : ''}">${h.gold ? '—' : h.max}</td>
          <td class="c-st">${status(h)}</td>
          <td class="num c-meta c-sep${h.gems ? '' : ' is-empty'}">${h.gems ? gemsTxt(h.gems) : '—'}</td>
        </tr>`).join('');
      const counted = A.helpers.filter((h) => !h.gold);   // l'Orpailleur ne se monte pas avec des gemmes
      const nMax = counted.filter((h) => h.lvl >= h.max).length;
      const total = counted.reduce((s, h) => s + h.gems, 0);
      out.push(`
        <details class="cat" data-key="helpers"${openState.helpers ? ' open' : ''}>
          <summary><span class="t">Assistants<small>${nMax} / ${counted.length} au max${total ? ` · ${nf.format(total)} gemmes restantes` : ''}${counted.length < A.helpers.length ? ' · Orpailleur via le Pass d\'or' : ''}</small></span><span></span></summary>
          <div class="table-wrap"><table>
            ${vis.length ? '<thead><tr><th>Assistant</th><th class="num">Niveau</th><th class="num">Max</th><th>Statut</th><th class="num">Gemmes restantes</th></tr></thead>' : ''}
            <tbody>${body}${moreRow(A.helpers.length - vis.length, 5, !vis.length)}</tbody>
          </table></div>
        </details>`);
    }
    $('#details').innerHTML = out.join('');
  }

  function renderIgnored(A) {
    const ids = [...ignored];
    // vignette : bâtiments et pièges au niveau max de l'HDV cible, portrait pour le reste
    const pic = (id) => {
      const e = V.t.buildings[id] || V.t.traps[id];
      return imgSrc(id) ? thumb(id, e ? maxLv(e, A.T) : 0) : '';
    };
    $('#ignored-list').innerHTML = ids.length
      ? `<span class="ig-label">Ignorés&nbsp;:</span> ${ids.map((id) => `<button type="button" class="tag" data-unignore="${esc(id)}" title="Réinclure dans le calcul">${pic(id)}${esc(nameOf(id))}<span aria-hidden="true">×</span><span class="sr-only"> — réinclure</span></button>`).join('')}`
        + (ids.length > 1 ? ' <button type="button" class="link" data-unignore="*">Tout réinclure</button>' : '')
      : '<span class="muted">Pour ignorer une amélioration (un héros que tu ne montes pas, un bâtiment…), décoche sa case « Compter » dans le détail plus bas.</span>';
  }

  function renderBanners(A) {
    const stale = $('#stale');
    const days = (A.now - A.ts) / 86400000;
    if (days > 7) {
      stale.hidden = false;
      stale.textContent = `Ton export date de ${Math.round(days)} jours : réexporte ton village depuis le jeu pour un calcul à jour.`;
    } else stale.hidden = true;
    const hint = $('#hint');
    if (A.th.rem != null && A.T === A.curTH && A.curTH < V.maxHall) {
      hint.hidden = false;
      hint.innerHTML = `${V.your} passe au niveau ${A.curTH + 1} le ${esc(dtShort.format(A.th.end))}. `
        + `<button type="button" class="link" data-target="${A.curTH + 1}">Voir ce qui t'attend à ${V.the} ${A.curTH + 1}</button>`;
    } else hint.hidden = true;
    // éléments inconnus : message pour le joueur en haut, détails techniques repliés
    const unk = $('#unknown');
    const nu = A.unknown.length;
    const key = A.unknown.join(',');
    unk.hidden = !nu;
    if (unk.dataset.key !== key) {          // ne pas refermer les détails à chaque rafraîchissement
      unk.dataset.key = key;
      const pl = nu > 1;
      unk.innerHTML = nu
        ? `${nu} élément${pl ? 's' : ''} récent${pl ? 's' : ''} de ton village ${pl ? 'ne sont' : 'n\'est'} pas encore connu${pl ? 's' : ''} du site&nbsp;: ${pl ? 'ils ne sont pas comptés' : 'il n\'est pas compté'} dans le calcul.`
          + `<details><summary>Détails techniques</summary>Identifiant${pl ? 's' : ''}&nbsp;: ${A.unknown.map(esc).join(', ')}. Régénère <code>data/coc-data.js</code> avec <code>tools/build_data.py</code> quand une table plus récente est disponible.</details>`
        : '';
    }
  }

  // ---------- Menus déroulants des hypothèses ----------
  // Bouton + liste dessinés par le site (motif ARIA « listbox ») : même rendu sur tous les navigateurs.
  // Clavier : flèches, Début/Fin, Entrée/Espace, Échap, Tab. Souris : clic, survol, clic à côté pour fermer.
  const CHECK = '<svg class="dd-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  const menus = {};
  function makeMenu(key, onPick) {
    const box = $(`#dd-${key}`);
    const lbl = box.dataset.label;
    box.innerHTML = `<button type="button" class="dd-btn" id="opt-${key}" aria-haspopup="listbox" aria-expanded="false" aria-controls="opt-${key}-list" aria-labelledby="${lbl} opt-${key}">`
      + '<span class="dd-val"></span><svg class="dd-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></button>'
      + `<ul class="dd-list" id="opt-${key}-list" role="listbox" tabindex="-1" aria-labelledby="${lbl}" hidden></ul>`;
    const btn = box.querySelector('.dd-btn');
    const list = box.querySelector('.dd-list');
    let active = -1;
    let built = '';
    const items = () => [...list.querySelectorAll('[role="option"]')];
    const setActive = (i) => {
      const all = items();
      if (!all.length) return;
      active = Math.max(0, Math.min(all.length - 1, i));
      all.forEach((li, k) => li.classList.toggle('is-active', k === active));
      list.setAttribute('aria-activedescendant', all[active].id);
      all[active].scrollIntoView({ block: 'nearest' });
    };
    const close = (focusBtn) => {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    };
    const open = () => {
      for (const m of Object.values(menus)) if (m !== menu) m.close(false);   // un seul menu ouvert à la fois
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      // près du bord droit de l'écran (téléphone), la liste s'aligne à droite du bouton
      list.classList.remove('dd-right');
      list.classList.toggle('dd-right', list.getBoundingClientRect().right > document.documentElement.clientWidth - 8);
      setActive(items().findIndex((li) => li.getAttribute('aria-selected') === 'true'));
      list.focus();
    };
    const pick = (li) => {
      close(true);
      if (li) onPick(li.dataset.value);
    };
    btn.addEventListener('click', () => (list.hidden ? open() : close(true)));
    btn.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    list.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown': setActive(active + 1); break;
        case 'ArrowUp': setActive(active - 1); break;
        case 'Home': setActive(0); break;
        case 'End': setActive(items().length - 1); break;
        case 'Enter': case ' ': pick(items()[active]); break;
        case 'Escape': close(true); break;
        case 'Tab': close(false); return;   // laisse la tabulation passer au champ suivant
        default: return;
      }
      e.preventDefault();
    });
    list.addEventListener('click', (e) => pick(e.target.closest('[role="option"]')));
    list.addEventListener('mousemove', (e) => {
      const li = e.target.closest('[role="option"]');
      if (li) setActive(items().indexOf(li));
    });
    // clic ou focus en dehors du menu : on le ferme
    document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) close(false); });
    box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) close(false); });

    const menu = {
      close,
      // options : [{ value, label (texte du bouton), html (contenu de la ligne) }]
      set(options, value, disabled, fallback) {
        const html = options.map((o) => `<li role="option" id="opt-${key}-${o.value}" data-value="${o.value}" aria-selected="false">${o.html}${CHECK}</li>`).join('');
        if (html !== built) { list.innerHTML = html; built = html; }   // ne reconstruit que si le contenu change
        for (const li of items()) li.setAttribute('aria-selected', String(li.dataset.value === String(value)));
        const cur = options.find((o) => String(o.value) === String(value));
        btn.querySelector('.dd-val').textContent = cur ? cur.label : (fallback || String(value));
        btn.disabled = !!disabled;
        if (disabled) close(false);
      },
    };
    menus[key] = menu;
    return menu;
  }

  // Niveaux d'un assistant jusqu'au max de l'HDV cible : la valeur est le nombre d'heures gagnées par jour
  function helperOptions(A, id, none) {
    const h = D.helpers[id];
    const mine = A.helpers.find((x) => x.id === id);
    const out = [{ value: 0, label: none, html: `<span>${none}</span>` }];
    if (!h) return out;
    for (const [L, th, mult] of h.lv) {
      const isMine = mine && mine.lvl === L;
      if (th > A.T && !isMine) continue;
      out.push({
        value: mult,
        label: `Niv. ${L} · ${mult} h/j`,           // court : tient dans le bouton sur téléphone
        html: `<span>Niveau ${L}</span> <small>${mult} h par jour${isMine ? ' · actuel' : ''}</small>`,
      });
    }
    return out;
  }

  function syncOptions(A) {
    const targets = [];
    for (let t = A.curTH; t <= V.maxHall; t++) {
      const src = imgSrc(V.hall, t);
      targets.push({
        value: t,
        label: `${V.short} ${t}${t === A.curTH ? ' (actuel)' : ''}`,
        html: `${src ? `<img class="dd-th" src="${src}" alt="">` : ''}<span>${V.short} ${t}</span>${t === A.curTH ? ' <small>actuel</small>' : ''}`,
      });
    }
    menus.target.set(targets, A.T);

    const plural = (n) => `${n} ouvrier${n > 1 ? 's' : ''}`;
    const builders = [];
    for (let n = 1; n <= Math.max(V.maxBuilders, opts.builders, A.builders); n++) {
      builders.push({ value: n, label: plural(n), html: `<span>${plural(n)}</span>${n === A.builders ? ' <small>ton village</small>' : ''}` });
    }
    menus.builders.set(builders, opts.builders);

    // apprenti, assistant du labo et familiers : village principal seulement
    const home = V.key === 'home';
    for (const k of ['app', 'lab']) $(`#dd-${k}`).closest('.field').hidden = !home;
    $('#opt-petson').hidden = !home;
    if (home) {
      menus.app.set(helperOptions(A, ID.APP, 'Pas d\'apprenti'), opts.app, false, `${opts.app} h/j`);
      menus.lab.set(helperOptions(A, ID.LAB_ASSIST, 'Pas d\'assistant'), opts.lab, !opts.labOn, `${opts.lab} h/j`);
    }
    $('#lbl-target .opt-txt').textContent = `${V.short} cible`;
    $('#dd-builders').closest('.field').querySelector(':scope > small').textContent = V.buildersNote;
    $('#opt-labon .sw-name').textContent = V.labName;
    $('#opt-labon').setAttribute('aria-label', V.labName);
    menus.gp.set([0, 10, 15, 20].map((v) => ({
      value: v,
      label: v ? `−${v} %` : 'Aucun boost',   // court pour le bouton ; la note dessous dit « temps et coûts »
      html: v ? `<span>−${v} %</span> <small>temps et coûts</small>` : '<span>Aucun boost</span>',
    })), opts.gp);
    for (const s of SWITCHES) {
      const sw = $(s.sel);
      sw.setAttribute('aria-checked', String(opts[s.key]));
      sw.querySelector('.state').textContent = opts[s.key] ? s.on : s.off;
    }
    $('#opt-hidemax').setAttribute('aria-checked', String(hideMax));

    // images des réglages : HDV/MDO cible, cabane d'ouvrier (avant-poste d'O.T.T.O), assistants, labo, animalerie
    const huts = A.recs.filter((r) => r.id === V.hut);
    const pics = {
      '#ic-target': imgSrc(V.hall, A.T),
      '#ic-builders': imgSrc(V.hut, huts.length ? Math.max(...huts.map((r) => r.lvl)) : 1),
      '#ic-app': imgSrc(ID.APP),
      '#ic-lab': imgSrc(ID.LAB_ASSIST),
      '#ic-labon': imgSrc(V.lab, bMax(V.lab, A.T)),
      '#ic-petson': imgSrc(ID.PH, bMax(ID.PH, A.T)),
    };
    for (const [sel, src] of Object.entries(pics)) {
      const el = $(sel);
      el.hidden = !src;
      if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
    }
  }

  function render() {
    if (!village) return;
    const A = analyze(village, Date.now(), opts);
    markIgnored(A);
    const E = estimate(A, opts);
    syncOptions(A);
    renderIgnored(A);
    renderSummary(A, E);
    renderTiming(A, E);
    renderCats(A);
    renderInprog(A);
    renderRes(A);
    renderDetails(A);
    renderBanners(A);
  }

  // ---------- Import ----------
  function defaultOpts(v) {
    const A = analyze(v, Date.now(), null);
    const helper = (id) => (A.helpers.find((h) => h.id === id) || {}).mult || 0;
    return {
      target: A.curTH,
      builders: A.builders,
      app: helper(ID.APP),
      lab: helper(ID.LAB_ASSIST),
      gp: 0,
      labOn: readPref(LAB_KEY) !== '0',
      petsOn: readPref(PETS_KEY) !== '0',
    };
  }

  function readPref(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function showError(msg) {
    const el = $('#import-error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  function load(text, remember) {
    let v;
    try { v = JSON.parse(text); } catch (e) {
      showError('Ce texte n\'est pas du JSON valide. Vérifie que tu as bien collé tout l\'export.');
      return false;
    }
    if (!v || typeof v !== 'object' || !Array.isArray(v.buildings) || typeof v.timestamp !== 'number') {
      showError('Ce JSON ne ressemble pas à un export de village (champs « buildings » et « timestamp » attendus).');
      return false;
    }
    if (!v.buildings.some((b) => b.data === ID.TH)) {
      showError('Hôtel de ville introuvable dans ce fichier.');
      return false;
    }
    showError('');
    village = v;
    optsBy = {};
    if (remember) { try { localStorage.setItem(STORE_KEY, text); } catch (e) { /* stockage indisponible */ } }
    $('#import').hidden = true;
    $('#results').hidden = false;
    $('#btn-reset').hidden = false;
    syncVillageSwitch();
    setMode(readPref(MODE_KEY) === 'bb' ? 'bb' : 'home', false);
    clearInterval(tick);
    tick = setInterval(render, 60000);
    window.scrollTo({ top: 0 });
    return true;
  }

  function reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* rien */ }
    showError('');
    village = null;
    clearInterval(tick);
    $('#village-switch').hidden = true;
    applyMode('home');
    $('#results').hidden = true;
    $('#import').hidden = false;
    $('#btn-reset').hidden = true;
    $('#paste').value = '';
    $('#file').value = '';
  }

  // ---------- Village principal / base des ouvriers ----------
  // Change de village affiché : données, hypothèses, textes et thème (bleu nuit pour la MDO).
  function applyMode(key) {
    V = VILLAGES[key];
    document.documentElement.dataset.village = key;
    $('#site-title').textContent = `Avancement ${V.short}`;
    $('#tagline').textContent = V.tagline;
    document.title = `Avancement ${V.short}`;
    for (const b of document.querySelectorAll('#village-switch [data-village]')) b.setAttribute('aria-pressed', String(b.dataset.village === key));
  }
  function setMode(key, remember) {
    if (key === 'bb' && !hasBB(village)) key = 'home';
    applyMode(key);
    opts = optsBy[key] || (optsBy[key] = defaultOpts(village));
    if (remember) { try { localStorage.setItem(MODE_KEY, key); } catch (e) { /* stockage indisponible */ } }
    render();
  }
  // boutons de bascule : image de l'HDV et de la MDO actuels ; MDO grisée si l'export n'en contient pas
  function syncVillageSwitch() {
    const lvl = (list, id) => ((list || []).find((b) => b.data === id) || {}).lvl || 1;
    const btns = {};
    for (const b of document.querySelectorAll('#village-switch [data-village]')) btns[b.dataset.village] = b;
    btns.home.querySelector('img').src = imgSrc(ID.TH, lvl(village.buildings, ID.TH)) || '';
    const bb = hasBB(village);
    btns.bb.disabled = !bb;
    btns.bb.title = bb ? '' : 'Cet export ne contient pas de base des ouvriers';
    btns.bb.querySelector('img').src = imgSrc(BB.HALL, bb ? lvl(village.buildings2, BB.HALL) : 1) || '';
    $('#village-switch').hidden = false;
  }

  async function loadFile(file) {
    if (!file) return;
    try { load(await file.text(), true); } catch (e) { showError('Impossible de lire ce fichier.'); }
  }

  // Bouton « Coller mon village » : lit directement le presse-papiers (l'export du jeu y copie le JSON)
  async function pasteFromClipboard() {
    let text;
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch (e) {
      showError('Ton navigateur ne permet pas de lire le presse-papiers ici. Colle le JSON dans le champ ci-dessous (Ctrl+V, ou appui long puis Coller).');
      $('#paste').focus();
      return;
    }
    if (!text.startsWith('{')) {
      showError(text
        ? 'Ton presse-papiers ne contient pas l\'export du village. Relance l\'export depuis les Paramètres du jeu, puis réessaie.'
        : 'Ton presse-papiers est vide. Relance l\'export depuis les Paramètres du jeu, puis réessaie.');
      return;
    }
    $('#paste').value = text;
    load(text, true);
  }

  function init() {
    $('#data-source').textContent = `Données de jeu : ${D.label} (fichier généré le ${dtLong.format(new Date(D.generated))}). Les coûts et durées peuvent avoir changé depuis.`;

    // fichier : lien « Choisir un fichier », ou dépôt n'importe où sur la carte d'import (ordinateur)
    const card = $('#import');
    const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    $('#file').addEventListener('change', (e) => loadFile(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((t) => card.addEventListener(t, (e) => {
      if (!hasFiles(e)) return;              // un texte glissé dans le champ garde son comportement normal
      e.preventDefault();
      card.classList.add('over');
    }));
    card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('over'); });
    card.addEventListener('drop', (e) => {
      card.classList.remove('over');
      if (!hasFiles(e)) return;
      e.preventDefault();
      loadFile(e.dataTransfer.files[0]);
    });
    $('#btn-clip').addEventListener('click', pasteFromClipboard);

    $('#btn-analyze').addEventListener('click', () => {
      const text = $('#paste').value.trim();
      if (!text) { showError('Colle d\'abord le JSON de ton village, ou choisis un fichier.'); return; }
      load(text, true);
    });
    $('#paste').addEventListener('paste', () => setTimeout(() => {
      const text = $('#paste').value.trim();
      if (text.startsWith('{') && text.endsWith('}')) load(text, true);
    }, 0));
    $('#btn-reset').addEventListener('click', reset);

    for (const key of ['target', 'builders', 'app', 'lab', 'gp']) {
      makeMenu(key, (v) => { opts[key] = Number(v); render(); });
    }
    $('#village-switch').addEventListener('click', (e) => {
      const b = e.target.closest('[data-village]');
      if (b && !b.disabled && b.getAttribute('aria-pressed') !== 'true') { setMode(b.dataset.village, true); window.scrollTo({ top: 0 }); }
    });
    $('#hint').addEventListener('click', (e) => {
      const t = e.target.closest('[data-target]');
      if (t) { opts.target = Number(t.dataset.target); render(); }
    });
    const setIgnored = (id, on) => {
      if (id === '*') ignored.clear();
      else if (on) ignored.add(id);
      else ignored.delete(id);
      saveIgnored();
      render();
    };
    $('#details').addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-ignore]');
      if (!cb) return;
      const id = cb.dataset.ignore;
      setIgnored(id, !cb.checked);
      const again = document.querySelector(`#details input[data-ignore="${CSS.escape(id)}"]`);
      if (again) again.focus({ preventScroll: true });
    });
    $('#details').addEventListener('toggle', (e) => {
      const d = e.target;
      if (d.dataset && d.dataset.key) openState[d.dataset.key] = d.open;
    }, true);
    $('#ignored-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-unignore]');
      if (b) setIgnored(b.dataset.unignore, false);
    });
    for (const s of SWITCHES) {
      $(s.sel).addEventListener('click', () => {
        opts[s.key] = !opts[s.key];
        try { localStorage.setItem(s.store, opts[s.key] ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
        render();
      });
    }
    const setHideMax = (on) => {
      hideMax = on;
      try { localStorage.setItem(HIDEMAX_KEY, on ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
      render();
    };
    $('#opt-hidemax').addEventListener('click', () => setHideMax(!hideMax));
    $('#details').addEventListener('click', (e) => {
      if (e.target.closest('[data-showmax]')) setHideMax(false);
    });

    hideMax = readPref(HIDEMAX_KEY) !== '0';
    ignored = new Set(readIgnored());
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* stockage indisponible */ }
    if (saved) load(saved, false);
  }

  if (!D) {
    showError('Fichier de données introuvable (data/coc-data.js).');
    return;
  }
  init();
})();
