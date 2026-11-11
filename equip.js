// Onglet « Mes équipements » : coût en minerais pour monter un équipement d'un niveau à un autre.
// Le niveau actuel est prérempli depuis le village importé (onglet Mon village), le niveau cible se choisit.
// Outils partagés : window.COC_UI (app.js).
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const BLACKSMITH = 1000070;
  const TH = 1000001;
  const ORES = [['O1', 'Minerai brillant'], ['O2', 'Minerai luisant'], ['O3', 'Minerai étoilé']];
  // dernier équipement choisi et son niveau cible, retenus d'une visite à l'autre
  const STORE_KEY = 'avancement-hdv:equipements';

  let ui = null, D = null;
  let ready = false;
  let heroes = [];          // [{ id, name, src, list: [équipements] }] dans l'ordre du jeu
  let byId = {};            // id -> équipement
  let fromMenu = null, toMenu = null;
  const state = { hero: '', id: '', from: 0, to: 0 };
  const fromOverride = {};  // niveau actuel modifié à la main (id -> niveau), pour la visite en cours

  // ---------- Données ----------
  const forgeTH = (lvl) => {                              // HDV qui donne accès à ce niveau de forge
    const r = D.buildings[BLACKSMITH] && D.buildings[BLACKSMITH].lv.find((x) => x[0] === lvl);
    return r ? r[3] : 0;
  };
  // ligne d'un niveau : [niveau, brillant, luisant, étoilé, HDV, forge] -> objet lisible
  const levelOf = (r) => ({ lvl: r[0], ores: [r[1], r[2], r[3]], forge: r[5], th: Math.max(r[4], forgeTH(r[5])) });

  function build() {
    const heroByName = {};
    heroes = Object.entries(D.heroes)
      .map(([id, h]) => ({ id, name: h.n, since: h.lv[0] ? h.lv[0][3] : 99, src: ui.imgSrc(id), list: [] }))
      .sort((a, b) => a.since - b.since || +a.id - +b.id);
    for (const h of heroes) heroByName[h.name] = h;
    byId = {};
    for (const [id, e] of Object.entries(D.equipment)) {
      const h = heroByName[e.h];
      if (!h || !e.lv || !e.lv.length) continue;
      const levels = e.lv.map(levelOf);
      const it = { id, name: e.n, epic: e.rar === 'Epic', hero: h, levels, max: levels[levels.length - 1].lvl, since: levels[0].th };
      h.list.push(it);
      byId[id] = it;
    }
    for (const h of heroes) h.list.sort((a, b) => a.epic - b.epic || a.since - b.since || a.name.localeCompare(b.name, 'fr'));
    heroes = heroes.filter((h) => h.list.length);
  }

  // ---------- Village importé ----------
  const village = () => ui.village();
  const myLevel = (id) => {                               // niveau dans la sauvegarde, 0 si absent
    const v = village();
    const x = v && (v.equipment || []).find((q) => String(q.data) === String(id));
    return x ? x.lvl || 0 : 0;
  };
  const myBuilding = (id) => {
    const v = village();
    return v ? Math.max(0, ...(v.buildings || []).filter((b) => b.data === id).map((b) => b.lvl || 0)) : 0;
  };

  // ---------- Affichage ----------
  const esc = (s) => ui.esc(s);
  const nf = (n) => ui.nf.format(n);
  const rarity = (it) => `<img class="rarity" src="img/ui/rarity-${it.epic ? 'epic' : 'common'}.webp" width="${it.epic ? 183 : 186}" height="${it.epic ? 68 : 69}" alt="${it.epic ? 'Épique' : 'Commun'}">`;
  const ownChip = (it) => {
    const v = village();
    if (!v) return '';
    const l = myLevel(it.id);
    if (l) return `<span class="chip ${l >= it.max ? 'ok' : 'prog'}">niv. ${l}</span>`;
    return Array.isArray(v.equipment) ? '<span class="chip off">non obtenu</span>' : '';
  };

  function renderHeroes() {
    $('#eq-heroes').innerHTML = heroes.map((h) => `<button type="button" class="chip-btn" data-hero="${h.id}" aria-pressed="${state.hero === h.id}">${h.src ? `<img class="chip-ic" src="${h.src}" alt="">` : ''}<span>${esc(h.name)}</span> <small>${h.list.length}</small></button>`).join('');
  }

  function renderGrid() {
    const h = heroes.find((x) => x.id === state.hero) || heroes[0];
    $('#eq-grid').innerHTML = h.list.map((it) => `
      <button type="button" class="eq-card" data-id="${it.id}" aria-pressed="${it.id === state.id}">
        <img class="eq-pic" src="${ui.imgSrc(it.id) || ''}" alt="" loading="lazy">
        <span class="eq-name">${esc(it.name)}</span>
        ${rarity(it)}
        ${ownChip(it)}
      </button>`).join('');
  }

  function renderSim() {
    const it = byId[state.id];
    if (!it) return;
    const saved = myLevel(it.id);
    const v = village();

    $('#eq-head').innerHTML = `
      <img class="eq-head-pic" src="${ui.imgSrc(it.id) || ''}" alt="">
      <div class="eq-head-txt">
        <h2>${esc(it.name)}${rarity(it)}</h2>
        <p class="muted">${esc(it.hero.name)} · niveau max ${it.max} · <a class="link" href="#wiki/${it.id}">fiche du wiki</a></p>
      </div>`;

    // niveau actuel : de 1 au max ; niveau cible : au-dessus du niveau actuel
    fromMenu.set(it.levels.map((l) => ({
      value: l.lvl,
      label: `Niveau ${l.lvl}`,
      html: `<span>Niveau ${l.lvl}</span>${l.lvl === saved ? ' <small>ton niveau</small>' : ''}`,
    })), state.from);
    const above = it.levels.filter((l) => l.lvl > state.from);
    if (above.length) {
      toMenu.set(above.map((l) => ({
        value: l.lvl,
        label: `Niveau ${l.lvl}`,
        html: `<span>Niveau ${l.lvl}</span> <small>forge niv. ${l.forge} · HDV ${l.th}</small>`,
      })), state.to);
    } else {
      toMenu.set([{ value: it.max, label: 'Niveau max atteint', html: '<span>Niveau max atteint</span>' }], it.max, true);
    }
    $('#eq-from-note').textContent = !v ? 'importe ton village pour partir de ton niveau'
      : !saved ? 'pas encore obtenu dans ta sauvegarde'
        : state.from === saved ? 'd\'après ta sauvegarde' : `ta sauvegarde : niveau ${saved}`;
    $('#eq-to-note').textContent = `jusqu'au niveau ${it.max}`;

    // résultat : total des minerais, prérequis du niveau cible, détail niveau par niveau
    const steps = it.levels.filter((l) => l.lvl > state.from && l.lvl <= state.to);
    if (!steps.length) {
      $('#eq-result').innerHTML = `<p class="eq-done"><span class="chip ok">Max</span> ${esc(it.name)} est déjà au niveau maximum (${it.max}).</p>`;
      return;
    }
    const total = [0, 1, 2].map((i) => steps.reduce((s, l) => s + l.ores[i], 0));
    const target = steps[steps.length - 1];
    const forge = myBuilding(BLACKSMITH), th = myBuilding(TH);
    const needs = [];
    if (v && forge < target.forge) needs.push(`ta forge est au niveau ${forge}`);
    if (v && th < target.th) needs.push(`tu es HDV ${th}`);
    const tile = ([k, name], i) => `
      <div class="eq-ore${total[i] ? '' : ' is-zero'}">
        ${ui.icon(k, 'eq-ore-ic', null)}
        <span class="eq-ore-val">${nf(total[i])}</span>
        <span class="eq-ore-lbl">${name}</span>
      </div>`;
    $('#eq-result').innerHTML = `
      <p class="eq-sum" aria-live="polite">Du niveau <b>${state.from}</b> au niveau <b>${state.to}</b>, soit ${steps.length} amélioration${steps.length > 1 ? 's' : ''} :</p>
      <div class="eq-ores">${ORES.map(tile).join('')}</div>
      <p class="eq-req${needs.length ? ' is-warn' : ''}">Le niveau ${target.lvl} demande la <b>forge niv. ${target.forge}</b> et l'<b>HDV ${target.th}</b>${needs.length ? ` : ${needs.join(' et ')}.` : '.'}</p>
      <details class="eq-steps">
        <summary>Détail niveau par niveau</summary>
        <div class="wiki-table-wrap">
          <table class="wiki-table eq-table">
            <thead><tr><th>Niveau</th>${ORES.map(([, n]) => `<th class="num">${n.replace('Minerai ', '')}</th>`).join('')}<th class="num">Forge</th><th class="num">HDV</th></tr></thead>
            <tbody>${steps.map((l) => `<tr><td>Niveau ${l.lvl}</td>${l.ores.map((o, i) => `<td class="num">${o ? `<span class="cost">${nf(o)} ${ui.icon(ORES[i][0], 'ic', null)}</span>` : '<span class="muted">—</span>'}</td>`).join('')}<td class="num">niv. ${l.forge}</td><td class="num">HDV ${l.th}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td>Total</td>${total.map((o, i) => `<td class="num">${o ? `<span class="cost">${nf(o)} ${ui.icon(ORES[i][0], 'ic', null)}</span>` : '<span class="muted">—</span>'}</td>`).join('')}<td></td><td></td></tr></tfoot>
          </table>
        </div>
      </details>`;
  }

  function render() {
    renderHeroes();
    renderGrid();
    renderSim();
  }

  // ---------- Choix ----------
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ id: state.id, to: state.to })); } catch (e) { /* stockage indisponible */ }
  }
  // choisit un équipement : niveau actuel de la sauvegarde (ou modifié à la main), niveau cible gardé s'il reste valable
  function pick(id, to) {
    const it = byId[id];
    if (!it) return;
    state.id = id;
    state.hero = it.hero.id;
    state.from = fromOverride[id] || myLevel(id) || 1;
    state.to = to > state.from && to <= it.max ? to : it.max;
  }

  function setup() {
    ready = true;
    ui = window.COC_UI;
    D = ui.D;
    build();
    fromMenu = ui.makeMenu('eq-from', (v) => {
      state.from = Number(v);
      fromOverride[state.id] = state.from;
      if (state.to <= state.from) state.to = byId[state.id].max;
      save();
      renderSim();
    });
    toMenu = ui.makeMenu('eq-to', (v) => { state.to = Number(v); save(); renderSim(); });
    $('#eq-heroes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hero]');
      if (!b || b.dataset.hero === state.hero) return;
      state.hero = b.dataset.hero;
      const h = heroes.find((x) => x.id === state.hero);
      // le héros choisi : son équipement le plus avancé dans la sauvegarde, sinon le premier
      const best = [...h.list].sort((a, c) => myLevel(c.id) - myLevel(a.id))[0];
      pick(best.id);
      save();
      render();
    });
    $('#eq-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      pick(b.dataset.id);
      save();
      render();
      // sur téléphone, le résultat est sous la liste : on y descend
      if (window.matchMedia('(max-width: 960px)').matches) $('#eq-sim').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* rien de retenu */ }
    const first = saved && byId[saved.id] ? saved.id : heroes[0].list[0].id;
    pick(first, saved && saved.id === first ? saved.to : 0);
  }

  // affiché à chaque ouverture de l'onglet : le village a pu être importé ou changé entre-temps
  function show() {
    if (!ready) setup();
    else pick(state.id, state.to);
    render();
  }

  window.COC_EQUIP = { show };
})();
