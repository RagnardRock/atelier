// Saga 1.38 : la salle de campagne, côté MJ.
//
// Une campagne (une partie du MJ en mode table) dure d'une séance à l'autre :
//   - par le relais, sa salle est FIXE : le même lien d'invitation, avec le même code, à chaque séance ;
//   - les téléphones reliés (le compagnon) le restent : plus de QR à scanner à chaque fois ;
//   - à la fin d'une séance (et à la demande, et toutes les 10 minutes si quelque chose a changé), Saga dépose
//     sur le relais, pour chaque joueur qui a relié son téléphone, une copie de ce qu'il a le droit de voir :
//     sa fiche, ses macros, ses documents, le journal. Chiffrée avec SA clé (moteur/coffre.js) : le relais ne
//     sait pas la lire. Le téléphone la relit hors séance. Le MJ, lui, n'a pas de copie : ses infos ne quittent
//     pas son PC.
//   - un changement de fiche fait hors séance sur un téléphone revient ici comme une PROPOSITION : le MJ l'accepte
//     (ou la refuse) en un clic, ou les accepte toutes d'office. Elle passe par les mêmes vérifications qu'un
//     changement fait en séance (le champ doit être modifiable par le joueur).
//
// L'état vit dans la partie (table.campagne, voir etat.js) : { nom, fond, id, secret, code, telephones, cles,
// propositions, auto, depot }.
//
//   TableCampagne.creer({ table, copiePour, appliquer, multi, message, rafraichir }) → { brancher, deposer,
//     accepter, refuser, bloc, ... }

const TableCampagne = (() => {
  const DIX_MINUTES = 10 * 60e3;
  function aleatoire(n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  let ecoute = null; // les messages de main.js n'ont qu'un seul destinataire (la dernière campagne branchée)

  function creer({ table, copiePour, appliquer, multi = () => null, message = () => {}, rafraichir = () => {} }) {
    // (la campagne a pu être remplacée en entier, par un script ou une vieille sauvegarde : on complète)
    const c = () => {
      const t = table();
      if (!t.campagne || typeof t.campagne !== 'object') t.campagne = {};
      const x = t.campagne;
      if (!Array.isArray(x.telephones)) x.telephones = [];
      if (!x.cles || typeof x.cles !== 'object') x.cles = {};
      if (!Array.isArray(x.propositions)) x.propositions = [];
      return x;
    };
    let signatureDeposee = '', minuterie = null, enCours = null;

    // L'identité sur le relais : créée une fois, gardée dans la partie.
    function assurer() {
      const x = c();
      if (!x.id) x.id = aleatoire(12);
      if (!x.secret) x.secret = aleatoire(24);
      return x;
    }
    // Saga (main.js, reseau.js) apprend la campagne : sa salle, ses téléphones, ses clés.
    function brancher() {
      if (!window.saga.reseauCampagne) return;
      const x = assurer();
      window.saga.reseauCampagne({ id: x.id, secret: x.secret, code: x.code, telephones: x.telephones, cles: x.cles });
      ecoute = api;
      clearInterval(minuterie);
      minuterie = setInterval(() => { if (ecoute === api) deposer({ silencieux: true, siChange: true }); }, DIX_MINUTES);
    }
    function debrancher() {
      clearInterval(minuterie);
      if (ecoute === api) { ecoute = null; window.saga.reseauCampagne?.(null); }
    }
    // Ce que reseau.js a changé (un téléphone relié ou coupé, une clé créée) : gardé dans la partie.
    function recevoirCampagne(d) {
      const x = c();
      if (!x || !d) return;
      if (d.code) x.code = d.code;
      if (Array.isArray(d.telephones)) x.telephones = d.telephones;
      if (d.cles && typeof d.cles === 'object') x.cles = d.cles;
      rafraichir();
    }

    // --- Le coffre : une copie par joueur relié ---
    const joueursRelies = () => Object.values(c().cles || {}).map((k) => k.nom).filter(Boolean);
    async function deposer({ silencieux = false, siChange = false } = {}) {
      if (!window.saga.reseauDeposer) return null;
      if (enCours) return enCours;
      const noms = joueursRelies();
      if (!noms.length) { if (!silencieux) message('Aucun joueur n\'a encore relié son téléphone par le relais : rien à déposer.'); return null; }
      const copies = noms.map((nom) => ({ nom, json: JSON.stringify(copiePour(nom)) }));
      // Toutes les 10 minutes : seulement si quelque chose a changé (la date de la copie mise à part).
      const sig = JSON.stringify(copies.map((x) => x.json.replace(/^\{"v":1,"t":\d+,/, '')));
      if (siChange && sig === signatureDeposee) return null;
      enCours = window.saga.reseauDeposer(copies).then((r) => {
        if (r?.deposes?.length) { c().depot = Date.now(); signatureDeposee = sig; }
        if (!silencieux) {
          if (r?.deposes?.length) message(`Copies déposées pour ${r.deposes.join(', ')} : leurs téléphones les liront hors séance.`);
          for (const e of r?.erreurs || []) message(e.nom ? `Copie de ${e.nom} non déposée : ${e.erreur}` : e.erreur);
        }
        rafraichir();
        return r;
      }).catch((err) => { if (!silencieux) message(`Dépôt impossible : ${err.message}`); return null; })
        .finally(() => { enCours = null; });
      return enCours;
    }

    // --- Les changements proposés hors séance ---
    let numero = 0;
    function recevoirPropositions(l) {
      const x = c();
      let n = 0;
      for (const p of l || []) {
        for (const ch of p.changements || []) {
          if (x.propositions.some((q) => q.nom === p.nom && q.id === ch.id && q.t === ch.t)) continue;
          x.propositions.push({ n: `${Date.now().toString(36)}-${++numero}`, nom: p.nom, id: ch.id, valeur: ch.valeur, t: ch.t || Date.now() });
          n++;
        }
      }
      x.propositions = x.propositions.slice(-200);
      if (!n) return;
      if (x.auto) {
        const ok = accepterTout();
        message(`${ok} changement${ok > 1 ? 's' : ''} de fiche fait${ok > 1 ? 's' : ''} hors séance, appliqué${ok > 1 ? 's' : ''} d'office.`);
      } else message(`${n} changement${n > 1 ? 's' : ''} de fiche proposé${n > 1 ? 's' : ''} hors séance : à voir dans l'onglet Joueurs.`);
      rafraichir();
    }
    // Le dernier changement d'un champ compte (deux changements du même champ : le plus récent).
    function accepter(n) {
      const x = c();
      const p = x.propositions.find((q) => q.n === n);
      if (!p) return false;
      x.propositions = x.propositions.filter((q) => q !== p);
      const ok = appliquer(p.nom, p.id, p.valeur);
      if (!ok) message(`Changement refusé par le jeu (${p.nom} : ${p.id}) : ce champ n'est pas modifiable par le joueur, ou il n'a plus de héros.`);
      rafraichir();
      return ok;
    }
    function refuser(n) {
      const x = c();
      x.propositions = x.propositions.filter((q) => q.n !== n);
      rafraichir();
    }
    function accepterTout(nom = '') {
      const l = [...c().propositions].filter((p) => !nom || p.nom === nom).sort((a, b) => a.t - b.t);
      let ok = 0;
      for (const p of l) if (accepter(p.n)) ok++;
      return ok;
    }

    // --- Dans l'onglet Joueurs du MJ ---
    const heure = (t) => (t ? new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais');
    function bouton(icone, texte, faire, titre = '') {
      const b = el('button', { className: 'table-bouton', type: 'button', title: titre }, el('i', { className: `codicon codicon-${icone}` }), texte ? el('span', { textContent: texte }) : null);
      b.onclick = faire;
      return b;
    }
    function bloc({ libelleChamp = (nom, id) => id } = {}) {
      const x = c();
      const m = multi();
      const relais = m?.infos?.internet?.methode === 'relais';
      const out = el('div', { className: 'table-campagne' });
      out.append(el('div', { className: 'table-sous-titre', textContent: 'Campagne' }));
      out.append(el('p', { className: 'table-note', textContent: relais
        ? 'Même lien et même code à chaque séance.'
        : 'Les joueurs gardent leur fiche et leurs documents entre deux séances.' }));
      // Les téléphones de la campagne (même ceux dont le joueur n'est pas là ce soir).
      const tels = x.telephones || [];
      if (tels.length) {
        const l = el('div', { className: 'table-telephones' });
        for (const t of tels) {
          const couper = bouton('close', '', () => window.saga.reseauOublierTelephone?.(t.jeton), 'Couper ce téléphone (il ne lira plus rien de la campagne)');
          l.append(el('div', { className: 'table-ligne' }, el('i', { className: 'codicon codicon-device-mobile' }),
            el('span', { className: 'table-nom', textContent: t.mj ? 'Toi (MJ)' : t.nom }), t.appareil ? el('small', { textContent: t.appareil }) : null, couper));
        }
        out.append(l);
      }
      // Le coffre.
      const nb = joueursRelies().length;
      const depot = bouton('cloud-upload', 'Déposer maintenant', () => deposer(), 'Envoie maintenant à chaque joueur relié la copie de sa fiche, de ses documents et du journal (chiffrée : le relais ne sait pas la lire).');
      depot.disabled = !nb || !relais;
      out.append(el('div', { className: 'table-ligne table-coffre' }, el('i', { className: 'codicon codicon-archive' }),
        el('span', { textContent: nb ? `Copies hors séance (${nb} joueur${nb > 1 ? 's' : ''}) · ${heure(x.depot)}` : 'Copies hors séance : aucun téléphone de joueur relié par le relais' }), depot));
      // Les propositions.
      const auto = el('input', { type: 'checkbox', checked: x.auto });
      auto.onchange = () => { x.auto = auto.checked; if (x.auto && x.propositions.length) { const ok = accepterTout(); message(`${ok} changement${ok > 1 ? 's' : ''} appliqué${ok > 1 ? 's' : ''}.`); } rafraichir(); };
      out.append(el('label', { className: 'table-case' }, auto, el('span', { textContent: 'Accepter d\'office les changements de fiche faits hors séance' })));
      if (x.propositions.length) {
        out.append(el('div', { className: 'table-sous-titre', textContent: `Changements proposés hors séance (${x.propositions.length})` }));
        const l = el('div', { className: 'table-propositions' });
        for (const p of [...x.propositions].sort((a, b) => a.t - b.t)) {
          const v = typeof p.valeur === 'boolean' ? (p.valeur ? 'oui' : 'non') : String(p.valeur);
          l.append(el('div', { className: 'table-ligne table-proposition' },
            el('span', { className: 'table-nom', textContent: p.nom }),
            el('span', { textContent: `${libelleChamp(p.nom, p.id)} → ${v.length > 40 ? `${v.slice(0, 40)}…` : v}`, title: `${v}\n${heure(p.t)}` }),
            bouton('check', '', () => accepter(p.n), 'Accepter'), bouton('close', '', () => refuser(p.n), 'Refuser')));
        }
        out.append(l, bouton('check-all', 'Tout accepter', () => { const ok = accepterTout(); message(`${ok} changement${ok > 1 ? 's' : ''} appliqué${ok > 1 ? 's' : ''}.`); }));
      }
      return out;
    }

    const api = {
      brancher, debrancher, deposer, accepter, refuser, accepterTout, bloc, assurer,
      recevoirCampagne, recevoirPropositions,
      get joueurs() { return joueursRelies(); },
    };
    // Une seule écoute (la campagne branchée en dernier la reçoit).
    if (!TableCampagne.ecouteBranchee) {
      TableCampagne.ecouteBranchee = true;
      window.saga.onReseauCampagne?.((d) => ecoute?.recevoirCampagne(d));
      window.saga.onReseauPropositions?.((l) => ecoute?.recevoirPropositions(l));
    }
    return api;
  }
  const mod = { creer, aleatoire, ecouteBranchee: false };
  return mod;
})();
if (typeof module !== 'undefined') module.exports = TableCampagne;
