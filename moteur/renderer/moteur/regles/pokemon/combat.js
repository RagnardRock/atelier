// Les combats (Saga 0.3) : un contre un, contre une créature sauvage ou un dresseur, au tour par
// tour, avec les règles des jeux officiels (dégâts, types, coups critiques, précision, statuts,
// étages de statistiques, priorité, vitesse, capture, fuite, expérience, évolution en plein combat).
//
// Ce fichier décide ; l'écran (ecran-combat.js) montre et demande. Chaque étape attend l'écran
// (« await ui.message(…) ») : le combat se lit de haut en bas, comme un script.
//
// lancer() rend { issue } : 'victoire', 'defaite', 'fuite' ou 'capture'. La partie est modifiée
// sur place (PV, PP, expérience, sac, captures, argent).

const Combat = (() => {
  const C = Creatures;
  const hasard = (n) => Math.floor(Math.random() * n);
  const chance = (pourcent) => Math.random() * 100 < pourcent;
  const ETAGES = ['attaque', 'defense', 'att_spe', 'def_spe', 'vitesse', 'precision', 'esquive'];
  const LUTTE = { id: 'lutte', nom: 'Lutte', type: '', categorie: 'physique', puissance: 50, precision: 0, priorite: 0, drain: -25, stats: [], statut: '' };
  const NOMS_STATUTS = { brulure: 'BRU', paralysie: 'PAR', poison: 'PSN', poison_grave: 'PSN', sommeil: 'SOM', gel: 'GEL' };

  async function lancer({ jeu, partie, ui, sauvage = null, dresseur = null, fond = 'herbes' }) {
    const trouver = (sorte, id) => C.trouver(jeu, sorte, id);
    const monnaie = jeu.donnees.reglages?.reglages?.monnaie || '₽';
    const tag = (o, k) => o?.officiel || o?.id || k;

    // --- Les deux camps ---
    const camp = (equipe, joueur) => ({ equipe, joueur, actif: equipe.findIndex((c) => c.pv > 0), etages: {}, confusion: 0, toxique: 0, peur: false, participants: new Set() });
    const nous = camp(partie.equipe, true);
    let adverses;
    if (dresseur) {
      // Un dresseur qui « suit la progression » du joueur : son niveau monte avec lui.
      const r = jeu.donnees.reglages?.reglages || {};
      let ref = 0;
      if (dresseur.ajuste && r.ajustement === 'equipe') ref = Math.max(0, ...partie.equipe.map((c) => c.niveau));
      if (dresseur.ajuste && r.ajustement === 'badges') ref = C.plafond(jeu, partie);
      adverses = (dresseur.equipe || []).filter((m) => trouver('creatures', m.creature)).slice(0, 6).map((m) => {
        const niveau = Math.max(Number(m.niveau) || 5, ref ? ref + (Number(r.ecart) || 0) : 0);
        const c = C.creer(jeu, m.creature, niveau, { nature: m.nature || undefined, attaques: m.attaques, chromatique: false });
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
    function etat(k) {
      const c = actif(k), e = C.espece(jeu, c);
      const xpMin = C.xpPour(e?.croissance, c.niveau), xpMax = C.xpPour(e?.croissance, c.niveau + 1);
      return {
        nom: C.nom(jeu, c), niveau: c.niveau, sexe: c.sexe, pv: c.pv, pvMax: C.pvMax(jeu, c), statut: NOMS_STATUTS[c.statut] || '',
        xp: c.niveau >= 100 ? 0 : Math.max(0, Math.min(1, (c.xp - xpMin) / Math.max(1, xpMax - xpMin))),
        image: (k.joueur ? e?.sprites?.dos || e?.sprites?.face : e?.sprites?.face) || '', chromatique: c.chromatique,
        types: types(c).map((t) => ({ nom: typeDe(t)?.nom || t, couleur: typeDe(t)?.couleur || '#888' })),
      };
    }
    const montrer = (k) => ui.creature(k.joueur ? 'joueur' : 'adversaire', etat(k));
    // Les PV changent : la barre glisse.
    async function pv(k, c, nouveau) {
      const avant = c.pv;
      c.pv = Math.max(0, Math.min(C.pvMax(jeu, c), Math.round(nouveau)));
      if (c === actif(k) && c.pv !== avant) await ui.pv(k.joueur ? 'joueur' : 'adversaire', c.pv, C.pvMax(jeu, c));
    }

    // --- Les statistiques en combat (avec les étages, de −6 à +6) ---
    const multEtage = (s, e) => (s === 'precision' || s === 'esquive' ? (e >= 0 ? (3 + e) / 3 : 3 / (3 - e)) : (e >= 0 ? (2 + e) / 2 : 2 / (2 - e)));
    function stat(k, s) {
      const c = actif(k);
      let v = C.stats(jeu, c)[s] * multEtage(s, k.etages[s] || 0);
      if (s === 'vitesse' && c.statut === 'paralysie') v *= 0.5;
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
    function choixAdverse() {
      const c = actif(eux);
      const possibles = c.attaques.filter((a) => a.pp > 0 && trouver('attaques', a.id));
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
        if (!chance(20)) { await ui.message(`${nom} est gelé !`); return; }
        c.statut = '';
        montrer(k);
        await ui.message(`${nom} dégèle !`);
      }
      if (k.peur) { k.peur = false; await ui.message(`${nom} a peur et ne bouge pas !`); return; }
      if (k.confusion > 0) {
        k.confusion--;
        if (!k.confusion) await ui.message(`${nom} n'est plus confus.`);
        else {
          await ui.message(`${nom} est confus…`);
          if (chance(33)) {
            const deg = degats(c, stat(k, 'attaque'), stat(k, 'defense'), 40, 1);
            await ui.message('Il se blesse dans sa confusion !');
            ui.animer(k.joueur ? 'joueur' : 'adversaire', 'touche');
            await pv(k, c, c.pv - deg);
            return;
          }
        }
      }
      if (c.statut === 'paralysie' && chance(25)) { await ui.message(`${nom} est paralysé ! Il ne peut pas attaquer !`); return; }

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
          const deg = degats(c, A, D, puissance, mult);
          ui.animer(cible.joueur ? 'joueur' : 'adversaire', 'touche');
          infliges += Math.min(d.pv, deg);
          await pv(cible, d, d.pv - deg);
          if (crit) await ui.message('Coup critique !');
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
        if (d.pv <= 0) return;
        // La peur : seulement si l'attaquant passe en premier (le défenseur n'a pas encore agi).
        if (att.peur && chance(att.peur) && !cible.aJoue) cible.peur = true;
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

    // La formule des dégâts.
    function degats(c, A, D, puissance, mult) {
      const base = Math.floor(Math.floor(Math.floor(2 * c.niveau / 5 + 2) * puissance * A / D) / 50) + 2;
      return Math.max(1, Math.floor(base * mult * (85 + hasard(16)) / 100));
    }

    async function infliger(k, statut, annoncer) {
      const c = actif(k), nom = nomDe(k);
      if (statut === 'confusion') {
        if (k.confusion) { if (annoncer) await ui.message(`${nom} est déjà confus.`); return; }
        k.confusion = 2 + hasard(4);
        await ui.message(`${nom} devient confus !`);
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
        brulure: `${nom} est brûlé !`, paralysie: `${nom} est paralysé ! Il aura du mal à attaquer !`, poison: `${nom} est empoisonné !`,
        poison_grave: `${nom} est gravement empoisonné !`, sommeil: `${nom} s'endort !`, gel: `${nom} est gelé !`,
      }[statut]);
    }

    async function changerEtage(k, s, n) {
      if (!ETAGES.includes(s) || !n) return;
      const avant = k.etages[s] || 0;
      const apres = Math.max(-6, Math.min(6, avant + n));
      const nomStat = C.NOMS_STATS[s] || s;
      if (apres === avant) { await ui.message(`${nomStat} de ${nomDe(k)} ne peut plus ${n > 0 ? 'monter' : 'baisser'} !`); return; }
      k.etages[s] = apres;
      ui.animer(k.joueur ? 'joueur' : 'adversaire', n > 0 ? 'monte' : 'baisse');
      const fort = Math.abs(apres - avant) >= 2 ? ' beaucoup' : '';
      await ui.message(`${nomStat} de ${nomDe(k)}${fort} ${n > 0 ? 'augmente' : 'baisse'} !`);
    }

    // La fin du tour : brûlure et poison.
    async function finDeTour(k) {
      const c = actif(k);
      if (c.pv <= 0) return;
      const max = C.pvMax(jeu, c);
      if (c.statut === 'brulure') { await ui.message(`${nomDe(k)} souffre de sa brûlure !`); await pv(k, c, c.pv - Math.max(1, Math.floor(max / 16))); }
      else if (c.statut === 'poison') { await ui.message(`${nomDe(k)} souffre du poison !`); await pv(k, c, c.pv - Math.max(1, Math.floor(max / 8))); }
      else if (c.statut === 'poison_grave') { await ui.message(`${nomDe(k)} souffre du poison !`); await pv(k, c, c.pv - Math.max(1, Math.floor(max * k.toxique / 16))); k.toxique = Math.min(15, k.toxique + 1); }
    }

    // Changer de créature : les étages et la confusion s'effacent.
    async function envoyer(k, i, premier = false) {
      k.actif = i;
      k.etages = {};
      k.confusion = 0;
      k.toxique = actif(k).statut === 'poison_grave' ? 1 : 0;
      k.peur = false;
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
      let secousses = 4;
      if (bonus < 255) {
        const bonusStatut = d.statut === 'sommeil' || d.statut === 'gel' ? 2 : d.statut ? 1.5 : 1;
        const a = (3 * max - 2 * d.pv) * (Number(e?.taux_capture) || 45) * bonus / (3 * max) * bonusStatut;
        if (a < 255) {
          const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a)));
          secousses = 0;
          while (secousses < 4 && hasard(65536) < b) secousses++;
        }
      }
      for (let i = 0; i < Math.min(3, secousses); i++) await ui.animer('adversaire', 'secoue');
      if (secousses >= 4) {
        await ui.animer('adversaire', 'attrape');
        await ui.message(`Et hop ! ${C.nom(jeu, d)} est attrapé !`);
        partie.compteurs.captures = (partie.compteurs.captures || 0) + 1;
        const place = Collection.ranger(jeu, partie, d);
        if (place.ou === 'boite') await ui.message(`Ton équipe est pleine : ${C.nom(jeu, d)} part au PC, dans la ${place.nom}.`);
        return true;
      }
      await ui.animer('adversaire', 'sort');
      await ui.message(['Oh non ! La créature s\'est libérée !', 'Raaah ! Ça y était presque !', 'Aaaah ! Presque !', 'Mince ! Ça y était presque !'][secousses]);
      return false;
    }

    // --- La fuite (contre une créature sauvage) ---
    let essaisFuite = 0;
    function fuiteReussie() {
      essaisFuite++;
      const a = stat(nous, 'vitesse'), b = stat(eux, 'vitesse');
      if (a >= b) return true;
      return hasard(256) < (Math.floor(a * 128 / b) + 30 * essaisFuite) % 256;
    }

    // --- Gagner de l'expérience (et apprendre, évoluer) ---
    async function recompenses(battue) {
      const e = C.espece(jeu, battue);
      const gagnants = [...nous.participants].filter((c) => c.pv > 0 && partie.equipe.includes(c));
      if (!gagnants.length) return;
      const total = Math.max(1, Math.floor((Number(e?.xp_base) || 60) * battue.niveau / 7 * (dresseur ? 1.5 : 1)));
      const part = Math.max(1, Math.floor(total / gagnants.length));
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
          } else if (ev.type === 'evolue') {
            const avant = C.nom(jeu, c);
            await ui.message(`Quoi ? ${avant} évolue !`);
            const nouvelles = C.evoluer(jeu, c, ev.vers);
            if (estActif) { await ui.animer('joueur', 'evolution'); montrer(nous); }
            await ui.message(`Félicitations ! ${avant} a évolué en ${C.espece(jeu, c)?.nom || ev.vers} !`);
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
      await ui.message(`${nom} veut apprendre ${nomA}, mais il connaît déjà quatre attaques.`);
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
          action = { type: 'attaque', attaque: c.attaques[i] };
        } else if (choix === 'sac') {
          action = await utiliserObjet();
        } else if (choix === 'equipe') {
          const i = await choisirCreature('Équipe : qui envoyer ?', false);
          if (i != null) action = { type: 'changer', cible: i };
        } else if (choix === 'fuite') {
          if (dresseur) { await ui.message('Impossible de fuir un combat de dresseur !'); continue; }
          if (fuiteReussie()) { await ui.message('Tu prends la fuite !'); ui.fermer(); return { issue: 'fuite' }; }
          await ui.message('Impossible de fuir !');
          action = { type: 'rien' };
        }
      }

      // 2. Les actions passent : changer et objets d'abord, puis les attaques (priorité, puis vitesse).
      const adverse = choixAdverse();
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

      const ordre = [];
      if (!nous.aJoue) ordre.push([nous, eux, action.attaque]);
      ordre.push([eux, nous, adverse.attaque]);
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
      for (const k of [nous, eux]) { k.peur = false; await finDeTour(k); }

      // 3. Les K.O.
      if (actif(eux).pv <= 0) {
        const battue = actif(eux);
        await ui.animer('adversaire', 'ko');
        await ui.message(`${nomDe(eux)} est K.O. !`);
        await recompenses(battue);
        nous.participants = new Set([actif(nous)].filter((c) => c.pv > 0));
        const suivant = eux.equipe.findIndex((c) => c.pv > 0);
        if (suivant < 0) {
          if (dresseur) {
            await ui.message(`Tu as battu ${nomDresseur()} !`);
            if (dresseur.dialogue_victoire) await ui.message(dresseur.dialogue_victoire, { qui: nomDresseur() });
            const argent = Number(dresseur.argent) || 0;
            if (argent) { partie.argent = (partie.argent || 0) + argent; await ui.message(`Tu gagnes ${argent} ${monnaie} !`); }
          }
          ui.fermer();
          return { issue: 'victoire' };
        }
        await envoyer(eux, suivant);
      }
      if (actif(nous).pv <= 0) {
        await ui.animer('joueur', 'ko');
        await ui.message(`${C.nom(jeu, actif(nous))} est K.O. !`);
        if (!vivants(nous).length) {
          await ui.message('Tu n\'as plus de créature en état de se battre…');
          if (dresseur?.dialogue_defaite) await ui.message(dresseur.dialogue_defaite, { qui: nomDresseur() });
          const perdu = Math.floor((partie.argent || 0) / 2);
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
