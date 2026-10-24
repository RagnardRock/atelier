// Lecteur des documents affichés en HTML : les textes (.txt, .log, .json…), le Markdown (mis en
// forme, comme sur GitHub) et, avec word.js, les documents Word. Le texte s'affiche sur une feuille,
// avec zoom, recherche (Ctrl+F) et impression.

class LecteurHtml extends LecteurBase {
  // Les lecteurs qui en héritent remplissent this.feuille dans contenu().
  async contenu() {}

  async ouvrir() {
    this.feuille = el('article', { className: 'feuille' });
    this.zone = el('div', { className: 'feuille-zone' }, this.feuille);
    this.racine.append(this.zone);
    await this.contenu();
    // Les liens d'un document s'ouvrent dans le navigateur (main.js › setWindowOpenHandler).
    for (const a of $$('a[href]', this.feuille)) if (/^https?:|^mailto:/.test(a.getAttribute('href'))) a.target = '_blank';
    this.recherche = new RechercheDom(this.feuille, this.zone);
    this.zoom = this.ctx.position.zoom || 1;
    this.champ = Barre.recherche((t, o) => this.chercher(t, o));
    this.libelleZoom = el('span', { className: 'zoom-libelle' });
    this.barre.append(
      Barre.groupe(bouton('zoom-out', 'Plus petit (Ctrl+-)', () => this.zoomer(-1)), this.libelleZoom, bouton('zoom-in', 'Plus grand (Ctrl++)', () => this.zoomer(1))),
      Barre.sep(),
      this.champ.element,
      Barre.espace(),
      ...this.boutonsDroite(),
    );
    this.zone.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); this.zoomer(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
    this.zone.addEventListener('scroll', () => { clearTimeout(this.delai); this.delai = setTimeout(() => this.ctx.changement(), 300); });
    this.appliquer();
    if (this.ctx.position.defilement) requestAnimationFrame(() => { this.zone.scrollTop = this.ctx.position.defilement * this.zone.scrollHeight; });
  }

  boutonsDroite() {
    return [Barre.groupe(
      bouton('copy', 'Copier tout le texte', async () => { await window.mimir.copierTexte(this.feuille.innerText); notify('Texte copié.', 'success', 2000); }),
      bouton('folder-opened', 'Montrer dans l\'Explorateur', () => window.mimir.montrer(this.doc.chemin)),
    )];
  }

  appliquer() {
    this.feuille.style.zoom = this.zoom;
    this.libelleZoom.textContent = `${Math.round(this.zoom * 100)} %`;
    this.ctx.changement();
  }
  zoomer(sens) {
    this.zoom = sens === 0 ? 1 : Math.max(0.5, Math.min(3, Math.round((this.zoom + sens * 0.1) * 10) / 10));
    this.appliquer();
  }
  chercher(texte, options) {
    if (texte === undefined) return this.champ.focus();
    const { actuel, total } = this.recherche.chercher(texte, options);
    this.champ.compte.textContent = texte ? (total ? `${actuel} / ${total}` : 'Aucun résultat') : '';
  }
  etat() {
    const mots = (this.feuille.innerText.match(/\S+/g) || []).length;
    return { info: `${mots.toLocaleString('fr')} mots · ${formatSize(this.doc.taille)}`, zoom: `${Math.round(this.zoom * 100)} %` };
  }
  position() { return { zoom: this.zoom, defilement: this.zone.scrollHeight ? this.zone.scrollTop / this.zone.scrollHeight : 0 }; }
  imprimer() { Impression.html(this.feuille.cloneNode(true)); }
  async texte() { return this.feuille.innerText; }
  async chercherTexte(q) { return extraits(this.feuille.innerText, q).map((e) => ({ extrait: e })); }
  sommaire() {
    return $$('h1, h2, h3', this.feuille).map((h) => ({ titre: h.textContent.trim(), niveau: Number(h.tagName[1]) - 1 }));
  }
  detruire() { this.recherche?.effacer(); super.detruire(); }
}

class LecteurTexte extends LecteurHtml {
  type = 'texte';
  async contenu() {
    const texte = new TextDecoder('utf-8').decode(this.doc.bytes);
    const ext = extensionDe(this.doc.nom);
    if (ext === 'md' || ext === 'markdown') {
      this.feuille.classList.add('markdown');
      this.feuille.innerHTML = DOMPurify.sanitize(marked.parse(texte, { gfm: true }));
    } else {
      this.feuille.classList.add('texte-brut');
      this.feuille.append(el('pre', { textContent: texte }));
    }
  }
}
Lecteurs.ajouter('texte', LecteurTexte);
