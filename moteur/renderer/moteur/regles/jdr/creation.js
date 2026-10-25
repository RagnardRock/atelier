// Le pack JDR (Saga 0.13) : créer son personnage, au début d'une nouvelle partie (ou par la commande
// « creer_personnage » d'un événement). Neuf étapes, toutes au clavier, à la manette ou à la souris :
//   1. un pré-tiré, ou un nouveau personnage    2. son nom    3. son apparence (un personnage du jeu)
//   4. son origine    5. sa classe    6. ses caractéristiques (tableau standard, achat de points ou 4d6)
//   7. ses compétences    8. ses sorts (s'il en lance)    9. le récapitulatif
// L'équipement de départ de sa classe arrive dans le sac, et ce qui se porte est porté.
//
// Les méthodes permises, le niveau de départ et le nombre de personnages se règlent dans Tafl
// (Réglages › Règles du JDR › Création).

const JdrCreation = (() => {
  const B = JdrBase, P = JdrPerso, D = JdrDes, T = JdrTests;
  const METHODES = { standard: 'Tableau standard (15, 14, 13, 12, 10, 8)', points: 'Achat de points (27 points)', des: 'Lancer 4d6 (on garde les 3 meilleurs)' };

  const bonusTexte = (jeu, bonus) => Object.entries(bonus || {}).filter(([, v]) => v).map(([k, v]) => `${B.courtCarac(jeu, k)} ${B.signe(v)}`).join(' ');
  const pretires = (jeu) => [...jeu.personnages.values()].filter((p) => p.jdr?.classe && B.trouver(jeu, 'classes_jdr', p.jdr.classe));

  // Répartir des valeurs (tableau standard, 4d6) : chaque caractéristique prend une des valeurs qui restent.
  async function assigner(jeu, ui, valeurs, origine) {
    const cars = B.caracteristiques(jeu);
    const out = {};
    const reste = [...valeurs].sort((a, b) => b - a);
    for (const k of cars) {
      if (reste.length === 1) { out[k.id] = reste.pop(); continue; }
      const b = Number(origine?.bonus?.[k.id]) || 0;
      const i = await ui.liste({
        titre: `${k.nom} : quelle valeur ?`, annulable: true,
        entete: Object.entries(out).map(([id, v]) => `${B.courtCarac(jeu, id)} ${v}`).join(' · '),
        items: reste.map((v) => ({ texte: String(v), detail: b ? `${v + b} avec ton origine (${B.signe(b)}) · mod ${B.signe(B.mod(v + b))}` : `mod ${B.signe(B.mod(v))}` })),
      });
      if (i == null) return null;
      out[k.id] = reste.splice(i, 1)[0];
    }
    return out;
  }
  // L'achat de points : chaque valeur de 8 à 15, 27 points en tout.
  async function acheter(jeu, ui, origine) {
    const cars = B.caracteristiques(jeu);
    const cout = (v) => Object.values(v).reduce((s, x) => s + (B.COUT_POINTS[x] ?? 99), 0);
    if (!ui.repartir) return assigner(jeu, ui, B.TABLEAU_STANDARD, origine);
    return ui.repartir({
      titre: 'Achat de points',
      lignes: cars.map((k) => ({ id: k.id, nom: k.nom, valeur: 8, min: 8, max: 15 })),
      entete: (v) => `Points dépensés : ${cout(v)} / 27`,
      detail: (id, v) => { const b = Number(origine?.bonus?.[id]) || 0; return `${b ? `${v[id] + b} (${B.signe(b)}) · ` : ''}mod ${B.signe(B.mod(v[id] + b))} · coûte ${B.COUT_POINTS[v[id]]}`; },
      permis: (v) => cout(v) <= 27,
      valide: (v) => (cout(v) === 27 ? '' : `Il reste ${27 - cout(v)} point${27 - cout(v) > 1 ? 's' : ''} à dépenser (tu peux valider quand même).`),
    });
  }
  // 4d6 : six fois, le plus petit dé ne compte pas.
  async function lancer4d6(jeu, partie, ui, origine, qui) {
    const valeurs = [], lignes = [];
    for (let k = 0; k < 6; k++) {
      const r = D.lancer(partie, '4d6');
      const plusPetit = r.des.reduce((m, x, i) => (x.valeur < r.des[m].valeur ? i : m), 0);
      r.des[plusPetit].garde = false;
      const total = r.total - r.des[plusPetit].valeur;
      valeurs.push(total);
      lignes.push(D.noter(partie, { qui, quoi: `Caractéristique ${k + 1}`, formule: '4d6', des: r.des, total }));
    }
    await T.montrer(ui, '4d6, six fois', lignes);
    await ui.dire(`Tes valeurs : ${valeurs.join(', ')}.`);
    return assigner(jeu, ui, valeurs, origine);
  }

  // Les compétences : celles que sa classe laisse choisir (et celles de son origine, déjà là).
  async function competences(jeu, ui, c) {
    const k = P.classe(jeu, c);
    const deOrigine = P.origine(jeu, c)?.maitrises?.competences || [];
    const parmi = (k?.competences_choix?.parmi?.length ? k.competences_choix.parmi : B.competences(jeu).map((x) => x.id)).filter((id) => !deOrigine.includes(id) && B.trouver(jeu, 'competences', id));
    // Le nombre : celui de la classe, plus celles que l'origine laisse choisir (le demi-elfe : 2).
    const enPlus = B.borne(Number(P.origine(jeu, c)?.competences_choix?.nombre) || 0, 0, 18);
    const max = Math.min(parmi.length, B.borne(Number(k?.competences_choix?.nombre ?? 2) + enPlus, 0, 18));
    const choisis = new Set();
    let i = 0;
    while (max > 0) {
      i = await ui.liste({
        titre: `Compétences de ${c.nom || 'ton personnage'}`, entete: `${choisis.size} / ${max}`, depart: i, annulable: false, large: true,
        note: deOrigine.length ? `Déjà maîtrisées grâce à ton origine : ${deOrigine.map((id) => B.nomCompetence(jeu, id)).join(', ')}.` : '',
        items: [...parmi.map((id) => ({ texte: `${choisis.has(id) ? '✔ ' : '   '}${B.nomCompetence(jeu, id)}`, detail: B.courtCarac(jeu, P.caracDe(jeu, id)), desactive: choisis.size >= max && !choisis.has(id) })),
          { texte: 'Valider', detail: choisis.size < max ? `encore ${max - choisis.size} à choisir` : '', desactive: choisis.size < max }],
      });
      if (i === parmi.length) break;
      const id = parmi[i];
      if (choisis.has(id)) choisis.delete(id); else if (choisis.size < max) choisis.add(id);
    }
    c.competences = [...choisis];
  }

  // L'équipement de départ : dans le sac, et ce qui se porte est porté (la meilleure armure, la première
  // arme, un bouclier si la main gauche est libre).
  function equiperDepart(jeu, partie, c) {
    const k = P.classe(jeu, c);
    for (const x of k?.equipement_depart || []) {
      const o = P.objet(jeu, x.objet);
      if (o) partie.sac[o.id] = (partie.sac[o.id] || 0) + Math.max(1, Number(x.nombre) || 1);
    }
    const dans = Object.keys(partie.sac).map((id) => P.objet(jeu, id)).filter(Boolean);
    const armures = dans.filter((o) => P.placeDe(o) === 'armure' && (P.maitrises(jeu, c).armures.includes(P.armure(o).type))).sort((a, b) => P.armure(b).ca - P.armure(a).ca);
    if (armures[0] && !c.equipement.armure) P.equiper(jeu, partie, c, 'armure', armures[0].id);
    const armes = dans.filter((o) => P.arme(o) && P.maitriseArme(jeu, c, o));
    if (armes[0] && !c.equipement.arme) P.equiper(jeu, partie, c, 'arme', armes[0].id);
    const bouclier = dans.find((o) => P.armure(o)?.type === 'bouclier' && P.maitrises(jeu, c).armures.includes('bouclier'));
    if (bouclier && !c.equipement.seconde && P.peutMettre(jeu, c, bouclier, 'seconde') && partie.sac[bouclier.id] > 0) P.equiper(jeu, partie, c, 'seconde', bouclier.id);
    if (k?.or_depart) partie.argent = (partie.argent || 0) + (/d/.test(String(k.or_depart)) ? D.lancer(partie, k.or_depart).total : Number(k.or_depart) || 0);
    c.pv = P.pvMax(jeu, c);
  }

  // La création complète. Rend le personnage (pas encore rangé dans le groupe), ou null (abandon,
  // seulement si `annulable`).
  async function creer({ jeu, partie, ui, numero = 1, annulable = false }) {
    const R = B.regles(jeu);
    const niveau = B.borne(Number(R.creation.niveau_depart) || 1, 1, 20);
    for (;;) {
      // 1. Un pré-tiré ?
      const pt = R.creation.pretires ? pretires(jeu).filter((p) => !partie.equipe.some((c) => c.creature === p.id)) : [];
      if (pt.length) {
        const i = await ui.liste({
          titre: numero > 1 ? `Personnage n° ${numero}` : 'Ton personnage', annulable, large: true,
          items: [{ texte: 'Créer un nouveau personnage', detail: 'origine, classe, caractéristiques…' },
            ...pt.map((p) => ({ texte: p.nom, image: (p.portraits || [])[0]?.png || Sprites.vignette(jeu, p), detail: `${B.trouver(jeu, 'origines', p.jdr.origine)?.nom || ''} · ${B.trouver(jeu, 'classes_jdr', p.jdr.classe)?.nom || ''} · niv. ${p.jdr.niveau || niveau}` }))],
        });
        if (i == null) return null;
        if (i > 0) {
          const c = P.creer(jeu, pt[i - 1].id, Number(pt[i - 1].jdr.niveau) || niveau);
          // Un pré-tiré sans équipement écrit dans Tafl reçoit celui de sa classe.
          if (c && !Object.values(pt[i - 1].jdr.equipement || {}).some(Boolean)) equiperDepart(jeu, partie, c);
          if (c) return c;
        }
      }
      if (!B.liste(jeu, 'classes_jdr').length) {
        await ui.dire('(Ce jeu n\'a pas encore de classe : dans Tafl, Données › Classes, ou « Charger le modèle D&D 5e » dans Réglages.)');
        return P.depuis(jeu, { creature: jeu.heros?.id || [...jeu.personnages.keys()][0], nom: partie.nom, niveau });
      }
      // 2. Son nom.
      const nom = await ui.texte({ titre: 'Comment s\'appelle ton personnage ?', valeur: numero === 1 ? partie.nom || '' : '', max: 16, vide: 'Héros' });
      if (nom == null && annulable) return null;
      // 3. Son apparence : les personnages du jeu qui ont un sprite (le héros d'abord).
      const apparences = [...jeu.personnages.values()].filter((p) => p.sprite || p.heros).sort((a, b) => Number(Boolean(b.heros)) - Number(Boolean(a.heros)));
      let creature = jeu.heros?.id || apparences[0]?.id || [...jeu.personnages.keys()][0];
      if (apparences.length > 1) {
        const i = await ui.liste({ titre: 'Son apparence', annulable: false, items: apparences.map((p) => ({ texte: p.heros ? `${p.nom} (le héros)` : p.nom, image: Sprites.vignette(jeu, p) })) });
        creature = apparences[i ?? 0].id;
      }
      // 4. Son origine.
      const origines = B.liste(jeu, 'origines');
      let origine = null;
      if (origines.length) {
        const i = await ui.liste({ titre: 'Son origine', annulable: false, large: true, items: origines.map((o) => ({ texte: o.nom, detail: [bonusTexte(jeu, o.bonus), B.distance(jeu, o.vitesse || 9), (o.traits || []).map((t) => t.nom).slice(0, 3).join(', ')].filter(Boolean).join(' · ') })) });
        origine = origines[i ?? 0];
      }
      // 5. Sa classe.
      const classes = B.liste(jeu, 'classes_jdr');
      const ik = await ui.liste({
        titre: 'Sa classe', annulable: false, large: true,
        items: classes.map((k) => ({ texte: k.nom, detail: `d${k.de_vie || 8} · ${(k.carac_principale ? [k.carac_principale].flat() : []).map((x) => B.nomCarac(jeu, x)).join(' ou ')}${k.lanceur?.type && k.lanceur.type !== 'aucun' ? ' · sorts' : ''}` })),
      });
      const classe = classes[ik ?? 0];
      // 6. Ses caractéristiques.
      const methodes = (R.creation.methodes || []).filter((m) => METHODES[m]);
      let m = methodes[0] || 'standard';
      if (methodes.length > 1) {
        const i = await ui.liste({ titre: 'Ses caractéristiques', annulable: false, note: classe.carac_principale ? `Pour un ${classe.nom.toLowerCase()}, mets ta meilleure valeur en ${[classe.carac_principale].flat().map((x) => B.nomCarac(jeu, x)).join(' ou ')}.` : '', items: methodes.map((x) => ({ texte: METHODES[x] })) });
        m = methodes[i ?? 0];
      }
      const carac = m === 'points' ? await acheter(jeu, ui, origine) : m === 'des' ? await lancer4d6(jeu, partie, ui, origine, nom || 'Héros') : await assigner(jeu, ui, B.TABLEAU_STANDARD, origine);
      if (!carac) continue;
      const c = P.depuis(jeu, { creature, nom: nom || 'Héros', origine: origine?.id || '', classe: classe.id, niveau, carac });
      // Plus haut que le niveau 1 : les PV des niveaux suivants valent la moyenne.
      c.pv_niveaux = Array.from({ length: niveau - 1 }, () => Math.floor(P.deVie(jeu, c) / 2) + 1);
      // 7. Ses compétences ; 8. ses sorts.
      await competences(jeu, ui, c);
      if (P.lanceur(jeu, c)) await JdrHorsCombat.choisirSorts(jeu, ui, c);
      // 9. Le récapitulatif.
      const sac = { ...partie.sac }, argent = partie.argent;
      equiperDepart(jeu, partie, c);
      if (ui.fiche) await ui.fiche({ fiches: [JdrFiches.fiche(jeu, c)], i: 0 });
      const ok = await ui.liste({ titre: `${P.nom(jeu, c)}, ${P.origine(jeu, c)?.nom || ''} ${classe.nom.toLowerCase()} de niveau ${c.niveau}`, annulable: false, items: [{ texte: 'C\'est parti !' }, { texte: 'Recommencer ce personnage' }] });
      if (ok === 0) return c;
      partie.sac = sac;
      partie.argent = argent;
    }
  }

  return { creer, equiperDepart, pretires, METHODES };
})();
