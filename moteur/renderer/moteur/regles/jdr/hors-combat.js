// Le pack JDR (Saga 0.13) hors combat : le sac, l'équipement, les sorts, les tests à la demande, les
// repos, monter de niveau et le journal des jets.
//
// ui (prêté par le moteur, voir scripts.js) : dire(texte), liste({ titre, items, … }) → index ou null,
// quantite(…), texte({ titre, valeur, max }) → texte ou null, repartir({ … }) → valeurs ou null
// (menus.js), et des({ titre, lignes }) : le plateau de dés.

const JdrHorsCombat = (() => {
  const B = JdrBase, P = JdrPerso, D = JdrDes, T = JdrTests;
  const UTILES = ['soin', 'rappel', 'soin_statut', 'repousse'];
  const utilisable = (o) => Boolean(o && UTILES.includes(o.effet?.type));
  const retirer = (partie, id) => { partie.sac[id] = (partie.sac[id] || 0) - 1; if (partie.sac[id] <= 0) delete partie.sac[id]; };

  // Le groupe en liste : PV, CA, niveau. desactive(c) grise ceux sur qui ça ne fait rien.
  const lignes = (jeu, partie, desactive = () => false) => partie.equipe.map((c) => {
    const max = P.pvMax(jeu, c);
    return {
      texte: P.nom(jeu, c), image: P.portrait(jeu, c) || Sprites.vignette(jeu, P.apparence(jeu, c)), pv: c.pv / Math.max(1, max),
      detail: `N.${c.niveau} · ${c.mort_definitive ? 'mort' : c.pv > 0 ? `${c.pv}/${max} PV` : 'à terre'} · CA ${P.ca(jeu, c)}`, desactive: desactive(c),
    };
  });

  // --- Les objets du sac ---
  async function utiliserObjet({ jeu, partie, ui, id }) {
    const o = P.objet(jeu, id), e = o?.effet || {};
    if (!o || !(partie.sac[id] > 0)) return false;
    if (!utilisable(o)) { await ui.dire(`${o.nom} ne s'utilise pas comme ça.`); return false; }
    if (e.type === 'repousse') {
      retirer(partie, id);
      partie.repousse = Math.max(partie.repousse || 0, Number(e.valeur) || 100);
      await ui.dire(`Tu utilises ${o.nom}. Les monstres t'éviteront pendant ${partie.repousse} pas.`);
      return true;
    }
    if (!partie.equipe.length) { await ui.dire('Personne dans le groupe.'); return false; }
    const i = await ui.liste({ titre: `${o.nom} : sur qui ?`, items: lignes(jeu, partie, (c) => c.mort_definitive || (e.type === 'rappel' ? c.pv > 0 : e.type === 'soin' ? c.pv >= P.pvMax(jeu, c) : !c.etats?.length)) });
    if (i == null) return false;
    const c = partie.equipe[i], nom = P.nom(jeu, c);
    retirer(partie, id);
    if (e.type === 'soin') {
      const r = e.des ? D.lancer(partie, e.des) : { formule: '', des: [], bonus: Number(e.valeur) || 0, total: Number(e.valeur) || 0 };
      if (e.des) await T.montrer(ui, o.nom, [D.noter(partie, { qui: nom, quoi: o.nom, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
      const avant = c.pv;
      c.pv = Math.min(P.pvMax(jeu, c), c.pv + (Number(e.valeur) >= 9999 ? 9999 : r.total));
      if (avant <= 0 && c.pv > 0) { c.mort = { succes: 0, echecs: 0 }; c.stable = false; }
      await ui.dire(`${nom} récupère ${c.pv - avant} PV.`);
    } else if (e.type === 'rappel') {
      c.pv = Math.max(1, Math.floor(P.pvMax(jeu, c) * (Number(e.valeur) || 25) / 100));
      await ui.dire(`${nom} reprend connaissance !`);
    } else {
      c.etats = (c.etats || []).filter((x) => !(e.statut === 'tous' || !e.statut || x === e.statut));
      await ui.dire(`${nom} va mieux.`);
    }
    return true;
  }

  // --- Le menu d'un personnage ---
  function actionsMembre(jeu, c) {
    if (!c.jdr) return [];
    return [
      ...(P.peutMonter(jeu, c) ? [['niveau', `Monter au niveau ${c.niveau + 1} !`]] : []),
      ['equipement', 'Équipement'],
      ...(P.lanceur(jeu, c) ? [['sorts', 'Sorts']] : []),
      ['test', 'Faire un test (jet de dés)'],
      ...(c.des_vie > 0 && c.pv < P.pvMax(jeu, c) && c.pv > 0 ? [['des_vie', `Dépenser un dé de vie (${c.des_vie} restant${c.des_vie > 1 ? 's' : ''})`]] : []),
      ['notes', 'Notes du joueur'],
    ];
  }
  async function agirMembre({ jeu, partie, ui, c, id }) {
    if (id === 'equipement') await ecranEquipement(jeu, partie, ui, c);
    else if (id === 'sorts') await ecranSorts(jeu, partie, ui, c);
    else if (id === 'test') await faireTest(jeu, partie, ui, c);
    else if (id === 'niveau') await monterNiveau(jeu, partie, ui, c);
    else if (id === 'des_vie') await deVie(jeu, partie, ui, c);
    else if (id === 'notes') { const t = await ui.texte?.({ titre: `Notes de ${P.nom(jeu, c)}`, valeur: c.notes || '', max: 200 }); if (t != null) c.notes = t; }
  }

  // --- L'équipement : arme, main gauche (bouclier ou arme légère), armure ---
  function texteObjet(o) {
    const w = P.arme(o), a = P.armure(o);
    if (w) return `${w.degats}${w.polyvalente ? ` (${w.polyvalente})` : ''} ${B.nomDegats(w.type).toLowerCase()}${(w.proprietes || []).length ? ` · ${w.proprietes.join(', ').replace(/_/g, ' ')}` : ''}`;
    if (a) return a.type === 'bouclier' ? `CA +${Number(a.ca) || 2}` : `CA ${a.ca}${a.type === 'legere' ? ' + Dex' : a.type === 'intermediaire' ? ' + Dex (max 2)' : ''}`;
    return '';
  }
  async function ecranEquipement(jeu, partie, ui, c) {
    let k = 0;
    for (;;) {
      const at = P.attaques(jeu, c)[0];
      k = await ui.liste({
        titre: `Équipement de ${P.nom(jeu, c)}`, entete: `CA ${P.ca(jeu, c)} · ${at.nom} ${B.signe(at.bonus)} (${at.des}${at.mod ? B.signe(at.mod) : ''})`, depart: k,
        items: P.PLACES.map(([place, nom]) => { const o = P.objet(jeu, c.equipement[place]); return { texte: `${nom} : ${o?.nom || '—'}`, image: o?.icone || '', detail: o ? texteObjet(o) : '' }; }),
      });
      if (k == null) return;
      const [place, nomPlace] = P.PLACES[k];
      const possibles = Object.keys(partie.sac).map((id) => P.objet(jeu, id)).filter((o) => o && partie.sac[o.id] > 0 && (P.placeDe(o) === place || (place === 'seconde' && P.arme(o))));
      const items = [
        ...(c.equipement[place] ? [{ texte: '(Retirer)' }] : []),
        ...possibles.map((o) => {
          const ok = P.peutMettre(jeu, c, o, place);
          const maitrise = !P.arme(o) || P.maitriseArme(jeu, c, o);
          return { texte: o.nom, image: o.icone || '', desactive: !ok, detail: ok ? `${texteObjet(o)}${maitrise ? '' : ' · pas maîtrisée'} · ×${partie.sac[o.id]}` : place === 'seconde' ? 'pas dans la main gauche' : 'ne va pas ici' };
        }),
      ];
      const j = await ui.liste({ titre: `${nomPlace} de ${P.nom(jeu, c)}`, items, note: items.length ? '' : 'Rien à mettre ici dans le sac.' });
      if (j == null) continue;
      const retire = Boolean(c.equipement[place]) && j === 0;
      P.equiper(jeu, partie, c, place, retire ? '' : possibles[j - (c.equipement[place] ? 1 : 0)].id);
    }
  }

  // --- Les sorts : les voir, lancer un soin, changer ceux qu'il connaît ou prépare ---
  const detailSort = (jeu, s) => `${Number(s.niveau) ? `Niv. ${s.niveau}` : 'Tour de magie'} · ${B.ECOLES.find(([k]) => k === s.ecole)?.[1] || s.ecole || ''}${s.concentration ? ' · concentration' : ''}${s.rituel ? ' · rituel' : ''}`;
  async function ecranSorts(jeu, partie, ui, c) {
    for (;;) {
      const empl = P.emplacements(jeu, c);
      const entete = empl.length ? empl.map((n, i) => (n ? `${i + 1} : ${P.restants(jeu, c, i + 1)}/${n}` : '')).filter(Boolean).join(' · ') : 'Pas encore d\'emplacement';
      const connus = P.sortsConnus(jeu, c);
      const { tours, sorts } = P.nombreSorts(jeu, c);
      const items = [
        ...connus.map((s) => ({ texte: s.nom, detail: `${detailSort(jeu, s)}${s.effet?.type === 'soin' && s.effet?.hors_combat !== false ? ' · à lancer' : ''}` })),
        { texte: P.lanceur(jeu, c).prepare ? `Changer les sorts préparés (${connus.filter((s) => Number(s.niveau) > 0).length}/${sorts})` : `Changer les sorts connus (${connus.filter((s) => Number(s.niveau) > 0).length}/${sorts})`, detail: `et les tours de magie (${connus.filter((s) => !Number(s.niveau)).length}/${tours})` },
      ];
      const i = await ui.liste({ titre: `Sorts de ${P.nom(jeu, c)} · DD ${P.ddSorts(jeu, c)} · attaque ${B.signe(P.attaqueSorts(jeu, c))}`, entete, items, large: true });
      if (i == null) return;
      if (i === connus.length) { await choisirSorts(jeu, ui, c); continue; }
      const s = connus[i];
      const peutSoigner = s.effet?.type === 'soin' && s.effet?.hors_combat !== false && c.pv > 0;
      const a = await ui.liste({ titre: s.nom, note: `${detailSort(jeu, s)}\n${[s.temps, s.portee, s.composantes, s.duree].filter(Boolean).join(' · ')}\n\n${s.description || ''}`, items: [...(peutSoigner ? [{ texte: 'Lancer ce sort' }] : []), { texte: 'Retour' }] });
      if (a === 0 && peutSoigner) await soignerHorsCombat(jeu, partie, ui, c, s);
    }
  }
  async function soignerHorsCombat(jeu, partie, ui, c, s) {
    let emp = 0;
    if (Number(s.niveau) > 0) {
      const possibles = P.emplacements(jeu, c).map((n, i) => i + 1).filter((nv) => nv >= Number(s.niveau) && P.restants(jeu, c, nv) > 0);
      if (!possibles.length) { await ui.dire('Plus d\'emplacement de sort de ce niveau.'); return; }
      emp = possibles[0];
      if (possibles.length > 1 && s.effet.niveau_sup) {
        const k = await ui.liste({ titre: `${s.nom} : quel emplacement ?`, items: possibles.map((nv) => ({ texte: `Niveau ${nv}`, detail: `${P.restants(jeu, c, nv)} restant(s)` })) });
        if (k == null) return;
        emp = possibles[k];
      }
    }
    const cibles = s.effet.cibles === 'allies' ? partie.equipe.filter((x) => !x.mort_definitive) : s.effet.cibles === 'soi' ? [c] : null;
    let l = cibles;
    if (!l) {
      const j = await ui.liste({ titre: `${s.nom} : sur qui ?`, items: lignes(jeu, partie, (x) => x.mort_definitive || x.pv >= P.pvMax(jeu, x)) });
      if (j == null) return;
      l = [partie.equipe[j]];
    }
    if (emp) c.emplacements[emp] = (Number(c.emplacements[emp]) || 0) + 1;
    const mod = s.effet.ajouter_mod !== false ? P.modCarac(jeu, c, P.caracMagie(jeu, c)) : 0;
    const base = B.lireDes(s.effet.soin), sup = B.lireDes(s.effet.niveau_sup);
    const des = base ? `${base.n + (sup && emp > s.niveau && sup.faces === base.faces ? sup.n * (emp - s.niveau) : 0)}d${base.faces}${base.bonus ? B.signe(base.bonus).replace('−', '-') : ''}` : String(s.effet.soin || '0');
    const textes = [];
    for (const x of l) {
      const r = D.lancer(partie, des);
      const n = Math.max(1, Math.round(await Maison.formule('soin', { des: r.total, mod, sort: s.id }, () => r.total + mod)));
      await T.montrer(ui, s.nom, [D.noter(partie, { qui: P.nom(jeu, c), quoi: `${s.nom} sur ${P.nom(jeu, x)}`, formule: r.formule, des: r.des, bonus: n - r.total, total: n })]);
      const avant = x.pv;
      x.pv = Math.min(P.pvMax(jeu, x), x.pv + n);
      if (avant <= 0 && x.pv > 0) { x.mort = { succes: 0, echecs: 0 }; x.stable = false; }
      textes.push(`${P.nom(jeu, x)} récupère ${x.pv - avant} PV.`);
    }
    await ui.dire(`${P.nom(jeu, c)} lance ${s.nom}. ${textes.join(' ')}`);
  }
  // Choisir ses tours de magie et ses sorts (création, niveau, ou depuis le menu Sorts).
  async function choisirSorts(jeu, ui, c, { seulementManquants = false } = {}) {
    const { tours, sorts } = P.nombreSorts(jeu, c);
    for (const [niveau0, max, titre] of [[true, tours, 'Tours de magie'], [false, sorts, P.lanceur(jeu, c).prepare ? 'Sorts préparés' : 'Sorts connus']]) {
      if (!max) continue;
      const possibles = P.sortsDeClasse(jeu, c).filter((s) => (Number(s.niveau) === 0) === niveau0).sort((a, b) => a.niveau - b.niveau || String(a.nom).localeCompare(String(b.nom)));
      if (!possibles.length) continue;
      const choisis = new Set((c.sorts || []).filter((id) => possibles.some((s) => s.id === id)));
      if (seulementManquants && choisis.size >= Math.min(max, possibles.length)) continue;
      let k = 0;
      for (;;) {
        const plein = choisis.size >= max;
        k = await ui.liste({
          titre: `${titre} de ${P.nom(jeu, c)}`, entete: `${choisis.size} / ${max}`, depart: k, large: true, annulable: false,
          items: [
            ...possibles.map((s) => ({ texte: `${choisis.has(s.id) ? '✔ ' : '   '}${s.nom}`, detail: detailSort(jeu, s), desactive: plein && !choisis.has(s.id) })),
            { texte: 'Valider', detail: choisis.size < Math.min(max, possibles.length) ? `encore ${Math.min(max, possibles.length) - choisis.size} à choisir` : '' },
          ],
        });
        if (k === possibles.length) break;
        const id = possibles[k].id;
        if (choisis.has(id)) choisis.delete(id); else if (!plein) choisis.add(id);
      }
      c.sorts = [...(c.sorts || []).filter((id) => !possibles.some((s) => s.id === id)), ...choisis];
    }
  }

  // --- Faire un test à la demande (le MJ dit le DD, autour de la vraie table) ---
  async function faireTest(jeu, partie, ui, c) {
    const comps = B.competences(jeu), cars = B.caracteristiques(jeu);
    const items = [
      ...comps.map((k) => ({ texte: k.nom, detail: `${B.signe(P.bonusCompetence(jeu, c, k.id))} · ${B.courtCarac(jeu, k.carac)}${P.competencesMaitrisees(jeu, c).includes(k.id) ? ' · maîtrisée' : ''}` })),
      ...cars.map((k) => ({ texte: `Test de ${k.nom}`, detail: B.signe(P.modCarac(jeu, c, k.id)) })),
      ...cars.map((k) => ({ texte: `Sauvegarde de ${k.nom}`, detail: `${B.signe(P.bonusSauvegarde(jeu, c, k.id))}${P.maitriseSauvegarde(jeu, c, k.id) ? ' · maîtrisée' : ''}` })),
    ];
    const i = await ui.liste({ titre: `${P.nom(jeu, c)} : quel jet ?`, items, large: true, saut: 6 });
    if (i == null) return;
    const mode = await ui.liste({ titre: 'Avec…', items: [{ texte: 'Un jet normal' }, { texte: 'Avantage (deux d20, le meilleur)' }, { texte: 'Désavantage (deux d20, le pire)' }] });
    if (mode == null) return;
    const o = { jeu, partie, ui, c, avantage: mode === 1, desavantage: mode === 2 };
    let r;
    if (i < comps.length) r = await T.test({ ...o, competence: comps[i].id });
    else if (i < comps.length + cars.length) r = await T.test({ ...o, competence: cars[i - comps.length].id });
    else r = await T.sauvegarde({ ...o, carac: cars[i - comps.length - cars.length].id, dd: 0 });
    await ui.dire(`${P.nom(jeu, c)} obtient ${r.total}${r.naturel === 20 ? ' (20 naturel !)' : r.naturel === 1 ? ' (1 naturel…)' : ''}.`);
  }

  // --- Dépenser un dé de vie (repos court) ---
  async function deVie(jeu, partie, ui, c) {
    if (!(c.des_vie > 0) || c.pv <= 0) return false;
    c.des_vie--;
    const r = D.lancer(partie, `1d${P.deVie(jeu, c)}`);
    const con = P.modCarac(jeu, c, 'con');
    const n = Math.max(0, r.total + con);
    await T.montrer(ui, 'Dé de vie', [D.noter(partie, { qui: P.nom(jeu, c), quoi: 'Dé de vie', formule: r.formule, des: r.des, bonus: con, total: n })]);
    const avant = c.pv;
    c.pv = Math.min(P.pvMax(jeu, c), c.pv + n);
    await ui.dire(`${P.nom(jeu, c)} récupère ${c.pv - avant} PV.`);
    return true;
  }

  // --- Les repos ---
  const DUREES = { normal: ['1 heure', '8 heures'], heroique: ['5 minutes', '1 heure'], realiste: ['8 heures', '7 jours'] };
  async function repos({ jeu, partie, ui, sorte = '' }) {
    const R = B.regles(jeu), [court, long] = DUREES[R.repos] || DUREES.normal;
    let s = sorte;
    if (!s) {
      const i = await ui.liste({ titre: 'Se reposer', items: [{ texte: 'Repos court', detail: `${court} : dés de vie, quelques aptitudes` }, { texte: 'Repos long', detail: `${long} : tout revient` }] });
      if (i == null) return false;
      s = i === 0 ? 'court' : 'long';
    }
    if (s === 'long') {
      for (const c of partie.equipe) if (c.jdr && !c.mort_definitive) P.reposLong(jeu, c);
      await ui.dire(`Le groupe se repose (${long}). PV, emplacements de sorts et aptitudes sont revenus.`);
      return true;
    }
    for (const c of partie.equipe) if (c.jdr) P.reposCourt(jeu, c);
    await ui.dire(`Le groupe fait une pause (${court}). Chacun peut dépenser ses dés de vie.`);
    for (;;) {
      const qui = partie.equipe.filter((c) => c.jdr && c.pv > 0 && c.des_vie > 0 && c.pv < P.pvMax(jeu, c));
      if (!qui.length) break;
      const i = await ui.liste({ titre: 'Dépenser un dé de vie ?', items: [...qui.map((c) => ({ texte: P.nom(jeu, c), detail: `${c.pv}/${P.pvMax(jeu, c)} PV · ${c.des_vie} dé${c.des_vie > 1 ? 's' : ''} (d${P.deVie(jeu, c)})` })), { texte: 'C\'est bon, on repart' }] });
      if (i == null || i === qui.length) break;
      await deVie(jeu, partie, ui, qui[i]);
    }
    return true;
  }

  // --- Monter de niveau ---
  async function monterNiveau(jeu, partie, ui, c, { jalon = false } = {}) {
    if (!jalon && !P.peutMonter(jeu, c)) return false;
    if (c.niveau >= P.niveauMax(jeu)) return false;
    const R = B.regles(jeu), de = P.deVie(jeu, c), con = P.modCarac(jeu, c, 'con');
    const nom = P.nom(jeu, c), moyenne = Math.floor(de / 2) + 1;
    let gain = moyenne, jet = 0;
    let mode = R.pv_niveau;
    if (mode === 'choix') {
      const i = await ui.liste({ titre: `${nom} passe au niveau ${c.niveau + 1} : les PV`, annulable: false, items: [{ texte: `Prendre la moyenne : ${moyenne}`, detail: `+ Con (${B.signe(con)})` }, { texte: `Lancer 1d${de}`, detail: `+ Con (${B.signe(con)}) · peut-être mieux, peut-être pire` }] });
      mode = i === 1 ? 'jet' : 'moyenne';
    }
    if (mode === 'jet') {
      const r = D.lancer(partie, `1d${de}`);
      jet = r.total;
      await T.montrer(ui, 'PV du nouveau niveau', [D.noter(partie, { qui: nom, quoi: `PV du niveau ${c.niveau + 1}`, formule: r.formule, des: r.des, bonus: 0, total: r.total })]);
      gain = r.total;
    }
    gain = Math.max(1, Math.round(await Maison.formule('pv_niveau', { de, con, jet, niveau: c.niveau + 1 }, () => gain)));
    const avant = P.pvMax(jeu, c);
    const nouvelles = P.monter(jeu, c, gain);
    await ui.dire(`${nom} passe au niveau ${c.niveau} ! PV max : ${avant} → ${P.pvMax(jeu, c)}. Bonus de maîtrise : ${B.signe(P.pb(c))}.`);
    for (const a of nouvelles) await ui.dire(`Nouvelle aptitude : ${a.nom}.${a.description ? ` ${a.description}` : ''}`);
    // Une amélioration de caractéristiques : +2 à une, ou +1 à deux (jamais au-dessus de 20).
    const k = P.classe(jeu, c);
    const ameliorations = Array.isArray(k?.ameliorations) && k.ameliorations.length ? k.ameliorations : B.NIVEAUX_AMELIORATION;
    if (ameliorations.includes(c.niveau)) await ameliorer(jeu, ui, c);
    if (P.lanceur(jeu, c)) await choisirSorts(jeu, ui, c, { seulementManquants: true });
    return true;
  }
  async function ameliorer(jeu, ui, c) {
    const cars = B.caracteristiques(jeu);
    let reste = 2;
    while (reste > 0) {
      const i = await ui.liste({
        titre: `Amélioration de caractéristiques (${reste} point${reste > 1 ? 's' : ''})`, annulable: false,
        items: cars.map((k) => ({ texte: `${k.nom} : ${P.carac(jeu, c, k.id)}`, detail: `mod ${B.signe(P.modCarac(jeu, c, k.id))}`, desactive: P.carac(jeu, c, k.id) >= 20 })),
      });
      if (i == null) return;
      c.carac[cars[i].id] = (Number(c.carac[cars[i].id]) || 10) + 1;
      reste--;
    }
  }

  // --- Le journal des jets (menu du jeu) ---
  async function journal({ jeu, partie, ui }) {
    for (;;) {
      const l = [...D.etat(partie).journal].reverse();
      const i = await ui.liste({
        titre: 'Jets de dés', entete: `${l.length} jet${l.length > 1 ? 's' : ''}`, large: true,
        items: [
          { texte: 'Lancer des dés…', detail: 'd4, d6, d8, d10, d12, d20, d100 ou 2d6+3' },
          ...l.map((x) => ({ texte: `${x.qui ? `${x.qui} · ` : ''}${x.quoi}`, detail: `${D.detail(x)}${x.resultat ? ` · ${D.RESULTATS[x.resultat] || x.resultat}` : ''}${x.mode ? ` · ${x.mode}` : ''}` })),
        ],
      });
      if (i == null) return;
      if (i > 0) continue;
      const faces = ['d20', 'd4', 'd6', 'd8', 'd10', 'd12', 'd100', '2d6', '4d6', 'Autre…'];
      const k = await ui.liste({ titre: 'Lancer', items: faces.map((f) => ({ texte: f })) });
      if (k == null) continue;
      let formule = faces[k];
      if (formule === 'Autre…') {
        formule = await ui.texte?.({ titre: 'Quels dés ? (exemple : 2d6+3)', valeur: '1d20', max: 24 });
        if (!formule) continue;
        if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(formule.replace(/\s+/g, ''))) { await ui.dire(`« ${formule} » : je ne sais pas lire ce jet. Exemples : d20, 2d6+3, 1d8+1d6.`); continue; }
      }
      await T.jet({ jeu, partie, ui, formule, quoi: `Jet de ${formule}`, qui: partie.nom });
    }
  }

  return { utilisable, utiliserObjet, actionsMembre, agirMembre, ecranEquipement, ecranSorts, choisirSorts, faireTest, deVie, repos, monterNiveau, ameliorer, journal, texteObjet, detailSort, lignes };
})();
