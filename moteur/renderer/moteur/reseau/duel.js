// Le duel entre deux joueurs (Saga 1.0, pack Pokémon) : un combat amical, rien n'est perdu ni gagné.
//
// Un seul des deux calcule le combat, pour que les deux voient la même chose : celui qui a lancé le défi
// est l'« arbitre ». Il joue le combat normal du pack (regles/pokemon/combat.js) avec `duel` : à la place
// de l'IA, c'est l'autre joueur qui choisit, par le réseau. Tout ce que l'arbitre montre à l'écran est
// renvoyé à l'autre (les deux côtés inversés : mon adversaire est son héros), et quand c'est à lui de
// choisir, son écran le lui demande.
//
// Les équipes sont copiées au départ et remises comme avant à la fin : un duel ne change rien à la partie
// (ni PV, ni PP, ni expérience, ni objets).
//
//   Duel.creer({ moteur, multi, message }) → { commencer, recevoir, arreter, get enCours }

const Duel = (() => {
  const COTE = { joueur: 'adversaire', adversaire: 'joueur' }; // inverser les côtés chez l'autre joueur
  const copie = (x) => JSON.parse(JSON.stringify(x));

  function creer({ moteur, multi, message = () => {} }) {
    let jeu2 = null; // { avec, role, envoyer, finir, attentes: Map, ui, equipeAvant }
    let numero = 0;
    const attentes = new Map(); // n → resoudre : les demandes en attente d'une réponse de l'autre

    const equipeDe = () => (moteur.partieVive?.equipe || []).filter((c) => c && !c.heros);

    async function commencer({ avec, role, envoyer, finir }) {
      if (jeu2) return;
      const equipe = equipeDe();
      if (!equipe.some((c) => c.pv > 0)) { message('Aucune de tes créatures n\'est en état de se battre.'); envoyer({ etape: 'annuler' }); finir(); return; }
      presse = false;
      jeu2 = { avec, role, envoyer, finir, equipeAvant: copie(moteur.partieVive.equipe) };
      // Les deux côtés s'envoient leur équipe (telle qu'elle est maintenant) : l'arbitre a besoin de celle
      // de l'autre pour jouer le combat ; l'autre n'a besoin de rien, il regarde et choisit.
      envoyer({ etape: 'equipe', equipe: copie(equipe) });
      message(role === 'demandeur' ? 'Duel : en attente de l\'équipe adverse…' : 'Duel : l\'autre joueur prépare le combat…');
    }

    function arreter() {
      if (!jeu2) return;
      // Les équipes retrouvent leur état d'avant le duel.
      if (jeu2.equipeAvant && moteur.partieVive) moteur.partieVive.equipe = jeu2.equipeAvant;
      for (const r of attentes.values()) r(null);
      attentes.clear();
      const f = jeu2.finir;
      jeu2 = null;
      f?.();
    }

    // --- Ce que l'autre joueur nous envoie ---
    function recevoir(de, d) {
      if (!jeu2 || jeu2.avec !== de) return;
      if (d.etape === 'annuler') { presse = true; message('Le duel est annulé.'); arreter(); return; }
      if (d.etape === 'equipe') {
        jeu2.equipeAutre = Array.isArray(d.equipe) ? d.equipe : [];
        if (jeu2.role === 'demandeur') jouer();
        return;
      }
      if (d.etape === 'ui') { appliquer(d.appel); return; }
      if (d.etape === 'demande') { demander(d); return; }
      if (d.etape === 'reponse') { attentes.get(d.n)?.(d.valeur); attentes.delete(d.n); return; }
      if (d.etape === 'fin') {
        // Mon écran a peut-être encore des messages en retard : on les laisse finir, puis on annonce.
        presse = true;
        const gagne = d.issue === 'defaite'; // l'issue est celle de l'arbitre
        file = file.then(() => {
          moteur.annoncer('Duel terminé', gagne ? 'Tu as gagné !' : 'Tu as perdu…');
          arreter();
        }).catch(() => {});
      }
    }

    // --- L'arbitre : il joue le combat ---
    async function jouer() {
      const avec = jeu2.avec;
      const equipe = (jeu2.equipeAutre || []).map((c) => Regles.completer(moteur.jeuOuvert, c)).filter(Boolean);
      if (!equipe.length || !equipe.some((c) => c.pv > 0)) { message('L\'équipe adverse est vide.'); jeu2.envoyer({ etape: 'annuler' }); arreter(); return; }
      const ok = await moteur.duel(async ({ jeu, partie, ui }) => {
        const miroir = enveloppe(ui);
        const { issue } = await Combat.lancer({
          jeu, partie, ui: miroir, fond: 'arene',
          duel: {
            nom: multi.nomDe(avec), equipe,
            // À chaque tour, l'autre joueur choisit (son écran lui demande).
            choisir: (infos) => attendre('choix', infos),
          },
        });
        jeu2?.envoyer({ etape: 'fin', issue });
        moteur.annoncer('Duel terminé', issue === 'victoire' ? 'Tu as gagné !' : issue === 'defaite' ? 'Tu as perdu…' : 'Match nul.');
        return true;
      });
      if (!ok) { jeu2?.envoyer({ etape: 'annuler' }); }
      arreter();
    }
    // L'écran de l'arbitre, doublé : tout ce qu'il montre part aussi chez l'autre joueur, côtés inversés.
    function enveloppe(ui) {
      const passer = (nom, args) => jeu2?.envoyer({ etape: 'ui', appel: { nom, args } });
      const cote = (c) => COTE[c] || c;
      // Les côtés sont inversés chez l'autre joueur : ce que je vois de dos, il le voit de face
      // (Saga 1.2 ; avant, les deux écrans montraient le même sprite et tout semblait à l'envers).
      const retourner = (c, e) => {
        const sp = (moteur.jeuOuvert?.donnees?.creatures?.creatures || []).find((x) => x.id === e?.espece)?.sprites;
        if (!sp || !e) return e;
        return { ...e, image: (c === 'joueur' ? sp.face : sp.dos || sp.face) || e.image };
      };
      // Les textes aussi changent de camp : « Zaza adverse » chez moi, c'est « Zaza » chez lui, et mes
      // créatures deviennent les siennes « adverses ». On ne touche qu'aux noms des deux équipes.
      const nomsDe = (equipe) => (equipe || []).map((c) => (c?.surnom || espece(c)?.nom || '')).filter(Boolean);
      const espece = (c) => (moteur.jeuOuvert?.donnees?.creatures?.creatures || []).find((x) => x.id === c?.creature);
      const echapper = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      function texteRetourne(t) {
        if (typeof t !== 'string' || !t) return t;
        let s = t;
        const moi = multi.moi?.nom || 'L\'adversaire', lui = multi.nomDe(jeu2?.avec) || 'L\'adversaire';
        const [GARDE, MOI] = ['\u0000', '\u0001']; // des marques, pour ne pas retraiter ce qu'on vient d'écrire
        // Les entrées en jeu changent de bouche : « Léo envoie Zaza ! » se lit « En avant, Zaza ! », et
        // mon « En avant, Rono ! » se lit « Ragna envoie Rono ! ».
        const sienne = new RegExp(`^${echapper(lui)} envoie (.+) !$`);
        if (sienne.test(s)) s = s.replace(sienne, 'En avant, $1 !');
        else s = s.replace(/^(?:En avant|À toi), (.+) !$/, `${MOI} envoie $1 !`);
        // Les deux joueurs échangent leur place dans la phrase.
        s = s.replace(new RegExp(echapper(lui), 'g'), '\u0002').replace(new RegExp(echapper(moi), 'g'), '\u0003');
        s = s.replace(/\u0002/g, moi).replace(/\u0003/g, lui).replace(new RegExp(MOI, 'g'), moi);
        // Et « Zaza adverse » devient « Zaza », pendant que mes créatures deviennent les adverses.
        for (const n of nomsDe(jeu2?.equipeAutre)) s = s.replace(new RegExp(`${echapper(n)} adverse`, 'g'), `${GARDE}${n}${GARDE}`);
        for (const n of nomsDe(moteur.partieVive?.equipe)) s = s.replace(new RegExp(`${echapper(n)}(?![\\w${GARDE}])`, 'g'), `${n} adverse`);
        return s.replace(new RegExp(GARDE, 'g'), '');
      }
      return {
        ...ui,
        ouvrir: (o) => { passer('ouvrir', [{ fond: o?.fond || 'arene', dresseur: { nom: multi.moi?.nom || 'Adversaire', portrait: '' } }]); return ui.ouvrir(o); },
        // Pendant que je choisis, l'autre joueur voit qu'on l'attend.
        menu: (nom, dresseur) => { passer('message', [`Au tour de ${multi.moi?.nom || 'l\'adversaire'}…`, { discret: true }]); return ui.menu(nom, dresseur); },
        message: (t, o) => { passer('message', [texteRetourne(t), o]); return ui.message(t, o); },
        creature: (c, e) => { passer('creature', [cote(c), retourner(c, e)]); return ui.creature(c, e); },
        pv: (c, v, m) => { passer('pv', [cote(c), v, m]); return ui.pv(c, v, m); },
        etats: (c, l) => { passer('etats', [cote(c), l]); return ui.etats?.(c, l); },
        animer: (c, n, im) => { passer('animer', [cote(c), n, im]); return ui.animer(c, n, im); },
        evolution: (c, im) => { passer('evolution', [cote(c), im]); return ui.evolution(c, im); },
        fermer: () => { passer('fermer', []); return ui.fermer(); },
      };
    }
    // Attendre une réponse de l'autre joueur (son choix du tour).
    function attendre(quoi, infos) {
      const n = ++numero;
      jeu2?.envoyer({ etape: 'demande', sorte: quoi, n, infos });
      return new Promise((resoudre) => {
        attentes.set(n, resoudre);
        // S'il s'en va, le combat ne doit pas rester bloqué : au bout de 90 s, l'IA décide pour lui.
        setTimeout(() => { if (attentes.has(n)) { attentes.delete(n); resoudre(null); } }, 90e3);
      });
    }

    // --- L'autre joueur : son écran suit celui de l'arbitre, et lui demande ses choix ---
    let ui2 = null, enChoix = false; // enChoix : c'est à moi de choisir, l'écran ne doit pas bouger
    const AUTORISES = new Set(['ouvrir', 'message', 'creature', 'etats', 'pv', 'animer', 'evolution', 'fermer']);
    // Les appels se jouent l'un après l'autre, dans l'ordre où l'arbitre les a faits : sinon deux
    // animations se marcheraient dessus (une entrée annulerait la barre de PV de l'autre côté).
    let file = Promise.resolve();
    function appliquer(appel) {
      if (!appel || !AUTORISES.has(appel.nom)) return;
      file = file.then(() => jouerAppel(appel)).catch(() => {});
    }
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    let presse = false; // le combat est fini chez l'arbitre : on rattrape le retard sans traîner
    async function jouerAppel(appel) {
      // Pendant que je choisis, la suite attend : un message de l'arbitre effacerait mon menu.
      for (let k = 0; enChoix && k < 1200; k++) await pause(100);
      if (!ui2) { ouvrirEcran(); for (let k = 0; !ui2 && k < 40; k++) await pause(50); }
      if (!ui2) return;
      // Un message attend la touche Action de son lecteur : ici c'est l'arbitre qui mène le rythme.
      // On ne l'attend donc pas, mais on le laisse le temps d'être lu (Saga 1.2 : avant, le message
      // suivant l'effaçait aussitôt et l'invité ne voyait aucun texte).
      try {
        const r = ui2[appel.nom](...(appel.args || []));
        if (appel.nom === 'message') await pause(presse ? 220 : Math.min(2600, 700 + 28 * String(appel.args?.[0] || '').length));
        else await r;
      } catch { /* un appel qu'on ne sait pas jouer : tant pis */ }
      if (appel.nom === 'fermer') { ui2 = null; fermerEcran?.(); }
    }
    let fermerEcran = null;
    function ouvrirEcran() {
      if (ui2) return;
      moteur.duel(async ({ ui }) => {
        ui2 = ui;
        await new Promise((resoudre) => { fermerEcran = resoudre; });
        ui2 = null;
        return true;
      });
    }
    // L'arbitre nous demande ce qu'on fait : le menu de notre écran (Attaque, Équipe).
    async function demander(d) {
      if (d.sorte !== 'choix') { jeu2?.envoyer({ etape: 'reponse', n: d.n, valeur: null }); return; }
      // L'écran du duel vient peut-être d'arriver : on lui laisse le temps de s'ouvrir.
      for (let k = 0; !ui2 && k < 40; k++) await new Promise((r) => setTimeout(r, 50));
      if (!ui2) { jeu2?.envoyer({ etape: 'reponse', n: d.n, valeur: null }); return; }
      const infos = d.infos || {};
      enChoix = true;
      try {
        await choisir(d, infos);
      } finally { enChoix = false; }
    }
    async function choisir(d, infos) {
      // Ma créature est K.O. : pas de menu, je choisis seulement qui j'envoie (Saga 1.2).
      if (infos.force) {
        const vivantes = (infos.equipe || []).filter((c) => c.pv > 0);
        if (!vivantes.length) { jeu2?.envoyer({ etape: 'reponse', n: d.n, valeur: null }); return; }
        for (;;) {
          const i = await ui2.liste('Qui envoyer ?', (infos.equipe || []).map((c) => ({
            texte: `${c.nom}  N.${c.niveau}`, detail: c.pv > 0 ? `${c.pv} / ${c.pvMax} PV` : 'K.O.',
            desactive: c.pv <= 0, pv: c.pv / Math.max(1, c.pvMax),
          })), false);
          if (i == null) continue; // on ne peut pas refuser : il en faut une
          jeu2?.envoyer({ etape: 'reponse', n: d.n, valeur: { type: 'changer', cible: i } });
          return;
        }
      }
      for (;;) {
        const quoi = await ui2.menu(infos.actif?.nom || '…', true);
        if (quoi === 'attaque') {
          const i = await ui2.attaques((infos.attaques || []).map((a) => ({ nom: a.nom, pp: a.pp, ppMax: a.ppMax, type: a.type, couleur: a.couleur, categorie: a.categorie })));
          if (i == null) continue;
          const a = infos.attaques[i];
          if (a) { jeu2?.envoyer({ etape: 'reponse', n: d.n, valeur: { type: 'attaque', attaque: a.id } }); return; }
        } else if (quoi === 'equipe') {
          const i = await ui2.liste('Qui envoyer ?', (infos.equipe || []).map((c) => ({
            texte: `${c.nom}  N.${c.niveau}`, detail: c.pv > 0 ? `${c.pv} / ${c.pvMax} PV` : 'K.O.',
            desactive: c.pv <= 0 || c.actif, pv: c.pv / Math.max(1, c.pvMax),
          })), true);
          if (i == null) continue;
          jeu2?.envoyer({ etape: 'reponse', n: d.n, valeur: { type: 'changer', cible: i } });
          return;
        } else if (quoi === 'fuite') {
          await ui2.message('On ne fuit pas un duel amical !');
        } else if (quoi === 'sac') {
          await ui2.message('Pas de sac dans un duel.');
        }
      }
    }

    return { commencer, recevoir, arreter, get enCours() { return Boolean(jeu2); } };
  }
  return { creer };
})();
