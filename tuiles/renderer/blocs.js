// Tafl 0.28 : le script d'un événement en blocs reliés (dans la fenêtre de l'événement).
//
// Chaque commande est un bloc, coloré selon sa famille (dialogue, logique, objets…). Les blocs se
// suivent de haut en bas, reliés par un trait. Un « choix » s'ouvre en une branche par réponse, un
// « si » en deux branches (alors, sinon), côte à côte ; elles se rejoignent ensuite.
// - Glisser un bloc sur un trait : il y va (même dans une autre branche) ;
// - glisser une commande de la palette (à gauche) sur un trait : elle s'ajoute là ;
// - le + d'un trait : choisir une commande à ajouter là ; double-clic sur un bloc : le modifier ;
// - un clic sur un dialogue ou un choix : l'aperçu montre la boîte telle qu'elle sera dans Saga.
//
// Le script reste le même qu'avant (des listes de commandes rangées les unes dans les autres) :
// ce n'est qu'une autre façon de le montrer. Saga le lit sans changement.

const Blocs = (() => {
  // La couleur de chaque famille de commandes (les groupes du menu « Ajouter une commande »).
  const COULEURS = {
    Dialogue: '#5ec8ff', Logique: '#b9a8ff', 'Objets et créatures': '#ffd040', Histoire: '#ff9e4a',
    Héros: '#ff7aa8', Progression: '#7bd88f', Services: '#4ad6c4', Déplacements: '#d27bff',
    Ambiance: '#7f9cff',
  };
  const couleur = (type) => COULEURS[Events.COMMANDES[type]?.groupe] || '#9aa0ac';
  const SANS_APERCU = 'Clique sur un dialogue ou un choix pour voir sa boîte telle qu\'elle sera dans Saga.';

  let glisse = null; // ce qu'on glisse : { liste, i, c } (un bloc) ou { type } (de la palette)

  // Toutes les listes rangées dans une commande (réponses d'un choix, alors / sinon d'un si).
  const sousListes = (c) => (c.type === 'choix' ? c.options.map((o) => o.commandes) : c.type === 'si' ? [c.alors, c.sinon] : []);
  // La liste `liste` est-elle dans la commande c (on ne range pas un bloc dans ses propres branches) ?
  function contient(c, liste) {
    for (const l of sousListes(c)) {
      if (l === liste) return true;
      if (l.some((d) => contient(d, liste))) return true;
    }
    return false;
  }

  // o : { doc, ev (l'événement en cours de modification), page, etat, redessiner }.
  // etat est gardé par la fenêtre entre deux dessins : { choisi (la commande), boite, theme }.
  function dessiner(box, o) {
    const { doc, ev, page, etat } = o;
    box.replaceChildren();
    const zone = el('div', { className: 'flow-zone' });
    const toile = el('div', { className: 'flow-toile' });
    const apercu = el('div', { className: 'flow-apercu' });
    zone.append(palette(o), toile);
    box.append(zone, apercu);

    // Choisir un bloc : il s'entoure, et l'aperçu montre son dialogue.
    function choisir(c) {
      etat.choisi = c;
      etat.boite = 0;
      for (const b of toile.querySelectorAll('.bloc')) b.classList.toggle('choisi', b.commande === c);
      Apercu.montrer(apercu, o);
    }

    const flux = el('div', { className: 'flow' });
    const decl = Events.DECLENCHEMENTS.find(([k]) => k === ev.declenchement)?.[1] || ev.declenchement;
    flux.append(el('div', { className: 'flow-debut', title: page.conditions.length ? `Cette page, si ${page.conditions.map((c) => Events.resumeCondition(doc, c)).join(' et ')}` : 'Cette page est toujours valable' }, [icon('play'), el('span', { textContent: decl })]));
    flux.append(liste(page.commandes, true));
    flux.append(el('div', { className: 'flow-fin' }, [icon('debug-stop'), el('span', { textContent: 'Fin' })]));
    toile.append(flux);

    // Une liste de commandes : un trait (où l'on dépose) avant chaque bloc et après le dernier.
    function liste(cmds, principale = false) {
      const out = el('div', { className: 'flow-liste' });
      out.append(lien(cmds, 0, !cmds.length && !principale));
      cmds.forEach((c, i) => {
        out.append(bloc(c, cmds, i));
        const branches = sousListes(c);
        if (branches.length) out.append(fourche(c));
        out.append(lien(cmds, i + 1, false));
      });
      return out;
    }

    // Un trait entre deux blocs : on y dépose un bloc ou une commande ; son + en ajoute une.
    function lien(cmds, index, vide) {
      const t = el('div', { className: `flow-lien${vide ? ' vide' : ''}` });
      const plus = el('button', { className: 'flow-plus', title: 'Ajouter une commande ici' }, [icon('add')]);
      plus.onclick = async (e) => {
        e.stopPropagation();
        const r = plus.getBoundingClientRect();
        const type = await Events.choisir(Events.menuCommandes(doc), r.right + 4, r.top);
        await ajouter(type, cmds, index, r.right + 4, r.top);
      };
      t.append(plus);
      if (vide) t.append(el('span', { className: 'flow-vide', textContent: 'rien' }));
      t.addEventListener('dragover', (e) => {
        if (!glisse || (glisse.c && contient(glisse.c, cmds))) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = glisse.c ? 'move' : 'copy';
        t.classList.add('cible');
      });
      t.addEventListener('dragleave', () => t.classList.remove('cible'));
      t.addEventListener('drop', async (e) => {
        e.preventDefault();
        t.classList.remove('cible');
        const g = glisse;
        glisse = null;
        if (!g) return;
        if (g.type) return ajouter(g.type, cmds, index, e.clientX, e.clientY);
        if (contient(g.c, cmds)) return null;
        // Déplacer : on le retire de sa liste, puis on l'insère (plus haut d'un cran si c'était avant, dans la même liste).
        g.liste.splice(g.i, 1);
        cmds.splice(g.liste === cmds && g.i < index ? index - 1 : index, 0, g.c);
        o.redessiner();
        return null;
      });
      return t;
    }

    async function ajouter(type, cmds, index, x, y) {
      const c = await Events.nouvelleCommande(doc, type, ev, x, y);
      if (!c) return;
      cmds.splice(index, 0, c);
      etat.choisi = c;
      o.redessiner();
    }

    async function modifier(c, cmds, i) {
      const def = Events.COMMANDES[c.type];
      let out = null;
      if (c.type === 'si') {
        const cond = await Events.formCondition(doc, c.condition);
        if (cond) out = { ...c, condition: cond };
      } else if (def?.champs) out = await Events.formCommande(doc, c, ev);
      if (!out) return;
      cmds[i] = out;
      if (etat.choisi === c) etat.choisi = out;
      o.redessiner();
    }

    function bloc(c, cmds, i) {
      const def = Events.COMMANDES[c.type];
      const b = el('div', { className: `bloc${c.type === 'commentaire' ? ' note' : ''}${def ? '' : ' inconnu'}${etat.choisi === c ? ' choisi' : ''}`, draggable: true, title: 'Glisser : déplacer · double-clic : modifier', style: { '--bloc': couleur(c.type) } });
      b.commande = c;
      const tete = el('div', { className: 'bloc-tete' }, [icon(def?.icone || 'question'), el('span', { className: 'bloc-nom', textContent: def?.nom.replace(/\s*\(.*\)$/, '') || c.type })]);
      const corps = el('div', { className: 'bloc-texte' });
      if (c.type === 'dire') {
        // Un dialogue : le portrait de celui qui parle, son nom dans sa couleur, le début du texte.
        const qui = Events.quiReel(c.qui, ev);
        const p = Events.perso(doc, qui);
        const img = p && Events.portrait(doc, qui, c.expression);
        if (img) tete.prepend(el('img', { className: 'bloc-portrait', src: img.png, alt: '' }));
        corps.append(el('strong', { textContent: c.qui ? Events.nomQui(doc, c.qui, ev) : 'Texte seul', style: { color: p?.couleur || '' } }), ` ${String(c.texte || '…').replace(/\s+/g, ' ')}`);
      } else corps.textContent = def ? def.resume(doc, c, ev) : `Commande inconnue (${c.type}) : elle vient d'une version plus récente de Tafl.`;
      const actions = el('span', { className: 'bloc-actions' }, [
        def?.champs || c.type === 'si' ? petit('edit', 'Modifier', () => modifier(c, cmds, i)) : null,
        petit('copy', 'Dupliquer', () => { cmds.splice(i + 1, 0, structuredClone(c)); o.redessiner(); }),
        petit('trash', 'Supprimer', () => { cmds.splice(i, 1); if (etat.choisi === c) etat.choisi = null; o.redessiner(); }),
      ]);
      tete.append(actions);
      b.append(tete, corps);
      b.onclick = () => choisir(c);
      b.ondblclick = () => modifier(c, cmds, i);
      b.addEventListener('dragstart', (e) => {
        glisse = { liste: cmds, i, c };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', c.type);
        requestAnimationFrame(() => b.classList.add('glisse'));
        toile.classList.add('en-glisse');
      });
      b.addEventListener('dragend', () => { glisse = null; b.classList.remove('glisse'); toile.classList.remove('en-glisse'); });
      return b;
    }

    // Les branches d'un choix ou d'un si, côte à côte, qui se rejoignent dessous.
    function fourche(c) {
      const f = el('div', { className: 'flow-branches' });
      const branche = (titre, cmds, sorte) => {
        const b = el('div', { className: 'flow-branche' });
        b.append(el('div', { className: `flow-etiquette ${sorte}`, textContent: titre }), liste(cmds), el('div', { className: 'flow-suite' }), el('div', { className: 'flow-joint' }));
        return b;
      };
      if (c.type === 'choix') c.options.forEach((r) => f.append(branche(`« ${r.texte} »`, r.commandes, 'reponse')));
      else { f.append(branche('Alors', c.alors, 'alors')); f.append(branche('Sinon', c.sinon, 'sinon')); }
      return f;
    }

    Apercu.montrer(apercu, o);
  }

  const petit = (ic, title, run) => {
    const b = el('button', { className: 'icon-button', title }, [icon(ic)]);
    b.onclick = (e) => { e.stopPropagation(); run(e); };
    b.ondblclick = (e) => e.stopPropagation();
    return b;
  };

  // La palette : toutes les commandes du pack de règles du jeu, par famille, à glisser dans le script.
  function palette(o) {
    const box = el('div', { className: 'flow-palette' });
    let groupe = null;
    for (const [type, d] of Object.entries(Events.COMMANDES)) {
      if (!Events.duPack(o.doc, d)) continue;
      if (d.groupe !== groupe) {
        groupe = d.groupe;
        box.append(el('div', { className: 'flow-palette-groupe', textContent: groupe, style: { color: COULEURS[groupe] || '' } }));
      }
      const item = el('div', { className: 'flow-palette-item', draggable: true, title: `${d.nom} : glisse-la sur un trait du script, ou clique pour l'ajouter à la fin`, style: { '--bloc': couleur(type) } }, [icon(d.icone), el('span', { textContent: d.nom.replace(/\s*\(.*\)$/, '') })]);
      item.addEventListener('dragstart', (e) => {
        glisse = { type };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', type);
      });
      item.addEventListener('dragend', () => { glisse = null; });
      // Un clic : à la suite du bloc choisi (dans sa liste), sinon à la fin du script.
      item.onclick = async () => {
        const r = item.getBoundingClientRect();
        const c = await Events.nouvelleCommande(o.doc, type, o.ev, r.right + 4, r.top);
        if (!c) return;
        const ou = trouver(o.page.commandes, o.etat.choisi);
        if (ou) ou.liste.splice(ou.i + 1, 0, c); else o.page.commandes.push(c);
        o.etat.choisi = c;
        o.redessiner();
      };
      box.append(item);
    }
    return box;
  }

  // Où est la commande c dans le script : { liste, i } (null si elle n'y est pas).
  function trouver(cmds, c) {
    if (!c) return null;
    for (let i = 0; i < cmds.length; i++) {
      if (cmds[i] === c) return { liste: cmds, i };
      for (const l of sousListes(cmds[i])) {
        const r = trouver(l, c);
        if (r) return r;
      }
    }
    return null;
  }

  return { dessiner, trouver, COULEURS, SANS_APERCU };
})();

// L'aperçu du dialogue : la boîte de Saga (thème verre ou pixel, comme le jeu), avec le portrait, le
// nom dans sa couleur, le texte, et les réponses d'un choix. Les flèches passent d'une boîte à l'autre
// dans l'ordre du script (un texte coupé par une ligne vide fait plusieurs boîtes, comme dans Saga).
const Apercu = (() => {
  let ecriture = 0;

  // Les boîtes qui se suivent dans la liste du bloc choisi : [{ commande, texte, choix }].
  function suite(o) {
    const ou = Blocs.trouver(o.page.commandes, o.etat.choisi);
    if (!ou) return { boites: [], index: -1 };
    const boites = [];
    let index = -1;
    let derniere = null;
    for (const c of ou.liste) {
      if (c === o.etat.choisi && c.type === 'dire') index = boites.length;
      if (c.type === 'dire') {
        for (const bloc of String(c.texte || '').split(/\n\s*\n/)) {
          if (!bloc.trim()) continue;
          derniere = { commande: c, texte: bloc.trim(), choix: null };
          boites.push(derniere);
        }
        if (!c.texte?.trim()) boites.push(derniere = { commande: c, texte: '', choix: null });
      } else if (c.type === 'choix') {
        // Saga montre les réponses à côté de la dernière boîte, qui reste affichée.
        boites.push({ ...(derniere || { commande: null, texte: '' }), choix: c.options.map((r) => r.texte), commandeChoix: c });
        if (c === o.etat.choisi) index = boites.length - 1;
      }
    }
    return { boites, index };
  }

  function montrer(box, o) {
    clearInterval(ecriture);
    box.replaceChildren();
    const { doc, ev, etat } = o;
    const reglages = doc.data.reglages?.interface || {};
    etat.theme = etat.theme || (reglages.theme === 'pixel' ? 'pixel' : 'verre');
    const { boites, index } = suite(o);
    const tete = el('div', { className: 'flow-apercu-tete' }, [icon('preview'), el('span', { textContent: 'Aperçu dans Saga' })]);
    const theme = el('select', { title: 'Le thème de l\'interface du jeu (Données du jeu › Réglages › Interface)' });
    theme.add(new Option('Verre', 'verre'));
    theme.add(new Option('Pixel', 'pixel'));
    theme.value = etat.theme;
    theme.onchange = () => { etat.theme = theme.value; montrer(box, o); };
    tete.append(el('span', { className: 'spacer' }), theme);
    box.append(tete);
    if (index < 0 || !boites.length) {
      box.append(el('p', { className: 'flow-apercu-vide', textContent: Blocs.SANS_APERCU }));
      return;
    }
    // Le bloc choisi peut faire plusieurs boîtes : etat.boite avance de l'une à l'autre.
    const n = boites.length;
    const k = clamp(index + (etat.boite || 0), 0, n - 1);
    const b = boites[k];
    const nav = el('div', { className: 'flow-apercu-nav' });
    const fleche = (ic, title, delta, off) => {
      const btn = el('button', { className: 'icon-button', title, disabled: off }, [icon(ic)]);
      btn.onclick = () => { etat.boite = (etat.boite || 0) + delta; montrer(box, o); };
      return btn;
    };
    nav.append(fleche('chevron-left', 'Boîte précédente', -1, k <= 0), el('span', { textContent: `Boîte ${k + 1} / ${n}` }), fleche('chevron-right', 'Boîte suivante', 1, k >= n - 1));
    tete.append(nav);

    // La scène : comme celle de Saga (960 de large), réduite pour tenir dans la fenêtre.
    const scene = el('div', { className: 'saga-scene', dataset: { theme: etat.theme }, style: { '--accent': reglages.accent || '#7bd88f' } });
    const cadre = el('div', { className: 'saga-cadre' }, [scene]);
    const heros = doc.data.personnages.find((p) => p.heros)?.nom || 'Ragna';
    const remplir = (t) => String(t || '').replace(/\{joueur\}/g, heros);
    // Qui parle, comme Saga (orateur) : rien si le personnage n'existe pas.
    const c = b.commande;
    const id = c ? Events.quiReel(c.qui, ev) : '';
    const p = id ? Events.perso(doc, id) : null;
    const img = p ? Events.portrait(doc, id, c.expression) : null;
    const boite = el('div', { className: `dialogue${img ? ' avec-portrait' : ''}` });
    if (img) boite.append(el('img', { className: 'dialogue-portrait', src: img.png, alt: '' }));
    const texte = el('div', { className: 'dialogue-texte' });
    const corps = el('div', { className: 'dialogue-corps' }, [p ? el('div', { className: 'dialogue-nom', textContent: p.heros ? heros : p.nom, style: { color: p.couleur || '' } }) : null, texte]);
    boite.append(corps);
    if (!b.choix) boite.append(el('div', { className: 'dialogue-suite', textContent: '▼' }));
    scene.append(boite);
    if (b.choix) {
      const choix = el('div', { className: 'dialogue-choix' });
      b.choix.forEach((t, i) => choix.append(el('div', { className: `dialogue-option${i === 0 ? ' actif' : ''}`, textContent: remplir(t) })));
      scene.append(choix);
    }
    box.append(cadre);
    if (c && !img && p) box.append(el('p', { className: 'flow-apercu-note', textContent: `${p.nom} n'a pas de portrait « ${c.expression || 'normal'} » : Jeu › Données du jeu › Personnages.` }));
    if (c && c.qui && !p) box.append(el('p', { className: 'flow-apercu-note', textContent: c.qui === '@evenement' ? 'Cet événement n\'a pas de personnage (colonne de gauche) : Saga montre le texte sans nom.' : `Pas de personnage « ${c.qui} » : Saga montre le texte sans nom.` }));

    // Le texte s'écrit lettre par lettre, comme dans le jeu (55 lettres par seconde).
    const complet = remplir(b.texte) || (b.choix ? '' : '…');
    let ecrit = 0;
    texte.textContent = '';
    ecriture = setInterval(() => {
      ecrit = Math.min(complet.length, ecrit + 1);
      texte.textContent = complet.slice(0, ecrit);
      if (ecrit >= complet.length || !box.isConnected) clearInterval(ecriture);
    }, 1000 / 55);
    // La scène garde ses proportions : on la réduit à la largeur de l'aperçu.
    // Au plus 70 % : assez pour lire, sans prendre la place du script.
    requestAnimationFrame(() => {
      const k2 = Math.min(0.7, (box.clientWidth - 20 || 600) / 960);
      scene.style.transform = `scale(${k2})`;
      cadre.style.width = `${Math.round(960 * k2)}px`;
      cadre.style.height = `${Math.round(300 * k2)}px`;
    });
  }

  return { montrer };
})();
