// Les médias dans la page : images, vidéos et sons.
//
// - Insérer : boutons du ruban (ou menu Insertion), glisser un fichier sur la page, coller une image.
// - Un clic sur un média le choisit : une petite barre apparaît au-dessus (taille 25 / 50 / 75 / 100 %,
//   alignement, ouvrir le fichier, supprimer), et une poignée en bas à droite pour la taille à la souris.
// - Dans la page, une image ou une vidéo garde l'adresse de son fichier (file://) : rien n'est copié
//   tant que tu n'enregistres pas. À l'enregistrement, chaque format la range à sa façon (voir formats/).

const MediasPage = (() => {
  const barre = $('#media-barre');
  const poignee = $('#media-poignee');
  const defilement = $('#defilement');
  let choisi = null;

  // Insérer des fichiers (chemins sur le disque) là où est le curseur.
  async function insererFichiers(chemins) {
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
      html += Formats.htmlMedia(m.type, m.url, largeur, m.nom);
    }
    if (html) Editeur.inserer(html.includes('<video') || html.includes('<audio') ? `<p>${html}</p>` : html);
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
    const aligner = (a, titre, svg) => {
      const b = bouton('', titre, () => alignerBloc(a));
      b.innerHTML = svg;
      return b;
    };
    barre.append(
      aligner('left', 'À gauche', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/></svg>'),
      aligner('center', 'Au centre', '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/></svg>'),
      aligner('right', 'À droite', '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/></svg>'),
      el('span', { className: 'sep' }),
    );
    const src = m.getAttribute('src') || '';
    if (/^(file|https?):/i.test(src)) barre.append(bouton('codicon-link-external', 'Ouvrir le fichier avec son logiciel', () => window.edda.ouvrirMedia(src).catch((err) => notify(cleanError(err), 'error'))));
    if (type === 'image') barre.append(bouton('codicon-text-size', 'Texte de remplacement (lu par les lecteurs d\'écran)', texteAlternatif));
    barre.append(bouton('codicon-trash', 'Supprimer (Suppr)', supprimer));
    barre.append(el('span', { className: 'info', textContent: info(m) }));
  }
  function info(m) {
    const w = Math.round(m.getBoundingClientRect().width / zoom());
    return `${Medias.type(m) === 'image' ? 'Image' : Medias.type(m) === 'video' ? 'Vidéo' : 'Son'} · ${Medias.nom(m)}${Medias.type(m) !== 'audio' ? ` · ${Math.round(Unites.pxEnCm(w) * 10) / 10} cm` : ''}`;
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
      if (m.tagName === 'IMG') e.preventDefault();
      choisir(m);
      return;
    }
    deselectionner();
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
