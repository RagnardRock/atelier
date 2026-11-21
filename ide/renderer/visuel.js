// Mode visuel de l'aperçu, côté Rune : bouton loupe de la barre de l'aperçu.
// - Clic sur un élément de la page : son fichier s'ouvre et sa balise est sélectionnée dans le code ;
//   le panneau Bifrost montre l'élément choisi (ses flags, de quoi le rendre modifiable).
// - Poignée ▲ ▼ ⠿ sur les sections : le code de la section est déplacé (un seul Ctrl+Z pour annuler).
// - Un bloc du panneau Bifrost glissé dans l'aperçu s'insère à l'endroit montré par la ligne violette.
// Les positions viennent du serveur de l'aperçu (data-rune, voir visuel-page.js et visuel-texte.js) ;
// elles valent pour le texte servi, qui est celui de l'éditeur (brouillon) ou du disque.
// Si le texte a changé entre-temps, Rune le dit au lieu de retoucher au mauvais endroit.

const visuelPanel = (() => {
  let dernier = null; // { fichier, debut, tag } : élément choisi

  const dansLeProjet = (p) => typeof p === 'string' && !!state.root && (p.startsWith(state.root + '/') || p.startsWith(state.root + '\\'));

  // Ouvre le fichier de la page et renvoie { file, editor } quand son éditeur est prêt.
  async function ouvrir(chemin) {
    if (!dansLeProjet(chemin)) return null;
    await openFile(chemin, baseName(chemin));
    const group = state.activeGroup;
    if (group?.active?.file.path !== chemin || !group.editor || group.editor.getModel() !== group.active.file.model) return null;
    return { file: group.active.file, editor: group.editor };
  }

  const aChange = () => notify.info("La page a changé depuis son affichage : attends qu'elle se recharge, puis recommence.");

  async function choisir(m) {
    const o = await ouvrir(m.fichier);
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

  window.addEventListener('message', (e) => {
    const m = e.data?.runeVisuel;
    if (!m || !previewPanel.vientDeLaPage(e) || !previewPanel.visuel) return;
    const faire = m.choix !== undefined ? choisir : m.deplacer ? deplacer : m.deposer ? deposer : null;
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

  return { get dernier() { return dernier; } };
})();
