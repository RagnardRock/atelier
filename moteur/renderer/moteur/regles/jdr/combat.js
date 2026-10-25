// Le pack JDR (Saga 0.13) : les combats au d20, façon D&D 5e, sur l'écran de groupe (ecran-groupe.js).
//
// Pas encore de grille ni de déplacements : ce sera le mode « table » (pions, brouillard), qui reprendra
// exactement ces règles. Un combat :
//   1. l'initiative : d20 + Dex pour chacun, du plus grand au plus petit ;
//   2. chacun à son tour : une action (Attaquer, Sort, Objet, Esquiver, Aider, Se cacher, Fuir), puis
//      une action bonus s'il en a une (attaque de la main gauche, Second souffle, Rage, sort rapide) ;
//   3. une attaque : d20 + bonus contre la CA ; 20 naturel = critique (dés de dégâts doublés) ;
//   4. un sort : un emplacement dépensé, un jet d'attaque de sort ou une sauvegarde contre le DD ;
//   5. à 0 PV, un héros tombe et fait ses jets contre la mort ; tout le groupe à terre = défaite.
//
// Tout ce qui change pendant le combat vit dans `rencontre` (l'initiative, le tour, les états, les
// bonus des sorts), à part de l'écran : le mode « table » le reprendra tel quel. La partie n'est changée
// qu'à la fin (PV, ressources, emplacements, XP, or, butin, bestiaire). Les dés passent par des.js et
// sont montrés sur le plateau (ui.des) ; les formules remplaçables par une règle maison (attaque,
// degats, critique, initiative, soin, experience) passent par Maison.formule.

const JdrCombat = (() => {
  const B = JdrBase, P = JdrPerso, D = JdrDes, T = JdrTests;
  const LETTRES = 'ABCDEFGHIJ';
  const MAX_MONSTRES = 8;
  const PHYSIQUES = ['contondant', 'perforant', 'tranchant'];
  // « 3 Gobelins », « 2 Rats géants », « 2 Ours bruns » : chaque mot avant « de » prend la marque du pluriel.
  function pluriel(nom) {
    const [avant, ...apres] = String(nom).split(/(?= de | d'| du )/);
    const mot = (w) => (/[sxz]$/i.test(w) || !/[a-zàâäéèêëîïôöùûüç]$/i.test(w) ? w : /al$/i.test(w) ? `${w.slice(0, -2)}aux` : /(eau|eu)$/i.test(w) ? `${w}x` : `${w}s`);
    return [avant.split(' ').map((w) => w.split('-').length > 1 ? w : mot(w)).join(' '), ...apres].join('');
  }

  async function lancer({ jeu, partie, ui, groupe = null, fond = 'herbes' }) {
    const R = B.regles(jeu);
    const g = typeof groupe === 'string' ? B.trouver(jeu, 'groupes', groupe) : groupe;
    partie.dex = partie.dex || { vus: {}, pris: {} };
    partie.compteurs = partie.compteurs || {};
    const montrer = (titre, lignes) => T.montrer(ui, titre, lignes);

    // --- Les deux camps ---
    const heros = partie.equipe.map((c, i) => ({
      camp: 'heros', i, c, etats: (c.etats || []).map((id) => ({ id, garde: true })), bonus: [], concentration: null,
      esquive: false, cache: false, avantageProchain: false, rage: false, sournoise: false, init: 0,
    }));
    const monstres = [];
    for (const x of g?.monstres || []) {
      const m = B.trouver(jeu, 'monstres_jdr', x.monstre);
      if (!m) continue;
      for (let k = 0; k < B.borne(Math.round(Number(x.nombre) || 1), 1, 9) && monstres.length < MAX_MONSTRES; k++) {
        const pv = Math.max(1, Number(m.pv) || B.moyenne(m.pv_des) || 4);
        monstres.push({ camp: 'ennemis', i: monstres.length, m, nom: m.nom || m.id, pv, pvMax: pv, etats: [], bonus: [], concentration: null, esquive: false, cache: false, avantageProchain: false, recharges: {}, init: 0 });
      }
    }
    if (!monstres.length) return { issue: 'fuite' };
    const parNom = {};
    for (const u of monstres) parNom[u.nom] = (parNom[u.nom] || 0) + 1;
    const vus = {};
    for (const u of monstres) if (parNom[u.nom] > 1) { vus[u.nom] = (vus[u.nom] || 0) + 1; u.nom = `${u.nom} ${LETTRES[vus[u.nom] - 1]}`; }

    // --- Lire un combattant ---
    const estHeros = (u) => u.camp === 'heros';
    const pv = (u) => (estHeros(u) ? u.c.pv : u.pv);
    const pvMax = (u) => (estHeros(u) ? P.pvMax(jeu, u.c) : u.pvMax);
    const debout = (u) => pv(u) > 0;
    const mort = (u) => (estHeros(u) ? Boolean(u.c.mort_definitive) : pv(u) <= 0);
    const nom = (u) => (estHeros(u) ? P.nom(jeu, u.c) : u.nom);
    const le = (u) => (estHeros(u) ? nom(u) : `le ${nom(u)}`.replace(/^le ([AEIOUYÉÈÊHaeiouyéèêh])/, 'l\'$1'));
    const Le = (u) => { const t = le(u); return t[0].toUpperCase() + t.slice(1); };
    const caracDe = (u, k) => (estHeros(u) ? P.carac(jeu, u.c, k) : Number(u.m.carac?.[k]) || 10);
    const modDe = (u, k) => B.mod(caracDe(u, k));
    const effets = (u) => P.effetsEtats(jeu, u.etats.map((e) => e.id));
    const aEtat = (u, id) => u.etats.some((e) => e.id === id);
    const incapable = (u) => effets(u).has('incapable');
    const caDe = (u) => (estHeros(u) ? P.ca(jeu, u.c) : Number(u.m.ca) || 10) + u.bonus.reduce((s, b) => s + (Number(b.ca) || 0), 0);
    const allies = (u) => (estHeros(u) ? heros : monstres);
    const adversaires = (u) => (estHeros(u) ? monstres : heros);
    const vivants = (l) => l.filter(debout);
    const plusBlesse = (l) => [...l].sort((a, b) => pv(a) / pvMax(a) - pv(b) / pvMax(b))[0];
    const COURTS = { a_terre: 'TER', aveugle: 'AVG', empoisonne: 'PSN', effraye: 'PEUR', entrave: 'ENT', etourdi: 'ÉTO', paralyse: 'PAR', inconscient: 'KO', invisible: 'INV', charme: 'CHA', agrippe: 'AGR', petrifie: 'PÉT', incapable: 'NEU', assourdi: 'SRD', epuisement: 'ÉPU' };
    const statutCourt = (u) => {
      const l = u.etats.filter((e) => e.id !== 'inconscient').map((e) => COURTS[e.id] || B.nomEtat(jeu, e.id).slice(0, 3).toUpperCase());
      if (u.concentration) l.push('CONC');
      if (u.rage) l.push('RAGE');
      if (estHeros(u) && !debout(u)) l.unshift(u.c.mort_definitive ? 'MORT' : u.c.stable ? 'STABLE' : `MOURANT ${u.c.mort.succes}✓ ${u.c.mort.echecs}✗`);
      return l.join(' ');
    };
    const vueHeros = (u) => ({ nom: nom(u), apparence: P.apparence(jeu, u.c), pv: pv(u), pvMax: pvMax(u), pm: 0, pmMax: 0, info: `CA ${caDe(u)}${u.c.pv_temp ? ` · +${u.c.pv_temp}` : ''}`, statut: statutCourt(u), ko: !debout(u) });
    const vueMonstre = (u) => ({ nom: u.nom, image: u.m.image || '', taille: u.m.taille_ecran || (['grande', 'tres_grande', 'gigantesque', 'grand'].includes(u.m.taille) ? 'grand' : ['tres_petite', 'petite', 'petit'].includes(u.m.taille) ? 'petit' : 'moyen'), boss: Boolean(u.m.boss), ko: !debout(u) });
    const maj = (u) => (estHeros(u) ? ui.heros(u.i, vueHeros(u)) : ui.ennemi(u.i, vueMonstre(u)));

    // --- Les états ---
    async function mettreEtat(u, id, { tours = 0, sauvegarde = null, source = null } = {}) {
      if (!debout(u) && id !== 'inconscient') return;
      if (!estHeros(u) && (u.m.immunites_etats || []).includes(id)) { ui.nombre(u.camp, u.i, 'Immunisé', 'info'); return; }
      if (aEtat(u, id)) return;
      u.etats.push({ id, tours, sauvegarde, source });
      maj(u);
      if (id !== 'inconscient') await ui.message(`${Le(u)} est ${B.nomEtat(jeu, id).toLowerCase()} !`);
    }
    function oterEtat(u, id) { u.etats = u.etats.filter((e) => e.id !== id); maj(u); }

    // --- Les dégâts et les soins ---
    // La résistance, la vulnérabilité et l'immunité d'un monstre (ou d'un héros en rage, de son origine).
    function multiplicateur(u, type) {
      if (estHeros(u)) {
        if (u.rage && PHYSIQUES.includes(type)) return 0.5;
        if ((P.origine(jeu, u.c)?.resistances || []).includes(type)) return 0.5;
        return 1;
      }
      if ((u.m.immunites_degats || []).includes(type)) return 0;
      if ((u.m.resistances_degats || []).includes(type)) return 0.5;
      if ((u.m.vulnerabilites_degats || []).includes(type)) return 2;
      return 1;
    }
    async function tomber(u, { reste = 0 } = {}) {
      if (!estHeros(u)) {
        u.etats = [];
        u.concentration = null;
        maj(u);
        await ui.animer(u.camp, u.i, 'ko');
        await ui.message(`${Le(u)} est vaincu !`);
        partie.dex.pris[u.m.id] = true;
        return;
      }
      finirConcentration(u, false);
      // Les dégâts qui restent valent ses PV max : il meurt sur le coup (jets contre la mort seulement).
      if (R.morts === 'jets' && reste >= pvMax(u)) u.c.mort_definitive = true;
      u.c.mort = { succes: 0, echecs: 0 };
      u.c.stable = false;
      u.etats = u.etats.filter((e) => e.garde);
      await mettreEtat(u, 'inconscient');
      maj(u);
      await ui.animer(u.camp, u.i, 'ko');
      await ui.message(u.c.mort_definitive ? `${nom(u)} est tué sur le coup…` : R.morts === 'jets' ? `${nom(u)} s'effondre, mourant !` : `${nom(u)} est K.O. !`);
    }
    // Des dégâts sur u. Rend les dégâts vraiment infligés.
    async function blesser(u, n, { critique = false, type = '' } = {}) {
      n = Math.max(0, Math.round(n * multiplicateur(u, type)));
      if (!n) { ui.nombre(u.camp, u.i, 'Aucun effet', 'info'); return 0; }
      // Un héros déjà à terre : un échec à ses jets contre la mort (deux sur un critique).
      if (estHeros(u) && !debout(u)) {
        if (u.c.mort_definitive) return 0;
        if (R.morts === 'jets') {
          u.c.stable = false;
          u.c.mort.echecs = Math.min(3, u.c.mort.echecs + (critique ? 2 : 1));
          ui.nombre(u.camp, u.i, critique ? '✗✗' : '✗', 'degats');
          if (n >= pvMax(u) || u.c.mort.echecs >= 3) { u.c.mort_definitive = true; maj(u); await ui.message(`${nom(u)} succombe à ses blessures…`); }
          else { maj(u); await ui.message(`${nom(u)} est frappé à terre (${u.c.mort.echecs} échec${u.c.mort.echecs > 1 ? 's' : ''}).`); }
        }
        return n;
      }
      let reste = n;
      if (estHeros(u) && u.c.pv_temp > 0) { const t = Math.min(u.c.pv_temp, reste); u.c.pv_temp -= t; reste -= t; }
      const avant = pv(u);
      const apres = Math.max(0, avant - reste);
      if (estHeros(u)) u.c.pv = apres; else u.pv = apres;
      ui.nombre(u.camp, u.i, String(n), critique ? 'critique' : 'degats');
      await ui.animer(u.camp, u.i, 'touche');
      maj(u);
      if (apres <= 0) await tomber(u, { reste: reste - avant });
      else if (u.concentration) {
        // Garder sa concentration : sauvegarde de Constitution, DD 10 ou la moitié des dégâts.
        const dd = Math.max(10, Math.floor(n / 2));
        const ok = await sauver(u, 'con', dd, { quoi: `Concentration (${u.concentration.nom})` });
        if (!ok) finirConcentration(u, true);
      }
      // Un coup réveille celui qui dort (le sort Sommeil).
      if (aEtat(u, 'inconscient') && debout(u)) { oterEtat(u, 'inconscient'); await ui.message(`${Le(u)} se réveille !`); }
      return n;
    }
    async function soigner(u, n) {
      if (estHeros(u) && u.c.mort_definitive) { ui.nombre(u.camp, u.i, 'Trop tard', 'info'); return 0; }
      const avant = pv(u);
      const v = Math.min(pvMax(u), avant + Math.max(0, Math.round(n)));
      if (estHeros(u)) u.c.pv = v; else u.pv = v;
      if (avant <= 0 && v > 0) {
        if (estHeros(u)) { u.c.mort = { succes: 0, echecs: 0 }; u.c.stable = false; }
        oterEtat(u, 'inconscient');
        await ui.animer(u.camp, u.i, 'ranime');
        await ui.message(`${nom(u)} reprend connaissance !`);
      }
      ui.nombre(u.camp, u.i, String(v - avant), 'soin');
      await ui.animer(u.camp, u.i, 'soin');
      maj(u);
      return v - avant;
    }

    // --- Les sauvegardes (héros : la fiche ; monstre : son bloc de stats) ---
    async function sauver(u, carac, dd, { quoi = '', avantage = false } = {}) {
      const bonusSorts = u.bonus.filter((b) => b.sauvegarde).map((b) => D.lancer(partie, b.sauvegarde).total).reduce((s, x) => s + x, 0);
      if (estHeros(u)) {
        const r = await T.sauvegarde({ jeu, partie, ui, c: u.c, carac, dd, avantage, quoi, etatsCombat: u.etats.filter((e) => !e.garde).map((e) => e.id), bonusPlus: bonusSorts });
        return r.reussi;
      }
      const ef = effets(u);
      if (ef.has('echec_for_dex') && (carac === 'for' || carac === 'dex')) {
        await montrer(quoi || 'Sauvegarde', [D.noter(partie, { qui: nom(u), quoi: quoi || `Sauvegarde de ${B.nomCarac(jeu, carac)}`, total: 0, contre: `DD ${dd}`, resultat: 'rate' })]);
        return false;
      }
      const des = D.d20(partie, { avantage, desavantage: carac === 'dex' && ef.has('desavantage_sauvegardes_dex') });
      const k = u.m.sauvegardes?.[carac];
      const bonus = (Number.isFinite(Number(k)) && k !== null && k !== '' ? Number(k) : modDe(u, carac)) + bonusSorts;
      const total = Math.round(await Maison.formule('sauvegarde', { naturel: des.naturel, bonus, dd, carac, maitrise: k !== undefined }, () => des.naturel + bonus));
      const ok = total >= dd;
      await montrer(quoi || `Sauvegarde de ${B.nomCarac(jeu, carac)}`, [D.noter(partie, { qui: nom(u), quoi: quoi || `Sauvegarde de ${B.nomCarac(jeu, carac)}`, formule: 'd20', des: des.des, bonus: total - des.naturel, total, contre: `DD ${dd}`, resultat: ok ? 'reussi' : 'rate', mode: des.mode })]);
      return ok;
    }

    // --- La concentration ---
    function finirConcentration(u, dire = true) {
      const k = u.concentration;
      if (!k) return;
      u.concentration = null;
      for (const t of [...heros, ...monstres]) {
        t.bonus = t.bonus.filter((b) => b.source !== k);
        t.etats = t.etats.filter((e) => e.source !== k);
        maj(t);
      }
      maj(u);
      if (dire) ui.nombre(u.camp, u.i, `${k.nom} : fini`, 'baisse');
    }

    // --- Une attaque ---
    // a : { nom, bonus, des, mod, type, distance, finesse, critique_min }
    let frappesAuContact = new Map(); // ce tour-ci : cible → qui l'a frappée au contact (prise en tenaille)
    async function attaquer(u, t, a, { sort = null } = {}) {
      const ef = effets(u), eft = effets(t);
      // Une cible à terre : avantage au contact, désavantage à distance.
      const terre = aEtat(t, 'a_terre');
      const contre = terre && a.distance ? P.effetsEtats(jeu, t.etats.filter((e) => e.id !== 'a_terre').map((e) => e.id)) : eft;
      let avantage = ef.has('avantage_attaques') || contre.has('avantage_contre') || u.cache || u.avantageProchain;
      const desavantage = ef.has('desavantage_attaques') || eft.has('desavantage_contre') || t.esquive || (terre && a.distance);
      if (R.tenaille && !a.distance && [...(frappesAuContact.get(t) || [])].some((x) => x !== u && x.camp === u.camp)) avantage = true;
      u.cache = false;
      u.avantageProchain = false;
      const des = D.d20(partie, { avantage, desavantage });
      const bonusSorts = u.bonus.filter((b) => b.attaque).map((b) => D.lancer(partie, b.attaque).total).reduce((s, x) => s + x, 0);
      const bonus = Math.round(await Maison.formule('attaque', { naturel: des.naturel, bonus: a.bonus, magie: Number(a.magie) || 0, sort: Boolean(sort), distance: Boolean(a.distance) }, () => a.bonus)) + bonusSorts;
      // Le critique : 20 naturel (19 pour le champion, avec l'aptitude « critique_ameliore »).
      const critMin = estHeros(u) && !sort ? Number(P.palier(jeu, u.c, 'critique_ameliore')?.valeur) || 20 : 20;
      const seuil = B.borne(Math.round(await Maison.formule('critique', { niveau: estHeros(u) ? u.c.niveau : 0, classe: estHeros(u) ? u.c.classe : '' }, () => critMin)), 2, 20);
      const ca = caDe(t);
      const total = des.naturel + bonus;
      let critique = des.naturel >= seuil;
      const touche = critique || (!(des.naturel === 1 && R.echec_critique) && total >= ca);
      if (touche && !a.distance && eft.has('critique_contact')) critique = true;
      const ligne = D.noter(partie, { qui: nom(u), quoi: `${a.nom} contre ${nom(t)}`, formule: 'd20', des: des.des, bonus, total, contre: `CA ${ca}`, resultat: critique ? 'critique' : touche ? 'touche' : des.naturel === 1 ? 'echec_critique' : 'manque', mode: des.mode });
      if (!touche) {
        await montrer(a.nom, [ligne]);
        ui.nombre(t.camp, t.i, 'Raté', 'rate');
        await ui.animer(t.camp, t.i, 'esquive');
        return { touche: false };
      }
      if (!a.distance) { if (!frappesAuContact.has(t)) frappesAuContact.set(t, new Set()); frappesAuContact.get(t).add(u); }
      // Les dégâts : les dés de l'arme (doublés sur un critique), le modificateur, et ce qui s'ajoute.
      const lignes = [ligne];
      const crit = { doubler: critique && R.critiques !== 'max', max: critique && R.critiques === 'max' };
      const r = D.lancer(partie, a.des, crit);
      let plus = Number(a.mod) || 0;
      const extra = [];
      if (estHeros(u)) {
        if (u.rage && !a.distance && a.carac === 'for' && !sort) plus += Number(P.palier(jeu, u.c, 'rage')?.valeur) || 2;
        // L'attaque sournoise : une fois par tour, avec l'avantage ou un allié debout, arme de finesse ou à distance.
        const sournoise = P.palier(jeu, u.c, 'attaque_sournoise');
        if (sournoise && !u.sournoise && (a.finesse || a.distance) && !sort && !desavantage && (avantage || vivants(heros).length > 1)) {
          u.sournoise = true;
          const s = D.lancer(partie, `${Math.ceil(u.c.niveau / 2)}d6`, crit);
          extra.push({ nom: 'Attaque sournoise', r: s });
        }
        // Le châtiment divin du paladin : un emplacement de sort pour 2d8 radiants (+1d8 par niveau au-dessus du 1er).
        if (P.a(jeu, u.c, 'chatiment_divin') && !a.distance && !sort && P.emplacements(jeu, u.c).some((n, i) => P.restants(jeu, u.c, i + 1) > 0)) {
          const niveaux = P.emplacements(jeu, u.c).map((n, i) => i + 1).filter((nv) => P.restants(jeu, u.c, nv) > 0);
          const k = await ui.liste('Châtiment divin ?', [{ texte: 'Non' }, ...niveaux.map((nv) => ({ texte: `Oui, emplacement de niveau ${nv}`, detail: `+${Math.min(5, 1 + nv)}d8 radiants` }))], false);
          if (k > 0) {
            const nv = niveaux[k - 1];
            u.c.emplacements[nv] = (Number(u.c.emplacements[nv]) || 0) + 1;
            extra.push({ nom: 'Châtiment divin', r: D.lancer(partie, `${Math.min(5, 1 + nv)}d8`, crit), type: 'radiant' });
          }
        }
      }
      const dmgNormal = Math.max(0, r.total + plus);
      let n = Math.max(sort ? 0 : 1, Math.round(await Maison.formule('degats', { des: r.total, mod: plus, critique, type: a.type || '', sort: Boolean(sort) }, () => dmgNormal)));
      lignes.push(D.noter(partie, { qui: nom(u), quoi: `Dégâts (${B.nomDegats(a.type).toLowerCase()})`, formule: r.formule, des: r.des, bonus: n - r.total, total: n }));
      for (const x of extra) lignes.push(D.noter(partie, { qui: nom(u), quoi: x.nom, formule: x.r.formule, des: x.r.des, bonus: x.r.bonus, total: x.r.total }));
      await montrer(a.nom, lignes);
      if (critique) ui.nombre(t.camp, t.i, 'Critique !', 'info');
      let fait = await blesser(t, n, { critique, type: a.type });
      for (const x of extra) if (debout(t) || !estHeros(t)) fait += await blesser(t, x.r.total, { type: x.type || a.type });
      await ui.message(`${Le(u)} touche ${le(t)}${critique ? ' (coup critique)' : ''} : ${fait} dégât${fait > 1 ? 's' : ''}.`);
      return { touche: true, critique, degats: fait };
    }

    // --- Les sorts ---
    const sortsDe = (u) => P.sortsConnus(jeu, u.c).filter((s) => s.effet && s.effet.type && s.effet.type !== 'aucun');
    const estBonus = (s) => /bonus/i.test(s.temps || '') || s.effet?.action === 'bonus';
    const peutLancer = (u, s) => Number(s.niveau) === 0 || P.emplacements(jeu, u.c).some((nb, i) => i + 1 >= Number(s.niveau) && P.restants(jeu, u.c, i + 1) > 0);
    // Les dés d'un sort : ses dés, augmentés au niveau 5, 11 et 17 (tours de magie) ou par emplacement au-dessus.
    function desDuSort(s, lanceurNiveau, emplacement, cle = 'degats') {
      const base = B.lireDes(s.effet[cle]);
      if (!base) return String(s.effet[cle] || '0');
      let n = base.n;
      if (Number(s.niveau) === 0 && cle === 'degats' && !s.effet.sans_progression) n *= 1 + (lanceurNiveau >= 5) + (lanceurNiveau >= 11) + (lanceurNiveau >= 17);
      const sup = B.lireDes(s.effet.niveau_sup);
      let bonus = base.bonus;
      if (sup && emplacement > Number(s.niveau)) {
        if (sup.faces === base.faces) n += sup.n * (emplacement - s.niveau);
        bonus += sup.bonus * (emplacement - s.niveau);
      }
      return `${n ? `${n}d${base.faces}` : ''}${bonus ? `${bonus > 0 && n ? '+' : ''}${bonus}` : ''}` || '0';
    }
    async function choisirEmplacement(u, s) {
      if (Number(s.niveau) === 0) return 0;
      const possibles = P.emplacements(jeu, u.c).map((nb, i) => i + 1).filter((nv) => nv >= Number(s.niveau) && P.restants(jeu, u.c, nv) > 0);
      if (!possibles.length) return null;
      if (possibles.length === 1 || !s.effet.niveau_sup) return possibles[0];
      const k = await ui.liste(`${s.nom} : quel emplacement ?`, possibles.map((nv) => ({ texte: `Niveau ${nv}`, detail: `${P.restants(jeu, u.c, nv)} restant(s)` })), true);
      return k == null ? null : possibles[k];
    }
    // Les cibles d'un sort : 'un' (un adversaire), 'plusieurs' (jusqu'à `nombre`), 'zone' (tous les
    // adversaires), 'soi', 'allie', 'allies'. Rend la liste, ou null si le joueur revient en arrière.
    async function ciblesDuSort(u, s) {
      const e = s.effet, l = vivants(monstres);
      switch (e.cibles) {
        case 'soi': return [u];
        case 'allies': return heros.filter((h) => debout(h) || (e.type === 'soin' && !h.c.mort_definitive));
        case 'allie': {
          const i = await ui.cible({ camp: 'heros', possibles: heros.map((h) => !h.c.mort_definitive && (debout(h) || e.type === 'soin')), depart: u.i });
          return i == null ? null : [heros[i]];
        }
        case 'zone': return (await ui.cible({ camp: 'ennemis', tous: true, possibles: monstres.map(debout) })) == null ? null : l;
        case 'plusieurs': {
          const i = await ui.cible({ camp: 'ennemis', possibles: monstres.map(debout) });
          if (i == null) return null;
          const n = B.borne(Number(e.nombre) || 2, 1, 8);
          return [monstres[i], ...l.filter((x) => x !== monstres[i])].slice(0, n);
        }
        default: {
          const i = await ui.cible({ camp: 'ennemis', possibles: monstres.map(debout) });
          return i == null ? null : [monstres[i]];
        }
      }
    }
    async function lancerSort(u, s, emplacement, cibles) {
      const e = s.effet;
      if (emplacement > 0) u.c.emplacements[emplacement] = (Number(u.c.emplacements[emplacement]) || 0) + 1;
      if (P.lanceur(jeu, u.c)?.type === 'occultiste' && emplacement > 0) u.c.pacte = (Number(u.c.pacte) || 0) + 1;
      ui.bandeau(`${s.nom}${emplacement > Number(s.niveau) ? ` (niveau ${emplacement})` : ''}`);
      maj(u);
      await ui.animer('heros', u.i, 'avance');
      const couleur = e.couleur || (e.type === 'soin' ? '#7dffb0' : e.type_degats === 'feu' ? '#ff7a3c' : e.type_degats === 'froid' ? '#8fd6ff' : e.type_degats === 'foudre' ? '#ffe45c' : e.type_degats === 'radiant' ? '#fff3b0' : e.type_degats === 'necrotique' ? '#9b6bff' : '#c9b6ff');
      await ui.effet(cibles.map((t) => [t.camp, t.i]), couleur);
      const dd = P.ddSorts(jeu, u.c);
      const modMagie = P.modCarac(jeu, u.c, P.caracMagie(jeu, u.c));
      if (s.concentration) { finirConcentration(u); u.concentration = { nom: s.nom, sort: s.id }; }
      const source = u.concentration?.sort === s.id ? u.concentration : null;
      const tours = Number(e.tours) || (s.concentration ? 10 : 1);
      switch (e.type) {
        case 'attaque':
          for (const t of cibles) if (debout(t)) await attaquer(u, t, { nom: s.nom, bonus: P.attaqueSorts(jeu, u.c), des: desDuSort(s, u.c.niveau, emplacement), mod: e.ajouter_mod ? modMagie : 0, type: e.type_degats || 'force', distance: e.attaque !== 'corps' }, { sort: s });
          break;
        case 'auto': {
          const r = D.lancer(partie, desDuSort(s, u.c.niveau, emplacement));
          await montrer(s.nom, [D.noter(partie, { qui: nom(u), quoi: s.nom, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
          for (const t of cibles) if (debout(t)) await blesser(t, r.total, { type: e.type_degats || 'force' });
          break;
        }
        case 'sauvegarde': {
          const r = e.degats ? D.lancer(partie, desDuSort(s, u.c.niveau, emplacement)) : null;
          if (r) await montrer(s.nom, [D.noter(partie, { qui: nom(u), quoi: `${s.nom} : dégâts`, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
          for (const t of cibles) {
            if (!debout(t)) continue;
            const ok = await sauver(t, e.sauvegarde || 'dex', dd, { quoi: `${s.nom} : sauvegarde de ${B.nomCarac(jeu, e.sauvegarde || 'dex')}` });
            if (r) {
              const n = ok ? (e.moitie ? Math.floor(r.total / 2) : 0) : r.total;
              if (n > 0) await blesser(t, n, { type: e.type_degats || 'force' });
              else ui.nombre(t.camp, t.i, 'Résiste', 'info');
            }
            if (!ok && e.etat && debout(t)) await mettreEtat(t, e.etat, { tours, sauvegarde: e.repete ? { carac: e.sauvegarde || 'sag', dd } : null, source });
            else if (ok && !r) ui.nombre(t.camp, t.i, 'Résiste', 'info');
          }
          break;
        }
        case 'soin': {
          for (const t of cibles) {
            const r = D.lancer(partie, desDuSort(s, u.c.niveau, emplacement, 'soin'));
            const normal = r.total + (e.ajouter_mod !== false ? modMagie : 0);
            const n = Math.max(1, Math.round(await Maison.formule('soin', { des: r.total, mod: e.ajouter_mod !== false ? modMagie : 0, sort: s.id }, () => normal)));
            await montrer(s.nom, [D.noter(partie, { qui: nom(u), quoi: `${s.nom} sur ${nom(t)}`, formule: r.formule, des: r.des, bonus: n - r.total, total: n })]);
            await soigner(t, n);
          }
          break;
        }
        case 'bonus':
          for (const t of cibles) {
            t.bonus.push({ source: source || { nom: s.nom }, nom: s.nom, attaque: e.bonus_attaque || '', sauvegarde: e.bonus_sauvegarde || '', ca: Number(e.bonus_ca) || 0, tours });
            ui.nombre(t.camp, t.i, s.nom, 'hausse');
            await ui.animer(t.camp, t.i, 'hausse');
            maj(t);
          }
          break;
        case 'pv_temp':
          for (const t of cibles.filter(estHeros)) {
            const r = D.lancer(partie, desDuSort(s, u.c.niveau, emplacement, 'soin'));
            t.c.pv_temp = Math.max(t.c.pv_temp || 0, r.total + (e.ajouter_mod ? modMagie : 0));
            ui.nombre(t.camp, t.i, `+${t.c.pv_temp} PV temp.`, 'soin');
            maj(t);
          }
          break;
        case 'sommeil': {
          // Sommeil : un total de PV (5d8 + 2d8 par niveau au-dessus du 1er) ; les plus faibles s'endorment d'abord.
          const r = D.lancer(partie, desDuSort(s, u.c.niveau, emplacement));
          await montrer(s.nom, [D.noter(partie, { qui: nom(u), quoi: `${s.nom} : PV endormis`, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
          let reste = r.total;
          for (const t of [...cibles].filter(debout).sort((a, b) => pv(a) - pv(b))) {
            if (pv(t) > reste) break;
            if (!estHeros(t) && (t.m.immunites_etats || []).includes('inconscient')) continue;
            reste -= pv(t);
            await mettreEtat(t, 'inconscient', { tours: 10, source: { nom: s.nom, reveil: true } });
          }
          break;
        }
        case 'etat':
          for (const t of cibles) if (debout(t)) await mettreEtat(t, e.etat, { tours, source });
          break;
        default:
          await ui.message(`${s.nom} : ${s.description || 'rien ne se passe ici.'}`);
      }
      // Un sort de concentration qui n'a rien laissé (toutes les cibles ont résisté) : la concentration tombe.
      if (source && ![...heros, ...monstres].some((t) => t.bonus.some((b) => b.source === source) || t.etats.some((x) => x.source === source))) finirConcentration(u, false);
      await ui.animer('heros', u.i, 'recule');
      ui.bandeau('');
    }

    // --- Les objets du sac en combat (potions, soins) ---
    const objetsCombat = () => Object.entries(partie.sac).map(([id, n]) => ({ id, n, o: P.objet(jeu, id) }))
      .filter((x) => x.o && ['soin', 'rappel', 'soin_statut'].includes(x.o.effet?.type) && x.n > 0);
    async function utiliserObjet(u, x, t) {
      partie.sac[x.id]--;
      if (partie.sac[x.id] <= 0) delete partie.sac[x.id];
      ui.bandeau(x.o.nom);
      const e = x.o.effet;
      if (e.type === 'soin') {
        const r = e.des ? D.lancer(partie, e.des) : { formule: '', des: [], bonus: Number(e.valeur) || 0, total: Number(e.valeur) || 0 };
        if (e.des) await montrer(x.o.nom, [D.noter(partie, { qui: nom(u), quoi: `${x.o.nom} sur ${nom(t)}`, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
        await soigner(t, Number(e.valeur) >= 9999 ? pvMax(t) : r.total);
      } else if (e.type === 'rappel') {
        if (debout(t) || t.c.mort_definitive) ui.nombre(t.camp, t.i, 'Sans effet', 'info');
        else await soigner(t, Math.max(1, Math.floor(pvMax(t) * (Number(e.valeur) || 25) / 100)));
      } else if (e.type === 'soin_statut') {
        const avant = t.etats.length;
        t.etats = t.etats.filter((s) => !(e.statut === 'tous' || !e.statut || s.id === e.statut));
        maj(t);
        if (t.etats.length < avant) await ui.message(`${nom(t)} va mieux.`);
        else ui.nombre(t.camp, t.i, 'Sans effet', 'info');
      }
      ui.bandeau('');
    }

    // --- Le tour d'un héros ---
    let essaisFuite = 0, fuite = false;
    async function choisirCible(camp, depart = -1, possibles = null) {
      const l = camp === 'heros' ? heros : monstres;
      return ui.cible({ camp, possibles: possibles || l.map(debout), depart });
    }
    async function tourHeros(u) {
      u.esquive = false;
      u.sournoise = false;
      const c = u.c;
      const attaques = () => P.attaques(jeu, c);
      const sorts = () => (P.lanceur(jeu, c) ? sortsDe(u) : []);
      let actionFaite = false, bonusFait = false, attaqueFaite = false;
      const nombreAttaques = 1 + (P.palier(jeu, c, 'attaque_supplementaire') ? Math.max(1, Number(P.palier(jeu, c, 'attaque_supplementaire').valeur) || 1) : 0);
      // L'action, puis l'action bonus (s'il en a une à faire).
      for (;;) {
        if (fini() || !debout(u)) return;
        const bonusPossibles = actionsBonus(u, attaqueFaite);
        if (actionFaite && (bonusFait || !bonusPossibles.length)) return;
        const items = actionFaite ? [] : [
          { id: 'attaque', texte: `Attaquer (${attaques()[0].nom})`, icone: 'flame' },
          ...(P.lanceur(jeu, c) ? [{ id: 'sort', texte: 'Lancer un sort', icone: 'sparkle', desactive: !sorts().some((s) => !estBonus(s) && peutLancer(u, s)) }] : []),
          { id: 'objet', texte: 'Objet', icone: 'briefcase', desactive: !objetsCombat().length },
          { id: 'esquiver', texte: 'Esquiver', icone: 'shield' },
          { id: 'aider', texte: 'Aider un allié', icone: 'heart', desactive: vivants(heros).length < 2 },
          { id: 'cacher', texte: 'Se cacher', icone: 'eye-closed' },
          { id: 'fuir', texte: 'Fuir', icone: 'run-all', desactive: g.fuite === false },
        ];
        if (!bonusFait) for (const b of bonusPossibles) items.push({ ...b, texte: `${b.texte} (bonus)` });
        if (actionFaite) items.push({ id: 'fin', texte: 'Finir le tour', icone: 'check' });
        const choix = await ui.commande(u.i, items);
        if (choix == null) { if (actionFaite) return; continue; }
        if (choix === 'fin') return;
        const b = bonusPossibles.find((x) => x.id === choix);
        if (b) { if (await b.faire()) bonusFait = true; continue; }
        if (choix === 'attaque') {
          const a = attaques()[0];
          let n = 0;
          for (let k = 0; k < nombreAttaques; k++) {
            if (fini()) break;
            const i = await choisirCible('ennemis');
            if (i == null) { if (k === 0) break; continue; }
            ui.bandeau(a.nom);
            await ui.animer('heros', u.i, 'avance');
            await attaquer(u, monstres[i], a);
            await ui.animer('heros', u.i, 'recule');
            ui.bandeau('');
            n++;
          }
          if (n) { actionFaite = true; attaqueFaite = true; }
        } else if (choix === 'sort') {
          const l = sorts().filter((s) => !estBonus(s));
          const k = await ui.liste('Lancer un sort', l.map((s) => ({
            texte: s.nom, couleur: Number(s.niveau) ? '' : '#9aa0aa',
            detail: `${Number(s.niveau) ? `niv. ${s.niveau}` : 'tour'}${s.concentration ? ' · concentration' : ''}${peutLancer(u, s) ? '' : ' · plus d\'emplacement'}`, desactive: !peutLancer(u, s),
          })), true);
          if (k == null) continue;
          const s = l[k];
          const emp = await choisirEmplacement(u, s);
          if (emp == null) continue;
          const cibles = await ciblesDuSort(u, s);
          if (!cibles) continue;
          await lancerSort(u, s, emp, cibles);
          actionFaite = true;
        } else if (choix === 'objet') {
          const l = objetsCombat();
          const k = await ui.liste('Objet', l.map((x) => ({ texte: x.o.nom, detail: `×${x.n}`, image: x.o.icone || '' })), true);
          if (k == null) continue;
          const rappel = l[k].o.effet.type === 'rappel';
          const j = await choisirCible('heros', u.i, heros.map((h) => !h.c.mort_definitive && (rappel ? !debout(h) : true)));
          if (j == null) continue;
          await utiliserObjet(u, l[k], heros[j]);
          if (R.potion_bonus && !bonusFait) bonusFait = true; else actionFaite = true;
        } else if (choix === 'esquiver') {
          u.esquive = true;
          ui.nombre('heros', u.i, 'Esquive', 'hausse');
          await ui.message(`${nom(u)} se tient sur ses gardes.`);
          actionFaite = true;
        } else if (choix === 'aider') {
          const j = await choisirCible('heros', -1, heros.map((h) => h !== u && debout(h)));
          if (j == null) continue;
          heros[j].avantageProchain = true;
          ui.nombre('heros', j, 'Avantage', 'hausse');
          await ui.message(`${nom(u)} aide ${nom(heros[j])} : sa prochaine attaque aura l'avantage.`);
          actionFaite = true;
        } else if (choix === 'cacher') {
          await seCacher(u);
          actionFaite = true;
        } else if (choix === 'fuir') {
          // Fuir : un test de groupe de Dextérité (Acrobaties) contre 10 + la meilleure Dex des monstres,
          // plus facile à chaque essai raté.
          const dd = Math.max(5, 10 + Math.max(...vivants(monstres).map((m) => modDe(m, 'dex'))) - 2 * essaisFuite);
          const r = [];
          for (const h of vivants(heros)) r.push(await T.test({ jeu, partie, ui, c: h.c, competence: 'acrobaties', dd, quoi: 'Fuir', montrerJet: false }));
          await montrer(`Fuir · DD ${dd}`, r.map((x) => x.ligne));
          if (r.filter((x) => x.reussi).length >= Math.ceil(r.length / 2)) { fuite = true; return; }
          essaisFuite++;
          await ui.message('Impossible de fuir !');
          actionFaite = true;
        }
      }
    }
    async function seCacher(u) {
      const meilleur = Math.max(...vivants(adversaires(u)).map((m) => 10 + (Number(m.m?.competences?.perception) || modDe(m, 'sag'))));
      const r = await T.test({ jeu, partie, ui, c: u.c, competence: 'discretion', dd: meilleur, quoi: 'Se cacher' });
      u.cache = r.reussi;
      await ui.message(r.reussi ? `${nom(u)} se cache : sa prochaine attaque aura l'avantage.` : `${nom(u)} n'arrive pas à se cacher.`);
    }
    // Les actions bonus possibles maintenant : [{ id, texte, icone, faire() → true si faite }].
    function actionsBonus(u, attaqueFaite) {
      const c = u.c, out = [];
      const a2 = P.attaques(jeu, c).find((a) => a.seconde);
      if (a2 && attaqueFaite) out.push({ id: 'b-seconde', texte: `Attaquer de la main gauche (${a2.nom})`, icone: 'flame', faire: async () => { const i = await choisirCible('ennemis'); if (i == null) return false; await attaquer(u, monstres[i], a2); return true; } });
      if (P.a(jeu, c, 'arts_martiaux') && attaqueFaite && !c.equipement?.armure && !c.equipement?.seconde) {
        const mn = P.attaques(jeu, { ...c, equipement: {} })[0];
        out.push({ id: 'b-mains', texte: 'Frappe à mains nues', icone: 'flame', faire: async () => { const i = await choisirCible('ennemis'); if (i == null) return false; await attaquer(u, monstres[i], mn); return true; } });
      }
      if (P.a(jeu, c, 'second_souffle') && P.resteRessource(jeu, c, 'second_souffle') > 0 && pv(u) < pvMax(u)) {
        out.push({ id: 'b-souffle', texte: 'Second souffle', icone: 'heart', faire: async () => {
          P.depenser(c, 'second_souffle');
          const r = D.lancer(partie, `1d10+${c.niveau}`);
          await montrer('Second souffle', [D.noter(partie, { qui: nom(u), quoi: 'Second souffle', formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
          await soigner(u, r.total);
          return true;
        } });
      }
      if (P.a(jeu, c, 'rage') && !u.rage && P.resteRessource(jeu, c, 'rage') > 0 && P.armure(P.objet(jeu, c.equipement?.armure))?.type !== 'lourde') {
        out.push({ id: 'b-rage', texte: 'Entrer en rage', icone: 'flame', faire: async () => { P.depenser(c, 'rage'); u.rage = true; maj(u); ui.nombre('heros', u.i, 'Rage !', 'hausse'); await ui.animer('heros', u.i, 'hausse'); await ui.message(`${nom(u)} entre en rage !`); return true; } });
      }
      if (P.a(jeu, c, 'ruse')) out.push({ id: 'b-cacher', texte: 'Se cacher (Ruse)', icone: 'eye-closed', faire: async () => { await seCacher(u); return true; } });
      if (R.potion_bonus && objetsCombat().some((x) => x.o.effet.type === 'soin')) {
        out.push({ id: 'b-potion', texte: 'Boire une potion', icone: 'beaker', faire: async () => {
          const l = objetsCombat().filter((x) => x.o.effet.type === 'soin');
          const k = await ui.liste('Boire', l.map((x) => ({ texte: x.o.nom, detail: `×${x.n}` })), true);
          if (k == null) return false;
          await utiliserObjet(u, l[k], u);
          return true;
        } });
      }
      for (const s of (P.lanceur(jeu, c) ? sortsDe(u) : []).filter((x) => estBonus(x) && peutLancer(u, x))) {
        out.push({ id: `b-sort-${s.id}`, texte: s.nom, icone: 'sparkle', faire: async () => {
          const emp = await choisirEmplacement(u, s);
          if (emp == null) return false;
          const cibles = await ciblesDuSort(u, s);
          if (!cibles) return false;
          await lancerSort(u, s, emp, cibles);
          return true;
        } });
      }
      return out;
    }

    // --- Le tour d'un monstre ---
    const actionsMonstre = (u) => (u.m.actions || []).filter((a) => a && a.nom);
    async function tourMonstre(u) {
      u.esquive = false;
      // Les actions à recharge (le souffle d'un dragon) : 1d6 au début de son tour.
      for (const a of actionsMonstre(u)) {
        if (!a.recharge || u.recharges[a.nom] !== false) continue;
        const min = Number(String(a.recharge).split('-')[0]) || 6;
        if (D.d(partie, 6) >= min) u.recharges[a.nom] = true;
      }
      const cibles = vivants(heros);
      if (!cibles.length) return;
      const viser = () => { const l = vivants(heros); return D.chance(partie, 25) ? plusBlesse(l) : D.choisir(partie, l); };
      const dispo = actionsMonstre(u).filter((a) => !a.recharge || u.recharges[a.nom] !== false);
      const armes = dispo.filter((a) => Number.isFinite(Number(a.attaque)) && a.attaque !== '' && a.attaque !== null);
      // Multiattaque : `multiattaque` attaques avec ses armes ; sinon une action tirée selon les poids.
      let plan;
      if (Number(u.m.multiattaque) > 1 && armes.length && !(dispo.some((a) => a.recharge) && D.chance(partie, 60))) {
        plan = Array.from({ length: Number(u.m.multiattaque) }, (_, k) => armes[k % armes.length]);
      } else {
        const total = dispo.reduce((s, a) => s + Math.max(0, Number(a.poids) || 10), 0);
        let tirage = D.aleatoire(partie) * total;
        const a = dispo.find((x) => (tirage -= Math.max(0, Number(x.poids) || 10)) < 0) || dispo[0];
        plan = a ? [a] : [];
      }
      if (!plan.length) { await ui.message(`${Le(u)} observe le groupe.`); return; }
      for (const a of plan) {
        if (fini() || !debout(u)) return;
        if (a.recharge) u.recharges[a.nom] = false;
        ui.bandeau(a.nom);
        await ui.animer('ennemis', u.i, 'attaque');
        if (a.sauvegarde?.carac) {
          // Un souffle, un cri : chaque héros visé fait une sauvegarde.
          const vises = a.zone ? vivants(heros) : [viser()].filter(Boolean);
          await ui.effet(vises.map((t) => ['heros', t.i]), a.couleur || '#ff9d4a');
          const r = a.degats ? D.lancer(partie, a.degats) : null;
          if (r) await montrer(a.nom, [D.noter(partie, { qui: nom(u), quoi: `${a.nom} : dégâts`, formule: r.formule, des: r.des, bonus: r.bonus, total: r.total })]);
          for (const t of vises) {
            const ok = await sauver(t, a.sauvegarde.carac, Number(a.sauvegarde.dd) || 10, { quoi: `${a.nom} : sauvegarde de ${B.nomCarac(jeu, a.sauvegarde.carac)}` });
            if (r) { const n = ok ? (a.sauvegarde.moitie !== false ? Math.floor(r.total / 2) : 0) : r.total; if (n) await blesser(t, n, { type: a.type_degats }); }
            if (!ok && a.etat && debout(t)) await mettreEtat(t, a.etat, { tours: Number(a.tours) || 0, sauvegarde: a.repete ? { carac: a.sauvegarde.carac, dd: Number(a.sauvegarde.dd) || 10 } : null });
          }
        } else if (Number.isFinite(Number(a.attaque)) && a.attaque !== '' && a.attaque !== null) {
          const t = viser();
          if (!t) return;
          const r = await attaquer(u, t, { nom: a.nom, bonus: Number(a.attaque), des: a.degats || '1d4', mod: 0, type: a.type_degats || 'contondant', distance: Boolean(a.distance) });
          if (r.touche && a.etat && debout(t)) {
            if (a.etat_sauvegarde?.carac) {
              const ok = await sauver(t, a.etat_sauvegarde.carac, Number(a.etat_sauvegarde.dd) || 10, { quoi: `${a.nom} : sauvegarde` });
              if (!ok) await mettreEtat(t, a.etat, { tours: Number(a.tours) || 0 });
            } else await mettreEtat(t, a.etat, { tours: Number(a.tours) || 0 });
          }
        } else {
          await ui.message(`${Le(u)} : ${a.nom}. ${a.description || ''}`.trim());
        }
        ui.bandeau('');
      }
    }

    // --- Les jets contre la mort (un héros à 0 PV, au début de son tour) ---
    async function jetContreLaMort(u) {
      const c = u.c;
      if (c.mort_definitive || c.stable || R.morts !== 'jets') return;
      const des = D.d20(partie);
      let resultat;
      if (des.naturel === 20) { resultat = 'critique'; }
      else if (des.naturel >= 10) { c.mort.succes++; resultat = 'reussi'; }
      else { c.mort.echecs += des.naturel === 1 ? 2 : 1; resultat = 'rate'; }
      await montrer('Jet contre la mort', [D.noter(partie, { qui: nom(u), quoi: 'Jet contre la mort', formule: 'd20', des: des.des, total: des.naturel, contre: 'DD 10', resultat })]);
      if (resultat === 'critique') { await soigner(u, 1); return; }
      if (c.mort.echecs >= 3) { c.mort_definitive = true; maj(u); await ui.message(`${nom(u)} est mort…`); return; }
      if (c.mort.succes >= 3) { c.stable = true; maj(u); await ui.message(`${nom(u)} est stabilisé.`); return; }
      maj(u);
      await ui.message(`${nom(u)} lutte contre la mort (${c.mort.succes} réussite${c.mort.succes > 1 ? 's' : ''}, ${c.mort.echecs} échec${c.mort.echecs > 1 ? 's' : ''}).`);
    }

    // --- La fin du tour : les états qui passent, les bonus qui s'usent ---
    async function finDeTour(u) {
      for (const e of [...u.etats]) {
        if (e.garde || e.id === 'inconscient' && !e.source?.reveil) continue;
        if (e.sauvegarde) {
          if (await sauver(u, e.sauvegarde.carac, e.sauvegarde.dd, { quoi: `Se libérer : ${B.nomEtat(jeu, e.id)}` })) { oterEtat(u, e.id); await ui.message(`${Le(u)} n'est plus ${B.nomEtat(jeu, e.id).toLowerCase()}.`); }
        } else if (e.tours > 0 && --e.tours <= 0) {
          oterEtat(u, e.id);
          if (e.id === 'inconscient' && debout(u)) await ui.message(`${Le(u)} se réveille.`);
        }
      }
      for (const b of u.bonus) if (!b.source?.sort && b.tours > 0) b.tours--;
      u.bonus = u.bonus.filter((b) => b.source?.sort || b.tours > 0);
      maj(u);
    }

    const fini = () => fuite || !vivants(monstres).length || !vivants(heros).length;
    const garder = () => {
      for (const h of heros) {
        // Les états d'avant le combat restent ; ceux du combat s'effacent. Un héros à terre (pas mort) se relève avec 1 PV.
        h.c.etats = h.etats.filter((e) => e.garde).map((e) => e.id);
      }
    };

    // ======================= Le combat =======================
    if (!heros.some(debout)) return { issue: 'defaite' };
    for (const u of monstres) partie.dex.vus[u.m.id] = true;
    await ui.ouvrir({ jeu, fond, heros: heros.map(vueHeros), ennemis: monstres.map(vueMonstre), boss: monstres.some((u) => u.m.boss) });
    const noms = Object.entries(monstres.reduce((o, u) => { o[u.m.nom || u.m.id] = (o[u.m.nom || u.m.id] || 0) + 1; return o; }, {}));
    await ui.message(`${noms.map(([n, k]) => (k > 1 ? `${k} ${pluriel(n)}` : n)).join(', ').replace(/, ([^,]*)$/, ' et $1')} ${monstres.length > 1 ? 'surgissent' : 'surgit'} !`, { attendre: true });

    // 1. L'initiative.
    const lignesInit = [];
    for (const u of [...heros.filter(debout), ...monstres]) {
      const des = D.d20(partie);
      const dex = estHeros(u) ? P.initiative(jeu, u.c) : modDe(u, 'dex') + (Number(u.m.initiative) || 0);
      u.init = Math.round(await Maison.formule('initiative', { naturel: des.naturel, dex }, () => des.naturel + dex));
      u.departage = dex + (estHeros(u) ? 0.5 : 0) + D.aleatoire(partie) * 0.1;
      lignesInit.push(D.noter(partie, { qui: nom(u), quoi: 'Initiative', formule: 'd20', des: des.des, bonus: u.init - des.naturel, total: u.init }));
    }
    await montrer('Initiative', lignesInit);
    const ordre = [...heros, ...monstres].sort((a, b) => b.init - a.init || b.departage - a.departage);
    await ui.message(`Ordre du tour : ${ordre.filter((u) => debout(u) || estHeros(u)).map((u) => nom(u)).join(', ')}.`, { attendre: true });

    // 2. Les tours, jusqu'à la fin.
    let tour = 0;
    while (!fini() && tour < 200) {
      tour++;
      frappesAuContact = new Map();
      for (const u of ordre) {
        if (fini()) break;
        if (estHeros(u) && !debout(u)) { if (!u.c.mort_definitive) await jetContreLaMort(u); continue; }
        if (!debout(u)) continue;
        if (incapable(u)) {
          await ui.message(`${Le(u)} ne peut pas agir (${u.etats.filter((e) => B.trouver(jeu, 'etats', e.id)?.effets?.includes('incapable')).map((e) => B.nomEtat(jeu, e.id).toLowerCase()).join(', ')}).`);
        } else if (aEtat(u, 'a_terre')) {
          oterEtat(u, 'a_terre'); // se relever : la moitié de son déplacement (on ne compte pas les cases ici)
          await ui.message(`${Le(u)} se relève.`);
          if (estHeros(u)) await tourHeros(u); else await tourMonstre(u);
        } else if (estHeros(u)) await tourHeros(u);
        else await tourMonstre(u);
        if (fuite) break;
        await finDeTour(u);
        if (u.rage && estHeros(u) && !debout(u)) u.rage = false;
      }
    }

    // 3. La fin.
    ui.bandeau('');
    if (fuite) {
      await ui.message('Le groupe prend la fuite !');
      garder();
      ui.fermer();
      return { issue: 'fuite' };
    }
    if (!vivants(monstres).length) {
      await ui.message('Victoire !', { attendre: true, fanfare: true });
      partie.compteurs.monstres_vaincus = (partie.compteurs.monstres_vaincus || 0) + monstres.length;
      // L'expérience (sauf en progression « par jalons ») : partagée entre les héros qui ne sont pas morts.
      const vifs = heros.filter((h) => !h.c.mort_definitive);
      if (R.progression !== 'jalons') {
        const total = monstres.reduce((s, u) => s + (Number(u.m.xp) || B.xpFp(u.m.fp)), 0);
        const part = Math.max(0, Math.round(await Maison.formule('experience', { total, heros: vifs.length }, (v) => Math.floor(v.total / Math.max(1, v.heros)))));
        for (const h of vifs) h.c.xp += part;
        await ui.message(`Chaque héros gagne ${part} XP.`, { attendre: true });
        for (const h of vifs) if (P.peutMonter(jeu, h.c)) await ui.message(`${nom(h)} peut passer au niveau ${h.c.niveau + 1} ! (menu ${Regles.menus(jeu).equipe} › ${nom(h)} › Monter de niveau)`, { attendre: true, fanfare: true });
      }
      // L'or et le butin.
      let or = 0;
      for (const u of monstres) or += typeof u.m.or === 'string' && /d/.test(u.m.or) ? D.lancer(partie, u.m.or).total : Number(u.m.or) || 0;
      if (or) { partie.argent = (partie.argent || 0) + or; await ui.message(`Le groupe trouve ${or} ${B.monnaie(jeu)}.`, { attendre: true }); }
      const butin = {};
      for (const u of monstres) for (const b of u.m.butin || []) if (P.objet(jeu, b.objet) && D.chance(partie, Number(b.chance) || 0)) butin[b.objet] = (butin[b.objet] || 0) + (Number(b.nombre) || 1);
      for (const [id, n] of Object.entries(butin)) {
        partie.sac[id] = (partie.sac[id] || 0) + n;
        await ui.message(`Tu trouves ${P.objet(jeu, id).nom}${n > 1 ? ` ×${n}` : ''} !`, { attendre: true });
      }
      // Les héros à terre mais vivants se relèvent avec 1 PV.
      for (const h of heros) if (!debout(h) && !h.c.mort_definitive) { h.c.pv = 1; h.c.mort = { succes: 0, echecs: 0 }; h.c.stable = false; }
      for (const h of heros) finirConcentration(h, false);
      const morts = heros.filter((h) => h.c.mort_definitive);
      if (morts.length) await ui.message(`${morts.map(nom).join(' et ')} ${morts.length > 1 ? 'sont tombés' : 'est tombé'}… Un sort de Retour à la vie peut encore ${morts.length > 1 ? 'les' : 'le'} sauver.`, { attendre: true });
      garder();
      ui.fermer();
      return { issue: 'victoire' };
    }
    await ui.message('Le groupe est vaincu…', { attendre: true });
    garder();
    ui.fermer();
    return { issue: 'defaite' };
  }

  return { lancer };
})();
