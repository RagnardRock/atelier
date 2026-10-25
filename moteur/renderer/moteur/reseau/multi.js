// Le multijoueur de Saga (Saga 1.0), côté interface : le panneau des joueurs et la discussion.
//
// Deux bouts, le même fichier :
//   - l'hôte (la fenêtre de Saga) ouvre la partie (window.saga.reseauOuvrir) et voit l'adresse et le code
//     à donner à ses amis ;
//   - un ami (dans son navigateur) a rejoint par le pont web/saga-reseau.js.
// Chacun voit la liste des joueurs et peut parler à tous ou à un seul. Le reste du multijoueur est à
// côté : reseau/monde.js (se voir, échanger, se défier) et reseau/duel.js (le duel).
//
//   Multi.creer({ scene, moteur, message }) → { ouvrir, fermer, dessiner, panneau, ... }

const Multi = (() => {
  const estAmi = () => Boolean(window.saga.reseau);
  const MAX = 500;

  function creer({ scene, moteur, message = () => {} }) {
    const ami = estAmi();
    const racine = el('aside', { className: 'multi-panneau', hidden: true });
    const bulle = el('div', { className: 'multi-bulles' });
    scene.append(racine, bulle);
    let infos = { ouvert: false, joueurs: [], code: '', adresses: [], port: 0 };
    let joueurs = [];
    let lignes = [];
    let pour = 'tous';     // à qui on parle : 'tous', ou l'id d'un joueur
    let moi = ami ? null : { id: 'hote', nom: '' };
    let replie = true;
    let nonLus = 0;
    const ecoutes = [];    // ce que monde.js et duel.js veulent savoir : (sorte, donnees) => void

    const nomDe = (id) => joueurs.find((j) => j.id === id)?.nom || (id === 'hote' ? 'l\'hôte' : '?');
    const sur = (f) => ecoutes.push(f);
    const prevenir = (sorte, d) => { for (const f of ecoutes) f(sorte, d); };

    // --- Envoyer ---
    const dire = (texte, a = pour) => {
      if (!texte.trim()) return;
      if (ami) window.saga.reseau.dire(texte, a);
      else window.saga.reseauDire?.(texte, a);
    };
    // Un message à un autre joueur, pour les échanges et les duels (pas du chat).
    const pair = (vers, donnees) => {
      if (ami) window.saga.reseau.pair(vers, donnees);
      else window.saga.reseauPair?.(vers, donnees);
    };
    const bouger = (p) => {
      if (ami) window.saga.reseau.position(p);
      else window.saga.reseauBouger?.(p);
    };

    // --- Recevoir ---
    function recevoirChat(l) {
      lignes.push(l);
      if (lignes.length > 120) lignes.shift();
      if (replie && l.de !== moi?.id) { nonLus++; montrerBulle(l); }
      dessiner();
    }
    function recevoirJoueurs(l) {
      joueurs = Array.isArray(l) ? l : [];
      if (pour !== 'tous' && !joueurs.some((j) => j.id === pour)) pour = 'tous';
      dessiner();
      prevenir('joueurs', joueurs);
    }
    // Ce que l'hôte reçoit par IPC, et un ami par son flux : la même chose.
    function brancher() {
      if (ami) {
        const r = window.saga.reseau;
        r.sur('chat', recevoirChat);
        r.sur('joueurs', recevoirJoueurs);
        r.sur('monde', (d) => prevenir('monde', d));
        r.sur('pair', (d) => prevenir('pair', d));
        r.sur('vue', (v) => prevenir('vue', v));
        r.sur('jeu', () => message('L\'hôte a rechargé le jeu : recharge la page (F5).'));
        r.sur('fin', (d) => {
          joueurs = [];
          dessiner();
          message(d.raison === 'expulse' ? 'L\'hôte t\'a retiré de la partie.' : 'L\'hôte a fermé la partie.');
          prevenir('fin', d);
        });
        moi = r.moi;
        r.ecouter();
      } else {
        window.saga.onReseauClients?.(() => rafraichir());
        window.saga.onReseauAction?.((a) => {
          // Ce que le serveur renvoie à l'hôte : un message de chat, le monde, un message d'un joueur,
          // ou une demande d'un ami pour la table (table/table.js s'en occupe).
          if (a.reseau === 'chat') recevoirChat(a);
          else if (a.reseau === 'monde') prevenir('monde', a);
          else if (a.reseau === 'pair') prevenir('pair', a);
          else prevenir('demande', a);
        });
      }
    }

    // --- L'hôte ouvre la partie ---
    async function ouvrir({ mode = 'monde', nom = '', titre = '' } = {}) {
      if (ami) return infos;
      infos = await window.saga.reseauOuvrir({ mode, nom, titre });
      moi = { id: 'hote', nom: nom || (mode === 'table' ? 'MJ' : 'Hôte') };
      joueurs = infos.joueurs || [];
      replie = false;
      racine.hidden = false;
      dessiner();
      return infos;
    }
    async function fermer() {
      if (ami) return;
      infos = await window.saga.reseauFermer();
      joueurs = [];
      racine.hidden = true;
    }
    async function rafraichir() {
      if (ami) return;
      infos = await window.saga.reseauInfos();
      recevoirJoueurs(infos.joueurs || []);
    }
    const expulser = (id) => window.saga.reseauExpulser?.(id).then(rafraichir);

    // --- Le panneau ---
    function dessiner() {
      if (ami) racine.hidden = false;
      racine.classList.toggle('replie', replie);
      racine.innerHTML = '';
      const tete = el('button', { className: 'multi-tete', type: 'button' },
        el('i', { className: `codicon codicon-${replie ? 'comment-discussion' : 'chevron-right'}` }),
        el('span', { textContent: `Joueurs (${joueurs.filter((j) => j.connecte).length})` }),
        nonLus && replie ? el('b', { className: 'multi-pastille', textContent: String(nonLus) }) : null);
      tete.onclick = () => { replie = !replie; nonLus = 0; dessiner(); };
      racine.append(tete);
      if (replie) return;

      if (!ami && infos.ouvert) {
        const a = infos.adresses[0] ? `http://${infos.adresses[0]}:${infos.port}` : `le port ${infos.port}`;
        racine.append(el('div', { className: 'multi-rejoindre' },
          el('div', { className: 'multi-label', textContent: 'Tes amis ouvrent cette adresse' }),
          el('code', { className: 'multi-adresse', textContent: a }),
          el('div', { className: 'multi-label', textContent: 'et entrent ce code' }),
          el('code', { className: 'multi-code', textContent: infos.code }),
          el('p', { className: 'multi-note', textContent: 'Ils doivent être sur le même réseau (le Wi-Fi de la maison). Rien à installer : leur navigateur suffit.' })));
      }
      const l = el('div', { className: 'multi-joueurs' });
      for (const j of joueurs) {
        const ligne = el('div', { className: `multi-joueur${j.connecte ? '' : ' absent'}${j.id === moi?.id ? ' moi' : ''}` },
          el('i', { className: `codicon codicon-${j.hote ? 'star-full' : 'person'}` }),
          el('span', { className: 'multi-nom', textContent: j.nom }),
          j.connecte ? null : el('small', { textContent: 'déconnecté' }));
        if (!ami && !j.hote) {
          const b = el('button', { className: 'multi-mini', type: 'button', title: 'Retirer de la partie' }, el('i', { className: 'codicon codicon-close' }));
          b.onclick = () => expulser(j.id);
          ligne.append(b);
        }
        l.append(ligne);
      }
      racine.append(l);

      const journal = el('div', { className: 'multi-journal' });
      for (const x of lignes.slice(-60)) {
        journal.append(el('div', { className: `multi-ligne${x.pour !== 'tous' ? ' prive' : ''}` },
          el('b', { textContent: x.nom }),
          x.pour !== 'tous' ? el('small', { textContent: x.de === moi?.id ? ` → ${nomDe(x.pour)}` : ' (privé)' }) : null,
          el('span', { textContent: ` ${x.texte}` })));
      }
      racine.append(journal);
      journal.scrollTop = journal.scrollHeight;

      const aQui = el('select', { className: 'multi-select' });
      for (const [v, t] of [['tous', 'À tous'], ...joueurs.filter((j) => j.id !== moi?.id).map((j) => [j.id, `→ ${j.nom}`])]) {
        aQui.append(el('option', { value: v, textContent: t, selected: v === pour }));
      }
      aQui.value = pour;
      aQui.onchange = () => { pour = aQui.value; };
      const champ = el('input', { className: 'multi-champ', type: 'text', maxLength: MAX, placeholder: 'Écrire…' });
      const form = el('form', { className: 'multi-ecrire' }, aQui, champ, el('button', { className: 'multi-envoyer', type: 'submit' }, el('i', { className: 'codicon codicon-send' })));
      form.onsubmit = (e) => { e.preventDefault(); dire(champ.value); champ.value = ''; };
      racine.append(form);
      // Le champ garde le curseur quand le panneau se redessine.
      if (racine.dataset.focus === '1') champ.focus();
      champ.onfocus = () => { racine.dataset.focus = '1'; };
      champ.onblur = () => { racine.dataset.focus = ''; };
    }

    // Un message qui arrive quand le panneau est replié : une bulle, quelques secondes.
    function montrerBulle(l) {
      const b = el('div', { className: `multi-bulle${l.pour !== 'tous' ? ' prive' : ''}` }, el('b', { textContent: l.nom }), el('span', { textContent: ` ${l.texte}` }));
      bulle.prepend(b);
      setTimeout(() => b.classList.add('part'), 5200);
      setTimeout(() => b.remove(), 5800);
      while (bulle.children.length > 4) bulle.lastChild.remove();
    }

    brancher();
    const api = {
      ouvrir, fermer, rafraichir, dessiner, dire, pair, bouger, sur, expulser,
      get ami() { return ami; },
      get moi() { return moi; },
      get joueurs() { return joueurs; },
      get infos() { return infos; },
      get actif() { return ami || infos.ouvert; },
      nomDe,
      // Écrire dans le journal sans passer par le réseau (un échange fait, un duel gagné).
      noter(texte) { recevoirChat({ n: Date.now(), de: '', nom: '·', pour: 'tous', texte }); },
      ouvrirPanneau() { replie = false; nonLus = 0; dessiner(); },
      get element() { return racine; },
    };
    return api;
  }
  return { creer, estAmi };
})();
