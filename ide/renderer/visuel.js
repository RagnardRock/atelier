// Mode visuel de l'aperçu, côté Rune : bouton loupe de la barre de l'aperçu.
// - Clic sur un élément de la page : son fichier s'ouvre et sa balise est sélectionnée dans le code ;
//   le panneau Bifrost montre l'élément choisi (ses flags, de quoi le rendre modifiable).
// - Curseur dans le code de la page affichée : l'élément s'éclaire dans l'aperçu.
// - Double-clic sur un texte de l'aperçu : modifié sur place, puis réécrit dans le code.
// - Image lâchée sur une image de l'aperçu : copiée à côté de l'ancienne, src changé.
// - Poignée ▲ ▼ ⠿ sur les sections : le code de la section est déplacé (un seul Ctrl+Z pour annuler).
// - Un bloc du panneau Bifrost glissé dans l'aperçu s'insère à l'endroit montré par la ligne violette.
// Les positions viennent du serveur de l'aperçu (data-rune, voir visuel-page.js et visuel-texte.js) ;
// elles valent pour le texte servi, qui est celui de l'éditeur (brouillon) ou du disque.
// Si le texte a changé entre-temps, Rune le dit au lieu de retoucher au mauvais endroit.

const visuelPanel = (() => {
  let dernier = null; // { fichier, debut, tag } : élément choisi
  let pageAffichee = null; // fichier de la page affichée dans l'aperçu (mode visuel)

  const dansLeProjet = (p) => typeof p === 'string' && !!state.root && (p.startsWith(state.root + '/') || p.startsWith(state.root + '\\'));

  // Ouvre le fichier de la page et renvoie { file, editor } quand son éditeur est prêt.
  async function ouvrir(chemin) {
    if (!dansLeProjet(chemin)) return null;
    // déjà l'onglet actif : on ne le réactive pas (ça donnerait le clavier à l'éditeur)
    if (state.activeGroup?.active?.file.path !== chemin) await openFile(chemin, baseName(chemin));
    const group = state.activeGroup;
    if (group?.active?.file.path !== chemin || !group.editor || group.editor.getModel() !== group.active.file.model) return null;
    return { file: group.active.file, editor: group.editor };
  }

  const aChange = () => notify.info("La page a changé depuis son affichage : attends qu'elle se recharge, puis recommence.");

  async function choisir(m) {
    // ouvrir l'onglet peut donner le clavier à l'éditeur : il doit rester à la page (double-clic
    // pour modifier un texte, qui commence par un clic)
    const cadre = document.activeElement?.id === 'preview-frame' ? document.activeElement : null;
    const o = await ouvrir(m.fichier);
    if (cadre && document.activeElement !== cadre) cadre.focus();
    if (!o) return;
    const model = o.file.model;
    const e = VisuelTexte.trouver(model.getValue(), m.choix, m.tag);
    if (!e) return aChange();
    const debut = model.getPositionAt(e.debut);
    const fin = model.getPositionAt(e.fin);
    // sélection de la fin vers le début : le curseur est sur la balise (actions Bifrost du clic droit)
    const sel = new monaco.Selection(fin.lineNumber, fin.column, debut.lineNumber, debut.column);
    o.editor.setSelection(sel);
    o.editor.revealRangeInCenterIfOutsideViewport(sel);
    dernier = { fichier: m.fichier, debut: e.debut, tag: e.tag };
    document.dispatchEvent(new CustomEvent('visuel-choix', { detail: { fichier: m.fichier, element: e } }));
  }

  // Applique des retouches { debut, fin, texte } au fichier, en une seule étape d'annulation.
  function retoucher(o, retouches, message) {
    const model = o.file.model;
    const ops = retouches.map((r) => {
      const a = model.getPositionAt(r.debut);
      const b = model.getPositionAt(r.fin);
      return { range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: r.texte, forceMoveMarkers: true };
    });
    o.editor.pushUndoStop();
    o.editor.executeEdits('visuel', ops);
    o.editor.pushUndoStop();
    if (message) flash(message);
    if (state.config.previewLive === false) notify.info("Enregistre (Ctrl+S) pour voir le changement dans l'aperçu.");
  }

  async function deplacer(m) {
    const o = await ouvrir(m.fichier);
    if (!o) return;
    const texte = o.file.model.getValue();
    const { de, vers, apres } = m.deplacer;
    if (!VisuelTexte.trouver(texte, de) || !VisuelTexte.trouver(texte, vers)) return aChange();
    const r = VisuelTexte.deplacer(texte, de, vers, !!apres);
    if (!r) return;
    retoucher(o, r, 'Section déplacée (Ctrl+Z pour annuler)');
    // le curseur va sur la section déplacée, à sa nouvelle place
    const nouveau = VisuelTexte.appliquer(texte, r);
    const inseree = r.find((x) => x.texte);
    const decalage = r.filter((x) => x.debut < inseree.debut).reduce((s, x) => s + x.texte.length - (x.fin - x.debut), 0);
    const pos = inseree.debut + decalage + inseree.texte.search(/</);
    if (pos >= 0 && pos < nouveau.length) {
      const p = o.file.model.getPositionAt(pos);
      o.editor.setPosition(p);
      o.editor.revealLineInCenterIfOutsideViewport(p.lineNumber);
    }
  }

  async function deposer(m) {
    const o = await ouvrir(m.fichier);
    if (!o) return;
    const { bloc, vers, apres } = m.deposer;
    const texte = o.file.model.getValue();
    let place = null;
    if (vers !== null && vers !== undefined) {
      const e = VisuelTexte.trouver(texte, vers);
      if (!e) return aChange();
      place = VisuelTexte.place(texte, e, !!apres);
    }
    await bifrostPanel.insererBloc(bloc, place);
  }

  // Texte modifié sur place dans l'aperçu.
  async function texte(m) {
    const o = await ouvrir(m.fichier);
    if (!o) return;
    const t = o.file.model.getValue();
    const { debut, tag, html } = m.texte;
    if (!VisuelTexte.trouver(t, debut, tag)) return aChange();
    const r = VisuelTexte.remplacerContenu(t, debut, tag, String(html));
    if (r) retoucher(o, r, 'Texte modifié (Ctrl+Z pour annuler)');
  }

  // Image lâchée sur une image de l'aperçu : copiée dans le site, puis src changé.
  async function image(m) {
    const o = await ouvrir(m.fichier);
    if (!o) return;
    const t = o.file.model.getValue();
    const e = VisuelTexte.trouver(t, m.image.debut, 'img');
    if (!e) return aChange();
    const sep = state.root.includes('\\') ? '\\' : '/';
    const versSite = (p) => p.slice(state.root.length + 1).split(sep).join('/');
    const page = versSite(m.fichier);
    const cible = VisuelTexte.cheminImage(page, e.attrs.src || '', String(m.image.nom || 'image.png'));
    const ecrit = await window.atelier.writeImage(state.root + sep + cible.split('/').join(sep), new Uint8Array(m.image.donnees));
    // le texte a pu changer pendant l'écriture : on relit l'élément
    const r = VisuelTexte.changerSrc(o.file.model.getValue(), e.debut, VisuelTexte.relatif(page, versSite(ecrit)));
    if (!r) return aChange();
    retoucher(o, r, `Image remplacée : ${versSite(ecrit)}`);
  }

  window.addEventListener('message', (e) => {
    const m = e.data?.runeVisuel;
    if (!m || !previewPanel.vientDeLaPage(e) || !previewPanel.visuel) return;
    if (m.pret) { pageAffichee = m.fichier; return; }
    if (m.refus) return notify.info(String(m.refus));
    const faire = m.choix !== undefined ? choisir : m.deplacer ? deplacer : m.deposer ? deposer : m.texte ? texte : m.image ? image : null;
    faire?.(m).catch((err) => notify.error(cleanError(err)));
  });

  // Bloc du panneau Bifrost glissé : la page de l'aperçu montre où il tomberait.
  document.addEventListener('dragstart', (e) => {
    const b = e.target.closest?.('.bf-bloc[data-bloc]');
    if (!b) return;
    e.dataTransfer.setData('text/plain', `bifrost-bloc:${b.dataset.bloc}`);
    e.dataTransfer.effectAllowed = 'copy';
    if (previewPanel.visuel && previewPanel.ouvert) previewPanel.envoyer({ runeGlisse: b.dataset.bloc });
  });
  document.addEventListener('dragend', (e) => {
    if (e.target.closest?.('.bf-bloc[data-bloc]')) previewPanel.envoyer({ runeGlisse: null });
  });

  // Curseur dans le code de la page affichée → l'élément s'éclaire dans l'aperçu.
  // Seulement si l'aperçu montre bien ce texte (enregistré, ou brouillon envoyé pendant la frappe).
  let minuteur = null;
  function suivreCurseur(ed) {
    ed.onDidChangeCursorPosition(() => {
      if (!previewPanel.visuel || !previewPanel.ouvert || !pageAffichee) return;
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        const file = state.files.get(pageAffichee);
        const model = ed.getModel();
        if (!file || model !== file.model || !ed.hasTextFocus()) return;
        if (isDirty(file) && state.config.previewLive === false) return;
        const b = BifrostFlags.baliseA(model.getValue(), model.getOffsetAt(ed.getPosition()));
        if (b) previewPanel.envoyer({ runeMontrer: b.debut });
      }, 200);
    });
  }
  const suivis = new WeakSet();
  const equiper = (ed) => { if (ed?.onDidChangeCursorPosition && !suivis.has(ed)) { suivis.add(ed); suivreCurseur(ed); } };
  const demarrer = () => { monaco.editor.getEditors?.().forEach(equiper); monaco.editor.onDidCreateEditor((ed) => setTimeout(() => equiper(ed), 0)); };
  if (window.monaco?.editor) demarrer();
  else pageReady.then(() => { const attendre = () => (window.monaco?.editor ? demarrer() : setTimeout(attendre, 100)); attendre(); });
  document.addEventListener('visuel-bascule', () => { pageAffichee = null; });

  return { get dernier() { return dernier; } };
})();
