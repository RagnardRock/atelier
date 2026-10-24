// Rechercher et remplacer (Ctrl+F, Ctrl+H).
//
// Les mots trouvés sont surlignés avec l'API « CSS Custom Highlight » de Chromium : rien n'est
// ajouté dans la page, donc rien ne peut se retrouver par erreur dans le document enregistré.
// Remplacer passe par execCommand('insertText') : chaque remplacement s'annule avec Ctrl+Z.

const Recherche = (() => {
  const barre = $('#recherche');
  const champ = $('#recherche-texte');
  const champRemplacer = $('#recherche-remplacer');
  const compte = $('#recherche-compte');
  const casseBouton = $('#recherche-casse');
  let casse = false;
  let trouves = []; // Range[]
  let courant = -1;

  function ouvrir(remplacer = false) {
    if (!Editeur.doc()) return;
    barre.hidden = false;
    barre.classList.toggle('sans-remplacer', !remplacer);
    const sel = window.getSelection().toString();
    if (sel && !sel.includes('\n') && sel.length < 200) champ.value = sel;
    (remplacer && champ.value ? champRemplacer : champ).focus();
    champ.select();
    chercher();
  }
  function fermer() {
    barre.hidden = true;
    CSS.highlights?.clear();
    trouves = [];
    Editeur.restaurer();
  }

  // Toutes les occurrences, dans l'ordre de la page (le texte est lu nœud par nœud).
  function chercher({ garderPosition = false } = {}) {
    const page = Editeur.page();
    const cherche = champ.value;
    trouves = [];
    if (page && cherche) {
      const noeuds = [];
      const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      let texte = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) { noeuds.push({ n, debut: texte.length }); texte += n.nodeValue; }
      const a = casse ? texte : texte.toLowerCase();
      const b = casse ? cherche : cherche.toLowerCase();
      const position = (i) => {
        let k = noeuds.length - 1;
        while (k > 0 && noeuds[k].debut > i) k--;
        return { node: noeuds[k].n, offset: i - noeuds[k].debut };
      };
      for (let i = a.indexOf(b); i >= 0 && trouves.length < 5000; i = a.indexOf(b, i + b.length)) {
        const d = position(i), f = position(i + b.length);
        // La fin peut tomber au tout début du nœud suivant : on la garde à la fin du précédent.
        const r = document.createRange();
        r.setStart(d.node, d.offset);
        if (f.offset === 0 && f.node !== d.node) { const k = noeuds.findIndex((x) => x.n === f.node); r.setEnd(noeuds[k - 1].n, noeuds[k - 1].n.nodeValue.length); } else r.setEnd(f.node, f.offset);
        trouves.push(r);
      }
    }
    if (!garderPosition || courant >= trouves.length) courant = trouves.length ? 0 : -1;
    // Commencer au premier résultat après le curseur.
    if (!garderPosition && trouves.length) {
      const sel = Editeur.selection();
      if (sel) { const i = trouves.findIndex((r) => r.compareBoundaryPoints(Range.START_TO_START, sel) >= 0); courant = i >= 0 ? i : 0; }
    }
    surligner();
  }
  function surligner() {
    if (!CSS.highlights) return;
    CSS.highlights.clear();
    if (trouves.length) CSS.highlights.set('edda-trouve', new Highlight(...trouves));
    if (courant >= 0 && trouves[courant]) {
      CSS.highlights.set('edda-courant', new Highlight(trouves[courant]));
      const r = trouves[courant].getBoundingClientRect();
      const z = $('#defilement');
      const zr = z.getBoundingClientRect();
      if (r.top < zr.top + 60 || r.bottom > zr.bottom - 40) z.scrollBy({ top: r.top - zr.top - zr.height / 3 });
    }
    compte.textContent = champ.value ? (trouves.length ? `${courant + 1} sur ${trouves.length}` : 'Aucun') : '';
  }
  function aller(sens) {
    if (!trouves.length) return;
    courant = (courant + sens + trouves.length) % trouves.length;
    surligner();
  }

  // Remplacer l'occurrence en cours, puis aller à la suivante.
  function remplacerUn() {
    if (courant < 0 || !trouves[courant]) return;
    const page = Editeur.page();
    page.focus({ preventScroll: true });
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(trouves[courant]);
    if (champRemplacer.value) document.execCommand('insertText', false, champRemplacer.value);
    else document.execCommand('delete');
    Editeur.memoriser();
    chercher({ garderPosition: true });
    champRemplacer.focus();
  }
  // Tout remplacer : de la fin vers le début, pour que les positions restent justes.
  function remplacerTout() {
    if (!trouves.length) return 0;
    const n = trouves.length;
    const page = Editeur.page();
    page.focus({ preventScroll: true });
    const s = window.getSelection();
    for (let i = trouves.length - 1; i >= 0; i--) {
      s.removeAllRanges();
      s.addRange(trouves[i]);
      if (champRemplacer.value) document.execCommand('insertText', false, champRemplacer.value);
      else document.execCommand('delete');
    }
    Editeur.memoriser();
    chercher();
    notify(`${n} remplacement${n > 1 ? 's' : ''}.`, 'success', 2500);
    return n;
  }

  champ.addEventListener('input', () => chercher());
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); aller(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); fermer(); }
  });
  champRemplacer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && e.altKey) { e.preventDefault(); remplacerTout(); } else if (e.key === 'Enter') { e.preventDefault(); remplacerUn(); } else if (e.key === 'Escape') { e.preventDefault(); fermer(); }
  });
  casseBouton.onclick = () => { casse = !casse; casseBouton.classList.toggle('actif', casse); chercher(); };
  $('#recherche-prec').onclick = () => aller(-1);
  $('#recherche-suiv').onclick = () => aller(1);
  $('#recherche-fermer').onclick = fermer;
  $('#recherche-un').onclick = remplacerUn;
  $('#recherche-tout').onclick = remplacerTout;
  // La page change (on écrit) : les résultats se recalculent.
  let attente = 0;
  Editeur.surChangement(() => { if (!barre.hidden) { clearTimeout(attente); attente = setTimeout(() => chercher({ garderPosition: true }), 250); } });

  return { ouvrir, fermer, estOuverte: () => !barre.hidden };
})();
