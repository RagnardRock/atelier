// Les scripts JS d'un jeu, côté Saga (0.12). Voir tuiles/SCRIPTS.md (copié dans chaque dossier de jeu) pour tout ce qu'un
// script peut faire, et ../commun/bac-a-sable.js pour la boîte fermée où il tourne.
//
// Ici, Saga est « l'hôte » : il charge les scripts du jeu dans le bac à sable, leur répond quand ils
// demandent quelque chose (une boîte de dialogue, donner un objet…) et les appelle à trois endroits :
//   - le bloc Script d'un événement (commande « script » : une commande déclarée par commande()) ;
//   - une formule d'un pack de règles (formule() : les règles maison, par Maison.formule) ;
//   - un moment du jeu (quand() : nouvelle partie, carte, après un combat, moment de la journée, pas).
//
// Un script ne touche jamais la partie : chaque demande devient une commande des scripts en blocs
// (FORMAT.md › Commandes), jouée par scripts.js exactement comme si elle était dans le script de
// l'événement. Une erreur dans un script ne casse jamais le jeu : elle est dite (en test) ou notée (dans
// un jeu exporté), et le jeu continue.

// Les règles maison, pour les packs de règles : `await Maison.formule('degats', valeurs, formuleDuPack)`.
// Sans script qui remplace cette formule (ou si elle est coupée dans Tafl), c'est la formule du pack, tout
// de suite. Sinon, le script reçoit les valeurs plus `normal` (le résultat du pack) et rend un nombre.
const Maison = (() => {
  let hote = null; // { bac, coupees, pret, signaler } : celui du jeu en cours (scripts-js.js › creer)

  function formule(nom, valeurs, defaut) {
    const normal = defaut(valeurs);
    if (!hote || hote.coupees.has(nom)) return normal;
    const appeler = () => {
      if (!hote?.bac.a('formule', nom)) return normal;
      return hote.bac.appeler('formule', nom, { ...valeurs, normal })
        .then((r) => (typeof r.valeur === 'number' && Number.isFinite(r.valeur) ? r.valeur : normal))
        .catch((err) => { hote?.signaler(err, `formule('${nom}')`); return normal; });
    };
    return hote.pret ? appeler() : hote.bac.pret().then(appeler);
  }

  return { formule, utiliser(h) { hote = h; } };
})();

const ScriptsJs = (() => {
  // Ce que le bac à sable rend quand le jeu n'a pas de script : rien ne se passe, très vite.
  const AUCUN = {
    actif: false,
    commande: async (nom) => { throw new Error(`La commande de script « ${nom} » n'existe pas : ce jeu n'a pas de script actif`); },
    quand: async () => {},
    ecoute: () => false,
    regraine() {},
    fermer() {},
  };
  const MAX_IMBRICATION = 8; // un script qui lance un script qui lance un script…

  // hote : ce que le moteur prête.
  //   jeu, partie() : le jeu et la partie en cours
  //   lieu(ev) → { carte: { id, nom }, joueur: { nom, x, y, direction } }
  //   jouer(c, ev) → la commande des scripts en blocs c, jouée (rend l'issue d'un combat) ; lance
  //                  BacASable.FIN si le script doit s'arrêter (combat perdu, commande « fin »)
  //   choisir(options) → n° de la réponse ; annoncer(titre, texte)
  //   signaler(texte) : une erreur à montrer (en test) ou à noter (jeu exporté)
  function creer({ jeu, partie, lieu, jouer, choisir, annoncer, signaler }) {
    Maison.utiliser(null);
    if (!jeu.scripts?.length) return AUCUN;
    const reglages = jeu.donnees.reglages?.reglages?.scripts || {};
    const coupees = new Set(Array.isArray(reglages.formules_coupees) ? reglages.formules_coupees : []);
    // « Script « piege » (piege.js, ligne 4) : … »
    const dire = (err, quoi) => {
      const ou = BacASable.lieuTexte(err?.lieu);
      signaler(`Script${quoi ? ` ${quoi}` : ''}${ou ? ` (${ou})` : ''} : ${err?.message || err}`);
    };
    const copie = () => JSON.parse(JSON.stringify(partie()));
    const bac = BacASable.creer({
      fichiers: jeu.scripts,
      donnees: jeu.donnees,
      graine: Number.isInteger(partie().graine) ? partie().graine : 1,
      hote: {
        etat: (a) => {
          const ev = a.contexte?.ev || null;
          // Saga 0.13 : les fiches des membres, déjà calculées par le pack (saga.fiche).
          // Saga 1.4 : ce que les modules du jeu donnent à lire (saga.modules).
          return { partie: copie(), fiches: Regles.pourScript(jeu, partie()), modules: typeof Modules !== 'undefined' ? Modules.pourScript(jeu, partie()) : {}, ...lieu(ev), evenement: ev ? { id: ev.id, nom: ev.nom || ev.id, x: ev.x, y: ev.y } : null };
        },
        graine: (n) => { if (partie()) partie().graine = n; },
        console: (c) => {
          if (c.niveau === 'erreur') signaler(`Script${c.lieu ? ` (${BacASable.lieuTexte(c.lieu)})` : ''} : ${c.texte}`);
          else console[c.niveau === 'avertissement' ? 'warn' : 'log'](`[script${c.lieu ? ` ${BacASable.lieuTexte(c.lieu)}` : ''}]`, c.texte);
        },
        demande: async (action, args, a) => {
          const ev = a.contexte?.ev || null;
          if (action === 'choisir') {
            const options = (args?.options || []).map((o) => String(o).slice(0, 80)).filter(Boolean);
            if (options.length < 1) throw new Error('saga.choisir() a besoin d\'au moins une réponse');
            return choisir(options);
          }
          if (action === 'annoncer') { annoncer(String(args?.titre || '').slice(0, 80), String(args?.texte || '').slice(0, 200)); return null; }
          if (action === 'commande') {
            if (!args || typeof args.type !== 'string') throw new Error('saga.commande() a besoin d\'une commande avec un type (FORMAT.md › Commandes)');
            if (args.type === 'script' && (a.contexte?.profondeur || 0) >= MAX_IMBRICATION) throw new Error('Trop de scripts lancés les uns dans les autres');
            const issue = await jouer(args, ev, (a.contexte?.profondeur || 0) + 1);
            // L'issue d'un combat (un texte), ou le résultat d'une commande du pack (saga.test : un objet simple).
            if (typeof issue === 'string') return issue;
            return issue && typeof issue === 'object' ? JSON.parse(JSON.stringify(issue)) : null;
          }
          throw new Error(`Demande inconnue : ${action}`);
        },
      },
    });
    const h = { bac, coupees, pret: false, signaler: dire };
    bac.pret().then((inv) => {
      h.pret = true;
      for (const e of inv.erreurs) signaler(`Script ${BacASable.lieuTexte(e.ligne ? e : null) || e.fichier} : ${e.message}`);
    });
    Maison.utiliser(h);

    return {
      actif: true,
      // Le bloc Script : rend { finScript } (le script a demandé d'arrêter celui de l'événement).
      async commande(nom, params, ev, profondeur = 0) {
        const r = await bac.appeler('commande', nom, { params: params || {} }, { ev, profondeur });
        return { finScript: r.finScript };
      },
      // Un moment du jeu : chaque quand(moment) des scripts, dans l'ordre des fichiers.
      async quand(moment, infos = {}) {
        await bac.pret();
        if (!bac.a('quand', moment)) return;
        try {
          await bac.appeler('quand', moment, infos, { ev: null });
        } catch (err) {
          dire(err, `quand('${moment}')`);
        }
      },
      // Saga 1.12 (temps réel) : la décision d'un ennemi au comportement « script » (comportement() du script).
      // → une promesse de la décision, ou null si aucun script ne déclare ce comportement.
      comportement(nom, etat) {
        if (!h.pret || !bac.a('comportement', nom)) return null;
        return bac.appeler('comportement', nom, etat, { ev: null })
          .then((r) => (r?.valeur && !r.valeur.absente ? r.valeur : null))
          .catch((err) => { dire(err, `comportement('${nom}')`); return null; });
      },
      // Un script écoute-t-il ce moment ? (pour ne rien faire du tout à chaque pas sinon)
      ecoute: (moment) => h.pret && bac.a('quand', moment),
      regraine: (n) => bac.regraine(n),
      fermer() { bac.fermer(); Maison.utiliser(null); },
      dire,
    };
  }

  return { creer, AUCUN };
})();
