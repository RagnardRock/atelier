// Le monde partagé (Saga 1.0) : jouer à plusieurs dans un jeu qui n'est pas une partie de table.
//
// Chacun joue SA partie (gardée chez lui) dans le même jeu : on se voit marcher sur la même carte, on
// se parle, on échange et on se défie. Rien n'est commun que ce qui est envoyé : la position de chacun,
// les messages, les offres d'échange et les duels.
//
// Face à un autre joueur (touche Action), un petit menu : Échanger, Défier, Parler. Tout ce qui se fait
// à deux demande les deux accords, et chaque côté applique le résultat sur sa propre partie.
//
//   Monde.creer({ moteur, multi, scene, message, duel }) → { demarrer, arreter, dessiner, devant }

const MondePartage = (() => {
  const PERIODE = 0.12; // la position part au plus 8 fois par seconde, et seulement si elle a changé

  function creer({ moteur, multi, scene, message = () => {}, duel = null }) {
    const etiquettes = el('div', { className: 'multi-etiquettes' });
    scene.append(etiquettes);
    let actif = false, chrono = 0, envoye = '';
    let autres = [];     // les autres joueurs sur ma carte : [{ id, nom, carte, x, y, direction, tenue }]
    let occupe = null;   // un échange ou un duel en cours : rien d'autre ne peut commencer
    const offres = new Map(); // id du joueur → l'offre qu'il a faite (échange)

    const nomDe = (id) => multi.nomDe(id);
    const pair = (vers, d) => multi.pair(vers, d);

    function demarrer() {
      actif = true;
      envoye = '';
      etiquettes.hidden = false;
    }
    function arreter() {
      actif = false;
      autres = [];
      moteur.autres = [];
      etiquettes.hidden = true;
      etiquettes.innerHTML = '';
    }

    // --- Chaque image : envoyer ma position, placer les noms au-dessus des autres ---
    function dessiner(dt) {
      if (!actif) return;
      chrono += dt;
      if (chrono >= PERIODE) {
        chrono = 0;
        const p = moteur.position();
        if (p) {
          const c = { ...p, personnage: moteur.apparence.personnage, tenue: moteur.apparence.tenue || moteur.tenue };
          const s = JSON.stringify(c);
          if (s !== envoye) { envoye = s; multi.bouger(c); }
        }
      }
      // Les noms suivent les pions des autres joueurs.
      const l = moteur.etiquettes();
      const vus = new Set();
      for (const e of l) {
        vus.add(e.id);
        let n = etiquettes.querySelector(`[data-j="${e.id}"]`);
        if (!n) { n = el('div', { className: 'multi-etiquette' }); n.dataset.j = e.id; etiquettes.append(n); }
        if (n.textContent !== nomDe(e.id)) n.textContent = nomDe(e.id);
        n.style.transform = `translate(${Math.round(e.x)}px, ${Math.round(e.y)}px)`;
      }
      for (const n of [...etiquettes.children]) if (!vus.has(n.dataset.j)) n.remove();
    }

    // --- Ce que l'hôte ou le serveur nous dit ---
    function recevoir(sorte, d) {
      // La partie à plusieurs vient de s'ouvrir (ou on vient de rejoindre) : le monde partagé démarre,
      // sauf si on est à la table (là, c'est le MJ qui mène : table/table.js).
      if (!actif && multi.actif && !moteur?.table?.actif && moteur?.jeuOuvert) demarrer();
      if (sorte === 'monde') {
        autres = Array.isArray(d.joueurs) ? d.joueurs : [];
        moteur.autres = autres;
      } else if (sorte === 'pair') {
        repondreA(d.de, d.donnees);
      } else if (sorte === 'fin') {
        arreter();
      }
    }

    // --- Le joueur juste devant moi (moteur.js appelle ça sur la touche Action) ---
    function devant(x, y) {
      if (!actif) return false;
      const j = autres.find((q) => q.x === x && q.y === y);
      if (!j) return false;
      menu(j);
      return true;
    }

    // Ce que le jeu autorise entre joueurs (Tafl 1.0, Réglages › Partie › Multijoueur).
    const permis = () => {
      const m = moteur.jeuOuvert?.donnees?.reglages?.reglages?.multijoueur || {};
      return { echanges: m.echanges !== false, duels: m.duels !== false };
    };
    async function menu(j) {
      if (occupe) { message('Attends la fin de ce qui est en cours.'); return; }
      const p = permis();
      const peutEchanger = p.echanges && Regles.capacites(moteur.jeuOuvert).capture;
      const peutDefier = p.duels && Boolean(duel);
      const choix = await Dialogs.ask(j.nom, 'Que veux-tu faire ?', [
        ...(peutEchanger ? [{ label: 'Échanger', value: 'echange', primary: true }] : []),
        ...(peutDefier ? [{ label: 'Défier', value: 'duel', primary: !peutEchanger }] : []),
        { label: 'Parler', value: 'parler', primary: !peutEchanger && !peutDefier },
        { label: 'Rien', value: null },
      ]);
      if (choix === 'parler') { multi.ouvrirPanneau(); return; }
      if (choix === 'echange') proposer(j, 'echange');
      if (choix === 'duel') proposer(j, 'duel');
    }

    // --- Proposer, accepter ---
    function proposer(j, quoi) {
      occupe = { avec: j.id, quoi, role: 'demandeur', etat: 'attend' };
      pair(j.id, { quoi, etape: 'proposer' });
      message(`Proposition envoyée à ${j.nom}…`);
    }
    async function repondreA(de, d) {
      if (!d || typeof d !== 'object') return;
      const quoi = d.quoi === 'duel' ? 'duel' : 'echange';
      if (d.etape === 'proposer') {
        if (occupe) { pair(de, { quoi, etape: 'non', raison: 'occupe' }); return; }
        if ((quoi === 'duel' && !permis().duels) || (quoi === 'echange' && !permis().echanges)) { pair(de, { quoi, etape: 'non' }); return; }
        occupe = { avec: de, quoi, role: 'invite', etat: 'demande' };
        const oui = await Dialogs.ask(nomDe(de), quoi === 'duel' ? `${nomDe(de)} te défie en duel amical. Rien n'est perdu ni gagné.` : `${nomDe(de)} te propose un échange.`, [
          { label: 'Accepter', value: true, primary: true }, { label: 'Refuser', value: false },
        ]);
        if (!oui) { pair(de, { quoi, etape: 'non' }); occupe = null; return; }
        pair(de, { quoi, etape: 'oui' });
        commencer(de, quoi, 'invite');
        return;
      }
      if (!occupe || occupe.avec !== de) {
        // Un message d'un échange ou d'un duel qui n'existe plus de ce côté : on le laisse tomber.
        if (d.etape !== 'annuler') pair(de, { quoi, etape: 'annuler' });
        return;
      }
      if (d.etape === 'non') {
        message(d.raison === 'occupe' ? `${nomDe(de)} est déjà occupé.` : `${nomDe(de)} a refusé.`);
        occupe = null;
        return;
      }
      if (d.etape === 'oui') { commencer(de, quoi, 'demandeur'); return; }
      if (d.etape === 'annuler') { message(`${nomDe(de)} a tout annulé.`); fin(); return; }
      if (quoi === 'echange') echangeRecoit(de, d);
      else duel?.recevoir(de, d);
    }
    function fin() {
      occupe = null;
      offres.clear();
      duel?.arreter?.();
    }

    function commencer(avec, quoi, role) {
      occupe = { avec, quoi, role, etat: 'en cours' };
      if (quoi === 'duel') {
        if (!duel) { message('Les duels ne sont pas possibles dans ce jeu.'); pair(avec, { quoi, etape: 'annuler' }); occupe = null; return; }
        duel.commencer({ avec, role, envoyer: (d) => pair(avec, { quoi: 'duel', ...d }), finir: () => { occupe = null; } });
        return;
      }
      offrir(avec);
    }

    // --- L'échange ---
    // Chacun fait son offre (une créature, des objets, de l'argent), voit celle de l'autre, puis les deux
    // confirment. Chaque côté applique de son côté : il retire ce qu'il donne et reçoit ce qu'on lui donne.
    async function offrir(avec) {
      const jeu = moteur.jeuOuvert, partie = moteur.partieVive;
      const monnaie = jeu.donnees.reglages?.reglages?.monnaie || '₽';
      const membres = Collection.toutes(partie).filter((x) => !x.c.heros);
      const sac = Object.entries(partie.sac || {}).map(([id, n]) => ({ id, n, o: jeu.donnees.objets?.objets?.find((q) => q.id === id) })).filter((x) => x.n > 0 && x.o);
      const v = await Dialogs.form({
        title: `Échange avec ${nomDe(avec)}`,
        okLabel: 'Proposer',
        width: 520,
        fields: [
          { key: 'creature', label: 'Une créature', type: 'select', value: '', choices: [['', 'Aucune'], ...membres.map((x, i) => [String(i), `${Regles.resume(jeu, x.c).nom} N.${x.c.niveau}${x.ou === 'equipe' ? ' (équipe)' : ''}`])] },
          { key: 'objet', label: 'Un objet', type: 'select', value: '', choices: [['', 'Aucun'], ...sac.map((x) => [x.id, `${x.o.nom} (×${x.n})`])] },
          { key: 'nombre', label: 'Combien', type: 'number', value: 1, min: 1, max: 99 },
          { key: 'argent', label: `Argent (${monnaie})`, type: 'number', value: 0, min: 0, max: Math.max(0, Math.floor(partie.argent || 0)) },
          { type: 'info', text: 'Les deux joueurs voient l\'offre de l\'autre et doivent confirmer. Une créature de l\'équipe ne part que s\'il en reste une en état de se battre.' },
        ],
      });
      if (!v) { pair(avec, { quoi: 'echange', etape: 'annuler' }); fin(); return; }
      const place = v.creature === '' ? null : membres[Number(v.creature)];
      if (place?.ou === 'equipe' && !Collection.peutQuitterEquipe(partie, place.i)) {
        message('Il doit rester une créature en état de se battre dans ton équipe.');
        return offrir(avec);
      }
      const nombre = Math.max(1, Math.min(99, Math.round(Number(v.nombre) || 1), sac.find((x) => x.id === v.objet)?.n || 99));
      const offre = {
        creature: place ? JSON.parse(JSON.stringify(place.c)) : null,
        place: place ? { ou: place.ou, b: place.b, i: place.i } : null,
        objet: v.objet || '', nombre: v.objet ? nombre : 0,
        argent: Math.max(0, Math.min(Math.floor(partie.argent || 0), Math.round(Number(v.argent) || 0))),
      };
      offres.set('moi', offre);
      pair(avec, { quoi: 'echange', etape: 'offre', offre: { ...offre, place: null } });
      attendreOffre(avec);
    }
    async function attendreOffre(avec) {
      if (!offres.has(avec)) { message('En attente de l\'offre de l\'autre joueur…'); return; }
      const jeu = moteur.jeuOuvert;
      const sienne = offres.get(avec), mienne = offres.get('moi');
      const monnaie = jeu.donnees.reglages?.reglages?.monnaie || '₽';
      const dire = (o) => [
        o.creature ? `${Regles.resume(jeu, o.creature).nom} N.${o.creature.niveau}` : '',
        o.objet && o.nombre ? `${jeu.donnees.objets?.objets?.find((q) => q.id === o.objet)?.nom || o.objet} ×${o.nombre}` : '',
        o.argent ? `${o.argent} ${monnaie}` : '',
      ].filter(Boolean).join(', ') || 'rien';
      const oui = await Dialogs.ask('Échange', `Tu donnes : ${dire(mienne)}.\n${nomDe(avec)} donne : ${dire(sienne)}.`, [
        { label: 'Confirmer', value: true, primary: true }, { label: 'Annuler', value: false },
      ]);
      if (!oui) { pair(avec, { quoi: 'echange', etape: 'annuler' }); fin(); return; }
      occupe.confirme = true;
      pair(avec, { quoi: 'echange', etape: 'ok' });
      if (occupe.confirmeAutre) appliquer(avec);
    }
    function echangeRecoit(de, d) {
      if (d.etape === 'offre') {
        offres.set(de, d.offre && typeof d.offre === 'object' ? d.offre : {});
        if (offres.has('moi') && !occupe.confirme) attendreOffre(de);
        return;
      }
      if (d.etape === 'ok') {
        occupe.confirmeAutre = true;
        if (occupe.confirme) appliquer(de);
      }
    }
    function appliquer(avec) {
      const jeu = moteur.jeuOuvert, partie = moteur.partieVive;
      const mienne = offres.get('moi') || {}, sienne = offres.get(avec) || {};
      // Ce que je donne s'en va.
      if (mienne.place) Collection.enlever(partie, mienne.place);
      if (mienne.objet && mienne.nombre) {
        partie.sac[mienne.objet] = (partie.sac[mienne.objet] || 0) - mienne.nombre;
        if (partie.sac[mienne.objet] <= 0) delete partie.sac[mienne.objet];
      }
      if (mienne.argent) partie.argent = Math.max(0, (partie.argent || 0) - mienne.argent);
      // Ce que je reçois arrive.
      const recues = [];
      if (sienne.creature) {
        const c = Regles.completer(jeu, sienne.creature);
        if (c) { const r = Collection.ranger(jeu, partie, c); recues.push(`${Regles.resume(jeu, c).nom}${r.ou === 'boite' ? ` (au ${r.pc}, ${r.nom})` : ''}`); }
      }
      if (sienne.objet && sienne.nombre) {
        const o = jeu.donnees.objets?.objets?.find((q) => q.id === sienne.objet);
        if (o) { partie.sac[sienne.objet] = (partie.sac[sienne.objet] || 0) + sienne.nombre; recues.push(`${o.nom} ×${sienne.nombre}`); }
      }
      if (sienne.argent) { partie.argent = (partie.argent || 0) + sienne.argent; recues.push(`${sienne.argent} ${jeu.donnees.reglages?.reglages?.monnaie || '₽'}`); }
      moteur.annoncer('Échange fait !', recues.length ? `Tu reçois : ${recues.join(', ')}.` : 'Tu n\'as rien reçu.');
      multi.noter(`Échange entre ${multi.moi?.nom || 'moi'} et ${nomDe(avec)}.`);
      fin();
    }

    multi.sur(recevoir);
    return { demarrer, arreter, dessiner, devant, recevoir, get actif() { return actif; }, get autres() { return autres; } };
  }
  return { creer };
})();
