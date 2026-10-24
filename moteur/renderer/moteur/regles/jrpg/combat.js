// Le pack JRPG classique (Saga 0.8) : les combats au tour par tour, le groupe du joueur contre un
// groupe de monstres, façon Dragon Quest et Final Fantasy des débuts.
//
// Un tour : le joueur donne un ordre à chaque héros (Attaquer, Compétences, Objet, Défendre, Fuir),
// les monstres choisissent le leur, puis tout le monde agit dans l'ordre de l'Agilité (avec un peu de
// hasard). Ce fichier décide ; l'écran (ecran-groupe.js) montre et demande, avec des promesses.
//
// lancer() rend { issue } : 'victoire', 'defaite' ou 'fuite'. La partie est modifiée sur place (PV,
// PM, expérience, or, sac, bestiaire : partie.dex.vus et partie.dex.pris pour les monstres vaincus).
//
// Les formules sont dans de petites fonctions (degats, touche, soin, ordre, choixMonstre) : ce sont
// elles qu'un script du jeu pourra remplacer un jour (REGLES.md).

const JrpgCombat = (() => {
  const H = JrpgHeros;
  const hasard = (n) => Math.floor(Math.random() * n);
  const chance = (p) => Math.random() * 100 < p;
  const borne = (v, min, max) => Math.max(min, Math.min(max, v));
  // L'attaque de base (Attaquer) : physique, puissance 100, l'élément de l'arme.
  const ATTAQUE = { id: '', nom: 'Attaque', categorie: 'physique', puissance: 100, precision: 95, cible: 'adversaire', type: '', cout_pm: 0, stats: [], statut: '' };
  const DUREES = { sommeil: [2, 4], paralysie: [1, 3] };
  const MESSAGES_STATUT = { poison: 'est empoisonné', sommeil: 's\'endort', paralysie: 'est paralysé', silence: 'ne peut plus lancer de sorts', cecite: 'est aveuglé' };
  const LETTRES = 'ABCDEFGHIJ';
  const MAX_MONSTRES = 8;
  // Les monstres sans statistiques écrites : un petit monstre de niveau 1.
  const MONSTRE = { pv: 20, pm: 0, force: 7, magie: 5, defense: 5, esprit: 4, agilite: 6, chance: 3 };

  // --- Les formules (REGLES.md › « Formules du pack JRPG ») ---
  // Les dégâts d'un coup : A × A / (A + D) × 1,6 × puissance / 100, puis faiblesse, critique, défense, hasard.
  function formuleDegats({ A, D, puissance, element = 1, critique = false, defend = false }) {
    let n = (A * A) / Math.max(1, A + D) * 1.6 * (puissance / 100);
    n *= element * (critique ? 2 : 1) * (defend ? 0.5 : 1) * (0.9 + Math.random() * 0.2);
    return element === 0 ? 0 : Math.max(1, Math.round(n));
  }
  // Un soin de compétence : sa puissance de soin plus la Magie du lanceur, avec un peu de hasard.
  const formuleSoin = ({ soin, magie }) => Math.max(1, Math.round((soin + magie) * (0.9 + Math.random() * 0.2)));
  // Toucher : la précision, moins la moitié de l'Agilité que la cible a en plus ; aveuglé : deux fois moins.
  const formuleTouche = ({ precision, agiliteA, agiliteD, aveugle }) => (precision - Math.max(0, (agiliteD - agiliteA) / 2)) * (aveugle ? 0.5 : 1);
  // Un coup critique (physique seulement) : 3 % + Chance / 4, plus 10 % par palier de la compétence.
  const formuleCritique = ({ chance: c, paliers }) => 3 + c / 4 + paliers * 10;
  // Fuir : 50 %, plus deux fois l'écart d'Agilité moyenne, plus 10 % par essai raté.
  const formuleFuite = ({ agiliteHeros, agiliteMonstres, essais }) => borne(50 + (agiliteHeros - agiliteMonstres) * 2 + essais * 10, 5, 95);

  async function lancer({ jeu, partie, ui, groupe = null, fond = 'herbes' }) {
    const trouver = (sorte, id) => H.trouver(jeu, sorte, id);
    const g = typeof groupe === 'string' ? trouver('groupes', groupe) : groupe;
    const monnaie = H.reglages(jeu).monnaie || 'Or';
    partie.dex = partie.dex || { vus: {}, pris: {} };
    partie.compteurs = partie.compteurs || {};

    // --- Les deux camps ---
    const heros = partie.equipe.map((c, i) => ({ camp: 'heros', i, c, statuts: c.statut === 'poison' && c.pv > 0 ? { poison: true } : {}, etages: {}, defend: false }));
    const monstres = [];
    for (const x of g?.monstres || []) {
      const m = trouver('monstres', x.monstre);
      if (!m) continue;
      for (let k = 0; k < borne(Math.round(Number(x.nombre) || 1), 1, 9) && monstres.length < MAX_MONSTRES; k++) {
        const s = { ...MONSTRE, ...Object.fromEntries(Object.entries(m.stats || {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k2, v]) => [k2, Number(v)])) };
        monstres.push({ camp: 'ennemis', i: monstres.length, m, nom: m.nom || m.id, s, pv: Math.max(1, s.pv), pvMax: Math.max(1, s.pv), pm: s.pm, pmMax: s.pm, statuts: {}, etages: {}, defend: false });
      }
    }
    if (!monstres.length) return { issue: 'fuite' }; // un groupe vide (ou supprimé dans Tafl) : pas de combat
    // Deux Gobelins : « Gobelin A », « Gobelin B ».
    const parNom = {};
    for (const u of monstres) parNom[u.nom] = (parNom[u.nom] || 0) + 1;
    const vus = {};
    for (const u of monstres) if (parNom[u.nom] > 1) { vus[u.nom] = (vus[u.nom] || 0) + 1; u.nom = `${u.nom} ${LETTRES[vus[u.nom] - 1]}`; }

    // --- Lire et changer un combattant, héros ou monstre ---
    const estHeros = (u) => u.camp === 'heros';
    const pv = (u) => (estHeros(u) ? u.c.pv : u.pv);
    const pvMax = (u) => (estHeros(u) ? H.pvMax(jeu, u.c) : u.pvMax);
    const pm = (u) => (estHeros(u) ? u.c.pm : u.pm);
    const pmMax = (u) => (estHeros(u) ? H.pmMax(jeu, u.c) : u.pmMax);
    const vivant = (u) => pv(u) > 0;
    const nom = (u) => (estHeros(u) ? H.nom(jeu, u.c) : u.nom);
    function mettrePv(u, v) { v = borne(Math.round(v), 0, pvMax(u)); if (estHeros(u)) u.c.pv = v; else u.pv = v; }
    function mettrePm(u, v) { v = borne(Math.round(v), 0, pmMax(u)); if (estHeros(u)) u.c.pm = v; else u.pm = v; }
    // Une statistique en combat : avec l'équipement, et les hausses et baisses (étages de −4 à +4).
    const multEtage = (e) => (e >= 0 ? (2 + e) / 2 : 2 / (2 - e));
    const statBrute = (u, s) => (estHeros(u) ? H.stats(jeu, u.c)[s] : Number(u.s[s]) || 0);
    const stat = (u, s) => Math.max(1, Math.floor(statBrute(u, s) * multEtage(u.etages[s] || 0)));
    const allies = (u) => (estHeros(u) ? heros : monstres);
    const ennemis = (u) => (estHeros(u) ? monstres : heros);
    const vivants = (l) => l.filter(vivant);
    const statutCourt = (u) => Object.keys(u.statuts).filter((k) => u.statuts[k]).map((k) => H.COURTS[k]).filter(Boolean).join(' ');

    // Ce que l'écran montre de chacun.
    const vueHeros = (u) => ({ nom: nom(u), apparence: H.apparence(jeu, u.c), pv: pv(u), pvMax: pvMax(u), pm: pm(u), pmMax: pmMax(u), statut: statutCourt(u), ko: !vivant(u) });
    const vueMonstre = (u) => ({ nom: u.nom, image: u.m.image || '', taille: u.m.taille || 'moyen', boss: Boolean(u.m.boss), ko: !vivant(u) });
    const montrer = (u) => (estHeros(u) ? ui.heros(u.i, vueHeros(u)) : ui.ennemi(u.i, vueMonstre(u)));

    // --- Les effets ---
    async function mourir(u) {
      u.statuts = {};
      u.etages = {};
      montrer(u);
      await ui.animer(u.camp, u.i, 'ko');
      await ui.message(estHeros(u) ? `${nom(u)} est K.O. !` : `${nom(u)} est vaincu !`);
      if (!estHeros(u)) partie.dex.pris[u.m.id] = true;
    }
    async function blesser(u, n, { critique = false } = {}) {
      mettrePv(u, pv(u) - n);
      ui.nombre(u.camp, u.i, String(n), critique ? 'critique' : 'degats');
      await ui.animer(u.camp, u.i, 'touche');
      // Un coup réveille une fois sur deux.
      if (u.statuts.sommeil && vivant(u) && chance(50)) { delete u.statuts.sommeil; await ui.message(`${nom(u)} se réveille !`); }
      montrer(u);
      if (!vivant(u)) await mourir(u);
    }
    async function guerirPv(u, n) {
      const avant = pv(u);
      mettrePv(u, pv(u) + n);
      ui.nombre(u.camp, u.i, String(pv(u) - avant), 'soin');
      await ui.animer(u.camp, u.i, 'soin');
      montrer(u);
    }
    async function infliger(u, statut) {
      if (!MESSAGES_STATUT[statut] || !vivant(u)) return;
      const immunise = !estHeros(u) && ((u.m.statuts_immunises || []).includes(statut) || (u.m.boss && (statut === 'sommeil' || statut === 'paralysie')));
      if (immunise) { ui.nombre(u.camp, u.i, 'Immunisé', 'info'); return; }
      if (u.statuts[statut]) return;
      const d = DUREES[statut];
      u.statuts[statut] = d ? d[0] + hasard(d[1] - d[0] + 1) : true;
      montrer(u);
      await ui.message(`${nom(u)} ${MESSAGES_STATUT[statut]} !`);
    }
    async function changerEtage(u, s, n) {
      if (!vivant(u) || !n || !['force', 'magie', 'defense', 'esprit', 'agilite'].includes(s)) return;
      const avant = u.etages[s] || 0, apres = borne(avant + n, -4, 4);
      if (apres === avant) return;
      u.etages[s] = apres;
      ui.nombre(u.camp, u.i, `${H.NOMS_STATS[s]} ${n > 0 ? '▲' : '▼'}`, n > 0 ? 'hausse' : 'baisse');
      await ui.animer(u.camp, u.i, n > 0 ? 'hausse' : 'baisse');
    }
    // L'élément d'un coup contre un monstre : ×2 sur une faiblesse, ×½ sur une résistance, ×0 s'il est immunisé.
    function multElement(element, d) {
      if (!element || estHeros(d)) return 1;
      if ((d.m.immunites || []).includes(element)) return 0;
      if ((d.m.faiblesses || []).includes(element)) return 2;
      if ((d.m.resistances || []).includes(element)) return 0.5;
      return 1;
    }

    // --- Les cibles d'une action ---
    // L'ordre garde la cible choisie ({ camp, i } ou { tous: true }) ; si elle est tombée entre-temps,
    // l'action va sur une autre (un ennemi au hasard, l'allié le plus blessé).
    const plusBlesse = (l) => [...l].sort((a, b) => pv(a) / pvMax(a) - pv(b) / pvMax(b))[0];
    function cibles(u, comp, choix) {
      const camp = (c) => (c === 'heros' ? heros : monstres);
      switch (comp.cible) {
        case 'soi': return [u];
        case 'equipe': return comp.ranime ? allies(u) : vivants(allies(u));
        case 'adversaires': return vivants(ennemis(u));
        case 'tous': return [...vivants(allies(u)), ...vivants(ennemis(u))].filter((x) => x !== u);
        case 'allie': {
          const t = choix?.camp ? camp(choix.camp)[choix.i] : null;
          if (t && (vivant(t) || comp.ranime)) return [t];
          const l = vivants(allies(u));
          return l.length ? [plusBlesse(l)] : [];
        }
        default: { // un adversaire
          const t = choix?.camp ? camp(choix.camp)[choix.i] : null;
          if (t && vivant(t)) return [t];
          const l = vivants(ennemis(u));
          return l.length ? [l[hasard(l.length)]] : [];
        }
      }
    }

    // --- Une compétence (ou l'attaque de base) ---
    async function utiliser(u, comp, choix) {
      const base = comp === ATTAQUE;
      const cout = Number(comp.cout_pm) || 0;
      if (!base) {
        if (u.statuts.silence && comp.categorie === 'speciale') { await ui.message(`${nom(u)} ne peut pas lancer de sort !`); return; }
        if (pm(u) < cout) { await ui.message(`${nom(u)} n'a pas assez de PM !`); return; }
        mettrePm(u, pm(u) - cout);
        if (estHeros(u)) montrer(u);
        ui.bandeau(comp.nom);
      }
      const ts = cibles(u, comp, choix);
      if (estHeros(u)) await ui.animer('heros', u.i, 'avance');
      else await ui.animer('ennemis', u.i, 'attaque');
      if (!base && ts.length) await ui.effet(ts.map((t) => [t.camp, t.i]), trouver('types', comp.type)?.couleur || (comp.soin > 0 || comp.ranime ? '#7dffb0' : '#ffffff'));
      const element = base && estHeros(u) ? H.bonus(jeu, u.c).element : comp.type;
      const physique = comp.categorie === 'physique';
      for (const t of ts) {
        // Ranimer un K.O. : ses PV reviennent (le soin de la compétence, sinon un quart).
        if (comp.ranime && !vivant(t)) {
          mettrePv(t, Math.max(1, comp.soin > 0 ? formuleSoin({ soin: comp.soin, magie: stat(u, 'magie') }) : pvMax(t) / 4));
          await ui.animer(t.camp, t.i, 'ranime');
          montrer(t);
          await ui.message(`${nom(t)} reprend connaissance !`);
          continue;
        }
        if (!vivant(t)) continue;
        // Les dégâts.
        if (comp.categorie !== 'statut' && Number(comp.puissance) > 0) {
          const precision = Number(comp.precision) || 100;
          if ((physique || precision < 100) && !chance(formuleTouche({ precision, agiliteA: stat(u, 'agilite'), agiliteD: stat(t, 'agilite'), aveugle: Boolean(u.statuts.cecite) && physique }))) {
            ui.nombre(t.camp, t.i, 'Raté', 'rate');
            await ui.animer(t.camp, t.i, 'esquive');
            continue;
          }
          const eff = multElement(element, t);
          if (eff === 0) { ui.nombre(t.camp, t.i, 'Immunisé', 'info'); continue; }
          const critique = physique && chance(formuleCritique({ chance: stat(u, 'chance'), paliers: Number(comp.critique) || 0 }));
          const A = stat(u, physique ? 'force' : 'magie'), D = stat(t, physique ? 'defense' : 'esprit');
          const n = formuleDegats({ A, D, puissance: Number(comp.puissance) || 100, element: eff, critique, defend: t.defend });
          if (eff > 1) ui.nombre(t.camp, t.i, 'Faiblesse !', 'info');
          await blesser(t, n, { critique });
          if (critique) await ui.message('Coup critique !');
          if (!vivant(t)) continue;
        }
        // Les soins (PV), puis les statuts guéris.
        if (Number(comp.soin) > 0 && !comp.ranime) await guerirPv(t, formuleSoin({ soin: Number(comp.soin), magie: stat(u, 'magie') }));
        const guerit = comp.guerit || [];
        const gueris = Object.keys(t.statuts).filter((k) => guerit.includes('tous') || guerit.includes(k));
        if (gueris.length) { for (const k of gueris) delete t.statuts[k]; montrer(t); await ui.message(`${nom(t)} va mieux.`); }
        // Le statut infligé (chance_statut 0 = toujours).
        if (comp.statut && (!comp.chance_statut || chance(comp.chance_statut))) await infliger(t, comp.statut);
        // Les hausses et baisses sur la cible (stats_cible « adversaire » : la cible de la compétence).
        if (comp.stats?.length && comp.stats_cible !== 'soi' && (!comp.chance_stats || chance(comp.chance_stats))) {
          for (const s of comp.stats) await changerEtage(t, s.stat, Number(s.etages) || 0);
        }
      }
      if (comp.stats?.length && comp.stats_cible === 'soi' && (!comp.chance_stats || chance(comp.chance_stats))) {
        for (const s of comp.stats) await changerEtage(u, s.stat, Number(s.etages) || 0);
      }
      if (estHeros(u)) await ui.animer('heros', u.i, 'recule');
      ui.bandeau('');
    }

    // --- Les objets du sac en combat ---
    const EFFETS_COMBAT = ['soin', 'soin_pm', 'rappel', 'soin_statut'];
    function objetsCombat(reserves) {
      return Object.entries(partie.sac).map(([id, n]) => ({ id, n: n - (reserves[id] || 0), o: trouver('objets', id) }))
        .filter((x) => x.o && EFFETS_COMBAT.includes(x.o.effet?.type) && (partie.sac[x.id] || 0) > 0);
    }
    async function utiliserObjet(u, id, choix) {
      const o = trouver('objets', id), e = o?.effet || {};
      if (!o || !(partie.sac[id] > 0)) { await ui.message(`Il n'y a plus de ${o?.nom || id} !`); return; }
      partie.sac[id]--;
      if (partie.sac[id] <= 0) delete partie.sac[id];
      ui.bandeau(o.nom);
      await ui.animer('heros', u.i, 'avance');
      let t = heros[choix?.i] || u;
      if (e.type !== 'rappel' && !vivant(t)) t = plusBlesse(vivants(heros)) || u;
      const v = Number(e.valeur) || 0;
      if (e.type === 'rappel') {
        if (vivant(t)) ui.nombre('heros', t.i, 'Sans effet', 'info');
        else {
          mettrePv(t, Math.max(1, pvMax(t) * (v || 25) / 100));
          await ui.animer('heros', t.i, 'ranime');
          montrer(t);
          await ui.message(`${nom(t)} reprend connaissance !`);
        }
      } else if (e.type === 'soin') {
        await guerirPv(t, v >= 9999 || !v ? pvMax(t) : v);
        if (e.statut && Object.keys(t.statuts).length) { t.statuts = e.statut === 'tous' ? {} : Object.fromEntries(Object.entries(t.statuts).filter(([k]) => k !== e.statut)); montrer(t); }
      } else if (e.type === 'soin_pm') {
        const avant = pm(t);
        mettrePm(t, pm(t) + (v >= 9999 || !v ? pmMax(t) : v));
        ui.nombre('heros', t.i, `${pm(t) - avant} PM`, 'pm');
        await ui.animer('heros', t.i, 'soin');
        montrer(t);
      } else if (e.type === 'soin_statut') {
        const avant = Object.keys(t.statuts).length;
        if (!e.statut || e.statut === 'tous') t.statuts = {};
        else delete t.statuts[e.statut];
        montrer(t);
        if (Object.keys(t.statuts).length < avant) await ui.message(`${nom(t)} va mieux.`);
        else ui.nombre('heros', t.i, 'Sans effet', 'info');
      }
      await ui.animer('heros', u.i, 'recule');
      ui.bandeau('');
    }

    // --- Ce que choisit un monstre ---
    // Ses compétences ont un poids (une chance relative), l'attaque de base aussi (poids_attaque).
    // Un soin ne sert que si un allié a perdu plus de la moitié de ses PV ; ranimer, s'il y a un K.O.
    function choixMonstre(u) {
      const options = [{ comp: ATTAQUE, poids: Number.isFinite(Number(u.m.poids_attaque)) ? Number(u.m.poids_attaque) : 50 }];
      for (const x of u.m.competences || []) {
        const c = trouver('attaques', x.competence);
        if (!c || (Number(c.cout_pm) || 0) > pm(u) || (u.statuts.silence && c.categorie === 'speciale')) continue;
        if (c.ranime && !monstres.some((a) => !vivant(a))) continue;
        if (Number(c.soin) > 0 && !c.ranime && !vivants(monstres).some((a) => pv(a) / pvMax(a) < 0.5)) continue;
        options.push({ comp: c, poids: Math.max(0, Number(x.poids) || 10) });
      }
      const total = options.reduce((s, x) => s + x.poids, 0);
      let tirage = Math.random() * total;
      const { comp } = (total > 0 && options.find((x) => (tirage -= x.poids) < 0)) || options[0];
      let choix = null;
      if (comp.cible === 'allie') {
        const l = comp.ranime ? monstres.filter((a) => !vivant(a)) : vivants(monstres);
        const t = comp.ranime ? l[hasard(l.length)] : plusBlesse(l);
        if (t) choix = { camp: 'ennemis', i: t.i };
      } else if (!comp.cible || comp.cible === 'adversaire') {
        const l = vivants(heros);
        // Une fois sur quatre, il vise le héros le plus blessé.
        const t = chance(25) ? plusBlesse(l) : l[hasard(l.length)];
        if (t) choix = { camp: 'heros', i: t.i };
      }
      return { type: comp === ATTAQUE ? 'attaque' : 'competence', comp, cible: choix };
    }

    // --- Le choix du joueur, héros par héros ---
    // Retour revient au héros d'avant. Rend la liste des ordres, ou 'fuite' (réussie), ou null (fuite ratée).
    const peutAgir = (u) => vivant(u) && !u.statuts.sommeil && !u.statuts.paralysie;
    let essaisFuite = 0;
    async function choisirCible(u, comp) {
      switch (comp.cible) {
        case 'soi': case 'tous': return {};
        case 'adversaires': return (await ui.cible({ camp: 'ennemis', tous: true, possibles: monstres.map(vivant) })) == null ? null : { tous: true };
        case 'equipe': return (await ui.cible({ camp: 'heros', tous: true, possibles: heros.map((h) => vivant(h) || Boolean(comp.ranime)) })) == null ? null : { tous: true };
        case 'allie': {
          const i = await ui.cible({ camp: 'heros', possibles: heros.map((h) => (comp.ranime ? true : vivant(h))), depart: u.i });
          return i == null ? null : { camp: 'heros', i };
        }
        default: {
          const i = await ui.cible({ camp: 'ennemis', possibles: monstres.map(vivant) });
          return i == null ? null : { camp: 'ennemis', i };
        }
      }
    }
    async function ordresDuJoueur() {
      const ordres = heros.map(() => null);
      const reserves = {};
      let k = 0;
      while (k < heros.length) {
        const u = heros[k];
        if (!peutAgir(u)) { k++; continue; }
        const connues = H.competences(jeu, u.c);
        const sac = objetsCombat(reserves);
        const choix = await ui.commande(k, [
          { id: 'attaque', texte: 'Attaquer', icone: 'flame' },
          { id: 'competences', texte: 'Compétences', icone: 'sparkle', desactive: !connues.length },
          { id: 'objet', texte: 'Objet', icone: 'briefcase', desactive: !sac.some((x) => x.n > 0) },
          { id: 'defendre', texte: 'Défendre', icone: 'shield' },
          { id: 'fuir', texte: 'Fuir', icone: 'run-all', desactive: g.fuite === false },
        ]);
        if (choix == null) {
          // Retour : le héros d'avant (son ordre est oublié).
          let j = k - 1;
          while (j >= 0 && !peutAgir(heros[j])) j--;
          if (j >= 0) {
            if (ordres[j]?.type === 'objet') reserves[ordres[j].id]--;
            ordres[j] = null;
            k = j;
          }
          continue;
        }
        if (choix === 'attaque') {
          const c = await choisirCible(u, ATTAQUE);
          if (!c) continue;
          ordres[k] = { type: 'attaque', comp: ATTAQUE, cible: c };
        } else if (choix === 'competences') {
          const comps = connues.map((id) => trouver('attaques', id));
          const i = await ui.liste(`Compétences de ${nom(u)}`, comps.map((c) => ({
            texte: c.nom, detail: `${Number(c.cout_pm) || 0} PM${c.type ? ` · ${trouver('types', c.type)?.nom || c.type}` : ''}`,
            desactive: (Number(c.cout_pm) || 0) > pm(u) || (u.statuts.silence && c.categorie === 'speciale'),
            couleur: trouver('types', c.type)?.couleur || '',
          })), true);
          if (i == null) continue;
          const cible = await choisirCible(u, comps[i]);
          if (!cible) continue;
          ordres[k] = { type: 'competence', comp: comps[i], cible };
        } else if (choix === 'objet') {
          const l = sac.filter((x) => x.n > 0);
          const i = await ui.liste('Objet', l.map((x) => ({ texte: x.o.nom, detail: `×${x.n}`, image: x.o.icone || '' })), true);
          if (i == null) continue;
          const ranime = l[i].o.effet.type === 'rappel';
          const j = await ui.cible({ camp: 'heros', possibles: heros.map((h) => (ranime ? !vivant(h) : vivant(h))), depart: ranime ? heros.findIndex((h) => !vivant(h)) : u.i });
          if (j == null) continue;
          reserves[l[i].id] = (reserves[l[i].id] || 0) + 1;
          ordres[k] = { type: 'objet', id: l[i].id, cible: { camp: 'heros', i: j } };
        } else if (choix === 'defendre') {
          ordres[k] = { type: 'defendre' };
        } else if (choix === 'fuir') {
          const moyenne = (l) => l.reduce((s, x) => s + stat(x, 'agilite'), 0) / Math.max(1, l.length);
          if (chance(formuleFuite({ agiliteHeros: moyenne(vivants(heros)), agiliteMonstres: moyenne(vivants(monstres)), essais: essaisFuite }))) return 'fuite';
          essaisFuite++;
          await ui.message('Impossible de fuir !');
          return null;
        }
        k++;
      }
      return ordres;
    }

    // --- Le tour d'un combattant ---
    async function agir(u, ordre) {
      if (!vivant(u)) return;
      for (const s of ['sommeil', 'paralysie']) {
        if (!u.statuts[s]) continue;
        u.statuts[s]--;
        if (u.statuts[s] > 0) { await ui.message(s === 'sommeil' ? `${nom(u)} dort profondément.` : `${nom(u)} est paralysé et ne peut pas bouger !`); return; }
        delete u.statuts[s];
        montrer(u);
        await ui.message(s === 'sommeil' ? `${nom(u)} se réveille !` : `${nom(u)} peut de nouveau bouger !`);
        return; // il a perdu ce tour en se remettant
      }
      if (!ordre) return;
      if (ordre.type === 'defendre') return; // déjà en garde depuis le début du tour
      if (ordre.type === 'objet') await utiliserObjet(u, ordre.id, ordre.cible);
      else await utiliser(u, ordre.comp, ordre.cible);
    }
    // L'ordre du tour : l'Agilité, ±25 % de hasard.
    const ordre = (l) => l.map((u) => ({ u, v: stat(u, 'agilite') * (0.75 + Math.random() * 0.5) })).sort((a, b) => b.v - a.v).map((x) => x.u);
    const fini = () => !vivants(monstres).length || !vivants(heros).length;

    // Les statuts qui restent après le combat : seulement le poison.
    const garderStatuts = () => { for (const h of heros) h.c.statut = vivant(h) && h.statuts.poison ? 'poison' : ''; };

    // ======================= Le combat =======================
    if (!vivants(heros).length) return { issue: 'defaite' };
    for (const u of monstres) partie.dex.vus[u.m.id] = true;
    await ui.ouvrir({ jeu, fond, heros: heros.map(vueHeros), ennemis: monstres.map(vueMonstre), boss: monstres.some((u) => u.m.boss) });
    const noms = Object.entries(monstres.reduce((o, u) => { o[u.m.nom || u.m.id] = (o[u.m.nom || u.m.id] || 0) + 1; return o; }, {}));
    await ui.message(`${noms.map(([n, k]) => (k > 1 ? `${k} ${n}` : n)).join(', ').replace(/, ([^,]*)$/, ' et $1')} ${monstres.length > 1 ? 'apparaissent' : 'apparaît'} !`, { attendre: true });

    for (;;) {
      // 1. Les ordres du joueur, puis ceux des monstres.
      const ordres = await ordresDuJoueur();
      if (ordres === 'fuite') {
        await ui.message('Le groupe prend la fuite !');
        garderStatuts();
        ui.fermer();
        return { issue: 'fuite' };
      }
      const tous = new Map();
      if (ordres) heros.forEach((u, k) => { if (ordres[k]) tous.set(u, ordres[k]); });
      for (const u of vivants(monstres)) tous.set(u, choixMonstre(u));
      for (const [u, o] of tous) u.defend = o.type === 'defendre';
      // 2. Chacun agit à son tour.
      for (const u of ordre([...vivants(heros), ...vivants(monstres)])) {
        await agir(u, tous.get(u));
        if (fini()) break;
      }
      // 3. La fin du tour : le poison, la garde qui tombe.
      for (const u of [...heros, ...monstres]) {
        u.defend = false;
        if (fini() || !vivant(u) || !u.statuts.poison) continue;
        await ui.message(`${nom(u)} souffre du poison !`);
        await blesser(u, Math.max(1, Math.floor(pvMax(u) / 12)));
      }
      for (const u of heros) montrer(u);

      // 4. La fin du combat.
      if (!vivants(monstres).length) {
        ui.bandeau('');
        await ui.message('Victoire !', { attendre: true, fanfare: true });
        const xp = monstres.reduce((s, u) => s + (Number(u.m.xp) || 0), 0);
        const or = monstres.reduce((s, u) => s + (Number(u.m.or) || 0), 0);
        partie.argent = (partie.argent || 0) + or;
        partie.compteurs.monstres_vaincus = (partie.compteurs.monstres_vaincus || 0) + monstres.length;
        await ui.message(`Le groupe gagne ${xp} points d'expérience${or ? ` et ${or} ${monnaie}` : ''}.`, { attendre: true });
        // Le butin : chaque monstre, chaque objet avec sa chance.
        const butin = {};
        for (const u of monstres) for (const b of u.m.butin || []) if (trouver('objets', b.objet) && chance(Number(b.chance) || 0)) butin[b.objet] = (butin[b.objet] || 0) + 1;
        for (const [id, n] of Object.entries(butin)) {
          partie.sac[id] = (partie.sac[id] || 0) + n;
          await ui.message(`Tu trouves ${trouver('objets', id).nom}${n > 1 ? ` ×${n}` : ''} !`, { attendre: true });
        }
        // L'expérience : chaque héros debout la reçoit entière.
        for (const u of vivants(heros)) {
          for (const ev of H.gagnerXp(jeu, u.c, xp)) {
            montrer(u);
            if (ev.type === 'niveau') await ui.message(`${nom(u)} passe au niveau ${ev.niveau} !`, { attendre: true, fanfare: true });
            else if (ev.type === 'apprend') await ui.message(`${nom(u)} apprend ${trouver('attaques', ev.competence)?.nom || ev.competence} !`, { attendre: true });
          }
        }
        garderStatuts();
        ui.fermer();
        return { issue: 'victoire' };
      }
      if (!vivants(heros).length) {
        await ui.message('Le groupe est vaincu…', { attendre: true });
        const perdu = Math.floor((partie.argent || 0) / 2);
        if (perdu) { partie.argent -= perdu; await ui.message(`Dans la panique, tu perds ${perdu} ${monnaie}…`, { attendre: true }); }
        garderStatuts();
        ui.fermer();
        return { issue: 'defaite' };
      }
    }
  }

  return { lancer, ATTAQUE, formuleDegats, formuleSoin, formuleTouche, formuleCritique, formuleFuite };
})();
