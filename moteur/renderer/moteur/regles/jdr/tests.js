// Le pack JDR (Saga 0.13) : les tests (d20 + bonus contre un DD), hors combat comme en combat.
//
//   test         un personnage, une compétence ou une caractéristique, un DD
//   sauvegarde   un personnage, une caractéristique, un DD
//   tester       le groupe : qui lance ? (le joueur choisit, le meilleur, chacun, test de groupe)
//   oppose       une compétence du groupe contre celle d'un PNJ ou d'un monstre
//
// Chaque jet passe par les dés du pack (des.js : graine dans la partie, journal), est montré sur le
// plateau de dés (ui.des, s'il y en a un) et peut être changé par une règle maison (formules `test` et
// `sauvegarde`, Maison.formule). Le moteur ne fait que montrer : tout se décide ici, partie en entrée,
// résultat en sortie.

const JdrTests = (() => {
  const B = JdrBase, P = JdrPerso, D = JdrDes;

  // Montrer des jets sur le plateau (le moteur le prête : ui.des). Sans plateau, rien.
  async function montrer(ui, titre, lignes) {
    if (ui?.des && lignes.length) await ui.des({ titre, lignes });
  }
  const effets = (jeu, c, extra = []) => P.effetsEtats(jeu, [...(c.etats || []), ...extra]);
  const debout = (c) => c.pv > 0 && !c.mort_definitive;

  // Un test de compétence (ou de caractéristique pure) d'un personnage. Rend
  // { reussi, total, naturel, bonus, ligne }. dd 0 : un jet sans DD (le MJ dira).
  async function test({ jeu, partie, ui, c, competence, dd = 0, avantage = false, desavantage = false, quoi = '', montrerJet = true, etatsCombat = [] }) {
    const ef = effets(jeu, c, etatsCombat);
    const des = D.d20(partie, { avantage, desavantage: desavantage || ef.has('desavantage_tests') });
    const bonus = P.bonusCompetence(jeu, c, competence);
    const normal = des.naturel + bonus;
    const total = Math.round(await Maison.formule('test', {
      naturel: des.naturel, bonus, dd: Number(dd) || 0, competence, carac: P.caracDe(jeu, competence), maitrise: P.competencesMaitrisees(jeu, c).includes(competence),
    }, () => normal));
    const reussi = !dd || total >= dd;
    const ligne = D.noter(partie, {
      qui: P.nom(jeu, c), quoi: quoi || B.nomCompetence(jeu, competence), formule: 'd20', des: des.des, bonus: total - des.naturel, total,
      contre: dd ? `DD ${dd}` : '', resultat: dd ? (reussi ? 'reussi' : 'rate') : '', mode: des.mode,
    });
    if (montrerJet) await montrer(ui, quoi || B.nomCompetence(jeu, competence), [ligne]);
    return { reussi, total, naturel: des.naturel, bonus, ligne };
  }

  // Une sauvegarde. echec_for_dex (étourdi, paralysé…) : ratée d'office en Force et en Dextérité.
  async function sauvegarde({ jeu, partie, ui, c, carac, dd, avantage = false, desavantage = false, quoi = '', montrerJet = true, etatsCombat = [], bonusPlus = 0 }) {
    const ef = effets(jeu, c, etatsCombat);
    const nom = `Sauvegarde de ${B.nomCarac(jeu, carac)}`;
    if (ef.has('echec_for_dex') && (carac === 'for' || carac === 'dex')) {
      const ligne = D.noter(partie, { qui: P.nom(jeu, c), quoi: quoi || nom, formule: '', total: 0, contre: `DD ${dd}`, resultat: 'rate' });
      if (montrerJet) await montrer(ui, quoi || nom, [ligne]);
      return { reussi: false, total: 0, naturel: 0, bonus: 0, ligne };
    }
    const des = D.d20(partie, { avantage, desavantage: desavantage || (carac === 'dex' && ef.has('desavantage_sauvegardes_dex')) });
    const bonus = P.bonusSauvegarde(jeu, c, carac) + (Number(bonusPlus) || 0);
    const total = Math.round(await Maison.formule('sauvegarde', {
      naturel: des.naturel, bonus, dd: Number(dd) || 0, carac, maitrise: P.maitriseSauvegarde(jeu, c, carac),
    }, () => des.naturel + bonus));
    const reussi = total >= dd;
    const ligne = D.noter(partie, {
      qui: P.nom(jeu, c), quoi: quoi || nom, formule: 'd20', des: des.des, bonus: total - des.naturel, total,
      contre: `DD ${dd}`, resultat: reussi ? 'reussi' : 'rate', mode: des.mode,
    });
    if (montrerJet) await montrer(ui, quoi || nom, [ligne]);
    return { reussi, total, naturel: des.naturel, bonus, ligne };
  }

  // Le « MJ » peut garder le jet ou forcer le résultat (règle maison mj_decide), en vraie partie.
  async function mjDecide(jeu, ui, reussi) {
    if (!B.regles(jeu).mj_decide || !ui?.liste) return reussi;
    const i = await ui.liste({ titre: 'Le MJ décide', annulable: false, items: [{ texte: `Garder le jet (${reussi ? 'réussi' : 'raté'})` }, { texte: 'Forcer la réussite' }, { texte: 'Forcer l\'échec' }] });
    return i === 1 ? true : i === 2 ? false : reussi;
  }

  // Le test du groupe (bloc « Test » de Tafl). qui :
  //   'choix'    le joueur choisit qui le tente (par défaut)
  //   'meilleur' celui qui a le meilleur bonus
  //   'premier'  le premier du groupe (le héros)
  //   'tous'     chacun lance ; réussi si l'un d'eux réussit (chercher, repérer)
  //   'groupe'   chacun lance ; réussi si au moins la moitié réussit (test de groupe de la 5e)
  // sauvegarde : une sauvegarde au lieu d'un test (competence est alors une caractéristique).
  // Rend { reussi, membre, resultats, annule } (annule : le joueur a refusé de choisir).
  async function tester({ jeu, partie, ui, competence, dd = 10, qui = 'choix', avantage = false, desavantage = false, sauvegarde: estSauvegarde = false, quoi = '' }) {
    const membres = partie.equipe.filter((c) => c.jdr && debout(c) && !effets(jeu, c).has('incapable'));
    if (!membres.length) return { reussi: false, membre: null, resultats: [], annule: false };
    const bonusDe = (c) => (estSauvegarde ? P.bonusSauvegarde(jeu, c, competence) : P.bonusCompetence(jeu, c, competence));
    const nomTest = quoi || (estSauvegarde ? `Sauvegarde de ${B.nomCarac(jeu, competence)}` : B.nomCompetence(jeu, competence));
    const lancer = (c, montrerJet) => (estSauvegarde
      ? sauvegarde({ jeu, partie, ui, c, carac: competence, dd, avantage, desavantage, quoi: nomTest, montrerJet })
      : test({ jeu, partie, ui, c, competence, dd, avantage, desavantage, quoi: nomTest, montrerJet }));
    let choisis;
    if (qui === 'tous' || qui === 'groupe') choisis = membres;
    else if (qui === 'meilleur') choisis = [[...membres].sort((a, b) => bonusDe(b) - bonusDe(a))[0]];
    else if (qui === 'premier' || membres.length === 1) choisis = [membres[0]];
    else {
      const i = await ui.liste({
        titre: `${nomTest} (DD ${dd}) : qui le tente ?`,
        items: membres.map((c) => ({ texte: P.nom(jeu, c), detail: `${B.signe(bonusDe(c))}${!estSauvegarde && P.competencesMaitrisees(jeu, c).includes(competence) ? ' · maîtrisé' : ''}`, image: P.portrait(jeu, c) || '' })),
      });
      if (i == null) return { reussi: false, membre: null, resultats: [], annule: true };
      choisis = [membres[i]];
    }
    const resultats = [];
    for (const c of choisis) resultats.push({ c, ...(await lancer(c, false)) });
    await montrer(ui, `${nomTest} · DD ${dd}`, resultats.map((r) => r.ligne));
    const ok = resultats.filter((r) => r.reussi).length;
    let reussi = qui === 'groupe' ? ok >= Math.ceil(resultats.length / 2) : ok > 0;
    reussi = await mjDecide(jeu, ui, reussi);
    const meilleur = [...resultats].sort((a, b) => b.total - a.total)[0];
    return { reussi, membre: (resultats.find((r) => r.reussi) || meilleur)?.c || null, total: meilleur?.total || 0, resultats, annule: false };
  }

  // Un test opposé : la compétence d'un héros contre un bonus (un PNJ : « Tromperie +3 ») ou la
  // compétence d'un monstre de monstres_jdr. Égalité : celui qui tente échoue.
  async function oppose({ jeu, partie, ui, competence, contre = 0, monstre = '', competenceAdverse = '', nomAdverse = '', qui = 'choix' }) {
    const m = monstre ? B.trouver(jeu, 'monstres_jdr', monstre) : null;
    const compA = competenceAdverse || competence;
    let bonusA = Number(contre) || 0;
    if (m) {
      const k = Number(m.competences?.[compA]);
      bonusA = Number.isFinite(k) && m.competences?.[compA] !== undefined ? k : B.mod(Number(m.carac?.[B.trouver(jeu, 'competences', compA)?.carac || compA]) || 10);
    }
    const adv = nomAdverse || m?.nom || 'L\'adversaire';
    const membres = partie.equipe.filter((c) => c.jdr && debout(c));
    if (!membres.length) return { reussi: false, membre: null };
    let c = membres[0];
    if (qui === 'meilleur') c = [...membres].sort((a, b) => P.bonusCompetence(jeu, b, competence) - P.bonusCompetence(jeu, a, competence))[0];
    else if (qui === 'choix' && membres.length > 1) {
      const i = await ui.liste({ titre: `${B.nomCompetence(jeu, competence)} contre ${adv} : qui ?`, items: membres.map((x) => ({ texte: P.nom(jeu, x), detail: B.signe(P.bonusCompetence(jeu, x, competence)) })) });
      if (i == null) return { reussi: false, membre: null, annule: true };
      c = membres[i];
    }
    const moi = await test({ jeu, partie, ui, c, competence, montrerJet: false });
    const lui = D.d20(partie);
    const ligneLui = D.noter(partie, { qui: adv, quoi: B.nomCompetence(jeu, compA), formule: 'd20', des: lui.des, bonus: bonusA, total: lui.naturel + bonusA });
    let reussi = moi.total > ligneLui.total;
    moi.ligne.contre = `${ligneLui.total}`;
    moi.ligne.resultat = reussi ? 'reussi' : 'rate';
    await montrer(ui, `${B.nomCompetence(jeu, competence)} contre ${adv}`, [moi.ligne, ligneLui]);
    reussi = await mjDecide(jeu, ui, reussi);
    return { reussi, membre: c, total: moi.total, adverse: ligneLui.total };
  }

  // Un jet de dés libre (bloc « Jet de dés », la barre du journal). Rend la ligne du journal.
  async function jet({ jeu, partie, ui, formule, quoi = 'Jet de dés', qui = '' }) {
    const r = D.lancer(partie, formule);
    const ligne = D.noter(partie, { qui, quoi, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total });
    await montrer(ui, quoi, [ligne]);
    return ligne;
  }

  return { montrer, test, sauvegarde, tester, oppose, jet, mjDecide, debout, effets };
})();
