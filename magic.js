// Onglet « Objets magiques » : sur quelle amélioration utiliser chaque livre et chaque marteau pour gagner le plus.
// - Un livre termine instantanément une amélioration (en cours, ou qu'on lance) : la plus longue est le meilleur choix ;
//   un chantier en cours compte pour son temps restant.
// - Un marteau fait passer gratuitement au niveau suivant (ni attente ni coût), mais pas pendant une amélioration
//   en cours : le meilleur choix est la plus longue amélioration pas encore lancée.
// Les améliorations viennent de window.COC_UI.upgradeTargets (app.js), à partir du village importé.
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const NEXT = 4;           // améliorations suivantes affichées sous la meilleure
  // objets du jeu (noms et descriptions officiels en français), et les améliorations qu'ils acceptent
  const FIGHT = { scope: 'Troupes et engins de siège', scopeBB: 'Troupes', kinds: ['troop', 'siege'] };
  const SPELL = { scope: 'Sorts', kinds: ['spell'], homeOnly: true };
  const HERO = { scope: 'Héros et familiers', scopeBB: 'Héros', kinds: ['heroes', 'pets'] };
  const BUILD = { scope: 'Bâtiments, pièges et hôtel de ville', scopeBB: 'Bâtiments, pièges et maison des ouvriers', kinds: ['bld'] };
  const SECTIONS = [
    {
      key: 'books', title: 'Livres', pic: 'book_of_everything', hammer: false,
      intro: 'Un livre termine instantanément une amélioration, en cours ou que tu lances : utilise-le sur la plus longue. Un chantier en cours compte pour son temps restant.',
      items: [
        { file: 'book_of_fighting', name: 'Livre de combat', desc: 'Termine n\'importe quelle amélioration de troupe instantanément.', ...FIGHT },
        { file: 'book_of_spells', name: 'Livre des sorts', desc: 'Termine n\'importe quelle amélioration de sort instantanément, dans le village principal.', ...SPELL },
        { file: 'book_of_heroes', name: 'Livre des héros', desc: 'Termine une amélioration de héros ou de familier instantanément.', ...HERO },
        { file: 'book_of_building', name: 'Livre des bâtiments', desc: 'Termine n\'importe quelle amélioration de bâtiment instantanément.', ...BUILD },
        { file: 'book_of_everything', name: 'Livre universel', desc: 'Termine n\'importe quelle amélioration instantanément.', scope: 'Toutes les améliorations', kinds: null },
      ],
    },
    {
      key: 'hammers', title: 'Marteaux', pic: 'hammer_of_building', hammer: true,
      intro: 'Un marteau fait passer gratuitement au niveau suivant, sans attendre ni payer, mais pas pendant une amélioration en cours : utilise-le sur la plus longue amélioration pas encore lancée.',
      items: [
        { file: 'hammer_of_fighting', name: 'Marteau de combat', desc: 'Améliore instantanément n\'importe quelle troupe au niveau supérieur.', ...FIGHT },
        { file: 'hammer_of_spells', name: 'Marteau des sorts', desc: 'Améliore instantanément n\'importe quel sort au niveau supérieur, dans le village principal.', ...SPELL },
        { file: 'hammer_of_heroes', name: 'Marteau des héros', desc: 'Améliore instantanément n\'importe quel héros ou familier au niveau supérieur.', ...HERO },
        { file: 'hammer_of_building', name: 'Marteau des bâtiments', desc: 'Améliore instantanément n\'importe quel bâtiment au niveau supérieur. Nécessite un ouvrier disponible.', ...BUILD },
      ],
    },
  ];

  let ui = null;
  let ready = false;
  const state = { village: 'home' };

  const esc = (s) => ui.esc(s);
  const wikiHas = (id) => window.COC_WIKI && window.COC_WIKI.has(id);
  const costTxt = (x) => (x.cost && x.res && ui.ICONS[x.res] ? `${ui.big(x.cost)} ${ui.icon(x.res, 'ic', null)}` : '');

  // exemplaires identiques (même élément, même niveau, pas en cours) regroupés : « Tour d'archères ×3 »
  // tri : la plus longue d'abord ; à durée égale, la plus chère (ce que le marteau fait économiser en plus)
  function group(list) {
    const m = new Map();
    for (const x of list) {
      const k = x.prog ? `${x.kind}|${x.id}|${x.from}|prog|${x.time}` : `${x.kind}|${x.id}|${x.from}|${x.missing}`;
      const g = m.get(k);
      if (g) g.n++; else m.set(k, { ...x, n: 1 });
    }
    return [...m.values()].sort((a, b) => b.time - a.time || b.cost - a.cost || a.name.localeCompare(b.name, 'fr'));
  }

  const step = (x) => (x.missing ? 'à construire' : `niv. ${x.from} → ${x.to}${x.prog ? ' · en cours' : ''}`);
  const label = (x) => `${esc(x.name)}${x.n > 1 ? ` <span class="muted">×${x.n}</span>` : ''}`;
  // image + nom (+ niveau, et pour un marteau le coût économisé) : lien vers la fiche du wiki quand elle existe
  const target = (x, cls, hammer) => {
    const cost = hammer && costTxt(x);
    const inner = `${x.pic ? `<img class="${cls}-pic" src="${x.pic}" alt="" loading="lazy">` : ''}`
      + `<span class="${cls}-txt"><span class="${cls}-name">${label(x)}</span>`
      + `<span class="${cls}-lvl">${step(x)}${cost && cls === 'mg-n' ? ` · <span class="cost">${cost}</span>` : ''}</span></span>`;
    return wikiHas(x.wiki) ? `<a class="${cls} wiki-link" href="#wiki/${x.wiki}">${inner}</a>` : `<span class="${cls}">${inner}</span>`;
  };

  function card(it, all, bb, hammer) {
    // marteau : ni chantier en cours, ni bâtiment pas encore construit
    const ok = (x) => (!it.kinds || it.kinds.includes(x.kind)) && (!hammer || (!x.prog && !x.missing));
    const list = group(all.filter(ok));
    const best = list[0];
    const rest = list.slice(1, 1 + NEXT);
    const tie = (x) => ui.dur(x.time) === ui.dur(best.time) && (!hammer || x.cost === best.cost);
    const cost = best && hammer && costTxt(best);
    const body = best ? `
      <div class="mg-best">
        <span class="mg-label">À utiliser sur</span>
        <div class="mg-best-row">
          ${target(best, 'mg-t', hammer)}
          <span class="mg-gain">
            <span class="mg-time">${ui.dur(best.time)}</span><span class="mg-gain-lbl">${best.prog ? 'restants' : 'gagnés'}</span>
            ${cost ? `<span class="mg-gain-cost cost">${cost}</span><span class="mg-gain-lbl">économisés</span>` : ''}
          </span>
        </div>
      </div>
      ${rest.length ? `
        <p class="mg-label mg-next-lbl">Ensuite</p>
        <ul class="mg-next">${rest.map((x) => `<li>${target(x, 'mg-n', hammer)}<span class="mg-n-time">${tie(x) ? '<span class="chip ok">à égalité</span> ' : ''}${ui.dur(x.time)}</span></li>`).join('')}</ul>` : ''}`
      : `<p class="mg-empty muted">Aucune amélioration de ce type n'est possible${hammer ? ' (hors chantiers en cours)' : ''} à ton niveau actuel.</p>`;
    return `
      <article class="card mg-book">
        <div class="mg-head">
          <img class="mg-book-pic" src="img/magic/${it.file}.webp" alt="">
          <div class="mg-head-txt">
            <h3>${it.name}</h3>
            <p class="mg-scope">${bb && it.scopeBB ? it.scopeBB : it.scope}</p>
            <p class="muted mg-desc">${it.desc}</p>
          </div>
        </div>
        ${body}
      </article>`;
  }

  function render() {
    const v = ui.village();
    const bbOk = ui.hasBB();
    if (state.village === 'bb' && !bbOk) state.village = 'home';
    const sw = $('#mg-village');
    sw.hidden = !v || !bbOk;
    for (const b of sw.querySelectorAll('[data-village]')) b.setAttribute('aria-pressed', String(b.dataset.village === state.village));
    if (!v) {
      $('#mg-note').textContent = '';
      $('#mg-books').innerHTML = `
        <div class="card mg-none">
          <p>Importe d'abord ton village dans l'onglet <a class="link" href="#">Mon village</a> : la page te dira alors sur quelle amélioration utiliser chaque livre et chaque marteau.</p>
          <div class="mg-none-pics">${SECTIONS.flatMap((s) => s.items).map((it) => `<img src="img/magic/${it.file}.webp" alt="${it.name}" title="${it.name}">`).join('')}</div>
        </div>`;
      return;
    }
    const T = ui.upgradeTargets(state.village);
    const bb = state.village === 'bb';
    const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(T.ts);
    $('#mg-note').textContent = `D'après ton export du ${date}, à ${bb ? 'la ' : 'l\''}${T.short} ${T.curTH}`
      + `${T.gp ? `, avec le Pass d'or (−${T.gp} %) sur les améliorations pas encore lancées` : ''}.`;
    $('#mg-books').innerHTML = SECTIONS.map((s) => {
      const items = s.items.filter((it) => !(bb && it.homeOnly));
      return `
        <section class="wiki-cat mg-sec" aria-labelledby="mg-${s.key}">
          <h2 id="mg-${s.key}"><img class="wiki-cat-ic" src="img/magic/${s.pic}.webp" alt=""><span>${s.title}</span><small>${items.length}</small></h2>
          <p class="muted mg-intro">${s.intro}</p>
          <div class="mg-grid">${items.map((it) => card(it, T.list, bb, s.hammer)).join('')}</div>
        </section>`;
    }).join('');
  }

  function setup() {
    ready = true;
    ui = window.COC_UI;
    const sw = $('#mg-village');
    for (const b of sw.querySelectorAll('[data-village]')) {
      const id = b.dataset.village === 'bb' ? 1000034 : 1000001;
      b.querySelector('img').src = ui.imgSrc(id, 999) || '';
    }
    sw.addEventListener('click', (e) => {
      const b = e.target.closest('[data-village]');
      if (!b || b.dataset.village === state.village) return;
      state.village = b.dataset.village;
      render();
      ui.refreshHeader();                                 // thème bleu nuit sur la base des ouvriers
    });
  }

  // affiché à chaque ouverture de l'onglet : le village a pu être importé ou changé entre-temps
  function show() {
    if (!ready) setup();
    render();
  }

  window.COC_MAGIC = { show, village: () => state.village };
})();
