// Les combats (Saga 0.3) : un contre un, contre une créature sauvage ou un dresseur, au tour par
// tour, avec les règles des jeux officiels (dégâts, types, coups critiques, précision, statuts,
// étages de statistiques, priorité, vitesse, capture, fuite, expérience, évolution en plein combat).
//
// Ce fichier décide ; l'écran (ecran-combat.js) montre et demande. Chaque étape attend l'écran
// (« await ui.message(…) ») : le combat se lit de haut en bas, comme un script.
//
// lancer() rend { issue } : 'victoire', 'defaite', 'fuite' ou 'capture'. La partie est modifiée
// sur place (PV, PP, expérience, sac, captures, argent).
//
// Saga 1.0 : un duel amical entre deux joueurs (multijoueur) passe `duel` :
//   { nom, equipe, choisir(infos) }  nom et équipe de l'autre joueur, et ce qu'il décide à chaque tour
//                                    (l'IA est remplacée par ses choix, envoyés par le réseau).
// Dans un duel, personne ne gagne d'expérience, d'argent ni de créature : les équipes sont remises en
// état par celui qui a lancé le duel (reseau/duel.js).

const Combat = (() => {
  const C = Creatures;
  const hasard = (n) => Math.floor(Math.random() * n);
  const chance = (pourcent) => Math.random() * 100 < pourcent;
  const ETAGES = ['attaque', 'defense', 'att_spe', 'def_spe', 'vitesse', 'precision', 'esquive'];
  const LUTTE = { id: 'lutte', nom: 'Lutte', type: '', categorie: 'physique', puissance: 50, precision: 0, priorite: 0, drain: -25, stats: [], statut: '' };
  // Accorder au genre de la créature (Saga 0.7) : « gelé » / « gelée », « Il » / « Elle ».
  const fe = (c) => (c?.sexe === 'f' ? 'e' : '');
  const il = (c) => (c?.sexe === 'f' ? 'Elle' : 'Il');
  // Les noms courts des statistiques, pour les pastilles de l'écran (Saga 1.3).
  const COURT_STATS = { attaque: 'Atq', defense: 'Déf', att_spe: 'Atq.Spé', def_spe: 'Déf.Spé', vitesse: 'Vit', precision: 'Préc', esquive: 'Esq' };
  const NOMS_STATUTS = { brulure: 'BRU', paralysie: 'PAR', poison: 'PSN', poison_grave: 'PSN', sommeil: 'SOM', gel: 'GEL' };

  async function lancer({ jeu, partie, ui, sauvage = null, dresseur = null, fond = 'herbes', duel = null }) {
    if (duel) dresseur = { nom: duel.nom, equipe: duel.equipe, argent: 0, personnage: duel.personnage || '', ajuste: false };
    const trouver = (sorte, id) => C.trouver(jeu, sorte, id);
    const monnaie = jeu.donnees.reglages?.reglages?.monnaie || '₽';
    const tag = (o, k) => o?.officiel || o?.id || k;

    // --- Les deux camps ---
    const camp = (equipe, joueur) => ({ equipe, joueur, actif: equipe.findIndex((c) => c.pv > 0), etages: {}, confusion: 0, toxique: 0, peur: false, participants: new Set() });
    const nous = camp(partie.equipe, true);
    let adverses;
    if (duel) {
      // Un duel entre deux joueurs : l'équipe d'en face est celle de l'autre joueur, telle qu'elle est
      // (ses PV, ses PP, ses attaques apprises) ; rien n'est recréé ni ajusté.
      adverses = (duel.equipe || []).filter((c) => c && trouver('creatures', c.creature)).slice(0, 6);
      if (!adverses.length) { await ui.message(`${nomDresseur()} n'a pas de créature !`); return { issue: 'victoire' }; }
    } else if (dresseur) {
      // Un dresseur qui « suit la progression » du joueur : son niveau monte avec lui.
      const r = jeu.donnees.reglages?.reglages || {};
      const ref = dresseur.ajuste ? C.reference(jeu, partie, r.ajustement) : 0;
      adverses = (dresseur.equipe || []).filter((m) => trouver('creatures', m.creature)).slice(0, 6).map((m) => {
        const ecrit = Number(m.niveau) || 5;
        const niveau = Math.min(100, Math.max(ecrit, ref ? ref + (Number(r.ecart) || 0) : 0));
        // Monté par l'ajustement (Saga 0.7) : il prend la forme de son nouveau niveau, et les attaques
        // de ce niveau si Tafl ne lui en a pas choisi.
        const espece = niveau > ecrit && r.evolution_dresseurs ? C.formeAuNiveau(jeu, m.creature, niveau) : m.creature;
        const c = C.creer(jeu, espece, niveau, { nature: m.nature || undefined, attaques: m.attaques, chromatique: false });
        c.objet = m.objet || '';
        return c;
      });
      if (!adverses.length) { await ui.message(`${nomDresseur()} n'a pas de créature !`); return { issue: 'victoire' }; }
    } else adverses = [sauvage];
    const eux = camp(adverses, false);
    const actif = (k) => k.equipe[k.actif];
    const nomDe = (k, c = actif(k)) => (k.joueur ? C.nom(jeu, c) : `${C.nom(jeu, c)} ${dresseur ? 'adverse' : 'sauvage'}`);
    function nomDresseur() { return `${dresseur.classe ? `${dresseur.classe} ` : ''}${dresseur.nom || dresseur.id}`; }
    const vivants = (k) => k.equipe.filter((c) => c.pv > 0);
    const types = (c) => C.espece(jeu, c)?.types || [];
    const typeDe = (id) => trouver('types', id);

    // L'état montré par l'écran pour une créature.
    function etat(k, c = actif(k)) {
      const e = C.espece(jeu, c);
      const xpMin = C.xpPour(e?.croissance, c.niveau), xpMax = C.xpPour(e?.croissance, c.niveau + 1);
      return {
        nom: C.nom(jeu, c), niveau: c.niveau, sexe: c.sexe, pv: c.pv, pvMax: C.pvMax(jeu, c), statut: NOMS_STATUTS[c.statut] || '',
        xp: c.niveau >= 100 ? 0 : Math.max(0, Math.min(1, (c.xp - xpMin) / Math.max(1, xpMax - xpMin))),
        image: (k.joueur ? e?.sprites?.dos || e?.sprites?.face : e?.sprites?.face) || '', chromatique: c.chromatique,
        espece: c.creature, // en duel, l'autre joueur la voit de l'autre côté (reseau/duel.js)
        types: types(c).map((t) => ({ nom: typeDe(t)?.nom || t, couleur: typeDe(t)?.couleur || '#888' })),
      };
    }
    const montrer = (k) => { ui.creature(k.joueur ? 'joueur' : 'adversaire', etat(k)); montrerEtats(k); };
    // Saga 1.3 : les pastilles de l'écran, pour voir ce qui est en cours (étages, confusion, objet tenu).
    function montrerEtats(k) {
      if (!ui.etats) return;
      const c = actif(k), l = [];
      for (const s of ETAGES) {
        const n = k.etages?.[s] || 0;
        if (n) l.push({ texte: `${COURT_STATS[s] || s} ${n > 0 ? '+' : '−'}${Math.abs(n)}`, sens: n, detail: `${C.NOMS_STATS[s] || s} ${n > 0 ? '+' : ''}${n}` });
      }
      if (k.confusion > 0) l.push({ texte: 'Confus', sens: -1, detail: 'Elle peut se blesser toute seule.' });
      if (k.peur) l.push({ texte: 'Apeuré', sens: -1, detail: 'Elle ne bouge pas ce tour-ci.' });
      if (k.verrou) l.push({ texte: 'Choix', sens: -1, detail: `Elle ne peut plus lancer que ${trouver('attaques', k.verrou)?.nom || k.verrou}.` });
      if (tenu(c)) l.push({ texte: nomObjet(c), sens: 0, detail: `Elle tient ${nomObjet(c)}.` });
      ui.etats(k.joueur ? 'joueur' : 'adversaire', l);
    }
    // Les PV changent : la barre glisse.
    async function pv(k, c, nouveau) {
      const avant = c.pv;
      c.pv = Math.max(0, Math.min(C.pvMax(jeu, c), Math.round(nouveau)));
      if (c === actif(k) && c.pv !== avant) await ui.pv(k.joueur ? 'joueur' : 'adversaire', c.pv, C.pvMax(jeu, c));
    }

    // --- Les objets tenus (Saga 1.3) ---
    // Un objet peut dire ce qu'il fait quand une créature le tient (champ « tenu », Tafl 1.1).
    // Les objets officiels les plus connus marchent sans rien régler, par leur nom PokeAPI.
    const TENUS_OFFICIELS = {
      'life-orb': { type: 'degats', valeur: 1.3, recul: 10 },
      'muscle-band': { type: 'degats', valeur: 1.1, categorie: 'physique' },
      'wise-glasses': { type: 'degats', valeur: 1.1, categorie: 'speciale' },
      'choice-band': { type: 'stat', stat: 'attaque', valeur: 1.5, verrou: true },
      'choice-specs': { type: 'stat', stat: 'att_spe', valeur: 1.5, verrou: true },
      'choice-scarf': { type: 'stat', stat: 'vitesse', valeur: 1.5, verrou: true },
      'assault-vest': { type: 'stat', stat: 'def_spe', valeur: 1.5 },
      'eviolite': { type: 'stat', stat: 'defense', valeur: 1.5 },
      leftovers: { type: 'soin_tour', valeur: 6.25 },
      'shell-bell': { type: 'drain', valeur: 12.5 },
      'focus-sash': { type: 'survie' },
      'sitrus-berry': { type: 'baie', valeur: 25, seuil: 50 },
      'oran-berry': { type: 'baie', pv: 10, seuil: 50 },
      'lum-berry': { type: 'soin_statut', statut: 'tous' },
      'chesto-berry': { type: 'soin_statut', statut: 'sommeil' },
      'rawst-berry': { type: 'soin_statut', statut: 'brulure' },
      'aspear-berry': { type: 'soin_statut', statut: 'gel' },
      'cheri-berry': { type: 'soin_statut', statut: 'paralysie' },
      'pecha-berry': { type: 'soin_statut', statut: 'poison' },
      'persim-berry': { type: 'soin_statut', statut: 'confusion' },
    };
    // Les objets qui renforcent un type d'attaque (+20 %).
    const TENUS_TYPE = {
      charcoal: 'fire', 'mystic-water': 'water', 'miracle-seed': 'grass', magnet: 'electric', nevermeltice: 'ice',
      'black-belt': 'fighting', 'poison-barb': 'poison', 'soft-sand': 'ground', 'sharp-beak': 'flying',
      'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock', 'spell-tag': 'ghost',
      'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel', 'silk-scarf': 'normal', 'fairy-feather': 'fairy',
    };
    function tenu(c) {
      const o = c?.objet ? trouver('objets', c.objet) : null;
      if (!o) return null;
      if (o.tenu?.type) return o.tenu;
      const cle = o.officiel || o.id;
      if (TENUS_OFFICIELS[cle]) return TENUS_OFFICIELS[cle];
      if (TENUS_TYPE[cle]) return { type: 'type', element: TENUS_TYPE[cle], valeur: 1.2 };
      return null;
    }
    const nomObjet = (c) => trouver('objets', c?.objet)?.nom || c?.objet || 'son objet';
    // Le type de l'attaque est-il celui que l'objet renforce (id de types.json ou nom officiel) ?
    const memeType = (t, element) => Boolean(t) && (t === element || tag(typeDe(t), t) === element);
    // Une baie tenue se mange toute seule quand les PV tombent bas.
    async function baie(k) {
      const c = actif(k), t = tenu(c);
      if (!t || t.type !== 'baie' || c.pv <= 0) return;
      const max = C.pvMax(jeu, c);
      if (c.pv > Math.floor(max * (Number(t.seuil) || 50) / 100) || c.pv >= max) return;
      const n = nomObjet(c);
      c.objet = '';
      montrerEtats(k);
      await pv(k, c, c.pv + (t.pv ? Number(t.pv) : Math.max(1, Math.floor(max * (Number(t.valeur) || 25) / 100))));
      await ui.message(`${nomDe(k)} mange ${n} et récupère des PV !`);
    }

    // --- Les statistiques en combat (avec les étages, de −6 à +6) ---
    const multEtage = (s, e) => (s === 'precision' || s === 'esquive' ? (e >= 0 ? (3 + e) / 3 : 3 / (3 - e)) : (e >= 0 ? (2 + e) / 2 : 2 / (2 - e)));
    function stat(k, s) {
      const c = actif(k);
      let v = C.stats(jeu, c)[s] * multEtage(s, k.etages[s] || 0);
      if (s === 'vitesse' && c.statut === 'paralysie') v *= 0.5;
      const t = tenu(c);
      if (t?.type === 'stat' && t.stat === s) v *= Number(t.valeur) || 1;
      return Math.max(1, Math.floor(v));
    }

    // L'efficacité d'un type d'attaque contre les types du défenseur (×0, ×0,25 … ×4).
    function efficacite(typeAtt, typesDef) {
      const t = typeDe(typeAtt);
      if (!t) return 1;
      let m = 1;
      for (const d of typesDef) {
        if ((t.sans_effet || []).includes(d)) m *= 0;
        else if ((t.efficace || []).includes(d)) m *= 2;
        else if ((t.peu_efficace || []).includes(d)) m *= 0.5;
      }
      return m;
    }
    // Un type (par son nom officiel ou son id) : pour les immunités aux statuts.
    const aLeType = (c, ...noms) => types(c).some((t) => noms.includes(tag(typeDe(t), t)));

    // --- Choix de l'adversaire ---
    // En duel, c'est l'autre joueur qui décide (par le réseau) : il attaque ou il change de créature.
    async function choixDuel() {
      const c = actif(eux);
      const possibles = jouables(eux, c);
      const a = await duel.choisir({
        actif: { nom: C.nom(jeu, c), pv: c.pv, pvMax: C.pvMax(jeu, c) },
        attaques: possibles.map((x) => { const d = trouver('attaques', x.id); return { id: x.id, nom: d?.nom || x.id, pp: x.pp, ppMax: x.ppMax, type: typeDe(d?.type)?.nom || '', couleur: typeDe(d?.type)?.couleur || '#888', categorie: d?.categorie || '' }; }),
        equipe: eux.equipe.map((q, i) => ({ nom: C.nom(jeu, q), niveau: q.niveau, pv: q.pv, pvMax: C.pvMax(jeu, q), i, actif: i === eux.actif })),
      });
      if (a?.type === 'changer') {
        const i = Math.round(Number(a.cible));
        if (eux.equipe[i]?.pv > 0 && i !== eux.actif) return { type: 'changer', cible: i };
      }
      if (a?.type === 'attaque') {
        const x = possibles.find((q) => q.id === a.attaque);
        if (x) return { type: 'attaque', attaque: x };
      }
      return { type: 'attaque', attaque: possibles.length ? possibles[hasard(possibles.length)] : null };
    }
    // Sa créature est K.O. : il choisit celle qu'il envoie (Saga 1.2). S'il ne répond pas, la première.
    async function choixDuelSuivant(defaut) {
      const a = await duel.choisir({
        force: true, // pas de menu : seulement la liste de son équipe
        actif: { nom: C.nom(jeu, actif(eux)), pv: 0, pvMax: C.pvMax(jeu, actif(eux)) },
        attaques: [],
        equipe: eux.equipe.map((q, i) => ({ nom: C.nom(jeu, q), niveau: q.niveau, pv: q.pv, pvMax: C.pvMax(jeu, q), i, actif: false })),
      });
      const i = a?.type === 'changer' ? Math.round(Number(a.cible)) : -1;
      return eux.equipe[i]?.pv > 0 ? i : defaut;
    }
    // Les attaques qu'elle peut encore lancer (un objet Choix n'en laisse qu'une).
    function jouables(k, c) {
      const l = c.attaques.filter((a) => a.pp > 0 && trouver('attaques', a.id));
      const verrouillees = k.verrou ? l.filter((a) => a.id === k.verrou) : [];
      return verrouillees.length ? verrouillees : l;
    }
    function choixAdverse() {
      const c = actif(eux);
      const possibles = jouables(eux, c);
      if (!possibles.length) return { type: 'attaque', attaque: null };
      if (!dresseur || chance(30)) return { type: 'attaque', attaque: possibles[hasard(possibles.length)] };
      // Un dresseur choisit souvent l'attaque qui fait le plus mal.
      const cible = actif(nous);
      const score = (a) => {
        const d = trouver('attaques', a.id);
        if (d.categorie === 'statut' || !d.puissance) return 20 + hasard(20);
        return d.puissance * efficacite(d.type, types(cible)) * (types(c).includes(d.type) ? 1.5 : 1) * ((d.precision || 100) / 100);
      };
      return { type: 'attaque', attaque: possibles.sort((a, b) => score(b) - score(a))[0] };
    }

    // --- Une attaque ---
    async function attaquer(k, cible, slot) {
      const c = actif(k), d = actif(cible);
      if (c.pv <= 0) return;
      const nom = nomDe(k);
      // Ce qui peut l'empêcher d'agir.
      if (c.statut === 'sommeil') {
        c.sommeil--;
        if (c.sommeil > 0) { await ui.message(`${nom} dort profondément.`); return; }
        c.statut = '';
        montrer(k);
        await ui.message(`${nom} se réveille !`);
      }
      if (c.statut === 'gel') {
        if (!chance(20)) { await ui.message(`${nom} est gelé${fe(c)} !`); return; }
        c.statut = '';
        montrer(k);
        await ui.message(`${nom} dégèle !`);
      }
      if (k.peur) { k.peur = false; montrerEtats(k); await ui.message(`${nom} a peur et ne bouge pas !`); return; }
      if (k.confusion > 0) {
        k.confusion--;
        if (!k.confusion) { montrerEtats(k); await ui.message(`${nom} n'est plus confus${fe(c)}.`); }
        else {
          await ui.message(`${nom} est confus${fe(c)}…`);
          if (chance(33)) {
            const deg = await degats(c, stat(k, 'attaque'), stat(k, 'defense'), 40, 1);
            await ui.message(`${il(c)} se blesse dans sa confusion !`);
            ui.animer(k.joueur ? 'joueur' : 'adversaire', 'touche');
            await pv(k, c, c.pv - deg);
            return;
          }
        }
      }
      if (c.statut === 'paralysie' && chance(25)) { await ui.message(`${nom} est paralysé${fe(c)} ! ${il(c)} ne peut pas attaquer !`); return; }

      // Bandeau / Lunettes / Mouchoir Choix : la première attaque est la seule, jusqu'au changement.
      if (slot && tenu(c)?.verrou && k.verrou !== slot.id) { k.verrou = slot.id; montrerEtats(k); }
      const a = slot ? trouver('attaques', slot.id) : null;
      const att = a || LUTTE;
      if (slot) slot.pp = Math.max(0, slot.pp - 1);
      await ui.message(`${nom} utilise ${att.nom} !`);

      // La précision.
      const vise = att.cible === 'soi' || att.cible === 'equipe' || att.cible === 'terrain' ? k : cible;
      if (att.precision > 0 && vise !== k) {
        const p = att.precision * multEtage('precision', (k.etages.precision || 0) - (cible.etages.esquive || 0));
        if (!chance(p)) { await ui.message(`${nomDe(cible)} évite l'attaque !`); return; }
      }

      const puissance = Number(att.puissance) || 0;
      let infliges = 0;
      if (att.categorie !== 'statut' && puissance > 0) {
        const eff = att.type ? efficacite(att.type, types(d)) : 1;
        if (eff === 0) { await ui.message(`Ça n'affecte pas ${nomDe(cible)}…`); return; }
        const coups = Math.max(1, (att.coups_min || 1) + hasard(Math.max(1, (att.coups_max || 1) - (att.coups_min || 1) + 1)));
        let n = 0;
        for (; n < coups && d.pv > 0 && c.pv > 0; n++) {
          const physique = att.categorie !== 'speciale';
          const crit = chance([100 / 24, 12.5, 50, 100][Math.min(3, Math.max(0, Number(att.critique) || 0))]);
          // Un coup critique ignore les étages défavorables de l'attaquant et favorables du défenseur.
          const A = crit ? Math.max(stat(k, physique ? 'attaque' : 'att_spe'), C.stats(jeu, c)[physique ? 'attaque' : 'att_spe']) : stat(k, physique ? 'attaque' : 'att_spe');
          const D = crit ? Math.min(stat(cible, physique ? 'defense' : 'def_spe'), C.stats(jeu, d)[physique ? 'defense' : 'def_spe']) : stat(cible, physique ? 'defense' : 'def_spe');
          let mult = eff * (types(c).includes(att.type) ? 1.5 : 1) * (crit ? 1.5 : 1);
          if (physique && c.statut === 'brulure') mult *= 0.5;
          // L'objet tenu de l'attaquant (Orbe Vie, Bandeau Muscle, Charbon…).
          const to = tenu(c);
          if (to?.type === 'degats' && (!to.categorie || to.categorie === (physique ? 'physique' : 'speciale'))) mult *= Number(to.valeur) || 1;
          if (to?.type === 'type' && memeType(att.type, to.element)) mult *= Number(to.valeur) || 1;
          let deg = await degats(c, A, D, puissance, mult, crit);
          // Ceinture Force : à PV pleins, elle survit à un coup fatal.
          const td = tenu(d);
          const tientBon = td?.type === 'survie' && d.pv === C.pvMax(jeu, d) && deg >= d.pv;
          if (tientBon) deg = d.pv - 1;
          ui.animer(cible.joueur ? 'joueur' : 'adversaire', 'touche');
          infliges += Math.min(d.pv, deg);
          await pv(cible, d, d.pv - deg);
          if (crit) await ui.message('Coup critique !');
          if (tientBon) await consommer(cible, d, `${nomDe(cible)} tient bon grâce à {objet} !`);
        }
        if (eff > 1) await ui.message('C\'est super efficace !');
        else if (eff < 1) await ui.message('Ce n\'est pas très efficace…');
        if (coups > 1) await ui.message(`Touché ${n} fois !`);
        // Drain (Vol-Vie) ou contrecoup (Bélier, Lutte).
        if (att.drain > 0 && infliges > 0 && c.pv > 0) {
          await pv(k, c, c.pv + Math.max(1, Math.floor(infliges * att.drain / 100)));
          await ui.message(`${nomDe(cible)} perd de l'énergie !`);
        } else if (att.drain < 0 && infliges > 0) {
          await pv(k, c, c.pv - Math.max(1, Math.floor(infliges * -att.drain / 100)));
          await ui.message(`${nom} se blesse en attaquant !`);
        }
        // L'objet tenu après l'attaque : le recul de l'Orbe Vie, les PV du Grelot Coque.
        const apres = tenu(c);
        if (apres && infliges > 0 && c.pv > 0) {
          if (apres.type === 'drain') {
            const max = C.pvMax(jeu, c);
            if (c.pv < max) {
              await pv(k, c, c.pv + Math.max(1, Math.floor(infliges * (Number(apres.valeur) || 12.5) / 100)));
              await ui.message(`${nom} récupère des PV grâce à ${nomObjet(c)} !`);
            }
          }
          if (Number(apres.recul) > 0) {
            await pv(k, c, c.pv - Math.max(1, Math.floor(C.pvMax(jeu, c) * Number(apres.recul) / 100)));
            await ui.message(`${nom} souffre de ${nomObjet(c)} !`);
            await baie(k);
          }
        }
        if (d.pv > 0) await baie(cible);
        if (d.pv <= 0) return;
        // La peur : seulement si l'attaquant passe en premier (le défenseur n'a pas encore agi).
        if (att.peur && chance(att.peur) && !cible.aJoue) { cible.peur = true; montrerEtats(cible); }
      }
      // Les soins de l'attaque (Soin, Repos…).
      if (att.soin > 0 && c.pv > 0) {
        const max = C.pvMax(jeu, c);
        if (c.pv >= max) await ui.message(`Les PV de ${nom} sont au maximum !`);
        else { await pv(k, c, c.pv + Math.floor(max * att.soin / 100)); await ui.message(`${nom} récupère des PV !`); }
      }
      // Le statut infligé.
      // (chance_statut 0 = toujours, FORMAT.md)
      if (att.statut && d.pv > 0 && (!att.chance_statut || chance(att.chance_statut))) {
        await infliger(cible, att.statut, att.categorie === 'statut');
      }
      // Les changements de statistiques.
      if (att.stats?.length && (!att.chance_stats || chance(att.chance_stats))) {
        const qui = att.stats_cible === 'soi' ? k : cible;
        if (actif(qui).pv > 0) for (const s of att.stats) await changerEtage(qui, s.stat, Number(s.etages) || 0);
      }
      if (att.categorie === 'statut' && !att.statut && !att.stats?.length && !att.soin) await ui.message('Mais rien ne se passe…');
    }

    // La formule des dégâts (une règle maison peut la remplacer, Saga 0.12).
    const formuleDegats = ({ niveau, A, D, puissance, multiplicateur }) => {
      const base = Math.floor(Math.floor(Math.floor(2 * niveau / 5 + 2) * puissance * A / D) / 50) + 2;
      return Math.max(1, Math.floor(base * multiplicateur * (85 + hasard(16)) / 100));
    };
    async function degats(c, A, D, puissance, mult, critique = false) {
      const n = await Maison.formule('degats', { niveau: c.niveau, A, D, puissance, multiplicateur: mult, critique }, formuleDegats);
      return Math.max(1, Math.round(n));
    }

    // Un objet tenu qui se consomme disparaît, avec un mot pour le dire.
    async function consommer(k, c, texte) {
      const n = nomObjet(c);
      c.objet = '';
      montrerEtats(k);
      await ui.message(texte.replace('{objet}', n));
    }

    async function infliger(k, statut, annoncer) {
      const c = actif(k), nom = nomDe(k);
      // L'objet tenu qui guérit ce problème (Baie Prine, Baie Sucrée…) se mange tout de suite.
      const guerit = () => {
        const t = tenu(c);
        return t?.type === 'soin_statut' && (t.statut === 'tous' || t.statut === statut || (t.statut === 'poison' && statut === 'poison_grave'));
      };
      if (statut === 'confusion') {
        if (k.confusion) { if (annoncer) await ui.message(`${nom} est déjà confus${fe(c)}.`); return; }
        k.confusion = 2 + hasard(4);
        montrerEtats(k);
        await ui.message(`${nom} devient confus${fe(c)} !`);
        if (guerit()) { k.confusion = 0; await consommer(k, c, `${nom} mange {objet} et retrouve ses esprits !`); }
        return;
      }
      if (!NOMS_STATUTS[statut]) { if (annoncer) await ui.message('Mais rien ne se passe…'); return; } // pas encore géré par Saga
      if (c.statut) { if (annoncer) await ui.message(`${nom} a déjà un problème de statut.`); return; }
      const immunise = (statut === 'brulure' && aLeType(c, 'fire', 'feu'))
        || (statut === 'paralysie' && aLeType(c, 'electric', 'electrik'))
        || ((statut === 'poison' || statut === 'poison_grave') && aLeType(c, 'poison', 'steel', 'acier'))
        || (statut === 'gel' && aLeType(c, 'ice', 'glace'));
      if (immunise) { if (annoncer) await ui.message(`Ça n'affecte pas ${nom}…`); return; }
      c.statut = statut;
      if (statut === 'sommeil') c.sommeil = 1 + hasard(3);
      if (statut === 'poison_grave') k.toxique = 1;
      montrer(k);
      await ui.message({
        brulure: `${nom} est brûlé${fe(c)} !`, paralysie: `${nom} est paralysé${fe(c)} ! ${il(c)} aura du mal à attaquer !`, poison: `${nom} est empoisonné${fe(c)} !`,
        poison_grave: `${nom} est gravement empoisonné${fe(c)} !`, sommeil: `${nom} s'endort !`, gel: `${nom} est gelé${fe(c)} !`,
      }[statut]);
      if (guerit()) {
        c.statut = '';
        k.toxique = 0;
        montrer(k);
        await consommer(k, c, `${nom} mange {objet} et guérit !`);
      }
    }

    async function changerEtage(k, s, n) {
      if (!ETAGES.includes(s) || !n) return;
      const avant = k.etages[s] || 0;
      const apres = Math.max(-6, Math.min(6, avant + n));
      const nomStat = C.NOMS_STATS[s] || s;
      if (apres === avant) { await ui.message(`${nomStat} de ${nomDe(k)} ne peut plus ${n > 0 ? 'monter' : 'baisser'} !`); return; }
      k.etages[s] = apres;
      montrerEtats(k);
      ui.animer(k.joueur ? 'joueur' : 'adversaire', n > 0 ? 'monte' : 'baisse');
      const fort = Math.abs(apres - avant) >= 2 ? ' beaucoup' : '';
      await ui.message(`${nomStat} de ${nomDe(k)}${fort} ${n > 0 ? 'augmente' : 'baisse'} !`);
    }

    // La fin du tour : brûlure et poison.
    async function finDeTour(k) {
      const c = actif(k);
      if (c.pv <= 0) return;
      const max = C.pvMax(jeu, c);
      // Les Restes et leurs pareils, avant les dégâts de statut comme dans les jeux officiels.
      const t = tenu(c);
      if (t?.type === 'soin_tour' && c.pv < max) {
        await pv(k, c, c.pv + Math.max(1, Math.floor(max * (Number(t.valeur) || 6.25) / 100)));
        await ui.message(`${nomDe(k)} récupère des PV grâce à ${nomObjet(c)} !`);
      }
      if (c.statut === 'brulure') { await ui.message(`${nomDe(k)} souffre de sa brûlure !`); await pv(k, c, c.pv - Math.max(1, Math.floor(max / 16))); }
      else if (c.statut === 'poison') { await ui.message(`${nomDe(k)} souffre du poison !`); await pv(k, c, c.pv - Math.max(1, Math.floor(max / 8))); }
      else if (c.statut === 'poison_grave') { await ui.message(`${nomDe(k)} souffre du poison !`); await pv(k, c, c.pv - Math.max(1, Math.floor(max * k.toxique / 16))); k.toxique = Math.min(15, k.toxique + 1); }
      await baie(k);
    }

    // Changer de créature : les étages et la confusion s'effacent.
    async function envoyer(k, i, premier = false) {
      k.actif = i;
      k.etages = {};
      k.confusion = 0;
      k.toxique = actif(k).statut === 'poison_grave' ? 1 : 0;
      k.peur = false;
      k.verrou = '';
      if (k.joueur) nous.participants.add(actif(nous));
      else Collection.voir(partie, actif(k).creature); // le Pokédex : vue (Saga 0.6)
      montrer(k);
      // Le message s'écrit pendant que la créature entre (la balle part sur « En avant ! »).
      const texte = k.joueur ? (premier ? `En avant, ${C.nom(jeu, actif(k))} !` : `À toi, ${C.nom(jeu, actif(k))} !`)
        : dresseur ? `${nomDresseur()} envoie ${C.nom(jeu, actif(k))} !` : '';
      const lu = texte ? ui.message(texte) : null;
      await ui.animer(k.joueur ? 'joueur' : 'adversaire', 'entree');
      await lu;
    }

    // --- Le choix d'une créature de l'équipe (pour changer, ou après un K.O.) ---
    async function choisirCreature(titre, forcer) {
      for (;;) {
        const i = await ui.liste(titre, partie.equipe.map((c, j) => ({
          texte: `${C.nom(jeu, c)}  N.${c.niveau}`,
          detail: c.pv > 0 ? `${c.pv} / ${C.pvMax(jeu, c)} PV${c.statut ? ` · ${NOMS_STATUTS[c.statut]}` : ''}` : 'K.O.',
          image: C.espece(jeu, c)?.sprites?.face || '',
          desactive: c.pv <= 0 || j === nous.actif,
          pv: c.pv / C.pvMax(jeu, c),
        })), !forcer);
        if (i == null) return null;
        return i;
      }
    }

    // --- Le sac ---
    const objetsUtiles = () => Object.entries(partie.sac).map(([id, n]) => ({ id, n, o: trouver('objets', id) }))
      .filter((x) => x.n > 0 && x.o && ['soin', 'soin_statut', 'rappel', 'pp', 'pp_toutes', ...(dresseur ? [] : ['balle'])].includes(x.o.effet?.type));
    async function utiliserObjet() {
      const objets = objetsUtiles();
      if (!objets.length) { await ui.message('Rien dans ton sac ne sert en combat.'); return null; }
      const i = await ui.liste('Sac', objets.map((x) => ({ texte: x.o.nom, detail: `×${x.n}`, image: x.o.icone || '' })), true);
      if (i == null) return null;
      const { id, o } = objets[i];
      if (o.effet.type === 'balle') return { type: 'balle', id, o };
      const j = await choisirCreature(`${o.nom} : sur qui ?`, false);
      if (j == null) return null;
      return { type: 'objet', id, o, cible: j };
    }
    const retirer = (id) => { partie.sac[id] = (partie.sac[id] || 0) - 1; if (partie.sac[id] <= 0) delete partie.sac[id]; };
    async function appliquerObjet({ id, o, cible }) {
      const c = partie.equipe[cible], nom = C.nom(jeu, c), max = C.pvMax(jeu, c), e = o.effet || {};
      await ui.message(`Tu utilises ${o.nom}.`);
      const surActif = cible === nous.actif;
      const majPv = async (v) => { if (surActif) await pv(nous, c, v); else c.pv = Math.max(0, Math.min(max, v)); };
      if (e.type === 'rappel') {
        if (c.pv > 0) { await ui.message('Ça n\'aura aucun effet.'); return; }
        retirer(id);
        c.pv = Math.max(1, Math.floor(max * (Number(e.valeur) || 50) / 100));
        await ui.message(`${nom} reprend connaissance !`);
        return;
      }
      if (c.pv <= 0) { await ui.message('Ça n\'aura aucun effet.'); return; }
      retirer(id);
      if (e.type === 'soin') {
        if (Number(e.valeur) > 0 && c.pv < max) { const avant = c.pv; await majPv(c.pv + Number(e.valeur)); await ui.message(`${nom} récupère ${c.pv - avant} PV.`); }
        if (e.statut && c.statut && (e.statut === 'tous' || e.statut === c.statut)) { c.statut = ''; if (surActif) montrer(nous); await ui.message(`${nom} va mieux.`); }
      } else if (e.type === 'soin_statut') {
        if (c.statut && (e.statut === 'tous' || e.statut === c.statut || (e.statut === 'poison' && c.statut === 'poison_grave'))) { c.statut = ''; if (surActif) montrer(nous); await ui.message(`${nom} va mieux.`); }
        else await ui.message('Ça n\'a aucun effet.');
      } else if (e.type === 'pp' || e.type === 'pp_toutes') {
        for (const a of c.attaques) a.pp = Math.min(a.ppMax, a.pp + (Number(e.valeur) || 10));
        await ui.message(`Les PP de ${nom} sont restaurés.`);
      }
    }

    // --- La capture ---
    async function lancerBalle({ id, o }) {
      retirer(id);
      const d = actif(eux), e = C.espece(jeu, d);
      await ui.message(`Tu lances ${o.nom} !`);
      await ui.animer('adversaire', 'capture');
      const max = C.pvMax(jeu, d), bonus = Number(o.effet?.valeur) || 1;
      // La chance de capture en % (formule officielle : quatre secousses réussies de suite), qu'une règle
      // maison peut remplacer (Saga 0.12). Chaque secousse réussit avec la racine quatrième de la chance.
      const formuleCapture = ({ pv, pvMax, taux, balle, statut }) => {
        if (balle >= 255) return 100;
        const bonusStatut = statut === 'sommeil' || statut === 'gel' ? 2 : statut ? 1.5 : 1;
        const a = (3 * pvMax - 2 * pv) * taux * balle / (3 * pvMax) * bonusStatut;
        if (a >= 255) return 100;
        return 100 * (1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))) / 65536) ** 4;
      };
      const pourcent = Math.max(0, Math.min(100, Number(await Maison.formule('capture', { pv: d.pv, pvMax: max, taux: Number(e?.taux_capture) || 45, balle: bonus, statut: d.statut || '' }, formuleCapture)) || 0));
      let secousses = 4;
      if (pourcent < 100) {
        const b = 65536 * (pourcent / 100) ** 0.25;
        secousses = 0;
        while (secousses < 4 && hasard(65536) < b) secousses++;
      }
      for (let i = 0; i < Math.min(3, secousses); i++) await ui.animer('adversaire', 'secoue');
      if (secousses >= 4) {
        await ui.animer('adversaire', 'attrape');
        await ui.message(`Et hop ! ${C.nom(jeu, d)} est attrapé !`);
        partie.compteurs.captures = (partie.compteurs.captures || 0) + 1;
        const place = Collection.ranger(jeu, partie, d);
        if (place.ou === 'boite') await ui.message(`Ton équipe est pleine : ${C.nom(jeu, d)} part dans ${place.nom} (${place.pc}).`);
        return true;
      }
      await ui.animer('adversaire', 'sort');
      await ui.message(['Oh non ! La créature s\'est libérée !', 'Raaah ! Ça y était presque !', 'Aaaah ! Presque !', 'Mince ! Ça y était presque !'][secousses]);
      return false;
    }

    // --- La fuite (contre une créature sauvage) ---
    let essaisFuite = 0;
    // La chance de fuir en % (formule officielle), qu'une règle maison peut remplacer (Saga 0.12).
    const formuleFuite = ({ vitesse, vitesseAdverse, essais }) => (vitesse >= vitesseAdverse ? 100 : ((Math.floor(vitesse * 128 / vitesseAdverse) + 30 * essais) % 256) / 2.56);
    async function fuiteReussie() {
      essaisFuite++;
      const p = await Maison.formule('fuite', { vitesse: stat(nous, 'vitesse'), vitesseAdverse: stat(eux, 'vitesse'), essais: essaisFuite }, formuleFuite);
      return p >= 100 || chance(p);
    }

    // --- Gagner de l'expérience (et apprendre, évoluer) ---
    async function recompenses(battue) {
      const e = C.espece(jeu, battue);
      const gagnants = [...nous.participants].filter((c) => c.pv > 0 && partie.equipe.includes(c));
      if (!gagnants.length) return;
      // L'expérience de chacun (formule officielle), qu'une règle maison peut remplacer (Saga 0.12).
      const formuleXp = ({ base, niveau, dresseur: d, participants }) => Math.max(1, Math.floor(Math.max(1, Math.floor(base * niveau / 7 * (d ? 1.5 : 1))) / participants));
      const part = Math.max(0, Math.round(await Maison.formule('experience', { base: Number(e?.xp_base) || 60, niveau: battue.niveau, dresseur: Boolean(dresseur), participants: gagnants.length }, formuleXp)));
      for (const c of gagnants) {
        C.gagnerEv(jeu, c, battue);
        if (c.niveau >= C.plafond(jeu, partie)) continue;
        const estActif = c === actif(nous);
        const evenements = C.gagnerXp(jeu, partie, c, part);
        await ui.message(`${C.nom(jeu, c)} gagne ${part} points d'expérience !`);
        if (estActif) await ui.xp(etat(nous).xp, evenements.filter((x) => x.type === 'niveau').length);
        for (const ev of evenements) {
          if (ev.type === 'niveau') {
            if (estActif) montrer(nous);
            await ui.message(`${C.nom(jeu, c)} monte au niveau ${ev.niveau} !`);
          } else if (ev.type === 'apprend') {
            await ui.message(`${C.nom(jeu, c)} apprend ${trouver('attaques', ev.attaque)?.nom || ev.attaque} !`);
          } else if (ev.type === 'oublier') {
            await apprendre(c, ev.attaque);
          } else if (ev.type === 'plafond') {
            await ui.message(`${C.nom(jeu, c)} atteint le niveau maximum (${ev.niveau}) ! Un nouveau badge ${c.sexe === 'f' ? 'la' : 'le'} laissera progresser.`);
          } else if (ev.type === 'evolue') {
            const avant = C.nom(jeu, c);
            // L'évolution se montre sur la créature qui évolue, même si elle n'est pas au combat.
            // Retour (B, Échap) pendant l'animation l'arrête, comme dans les jeux officiels (Saga 0.7).
            ui.creature('joueur', etat(nous, c));
            await ui.message(`Quoi ? ${avant} évolue !`);
            const vers = C.trouver(jeu, 'creatures', ev.vers);
            const ok = await ui.evolution('joueur', vers?.sprites?.dos || vers?.sprites?.face || '');
            if (!ok) {
              montrer(nous);
              await ui.message(`Hein ? L'évolution de ${avant} s'est arrêtée.`);
              continue;
            }
            const nouvelles = C.evoluer(jeu, c, ev.vers);
            ui.creature('joueur', etat(nous, c));
            await ui.message(`Félicitations ! ${avant} a évolué en ${C.espece(jeu, c)?.nom || ev.vers} !`);
            montrer(nous);
            partie.compteurs.evolutions = (partie.compteurs.evolutions || 0) + 1;
            for (const a of nouvelles) {
              if (c.attaques.length < 4) { c.attaques.push(C.attaque(jeu, a)); await ui.message(`${C.nom(jeu, c)} apprend ${trouver('attaques', a)?.nom || a} !`); }
              else await apprendre(c, a);
            }
          }
        }
        if (estActif) montrer(nous);
      }
    }
    // Elle connaît déjà 4 attaques : le joueur choisit laquelle oublier (ou de ne pas apprendre).
    async function apprendre(c, id) {
      const nomA = trouver('attaques', id)?.nom || id, nom = C.nom(jeu, c);
      await ui.message(`${nom} veut apprendre ${nomA}, mais ${il(c).toLowerCase()} connaît déjà quatre attaques.`);
      const i = await ui.liste(`Oublier quelle attaque pour ${nomA} ?`, [
        ...c.attaques.map((a) => ({ texte: trouver('attaques', a.id)?.nom || a.id, detail: `${a.pp} / ${a.ppMax} PP` })),
        { texte: `Ne pas apprendre ${nomA}`, detail: '' },
      ], false);
      if (i == null || i >= c.attaques.length) { await ui.message(`${nom} n'apprend pas ${nomA}.`); return; }
      const oubliee = trouver('attaques', c.attaques[i].id)?.nom || c.attaques[i].id;
      c.attaques[i] = C.attaque(jeu, id);
      await ui.message(`1, 2 et… Tadaa ! ${nom} oublie ${oubliee} et apprend ${nomA} !`);
    }

    // ======================= Le combat =======================
    if (nous.actif < 0) return { issue: 'defaite' };
    await ui.ouvrir({ fond, dresseur: dresseur ? { nom: nomDresseur(), portrait: jeu.personnages.get(dresseur.personnage)?.portraits?.[0]?.png || '' } : null });
    montrer(eux);
    montrer(nous);
    nous.participants.add(actif(nous));
    // Une créature sauvage est là tout de suite ; celle d'un dresseur arrive quand il l'envoie.
    if (!dresseur) await ui.animer('adversaire', 'entree');
    if (dresseur) await ui.message(`${nomDresseur()} veut se battre !`);
    else {
      Collection.voir(partie, actif(eux).creature); // le Pokédex : vue (elle n'est pas « envoyée »)
      await ui.message(`Un ${C.nom(jeu, actif(eux))} sauvage apparaît !`);
      if (actif(eux).chromatique) await ui.message('Il brille !');
    }
    if (dresseur) await envoyer(eux, 0, true);
    await envoyer(nous, nous.actif, true);

    for (;;) {
      // 1. Le choix du joueur.
      let action = null;
      while (!action) {
        const choix = await ui.menu(C.nom(jeu, actif(nous)), Boolean(dresseur));
        if (choix === 'attaque') {
          const c = actif(nous);
          if (!c.attaques.some((a) => a.pp > 0)) { await ui.message(`${C.nom(jeu, c)} n'a plus de PP !`); action = { type: 'attaque', attaque: null }; break; }
          const i = await ui.attaques(c.attaques.map((a) => {
            const d = trouver('attaques', a.id), t = typeDe(d?.type);
            return { nom: d?.nom || a.id, pp: a.pp, ppMax: a.ppMax, type: t?.nom || d?.type || '', couleur: t?.couleur || '#888', categorie: d?.categorie || '' };
          }));
          if (i == null) continue;
          if (c.attaques[i].pp <= 0) { await ui.message('Il n\'y a plus de PP pour cette attaque !'); continue; }
          if (nous.verrou && c.attaques[i].id !== nous.verrou) {
            await ui.message(`${nomObjet(c)} ne laisse ${C.nom(jeu, c)} utiliser que ${trouver('attaques', nous.verrou)?.nom || nous.verrou} !`);
            continue;
          }
          action = { type: 'attaque', attaque: c.attaques[i] };
        } else if (choix === 'sac') {
          action = await utiliserObjet();
        } else if (choix === 'equipe') {
          const i = await choisirCreature('Équipe : qui envoyer ?', false);
          if (i != null) action = { type: 'changer', cible: i };
        } else if (choix === 'fuite') {
          if (dresseur) { await ui.message('Impossible de fuir un combat de dresseur !'); continue; }
          if (await fuiteReussie()) { await ui.message('Tu prends la fuite !'); ui.fermer(); return { issue: 'fuite' }; }
          await ui.message('Impossible de fuir !');
          action = { type: 'rien' };
        }
      }

      // 2. Les actions passent : changer et objets d'abord, puis les attaques (priorité, puis vitesse).
      const adverse = duel ? await choixDuel() : choixAdverse();
      nous.aJoue = false;
      eux.aJoue = false;
      if (action.type === 'changer') {
        await ui.message(`Reviens, ${C.nom(jeu, actif(nous))} !`);
        await ui.animer('joueur', 'sortie');
        await envoyer(nous, action.cible);
        nous.aJoue = true;
      } else if (action.type === 'objet') { await appliquerObjet(action); nous.aJoue = true; }
      else if (action.type === 'balle') {
        if (await lancerBalle(action)) { ui.fermer(); return { issue: 'capture' }; }
        nous.aJoue = true;
      } else if (action.type === 'rien') nous.aJoue = true;
      // L'autre joueur change de créature : cela passe avant les attaques, comme pour nous.
      if (adverse.type === 'changer') {
        await ui.message(`${nomDresseur()} rappelle ${C.nom(jeu, actif(eux))} !`);
        await ui.animer('adversaire', 'sortie');
        await envoyer(eux, adverse.cible);
        eux.aJoue = true;
      }

      const ordre = [];
      if (!nous.aJoue) ordre.push([nous, eux, action.attaque]);
      if (!eux.aJoue) ordre.push([eux, nous, adverse.attaque]);
      if (ordre.length === 2) {
        const prio = ([, , a]) => Number(trouver('attaques', a?.id)?.priorite) || 0;
        const p0 = prio(ordre[0]), p1 = prio(ordre[1]);
        const v0 = stat(nous, 'vitesse'), v1 = stat(eux, 'vitesse');
        if (p1 > p0 || (p1 === p0 && (v1 > v0 || (v1 === v0 && chance(50))))) ordre.reverse();
      }
      for (const [k, cible, slot] of ordre) {
        if (actif(k).pv <= 0 || actif(cible).pv <= 0) continue;
        await attaquer(k, cible, slot);
        k.aJoue = true;
        if (actif(nous).pv <= 0 || actif(eux).pv <= 0) break;
      }
      for (const k of [nous, eux]) { k.peur = false; montrerEtats(k); await finDeTour(k); }

      // 3. Les K.O.
      if (actif(eux).pv <= 0) {
        const battue = actif(eux);
        await ui.animer('adversaire', 'ko');
        await ui.message(`${nomDe(eux)} est K.O. !`);
        if (!duel) await recompenses(battue);
        nous.participants = new Set([actif(nous)].filter((c) => c.pv > 0));
        const suivant = eux.equipe.findIndex((c) => c.pv > 0);
        if (suivant < 0) {
          if (dresseur) {
            await ui.message(`Tu as battu ${nomDresseur()} !`);
            if (dresseur.dialogue_victoire) await ui.message(dresseur.dialogue_victoire, { qui: nomDresseur() });
            const argent = duel ? 0 : Number(dresseur.argent) || 0;
            if (argent) { partie.argent = (partie.argent || 0) + argent; await ui.message(`Tu gagnes ${argent} ${monnaie} !`); }
          }
          ui.fermer();
          return { issue: 'victoire' };
        }
        // En duel, c'est l'autre joueur qui choisit qui il envoie (Saga 1.2) ; sinon, la première valide.
        await envoyer(eux, duel ? await choixDuelSuivant(suivant) : suivant);
      }
      if (actif(nous).pv <= 0) {
        if (!duel) C.changerAmitie(actif(nous), -1); // tomber K.O. froisse un peu (Saga 0.7)
        await ui.animer('joueur', 'ko');
        await ui.message(`${C.nom(jeu, actif(nous))} est K.O. !`);
        if (!vivants(nous).length) {
          await ui.message('Tu n\'as plus de créature en état de se battre…');
          if (dresseur?.dialogue_defaite) await ui.message(dresseur.dialogue_defaite, { qui: nomDresseur() });
          const perdu = duel ? 0 : Math.floor((partie.argent || 0) / 2);
          if (perdu) { partie.argent -= perdu; await ui.message(`Dans la panique, tu perds ${perdu} ${monnaie}…`); }
          ui.fermer();
          return { issue: 'defaite' };
        }
        const i = await choisirCreature('Qui envoyer ?', true);
        await envoyer(nous, i ?? nous.equipe.findIndex((c) => c.pv > 0));
      }
    }
  }

  return { lancer, NOMS_STATUTS };
})();
