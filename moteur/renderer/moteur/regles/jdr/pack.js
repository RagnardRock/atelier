// Le pack JDR (Saga 0.13) : un jeu de rôle sur table façon D&D 5e (SRD 5.1). Ce fichier rassemble ses
// morceaux (base, des, personnage, tests, combat, hors-combat, creation, fiches) dans l'objet que la
// façade `Regles` attend (voir regles.js et REGLES.md › « Le pack JDR »).
//
// En plus du contrat commun, ce pack apporte (Saga 0.13, facultatifs pour les autres packs) :
//   commandes      les commandes des événements qu'il sait jouer : test, sauvegarde, test_oppose, jet,
//                  repos, xp, etat, creer_personnage (FORMAT.md › « Le pack JDR »)
//   condition      ses conditions : jdr_perception, jdr_maitrise, jdr_etat, jdr_classe, jdr_origine, jdr_niveau
//   debut          au début d'une nouvelle partie, quand le joueur est libre : la création des personnages
//   actionsPause   des choix en plus dans le menu de pause : Jets de dés, Se reposer
//   pourScript     ce qu'un script JS lit de chaque personnage (saga.fiche)

const Jdr = (() => {
  const B = JdrBase, P = JdrPerso, T = JdrTests, H = JdrHorsCombat;

  // Les membres visés par une commande : 'tous' (par défaut), 'premier', 'choix' (le joueur choisit).
  async function vises(jeu, partie, ui, qui, titre) {
    const l = partie.equipe.filter((c) => c.jdr && !c.mort_definitive);
    if (qui === 'premier') return l.slice(0, 1);
    if (qui === 'choix' && l.length > 1) {
      const i = await ui.liste({ titre, items: H.lignes(jeu, { equipe: l }) });
      return i == null ? [] : [l[i]];
    }
    return l;
  }
  // Des dégâts hors combat (un piège) : jamais sous 1 PV pour le dernier debout, pour ne pas bloquer le jeu.
  function blesserHorsCombat(jeu, partie, c, n) {
    const autres = partie.equipe.some((x) => x !== c && x.jdr && x.pv > 0);
    let reste = n;
    if (c.pv_temp > 0) { const t = Math.min(c.pv_temp, reste); c.pv_temp -= t; reste -= t; }
    c.pv = Math.max(autres ? 0 : 1, c.pv - reste);
    if (c.pv <= 0) { c.stable = true; c.mort = { succes: 0, echecs: 0 }; }
    return n;
  }

  // Les commandes des événements (scripts.js les joue par Regles.commande). o : { jeu, partie, ui,
  // c (la commande), jouer(commandes) (une branche), narrer(texte), ranger(membre) }. Rend un résultat
  // simple (pour un script JS : saga.test…), ou rien.
  const commandes = {
    async test({ jeu, partie, ui, c, jouer }) {
      const r = await T.tester({ jeu, partie, ui, competence: c.competence || 'perception', dd: B.borne(Number(c.dd) || 10, 1, 40), qui: c.qui || 'choix', avantage: Boolean(c.avantage), desavantage: Boolean(c.desavantage), sauvegarde: Boolean(c.sauvegarde), quoi: c.quoi || '' });
      if (r.annule) return { reussi: false, annule: true };
      if (c.variable) partie.variables[c.variable] = r.total;
      await jouer(r.reussi ? c.reussi : c.rate);
      return { reussi: r.reussi, total: r.total || 0, membre: r.membre ? P.nom(jeu, r.membre) : '', naturel: r.resultats?.[0]?.naturel || 0 };
    },
    async sauvegarde({ jeu, partie, ui, c, jouer, narrer }) {
      const carac = c.carac || 'dex', dd = B.borne(Number(c.dd) || 10, 1, 40);
      const l = await vises(jeu, partie, ui, c.qui || 'tous', `Sauvegarde de ${B.nomCarac(jeu, carac)} : qui ?`);
      const debout = l.filter((x) => x.pv > 0);
      const resultats = [];
      for (const x of debout) resultats.push({ x, ...(await T.sauvegarde({ jeu, partie, ui, c: x, carac, dd, quoi: c.quoi || '', montrerJet: false })) });
      await T.montrer(ui, `${c.quoi || `Sauvegarde de ${B.nomCarac(jeu, carac)}`} · DD ${dd}`, resultats.map((r) => r.ligne));
      const tous = resultats.every((r) => r.reussi);
      // Des dégâts (la moitié en cas de réussite si `moitie`) et un état pour ceux qui ratent.
      if (c.degats) {
        const r = JdrDes.lancer(partie, c.degats);
        await T.montrer(ui, 'Dégâts', [JdrDes.noter(partie, { quoi: `Dégâts (${B.nomDegats(c.type_degats).toLowerCase() || '—'})`, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
        const textes = [];
        for (const s of resultats) {
          const n = s.reussi ? (c.moitie ? Math.floor(r.total / 2) : 0) : r.total;
          if (n > 0) { blesserHorsCombat(jeu, partie, s.x, n); textes.push(`${P.nom(jeu, s.x)} perd ${n} PV${s.x.pv <= 0 ? ' et s\'effondre' : ''}.`); }
          else textes.push(`${P.nom(jeu, s.x)} s'en sort indemne.`);
        }
        if (textes.length) await narrer(textes.join(' '));
      }
      if (c.etat) for (const s of resultats) if (!s.reussi && !(s.x.etats || []).includes(c.etat)) { s.x.etats = [...(s.x.etats || []), c.etat]; await narrer(`${P.nom(jeu, s.x)} est ${B.nomEtat(jeu, c.etat).toLowerCase()}.`); }
      await jouer(tous ? c.reussi : c.rate);
      return { reussi: tous, reussis: resultats.filter((r) => r.reussi).length, total: resultats.length };
    },
    async test_oppose({ jeu, partie, ui, c, jouer }) {
      const r = await T.oppose({ jeu, partie, ui, competence: c.competence || 'athletisme', contre: Number(c.contre) || 0, monstre: c.monstre || '', competenceAdverse: c.competence_adverse || '', nomAdverse: c.nom_adverse || '', qui: c.qui || 'choix' });
      if (r.annule) return { reussi: false, annule: true };
      await jouer(r.reussi ? c.reussi : c.rate);
      return { reussi: r.reussi, total: r.total || 0, adverse: r.adverse || 0 };
    },
    async jet({ jeu, partie, ui, c }) {
      const ligne = await T.jet({ jeu, partie, ui, formule: c.formule || 'd20', quoi: c.quoi || `Jet de ${c.formule || 'd20'}`, qui: '' });
      if (c.variable) partie.variables[c.variable] = ligne.total;
      return { total: ligne.total, des: ligne.des.map((x) => x.valeur) };
    },
    async repos({ jeu, partie, ui, c }) {
      await H.repos({ jeu, partie, ui, sorte: c.sorte === 'court' ? 'court' : 'long' });
    },
    async xp({ jeu, partie, ui, c, narrer }) {
      const l = partie.equipe.filter((x) => x.jdr && !x.mort_definitive);
      if (c.jalon) {
        await narrer('Un nouveau palier de l\'aventure est franchi !');
        for (const x of l) await H.monterNiveau(jeu, partie, ui, x, { jalon: true });
        return;
      }
      const n = Math.max(0, Math.round(Number(c.montant) || 0));
      if (!n) return;
      for (const x of l) x.xp += n;
      await narrer(`Chaque héros gagne ${n} XP.`);
      for (const x of l) if (P.peutMonter(jeu, x)) await narrer(`${P.nom(jeu, x)} peut passer au niveau ${x.niveau + 1} ! (menu ${Regles.menus(jeu).equipe} › ${P.nom(jeu, x)})`);
    },
    async etat({ jeu, partie, ui, c, narrer }) {
      if (!c.etat) return;
      for (const x of await vises(jeu, partie, ui, c.qui || 'tous', `${B.nomEtat(jeu, c.etat)} : qui ?`)) {
        const a = (x.etats || []).includes(c.etat);
        if (c.action === 'retirer') { if (a) { x.etats = x.etats.filter((e) => e !== c.etat); await narrer(`${P.nom(jeu, x)} n'est plus ${B.nomEtat(jeu, c.etat).toLowerCase()}.`); } }
        else if (!a) { x.etats = [...(x.etats || []), c.etat]; await narrer(`${P.nom(jeu, x)} est ${B.nomEtat(jeu, c.etat).toLowerCase()}.`); }
      }
    },
    async creer_personnage({ jeu, partie, ui, ranger, narrer }) {
      const c = await JdrCreation.creer({ jeu, partie, ui, numero: partie.equipe.length + 1, annulable: true });
      if (!c) return;
      const ou = ranger(c);
      await narrer(ou.ou === 'equipe' ? `${P.nom(jeu, c)} rejoint le groupe !` : `Le groupe est complet : ${P.nom(jeu, c)} attend dans la ${ou.pc}.`);
    },
  };

  // Les conditions du pack (Monde.vraie les lui passe).
  function condition(jeu, cond, partie) {
    const l = (partie.equipe || []).filter((c) => c?.jdr && !c.mort_definitive);
    switch (cond.type) {
      case 'jdr_perception': return l.some((c) => P.perceptionPassive(jeu, c) >= (Number(cond.min) || 10));
      case 'jdr_maitrise': return l.some((c) => P.competencesMaitrisees(jeu, c).includes(cond.competence));
      case 'jdr_etat': return l.some((c) => (c.etats || []).includes(cond.etat)) === (cond.valeur !== false);
      case 'jdr_classe': return l.some((c) => c.classe === cond.classe);
      case 'jdr_origine': return l.some((c) => c.origine === cond.origine);
      case 'jdr_niveau': return l.some((c) => c.niveau >= (Number(cond.min) || 1));
      default: return undefined;
    }
  }

  const pack = {
    nom: 'jdr',
    ecran: 'groupe',
    capacites: { capture: false, relacher: false, ev: false, vendre: false, groupe: true, tenir: false },
    menus: {
      equipe: 'Groupe', dex: 'Bestiaire', dex_visible: true, pc: 'Réserve', boite: 'Réserve',
      places: 12, colonnes: 4, forme_boites: 'liste',
      pages: ['infos', 'caracteristiques', 'competences', 'combat', 'sorts', 'inventaire', 'traits'],
      toutes_pages: [['infos', 'Infos'], ['caracteristiques', 'Caractéristiques'], ['competences', 'Compétences'], ['combat', 'Combat'], ['sorts', 'Sorts'], ['inventaire', 'Équipement'], ['traits', 'Traits']],
      dex_pris: 'Vaincus', dex_pris_un: 'vaincu',
      dex_vide: 'Tu n\'as encore croisé aucun monstre. Ceux que tu rencontres en combat s\'inscrivent ici.',
    },
    existe: (jeu, id) => jeu.personnages.has(id),
    creer: (jeu, id, niveau) => P.creer(jeu, id, niveau),
    completer: (jeu, c) => P.completer(jeu, c),
    soigner: (jeu, c) => P.soigner(jeu, c),
    resume(jeu, c) {
      return {
        nom: P.nom(jeu, c), niveau: c.niveau, pv: Math.max(0, c.pv), pvMax: P.pvMax(jeu, c),
        statut: c.mort_definitive ? 'MORT' : c.pv <= 0 ? 'À TERRE' : (c.etats || []).map((e) => B.nomEtat(jeu, e).slice(0, 3).toUpperCase()).join(' '),
        image: P.portrait(jeu, c), apparence: P.apparence(jeu, c),
      };
    },
    rencontre(jeu, zone, partie) {
      const possibles = (zone.rencontres || []).filter((r) => B.trouver(jeu, 'groupes', r.groupe));
      const total = possibles.reduce((s, r) => s + Math.max(0, Number(r.chance) || 0), 0);
      if (!possibles.length || total <= 0) return null;
      let tirage = JdrDes.aleatoire(partie) * total;
      const r = possibles.find((q) => (tirage -= Math.max(0, Number(q.chance) || 0)) < 0) || possibles[0];
      return { groupe: r.groupe };
    },
    combattre: (o) => JdrCombat.lancer(o),
    utilisable: (jeu, objet) => H.utilisable(objet),
    utiliserObjet: (o) => H.utiliserObjet(o),
    ecranEv: async ({ ui }) => { await ui.dire('(Ce jeu n\'a pas de points d\'effort : c\'est une commande des jeux Pokémon.)'); },
    prixCreature: () => 0,
    fiche: (jeu, c) => JdrFiches.fiche(jeu, c),
    dex: (jeu) => ({ nom: 'Bestiaire', especes: JdrFiches.especes(jeu) }),
    ficheEspece: (jeu, id, etat) => JdrFiches.ficheEspece(jeu, id, etat),
    // Une partie neuve : sans création de personnage, le héros (et sa fiche de pré-tiré) est déjà là ;
    // avec, la création se fait au début (debut), quand le joueur est libre.
    nouvellePartie(jeu, partie) {
      const R = B.regles(jeu);
      JdrDes.etat(partie);
      partie.jdr.creer = R.creation.active ? B.borne(Number(R.creation.nombre) || 1, 1, 6) : 0;
      if (!R.creation.active && jeu.heros && !partie.equipe.some((c) => c.creature === jeu.heros.id)) {
        const c = P.creer(jeu, jeu.heros.id);
        if (c) partie.equipe.push(c);
      }
    },
    async debut({ jeu, partie, ui, ranger }) {
      const n = Number(partie.jdr?.creer) || 0;
      if (!n) return;
      partie.jdr.creer = 0;
      if (partie.equipe.length) return; // un test rapide de Tafl a déjà mis son groupe
      for (let k = 1; k <= n; k++) {
        const c = await JdrCreation.creer({ jeu, partie, ui, numero: k, annulable: k > 1 });
        if (!c) break;
        if (k === 1 && c.nom) partie.nom = c.nom;
        ranger(c);
      }
    },
    actionsMembre: (jeu, c) => H.actionsMembre(jeu, c),
    agirMembre: (o) => H.agirMembre(o),
    rejoindre(jeu, partie, id, niveau) {
      const parti = partie.partis?.[id];
      if (parti) { delete partie.partis[id]; return P.completer(jeu, parti); }
      return P.creer(jeu, id, niveau);
    },
    actionsPause: (jeu) => [['jets', 'Jets de dés', 'symbol-numeric'], ...(B.regles(jeu).repos_menu ? [['repos', 'Se reposer', 'coffee']] : [])],
    agirPause: async ({ jeu, partie, ui, id }) => {
      if (id === 'jets') await H.journal({ jeu, partie, ui });
      else if (id === 'repos') await H.repos({ jeu, partie, ui });
    },
    commandes,
    condition,
    pourScript: (jeu, partie) => (partie.equipe || []).filter((c) => c?.jdr).map((c) => JdrFiches.pourScript(jeu, c)),
  };
  return { pack };
})();
