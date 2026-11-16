// Saga 1.35 : l'habillage du MJ au mode table. Le plateau prend tout l'écran ; par-dessus, des panneaux
// en verre :
//
//   en haut      la campagne et la carte, l'état (combat, pause), voir comme, l'écran des joueurs, pause,
//                le compagnon (le QR du téléphone)
//   sous lui     l'ordre d'initiative, en combat
//   à gauche     le rail d'outils (table/outils.js)
//   en bas       le pion choisi (ses PV, + et −) et la barre des macros du MJ (touches 1 à 9)
//   au coin      le zoom
//
// Le panneau à onglets de droite est table/panneau.js. Les tailles (le panneau, la barre du bas) se
// règlent à la souris et restent d'une partie à l'autre (localStorage).
//
//   creer({ scene, table }) → { maj(), macro(i) → bool, marges(), fermer() }

const TableInterface = (() => {
  const lire = (k, d) => { try { const v = localStorage.getItem(`saga:table:${k}`); return v == null ? d : v; } catch { return d; } };
  const ecrire = (k, v) => { try { localStorage.setItem(`saga:table:${k}`, String(v)); } catch { /* stockage refusé */ } };
  const icone = (n) => el('i', { className: `codicon codicon-${n}` });
  const bouton = (ic, texte, faire, { titre = '', classe = '' } = {}) => {
    const b = el('button', { className: `ti-bouton ${classe}`, type: 'button', title: titre || texte }, ic ? icone(ic) : null, texte ? el('span', { textContent: texte }) : null);
    b.onclick = faire;
    return b;
  };
  const initiale = (nom) => String(nom || '?').trim().charAt(0).toUpperCase() || '?';

  function creer({ scene, table: T }) {
    const haut = el('header', { className: 'ti-haut ti-verre' });
    const ordre = el('div', { className: 'ti-ordre ti-verre', hidden: true });
    const zoom = el('div', { className: 'ti-zoom ti-verre' });
    const bas = el('div', { className: 'ti-bas' });
    const carteEl = el('div', { className: 'ti-pion ti-verre', hidden: true });
    const macrosEl = el('div', { className: 'ti-macros ti-verre' });
    const poignee = el('div', { className: 'ti-poignee-bas', title: 'Glisser : agrandir ou réduire la barre' });
    bas.append(carteEl, macrosEl, poignee);
    scene.append(haut, ordre, zoom, bas);

    // La hauteur de la barre du bas (la taille des macros), réglable et retenue.
    let hauteurBas = Math.max(56, Math.min(130, Number(lire('bas', 74)) || 74));
    const appliquerBas = () => document.body.style.setProperty('--ti-bas', `${hauteurBas}px`);
    appliquerBas();
    poignee.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = hauteurBas;
      const bouger = (m) => { hauteurBas = Math.max(56, Math.min(130, h0 + (y0 - m.clientY))); appliquerBas(); };
      const finir = () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', finir); ecrire('bas', hauteurBas); T.cadrer(); };
      window.addEventListener('pointermove', bouger);
      window.addEventListener('pointerup', finir);
    });

    // --- En haut ---
    let signatureHaut = '';
    function dessinerHaut() {
      const jeu = T.jeu(), partie = T.partie(), carte = T.carte();
      if (!jeu || !partie?.table || !carte) return;
      const c = T.combat;
      const tourDe = c?.actif ? (T.vue()?.pions || []).find((p) => p.id === c.actif)?.nom || '' : '';
      const multi = T.multi?.();
      const actuel = !T.apercu ? 'mj' : T.apercu.perso ? `perso:${T.apercu.perso}` : 'joueurs';
      const sig = JSON.stringify([partie.table.campagne?.nom, jeu.titre, carte.nom, c?.tour, tourDe, Boolean(partie.table.pause), actuel, multi?.actif, partie.equipe.length]);
      if (sig === signatureHaut) return;
      signatureHaut = sig;
      const titre = el('div', { className: 'ti-titre' },
        el('span', { className: 'ti-rune', textContent: 'ᛃ' }),
        el('b', { textContent: partie.table.campagne?.nom || jeu.titre }),
        el('small', { textContent: carte.nom || '' }));
      const etat = c ? el('div', { className: 'ti-etat ti-etat-combat' }, icone('flame'), el('span', { textContent: `Combat · tour ${c.tour || 1}${tourDe ? ` · au tour de ${tourDe}` : ''}` }))
        : partie.table.pause ? el('div', { className: 'ti-etat ti-etat-pause' }, icone('debug-pause'), el('span', { textContent: 'Pause : les joueurs attendent' }))
          : el('div', { className: 'ti-etat ti-etat-vide' });
      const roles = [['mj', 'Voir comme : moi, le MJ'], ['joueurs', 'Voir comme : les joueurs'], ...partie.equipe.filter((x) => x.jdr).map((x) => [`perso:${x.creature}`, `Voir comme : ${JdrPerso.nom(jeu, x)}`])];
      const voir = el('select', { className: 'ti-select', title: 'Voir le plateau comme le voit un joueur (le caché disparaît)' });
      for (const [v, l] of roles) voir.append(el('option', { value: v, textContent: l }));
      voir.value = actuel;
      voir.onchange = () => { voir.blur(); const v = voir.value; T.apercu = v === 'mj' ? null : { mj: false, perso: v.startsWith('perso:') ? v.slice(6) : null }; maj(); };
      const actions = el('div', { className: 'ti-actions' }, voir,
        bouton('screen-full', 'Écran des joueurs', () => window.saga.tableOuvrir?.(), { titre: 'Ouvrir la fenêtre des joueurs (télé, 2e écran) : seulement ce que les joueurs ont le droit de voir' }),
        bouton(partie.table.pause ? 'debug-continue' : 'debug-pause', partie.table.pause ? 'Reprendre' : 'Pause', () => { T.agir({ type: 'pause', valeur: !partie.table.pause }); maj(); }, { classe: partie.table.pause ? 'actif' : '' }),
        bouton('device-mobile', 'Compagnon', () => {
          if (multi?.actif) multi.compagnon();
          else { T.message('Ouvre d\'abord la partie aux joueurs (onglet Joueurs), puis relie ton téléphone.'); document.dispatchEvent(new CustomEvent('saga:table-onglet', { detail: 'joueurs' })); }
        }, { classe: 'accent', titre: 'Relier mon téléphone : dés, macros et PV des pions dans la main' }));
      haut.replaceChildren(titre, etat, actions);
    }

    // --- L'ordre d'initiative ---
    let signatureOrdre = '';
    function dessinerOrdre() {
      // Saga 1.43 : hors combat, l'initiative tenue à la main (avec un bouton pour passer au suivant).
      const manuel = !T.combat && T.vue()?.initiative;
      const c = T.combat || manuel;
      const pions = T.vue()?.pions || [];
      const l = (c?.ordre || []).map((o) => { const p = pions.find((q) => q.id === o.id); return { ...o, sorte: p?.sorte || (manuel ? 'libre' : 'monstre'), ko: Boolean(p?.ko), cache: Boolean(p?.cache) }; });
      const sig = JSON.stringify([l, c?.actif, c?.tour]);
      if (sig === signatureOrdre) return;
      signatureOrdre = sig;
      ordre.hidden = !l.length;
      ordre.replaceChildren(...l.map((o) => {
        const b = el('button', { type: 'button', className: `ti-init ${o.sorte}${o.id === c.actif ? ' actif' : ''}${o.ko ? ' ko' : ''}`, title: `${o.nom} · initiative ${o.init ?? '?'}${o.cache ? ' · caché aux joueurs' : ''}` },
          el('span', { className: 'ti-init-rond', textContent: initiale(o.nom) }), el('span', { className: 'ti-init-nom', textContent: o.nom }), el('small', { textContent: String(o.init ?? '') }));
        b.onclick = () => { T.selection = o.id; maj(); };
        return b;
      }), ...(manuel ? [bouton('debug-continue', 'Suivant', () => T.passerInitiative(1), { titre: `Tour ${c.tour} : passer au suivant` })] : []));
    }

    // --- Le zoom ---
    let zoomVu = 0;
    const pct = el('button', { className: 'ti-bouton ti-pct', type: 'button', title: 'Remontrer toute la carte' });
    pct.onclick = () => T.cadrer();
    zoom.append(bouton('zoom-out', '', () => T.zoomer(-1), { titre: 'Dézoomer (molette)' }), pct, bouton('zoom-in', '', () => T.zoomer(1), { titre: 'Zoomer (molette)' }), bouton('screen-normal', '', () => T.cadrer(), { titre: 'Recadrer : toute la carte' }));
    function dessinerZoom() {
      const z = T.zoom;
      if (z === zoomVu) return;
      zoomVu = z;
      pct.textContent = `${Math.round(z * 100)} %`;
    }

    // --- Le pion choisi (ou celui dont c'est le tour) ---
    let signaturePion = '';
    function dessinerPion() {
      const jeu = T.jeu(), partie = T.partie();
      const id = T.selection || T.combat?.actif || '';
      const v = (T.vue()?.pions || []).find((p) => p.id === id);
      const p = id ? T.pion(id) : null;
      if (!v || !p) { carteEl.hidden = true; signaturePion = ''; return; }
      const c = p.sorte === 'heros' ? TableEtat.membreDe(partie, p) : null;
      const m = p.sorte !== 'heros' ? (jeu.donnees.monstres_jdr?.monstres_jdr || []).find((x) => x.id === p.monstre) : null;
      const ca = c ? JdrPerso.ca(jeu, c) : m?.ca;
      const sous = c ? [JdrPerso.classe(jeu, c)?.nom, `niv. ${c.niveau || 1}`].filter(Boolean).join(' ') : (m?.type || '');
      const etats = (c?.etats || p.etats || []).map((e) => (typeof e === 'string' ? e : e?.id)).filter(Boolean);
      const sig = JSON.stringify([id, v.pv, v.pvMax, ca, sous, etats, T.selection === id, v.cache]);
      if (sig === signaturePion) return;
      signaturePion = sig;
      carteEl.hidden = false;
      const pc = v.pvMax ? Math.max(0, Math.min(100, (v.pv / v.pvMax) * 100)) : 0;
      const pvBouton = (d) => {
        const b = el('button', { type: 'button', className: 'ti-pv-bouton', title: `${d > 0 ? 'Soigner' : 'Blesser'} de 1 (Maj : de 5)` }, icone(d > 0 ? 'add' : 'remove'));
        b.onclick = (e) => { T.changerPv(id, { delta: d * (e.shiftKey ? 5 : 1) }); maj(); };
        return b;
      };
      carteEl.className = `ti-pion ti-verre ${p.sorte}`;
      carteEl.replaceChildren(
        el('div', { className: 'ti-pion-rond', textContent: initiale(v.nom) }),
        el('div', { className: 'ti-pion-corps' },
          el('div', { className: 'ti-pion-nom' }, el('b', { textContent: v.nom }), el('small', { textContent: [sous, ca != null ? `CA ${ca}` : '', T.selection === id ? 'choisi' : 'son tour', v.cache ? 'caché' : ''].filter(Boolean).join(' · ') })),
          v.pv != null ? el('div', { className: `ti-jauge${pc < 40 ? ' basse' : ''}` }, el('i', { style: `width:${pc}%` })) : null,
          el('div', { className: 'ti-pion-bas' }, v.pv != null ? el('span', { textContent: `${v.pv} / ${v.pvMax} PV` }) : el('span', { textContent: v.sante || '' }),
            ...etats.slice(0, 4).map((e) => el('span', { className: 'ti-etat-pion', textContent: (jeu.donnees.etats?.etats || []).find((x) => x.id === e)?.nom || e })))),
        v.pv != null ? el('div', { className: 'ti-pv' }, pvBouton(1), pvBouton(-1)) : el('span'),
        c ? bouton('account', '', () => T.ouvrirFiche(c), { titre: 'Sa fiche', classe: 'ti-fiche' }) : el('span'));
    }

    // --- Les macros du MJ ---
    let signatureMacros = '', ajout = false;
    function dessinerMacros() {
      const macros = T.table()?.macros || [];
      const sig = JSON.stringify([macros, ajout]);
      if (sig === signatureMacros) return;
      signatureMacros = sig;
      macrosEl.replaceChildren();
      macros.forEach((m, k) => {
        const secret = /^\/(gr|mj)\b/i.test(m.formule);
        const b = el('button', { type: 'button', className: `ti-macro${/d20/i.test(m.formule) ? '' : ' degats'}`, title: `${m.formule}${k < 9 ? ` · touche ${k + 1}` : ''} · clic droit : oublier` },
          el('b', {}, m.nom, secret ? icone('eye-closed') : null), el('code', { textContent: m.formule }), k < 9 ? el('kbd', { textContent: String(k + 1) }) : null);
        b.onclick = () => T.commande(`/m ${m.nom}`);
        b.oncontextmenu = (e) => { e.preventDefault(); T.agir({ type: 'macro_retirer', k }); maj(); };
        macrosEl.append(b);
      });
      if (ajout) {
        const nom = el('input', { className: 'ti-champ', placeholder: 'Nom (Init monstres)', maxLength: 30 });
        const formule = el('input', { className: 'ti-champ', placeholder: '/gr 1d20+2', maxLength: 80, spellcheck: false });
        const f = el('form', { className: 'ti-macro-form' }, nom, formule, el('button', { type: 'submit', className: 'ti-bouton accent', title: 'Garder' }, icone('check')), bouton('close', '', () => { ajout = false; dessinerMacros(); }, { titre: 'Annuler' }));
        f.onsubmit = (e) => { e.preventDefault(); if (nom.value.trim() && formule.value.trim()) { T.agir({ type: 'macro_ajouter', nom: nom.value.trim(), formule: formule.value.trim() }); ajout = false; maj(); } };
        f.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') { ajout = false; dessinerMacros(); } };
        macrosEl.append(f);
        setTimeout(() => nom.focus(), 20);
      } else if (macros.length < 20) {
        macrosEl.append(bouton('add', macros.length ? '' : 'Une macro', () => { ajout = true; dessinerMacros(); }, { titre: 'Garder un jet en macro (dans le chat : /m nom). « /gr » au début : un jet caché.', classe: 'ti-macro-plus' }));
      }
    }

    function maj() {
      if (!T.partie()?.table) return;
      dessinerHaut();
      dessinerOrdre();
      dessinerPion();
      dessinerMacros();
      dessinerZoom();
    }
    // Le zoom et l'ordre bougent sans que la table change : un petit coup d'œil régulier.
    // Un combat commence ou finit : l'encart du tour prend (ou rend) sa place, la carte se recadre à côté.
    let enCombat = Boolean(T.combat);
    const minuterie = setInterval(() => {
      dessinerZoom(); dessinerPion(); dessinerOrdre(); dessinerHaut();
      if (Boolean(T.combat) !== enCombat) { enCombat = Boolean(T.combat); T.cadrer(); }
    }, 300);

    return {
      maj,
      macro(i) { const m = (T.table()?.macros || [])[i]; if (!m) return false; T.commande(`/m ${m.nom}`); return true; },
      // La place des panneaux sur le plateau (pour cadrer la carte dans ce qui reste visible).
      marges() {
        const r = scene.getBoundingClientRect();
        const rh = haut.getBoundingClientRect(), rb = bas.getBoundingClientRect();
        return { g: 72, d: Math.max(0, r.right - (scene.querySelector('.table-colonne')?.getBoundingClientRect().left ?? r.right)) + 8, souple: T.combat ? 316 : 0, h: rh.bottom - r.top + (ordre.hidden ? 8 : 56), b: r.bottom - rb.top + 8 };
      },
      fermer() { clearInterval(minuterie); haut.remove(); ordre.remove(); zoom.remove(); bas.remove(); },
    };
  }
  return { creer };
})();
