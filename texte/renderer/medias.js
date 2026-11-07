// Les médias dans la page : images, vidéos et sons.
//
// - Insérer : boutons du ruban (ou menu Insertion), glisser un fichier sur la page, coller une image.
// - Un clic sur un média le choisit : une petite barre apparaît au-dessus (taille 25 / 50 / 75 / 100 %,
//   habillage d'une image (dans le texte, ou flottante à gauche / à droite avec le texte autour),
//   alignement, ouvrir le fichier, supprimer), et une poignée en bas à droite pour la taille à la souris.
// - Une image se déplace à la souris : on appuie dessus, on bouge, on la lâche ailleurs dans le texte.
// - Dans la page, une image ou une vidéo garde l'adresse de son fichier (file://) : rien n'est copié
//   tant que tu n'enregistres pas. À l'enregistrement, chaque format la range à sa façon (voir formats/).

const MediasPage = (() => {
  const barre = $('#media-barre');
  const poignee = $('#media-poignee');
  const defilement = $('#defilement');
  let choisi = null;

  // Insérer des fichiers (chemins sur le disque) là où est le curseur.
  // flotte : 'gauche' ou 'droite' pour poser une image flottante (Claude), sinon dans le texte.
  async function insererFichiers(chemins, { flotte = null } = {}) {
    const doc = Editeur.doc();
    if (!doc) return;
    let html = '';
    const largeurMax = Formats.largeurUtile(doc.miseEnPage);
    for (const chemin of chemins) {
      const m = await window.edda.decrireMedia(chemin);
      if (!m) { notify(`Edda ne sait pas insérer ce fichier : ${nomFichier(chemin)}`, 'warning', 5000); continue; }
      if (m.type === 'video' && m.taille > 200 * 1024 * 1024) notify(`${m.nom} est une grosse vidéo (${Math.round(m.taille / 1024 / 1024)} Mo) : elle reste à part, la page ne garde que son adresse.`, 'info', 6000);
      let largeur = null;
      if (m.type === 'image') {
        try {
          const img = new Image();
          img.src = m.url;
          await img.decode();
          if (img.naturalWidth > largeurMax) largeur = largeurMax;
        } catch { /* image illisible : taille naturelle */ }
      } else if (m.type === 'video') largeur = Math.min(largeurMax, 640);
      // Une image flottante prend au plus la moitié de la ligne, pour laisser de la place au texte.
      if (m.type === 'image' && flotte && (!largeur || largeur > largeurMax / 2)) {
        largeur = largeur || await largeurNaturelle(m.url);
        if (!largeur || largeur > largeurMax / 2) largeur = Math.round(largeurMax / 2);
      }
      html += Formats.htmlMedia(m.type, m.url, largeur, m.nom, flotte);
    }
    if (html) Editeur.inserer(html.includes('<video') || html.includes('<audio') ? `<p>${html}</p>` : html);
  }

  async function largeurNaturelle(url) {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img.naturalWidth;
    } catch { return null; }
  }

  async function choisirEtInserer(type) {
    if (!Editeur.doc()) return;
    Editeur.memoriser();
    const medias = await window.edda.choisirMedias(type);
    if (medias.length) await insererFichiers(medias.map((m) => m.chemin));
  }

  // --- Choisir un média dans la page ---
  function choisir(m) {
    if (choisi === m) return placer();
    deselectionner();
    choisi = m;
    m.classList.add('choisi');
    construireBarre();
    placer();
  }
  function deselectionner() {
    choisi?.classList.remove('choisi');
    choisi = null;
    barre.hidden = true;
    poignee.hidden = true;
  }

  function construireBarre() {
    barre.innerHTML = '';
    const m = choisi;
    const type = Medias.type(m);
    const bouton = (contenu, titre, run) => {
      const b = el('button', { className: 'outil', title: titre });
      if (typeof contenu === 'string' && contenu.startsWith('codicon-')) b.append(el('i', { className: `codicon ${contenu}` }));
      else b.textContent = contenu;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.onclick = run;
      return b;
    };
    if (type !== 'audio') {
      for (const pc of [25, 50, 75, 100]) barre.append(bouton(`${pc} %`, `Largeur : ${pc} % de la ligne`, () => largeur(`${pc}%`)));
      barre.append(bouton('codicon-screen-normal', 'Taille d\'origine', () => largeur(null)));
      barre.append(el('span', { className: 'sep' }));
    }
    const icone = (b, svg) => { b.innerHTML = svg; return b; };
    const flotte = Formats.flotteDe(m);
    if (type === 'image') {
      // L'habillage : l'image dans la ligne de texte, ou flottante avec le texte qui l'entoure.
      const habiller = (f, titre, svg) => {
        const b = icone(bouton('', titre, () => habillage(f)), svg);
        if (f === flotte) b.classList.add('actif');
        return b;
      };
      barre.append(
        habiller(null, 'Dans le texte (l\'image est un caractère de la ligne)', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 13.5h12M9.5 8.25h4.5"/><rect x="2" y="6" width="5.5" height="4.5" rx="0.5"/></svg>'),
        habiller('gauche', 'Flottante à gauche (le texte l\'entoure à droite)', '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="6" height="6" rx="0.5"/><path d="M10.5 3h3.5M10.5 5.5h3.5M10.5 8h3.5M2 11h12M2 13.5h12"/></svg>'),
        habiller('droite', 'Flottante à droite (le texte l\'entoure à gauche)', '<svg viewBox="0 0 16 16"><rect x="8" y="2.5" width="6" height="6" rx="0.5"/><path d="M2 3h3.5M2 5.5h3.5M2 8h3.5M2 11h12M2 13.5h12"/></svg>'),
        el('span', { className: 'sep' }),
      );
    }
    if (!flotte) {
      // L'alignement du paragraphe (une image flottante, elle, se range à gauche ou à droite).
      const aligner = (a, titre, svg) => icone(bouton('', titre, () => alignerBloc(a)), svg);
      barre.append(
        aligner('left', 'Paragraphe à gauche', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/></svg>'),
        aligner('center', 'Paragraphe au centre', '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/></svg>'),
        aligner('right', 'Paragraphe à droite', '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/></svg>'),
        el('span', { className: 'sep' }),
      );
    }
    const src = m.getAttribute('src') || '';
    if (/^(file|https?):/i.test(src)) barre.append(bouton('codicon-link-external', 'Ouvrir le fichier avec son logiciel', () => window.edda.ouvrirMedia(src).catch((err) => notify(cleanError(err), 'error'))));
    if (type === 'image') barre.append(bouton('codicon-text-size', 'Texte de remplacement (lu par les lecteurs d\'écran)', texteAlternatif));
    barre.append(bouton('codicon-trash', 'Supprimer (Suppr)', supprimer));
    barre.append(el('span', { className: 'info', textContent: info(m) }));
  }
  function info(m) {
    const w = Math.round(m.getBoundingClientRect().width / zoom());
    const f = Formats.flotteDe(m);
    return `${Medias.type(m) === 'image' ? (f ? `Image flottante à ${f}` : 'Image') : Medias.type(m) === 'video' ? 'Vidéo' : 'Son'} · ${Medias.nom(m)}${Medias.type(m) !== 'audio' ? ` · ${Math.round(Unites.pxEnCm(w) * 10) / 10} cm` : ''}`;
  }
  const zoom = () => (Number(Editeur.page()?.style.zoom) || 1);

  // La barre au-dessus du média, la poignée sur son coin (en coordonnées de la zone qui défile).
  function placer() {
    if (!choisi || !choisi.isConnected) return deselectionner();
    const r = choisi.getBoundingClientRect();
    const z = defilement.getBoundingClientRect();
    const x = r.left - z.left + defilement.scrollLeft;
    const y = r.top - z.top + defilement.scrollTop;
    barre.hidden = false;
    const bw = barre.offsetWidth;
    barre.style.left = `${Math.max(4, Math.min(x, defilement.scrollWidth - bw - 8))}px`;
    barre.style.top = `${Math.max(4, y - barre.offsetHeight - 8)}px`;
    if (Medias.type(choisi) !== 'audio') {
      poignee.hidden = false;
      poignee.style.left = `${x + r.width - 7}px`;
      poignee.style.top = `${y + r.height - 7}px`;
    }
  }

  // Changer la largeur (« 50% », un nombre de pixels, ou null pour la taille d'origine), annulable.
  function largeur(valeur) {
    const m = choisi;
    if (!m) return;
    const copie = m.cloneNode(true);
    copie.classList.remove('choisi');
    copie.removeAttribute('contenteditable');
    if (valeur === null) copie.style.width = '';
    else copie.style.width = typeof valeur === 'number' ? `${Math.round(valeur)}px` : valeur;
    if (!copie.getAttribute('style')) copie.removeAttribute('style');
    remplacer(m, copie.outerHTML);
  }
  function remplacer(m, html) {
    // Après le remplacement, on retrouve le média à la même place pour le garder choisi.
    const tous = [...Editeur.page().querySelectorAll('img, video, audio')];
    const rang = tous.indexOf(m);
    deselectionner();
    Editeur.remplacerNoeud(m, html);
    const nouveau = Editeur.page().querySelectorAll('img, video, audio')[rang];
    if (nouveau) setTimeout(() => choisir(nouveau), 30);
  }
  // L'habillage d'une image : null (dans le texte), 'gauche' ou 'droite' (flottante), annulable.
  function habillage(f) {
    const m = choisi;
    if (!m || Formats.flotteDe(m) === f) return;
    const copie = m.cloneNode(true);
    copie.classList.remove('choisi');
    if (f) copie.dataset.flotte = f; else copie.removeAttribute('data-flotte');
    remplacer(m, copie.outerHTML);
  }
  function alignerBloc(a) {
    const m = choisi;
    if (!m) return;
    // L'alignement est celui du paragraphe qui contient le média.
    const r = document.createRange();
    r.selectNode(m);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    Editeur.memoriser();
    Editeur.exec({ left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight' }[a]);
    setTimeout(placer, 30);
  }
  async function texteAlternatif() {
    const m = choisi;
    const v = await Dialogs.form({ title: 'Texte de remplacement', okLabel: 'Enregistrer', fields: [{ type: 'info', text: 'Une courte description de l\'image : elle est lue par les lecteurs d\'écran, et s\'affiche si l\'image manque.' }, { key: 'alt', label: 'Description', type: 'text', value: m.getAttribute('alt') || '' }] });
    if (v === null) return;
    const copie = m.cloneNode(true);
    copie.classList.remove('choisi');
    copie.setAttribute('alt', v.alt);
    remplacer(m, copie.outerHTML);
  }
  function supprimer() {
    const m = choisi;
    if (!m) return;
    deselectionner();
    Editeur.remplacerNoeud(m, '');
  }

  // --- Poignée : glisser pour changer la taille (les proportions sont gardées) ---
  poignee.addEventListener('mousedown', (e) => {
    if (!choisi) return;
    e.preventDefault();
    const m = choisi;
    const depart = e.clientX;
    const z = zoom();
    const w0 = m.getBoundingClientRect().width / z;
    const max = Formats.largeurUtile(Editeur.doc().miseEnPage);
    const avant = m.style.width;
    const bouger = (ev) => {
      const w = Math.max(24, Math.min(max, w0 + (ev.clientX - depart) / z));
      m.style.width = `${Math.round(w)}px`;
      placer();
      barre.querySelector('.info').textContent = info(m);
    };
    const lacher = () => {
      window.removeEventListener('mousemove', bouger);
      window.removeEventListener('mouseup', lacher);
      // La taille finale est posée par un remplacement annulable (Ctrl+Z revient à l'ancienne taille).
      const finale = m.style.width;
      m.style.width = avant;
      if (finale !== avant) largeur(parseFloat(finale));
    };
    window.addEventListener('mousemove', bouger);
    window.addEventListener('mouseup', lacher);
  });

  // Clic sur un média : le choisir. Clic ailleurs : le relâcher.
  document.addEventListener('mousedown', (e) => {
    if (barre.contains(e.target) || e.target === poignee) return;
    const m = e.target.closest?.('.feuille img, .feuille video, .feuille audio');
    if (m && Editeur.page()?.contains(m)) {
      // Une vidéo : le clic sur ses boutons (lecture, volume) doit rester possible.
      if (m.tagName === 'IMG') {
        e.preventDefault();
        // Appuyer puis bouger (au moins 5 px) la déplace.
        if (e.button === 0) preparerDeplacement(m, e);
      }
      choisir(m);
      return;
    }
    deselectionner();
  }, true);

  // --- Déplacer une image à la souris ---
  // On prend l'image et on la lâche ailleurs dans le texte : un trait montre où elle va.
  // Le déplacement se fait en deux temps (poser la copie, enlever l'original) ; un seul Ctrl+Z
  // le défait quand même (voir data-deplace plus bas).
  const depot = $('#media-depot');
  function preparerDeplacement(m, e0) {
    let actif = false;
    let cible = null;
    const bouger = (e) => {
      if (!actif && Math.hypot(e.clientX - e0.clientX, e.clientY - e0.clientY) < 5) return;
      if (!actif) {
        actif = true;
        barre.hidden = true;
        poignee.hidden = true;
        document.body.classList.add('deplace-media');
      }
      cible = pointDeDepot(e.clientX, e.clientY, m);
      montrerDepot(cible);
    };
    const lacher = () => {
      window.removeEventListener('mousemove', bouger);
      window.removeEventListener('mouseup', lacher);
      document.body.classList.remove('deplace-media');
      depot.hidden = true;
      if (!actif) return;
      if (cible) deplacer(m, cible); else placer();
    };
    window.addEventListener('mousemove', bouger);
    window.addEventListener('mouseup', lacher);
  }
  // L'endroit du texte sous la souris (null : hors de la page, ou sur l'image elle-même).
  function pointDeDepot(x, y, m) {
    const p = Editeur.page();
    const r = document.caretRangeFromPoint?.(x, y);
    if (!r || !p?.contains(r.startContainer) || m.contains(r.startContainer)) return null;
    // Juste avant ou juste après l'image : elle ne bouge pas.
    if (r.startContainer === m.parentNode && (r.startContainer.childNodes[r.startOffset] === m || r.startContainer.childNodes[r.startOffset - 1] === m)) return null;
    return r;
  }
  function montrerDepot(r) {
    if (!r) { depot.hidden = true; return; }
    let rect = r.getClientRects()[0] || r.getBoundingClientRect();
    if (!rect || (!rect.height && !rect.width && !rect.top)) {
      const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      rect = n.getBoundingClientRect();
    }
    const z = defilement.getBoundingClientRect();
    const h = Math.max(14, rect.height || 18);
    depot.hidden = false;
    depot.style.left = `${rect.left - z.left + defilement.scrollLeft - 1}px`;
    depot.style.top = `${rect.top - z.top + defilement.scrollTop}px`;
    depot.style.height = `${h}px`;
  }
  // Un déplacement fait deux étapes d'annulation (poser la copie, enlever l'original). L'original et
  // sa copie portent le même data-deplace : si Ctrl+Z ou Ctrl+Y laisse les deux dans la page (le
  // déplacement à moitié défait), on fait aussitôt la seconde étape. Ça marche à toute profondeur.
  let interne = false;
  function deplacer(m, r) {
    const p = Editeur.page();
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    m.dataset.deplace = id;
    const copie = m.cloneNode(true);
    copie.classList.remove('choisi');
    deselectionner();
    p.focus({ preventScroll: true });
    const s = window.getSelection();
    interne = true;
    // 1. Poser la copie au point de dépôt.
    s.removeAllRanges();
    s.addRange(r);
    document.execCommand('insertHTML', false, copie.outerHTML);
    // La copie posée est juste avant le curseur.
    let nouveau = null;
    if (s.rangeCount) {
      const apres = s.getRangeAt(0);
      const avant = apres.startContainer.nodeType === 1 ? apres.startContainer.childNodes[apres.startOffset - 1] : null;
      if (avant?.tagName === 'IMG' && avant !== m) nouveau = avant;
    }
    nouveau ??= [...p.querySelectorAll('img')].find((x) => x !== m && x.getAttribute('src') === m.getAttribute('src') && !x.isSameNode(m)) || null;
    // 2. Enlever l'original.
    if (m.isConnected) {
      const o = document.createRange();
      o.selectNode(m);
      s.removeAllRanges();
      s.addRange(o);
      document.execCommand('delete');
    }
    interne = false;
    Editeur.memoriser();
    if (nouveau?.isConnected) setTimeout(() => choisir(nouveau), 30);
  }
  document.addEventListener('input', (e) => {
    if (interne || (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo')) return;
    const page = e.target.closest?.('.feuille');
    if (!page) return;
    const vus = new Set();
    const moitie = [...page.querySelectorAll('img[data-deplace]')].some((x) => vus.size === vus.add(x.dataset.deplace).size);
    if (!moitie) return;
    setTimeout(() => {
      interne = true;
      document.execCommand(e.inputType === 'historyUndo' ? 'undo' : 'redo');
      interne = false;
    }, 0);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!choisi || Dialogs.isOpen()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimer(); } else if (e.key === 'Escape') deselectionner();
  });
  defilement.addEventListener('scroll', () => { if (choisi) placer(); });
  window.addEventListener('resize', () => { if (choisi) placer(); });
  Editeur.surChangement(() => { if (choisi && !choisi.isConnected) deselectionner(); else if (choisi) requestAnimationFrame(placer); });

  return { insererFichiers, choisirEtInserer, deselectionner, choisi: () => choisi };
})();
