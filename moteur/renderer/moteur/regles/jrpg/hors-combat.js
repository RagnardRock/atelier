// Le pack JRPG classique (Saga 0.8) hors combat : les objets du sac sur la carte (soins, éthers,
// remèdes, Repousse), l'écran Équipement et les compétences de soin lancées depuis le menu du groupe.
//
// ui (prêté par le moteur) : dire(texte) attend que le joueur lise ; liste({ titre, items, … }) rend
// l'index choisi ou null (voir menus.js).

const JrpgHorsCombat = (() => {
  const H = JrpgHeros;
  const UTILES = ['soin', 'soin_pm', 'rappel', 'soin_statut', 'repousse'];
  const utilisable = (o) => Boolean(o && UTILES.includes(o.effet?.type));
  const retirer = (partie, id) => { partie.sac[id] = (partie.sac[id] || 0) - 1; if (partie.sac[id] <= 0) delete partie.sac[id]; };

  // Le groupe en liste, avec PV et PM ; desactive(c) grise ceux sur qui ça ne fait rien.
  const lignes = (jeu, partie, desactive = () => false) => partie.equipe.map((c) => {
    const max = H.pvMax(jeu, c);
    return {
      texte: `${H.nom(jeu, c)}${c.statut ? `  ${H.COURTS[c.statut]}` : ''}`, image: H.portrait(jeu, c) || Sprites.vignette(jeu, H.apparence(jeu, c)), pv: c.pv / Math.max(1, max),
      detail: `N.${c.niveau} · ${c.pv > 0 ? `${c.pv}/${max} PV` : 'K.O.'} · ${c.pm}/${H.pmMax(jeu, c)} PM`, desactive: desactive(c),
    };
  });

  // Un effet de soin sur un héros (objet ou compétence). Rend le texte à dire, ou null s'il ne fait rien.
  function soigner(jeu, c, { pv = 0, pm = 0, ranime = 0, statut = '' }) {
    const nom = H.nom(jeu, c), maxPv = H.pvMax(jeu, c), maxPm = H.pmMax(jeu, c);
    if (ranime) {
      if (c.pv > 0) return null;
      c.pv = Math.max(1, Math.floor(ranime));
      return `${nom} reprend connaissance !`;
    }
    if (c.pv <= 0) return null;
    const textes = [];
    if (pv > 0 && c.pv < maxPv) { const avant = c.pv; c.pv = Math.min(maxPv, c.pv + pv); textes.push(`${nom} récupère ${c.pv - avant} PV.`); }
    if (pm > 0 && c.pm < maxPm) { const avant = c.pm; c.pm = Math.min(maxPm, c.pm + pm); textes.push(`${nom} récupère ${c.pm - avant} PM.`); }
    if (statut && c.statut && (statut === 'tous' || statut === c.statut)) { c.statut = ''; textes.push(`${nom} va mieux.`); }
    return textes.length ? textes.join(' ') : null;
  }

  async function utiliserObjet({ jeu, partie, ui, id }) {
    const o = H.trouver(jeu, 'objets', id);
    const e = o?.effet || {};
    if (!o || !(partie.sac[id] > 0)) return false;
    if (!utilisable(o)) { await ui.dire(`${o.nom} ne s'utilise pas comme ça.`); return false; }
    const v = Number(e.valeur) || 0;
    if (e.type === 'repousse') {
      retirer(partie, id);
      partie.repousse = Math.max(partie.repousse || 0, v || 100);
      await ui.dire(`Tu utilises ${o.nom}. Les monstres t'éviteront pendant ${partie.repousse} pas.`);
      return true;
    }
    if (!partie.equipe.length) { await ui.dire('Personne dans le groupe.'); return false; }
    const i = await ui.liste({ titre: `${o.nom} : sur qui ?`, items: lignes(jeu, partie, (c) => (e.type === 'rappel' ? c.pv > 0 : c.pv <= 0)) });
    if (i == null) return false;
    const c = partie.equipe[i];
    const texte = soigner(jeu, c, {
      pv: e.type === 'soin' ? (v >= 9999 || !v ? H.pvMax(jeu, c) : v) : 0,
      pm: e.type === 'soin_pm' ? (v >= 9999 || !v ? H.pmMax(jeu, c) : v) : 0,
      ranime: e.type === 'rappel' ? H.pvMax(jeu, c) * (v || 25) / 100 : 0,
      statut: e.type === 'soin_statut' ? e.statut || 'tous' : e.type === 'soin' ? e.statut || '' : '',
    });
    if (!texte) { await ui.dire('Ça n\'aura aucun effet.'); return false; }
    retirer(partie, id);
    await ui.dire(texte);
    return true;
  }

  // --- Le menu d'un héros : Équipement et Compétences ---
  const actionsMembre = () => [['equipement', 'Équipement'], ['competences', 'Compétences']];
  async function agirMembre({ jeu, partie, ui, c, id }) {
    if (id === 'equipement') await ecranEquipement(jeu, partie, ui, c);
    else if (id === 'competences') await lancerCompetence(jeu, partie, ui, c);
  }

  // Ce qu'un objet change aux statistiques d'un héros : « Force +3 · Défense −1 ».
  function ecart(jeu, partie, c, place, id) {
    const avant = H.stats(jeu, c);
    const essai = { ...c, equipement: { ...c.equipement, [place]: id } };
    const apres = H.stats(jeu, essai);
    const l = H.STATS.filter((s) => apres[s] !== avant[s]).map((s) => `${H.NOMS_STATS[s]} ${apres[s] > avant[s] ? '+' : '−'}${Math.abs(apres[s] - avant[s])}`);
    return l.join(' · ') || 'rien ne change';
  }
  async function ecranEquipement(jeu, partie, ui, c) {
    let k = 0;
    for (;;) {
      const s = H.stats(jeu, c);
      k = await ui.liste({
        titre: `Équipement de ${H.nom(jeu, c)}`, entete: `Force ${s.force} · Défense ${s.defense} · Magie ${s.magie} · Esprit ${s.esprit}`, depart: k,
        items: H.PLACES.map(([place, nom]) => {
          const o = H.trouver(jeu, 'objets', c.equipement[place]);
          return { texte: `${nom} : ${o?.nom || '—'}`, image: o?.icone || '', detail: o ? Object.entries(o.equipement?.bonus || {}).filter(([, v]) => v).map(([st, v]) => `${H.NOMS_STATS[st]} ${v > 0 ? '+' : ''}${v}`).join(' · ') : '' };
        }),
      });
      if (k == null) return;
      const [place, nomPlace] = H.PLACES[k];
      // Ce qui peut aller ici : les objets du sac de cette place que sa classe peut porter.
      const possibles = Object.keys(partie.sac).map((id) => H.trouver(jeu, 'objets', id)).filter((o) => o && H.placeDe(o) === place && partie.sac[o.id] > 0);
      const items = [
        ...(c.equipement[place] ? [{ texte: '(Retirer)', detail: ecart(jeu, partie, c, place, '') }] : []),
        ...possibles.map((o) => ({
          texte: o.nom, image: o.icone || '', desactive: !H.peutPorter(jeu, c, o),
          detail: H.peutPorter(jeu, c, o) ? `${ecart(jeu, partie, c, place, o.id)} · ×${partie.sac[o.id]}` : 'pas pour sa classe',
        })),
      ];
      const j = await ui.liste({ titre: `${nomPlace} de ${H.nom(jeu, c)}`, items, note: items.length ? '' : 'Rien à mettre ici dans le sac.' });
      if (j == null) continue;
      const retire = Boolean(c.equipement[place]) && j === 0;
      H.equiper(jeu, partie, c, place, retire ? '' : possibles[j - (c.equipement[place] ? 1 : 0)].id);
    }
  }

  // Les compétences de soutien hors combat (soins, ranimer, guérir) : le lanceur paie ses PM.
  const horsCombat = (comp) => comp && (Number(comp.soin) > 0 || comp.ranime || comp.guerit?.length) && ['allie', 'equipe', 'soi'].includes(comp.cible);
  async function lancerCompetence(jeu, partie, ui, c) {
    for (;;) {
      const comps = H.competences(jeu, c).map((id) => H.trouver(jeu, 'attaques', id));
      const i = await ui.liste({
        titre: `Compétences de ${H.nom(jeu, c)}`, entete: `${c.pm}/${H.pmMax(jeu, c)} PM`,
        items: comps.map((x) => ({ texte: x.nom, detail: `${Number(x.cout_pm) || 0} PM${horsCombat(x) ? '' : ' · en combat'}`, desactive: !horsCombat(x) || c.pv <= 0 || (Number(x.cout_pm) || 0) > c.pm })),
        note: comps.length ? '' : 'Pas encore de compétence.',
      });
      if (i == null) return;
      const comp = comps[i];
      let cibles = [c];
      if (comp.cible === 'allie') {
        const j = await ui.liste({ titre: `${comp.nom} : sur qui ?`, items: lignes(jeu, partie, (x) => (comp.ranime ? x.pv > 0 : x.pv <= 0)) });
        if (j == null) continue;
        cibles = [partie.equipe[j]];
      } else if (comp.cible === 'equipe') cibles = partie.equipe;
      const magie = H.stats(jeu, c).magie;
      const textes = cibles.map((x) => soigner(jeu, x, {
        pv: comp.ranime ? 0 : JrpgCombat.formuleSoin({ soin: Number(comp.soin) || 0, magie }) * (Number(comp.soin) > 0 ? 1 : 0),
        ranime: comp.ranime ? (Number(comp.soin) > 0 ? JrpgCombat.formuleSoin({ soin: Number(comp.soin), magie }) : H.pvMax(jeu, x) / 4) : 0,
        statut: comp.guerit?.includes('tous') ? 'tous' : comp.guerit?.[0] || '',
      })).filter(Boolean);
      if (!textes.length) { await ui.dire('Ça n\'aura aucun effet.'); continue; }
      c.pm -= Number(comp.cout_pm) || 0;
      await ui.dire(`${H.nom(jeu, c)} lance ${comp.nom}. ${textes.join(' ')}`);
    }
  }

  return { utilisable, utiliserObjet, actionsMembre, agirMembre, ecranEquipement };
})();
