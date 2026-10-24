// Lecteur de livres EPUB, avec epub.js : le livre s'affiche page par page (une ou deux colonnes selon
// la largeur), avec le sommaire à gauche, la taille du texte réglable, et les couleurs de lecture de
// Mímir (normal, sombre, sépia). Les scripts d'un livre ne s'exécutent jamais.

class LecteurEpub extends LecteurBase {
  type = 'epub';

  async ouvrir() {
    const buffer = this.doc.bytes.buffer.slice(this.doc.bytes.byteOffset, this.doc.bytes.byteOffset + this.doc.bytes.byteLength);
    this.livre = ePub(buffer);
    await this.livre.opened.catch((err) => { throw new Error(`Ce livre ne s'ouvre pas (${err.message}).`); });
    await this.livre.loaded.navigation.catch(() => {});
    this.zone = el('div', { className: 'epub-zone' });
    this.racine.append(this.zone);
    this.taille = this.ctx.position.taille || this.config.epubTaille || 100;
    this.titre = this.livre.packaging?.metadata?.title || this.doc.nom;
    this.auteur = this.livre.packaging?.metadata?.creator || '';

    // Sommaire
    this.cote = el('div', { className: 'sommaire-bloc' });
    this.cote.append(el('div', { className: 'panel-header' }, el('span', { className: 'panel-title', textContent: 'Sommaire' })));
    this.arbre = el('div', { className: 'sommaire' });
    this.cote.append(this.arbre);
    const toc = this.livre.navigation?.toc || [];
    const ajouter = (items, niveau) => {
      for (const it of items) {
        this.arbre.append(el('button', { className: 'sommaire-item', style: { paddingLeft: `${10 + niveau * 14}px` }, textContent: it.label.trim(), title: it.label.trim(), onclick: () => this.rendu.display(it.href) }));
        if (it.subitems?.length) ajouter(it.subitems, niveau + 1);
      }
    };
    ajouter(toc, 0);
    if (!toc.length) this.arbre.append(el('p', { className: 'vide-texte', textContent: 'Ce livre n\'a pas de sommaire.' }));

    this.libelleTaille = el('span', { className: 'zoom-libelle' });
    this.progression = el('span', { className: 'epub-progression' });
    this.champ = Barre.recherche((t, o) => this.chercher(t, o), 'Chercher dans le livre');
    this.barre.append(
      Barre.groupe(bouton('chevron-left', 'Page précédente (←)', () => this.rendu.prev()), this.progression, bouton('chevron-right', 'Page suivante (→)', () => this.rendu.next())),
      Barre.sep(),
      Barre.groupe(bouton('text-size', 'Texte plus petit (Ctrl+-)', () => this.zoomer(-1)), this.libelleTaille, bouton('zoom-in', 'Texte plus grand (Ctrl++)', () => this.zoomer(1))),
      Barre.sep(),
      this.champ.element,
      Barre.espace(),
      Barre.groupe(bouton('screen-full', 'Plein écran (F11)', () => window.mimir.pleinEcran())),
    );
  }

  // epub.js a besoin que la zone soit visible et ait sa taille pour calculer les pages :
  // le livre s'affiche donc la première fois que l'onglet est montré.
  async montrer() {
    if (this.rendu) {
      requestAnimationFrame(() => {
        this.rendu.resize();
        // Caché avant d'avoir fini de s'afficher (plusieurs documents ouverts d'un coup) : on réaffiche.
        if (!this.lieu) this.rendu.display(this.cfi || this.ctx.position.cfi || undefined);
      });
      return;
    }
    this.rendu = this.livre.renderTo(this.zone, { width: '100%', height: '100%', flow: 'paginated', spread: 'auto', allowScriptedContent: false });
    this.rendu.themes.register('normal', { body: { background: '#ffffff', color: '#1d1d1f' } });
    this.rendu.themes.register('sombre', { body: { background: '#1b1c22 !important', color: '#d6d6dc !important' }, a: { color: '#8fb4ff !important' } });
    this.rendu.themes.register('sepia', { body: { background: '#f4ecd8 !important', color: '#4b3b28 !important' } });
    this.rendu.themes.default({ body: { 'font-family': 'Georgia, "Segoe UI", serif', 'line-height': '1.6' }, img: { 'max-width': '100%' } });
    this.couleurs(this.config.lecture);
    this.appliquerTaille();
    this.rendu.on('relocated', (loc) => {
      this.cfi = loc.start.cfi;
      this.lieu = loc;
      this.majProgression();
      this.ctx.changement();
    });
    // Les flèches marchent aussi quand le livre (dans son cadre) a le focus.
    this.rendu.on('keydown', (e) => { if (!this.clavier(e)) window.dispatchEvent(new KeyboardEvent('keydown', e)); });
    await this.rendu.display(this.ctx.position.cfi || undefined);
    // Les positions (en %) se calculent ensuite, sans bloquer l'affichage.
    this.livre.locations.generate(1600).then(() => this.majProgression()).catch(() => {});
  }

  majProgression() {
    if (!this.lieu) return;
    const pct = this.livre.locations.length() ? Math.round(this.livre.locations.percentageFromCfi(this.lieu.start.cfi) * 100) : null;
    const chap = this.lieu.start.displayed;
    this.progression.textContent = pct !== null ? `${pct} %` : chap ? `${chap.page} / ${chap.total}` : '';
  }
  couleurs(lecture) { this.rendu?.themes.select({ sombre: 'sombre', sepia: 'sepia' }[lecture] || 'normal'); }
  appliquerTaille() {
    this.rendu?.themes.fontSize(`${this.taille}%`);
    this.libelleTaille.textContent = `${this.taille} %`;
  }
  zoomer(sens) {
    this.taille = sens === 0 ? 100 : Math.max(60, Math.min(250, this.taille + sens * 10));
    this.appliquerTaille();
    this.ctx.changement();
  }
  allerPage(n) {
    // Pour un livre, « page » = pourcentage du livre (les pages dépendent de la taille de la fenêtre).
    const pct = Math.max(0, Math.min(100, Number(n))) / 100;
    if (this.livre.locations.length()) this.rendu.display(this.livre.locations.cfiFromPercentage(pct));
  }
  async chercher(texte, { precedent, nouveau } = {}) {
    if (texte === undefined) return this.champ.focus();
    if (!texte.trim()) { this.champ.compte.textContent = ''; this.resultats = []; return; }
    if (nouveau || !this.resultats) {
      this.champ.compte.textContent = '…';
      this.resultats = await this.trouver(texte);
      this.ir = -1;
    }
    if (!this.resultats.length) { this.champ.compte.textContent = 'Aucun résultat'; return; }
    this.ir = (this.ir + (precedent ? -1 : 1) + this.resultats.length) % this.resultats.length;
    this.champ.compte.textContent = `${this.ir + 1} / ${this.resultats.length}`;
    const r = this.resultats[this.ir];
    await this.rendu.display(r.cfi);
    this.rendu.annotations.remove(this.marque, 'highlight');
    this.marque = r.cfi;
    this.rendu.annotations.highlight(r.cfi, {}, () => {}, 'mimir-trouve');
  }
  async trouver(texte) {
    const out = [];
    for (const item of this.livre.spine.spineItems) {
      try {
        await item.load(this.livre.load.bind(this.livre));
        for (const r of item.find(texte)) out.push({ ...r, chapitre: item.index });
        item.unload();
      } catch { /* chapitre illisible : on passe */ }
    }
    return out;
  }
  clavier(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { this.rendu?.next(); return true; }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { this.rendu?.prev(); return true; }
    return false;
  }
  etat() {
    return {
      info: [this.titre, this.auteur].filter(Boolean).join(' · '),
      zoom: `Texte ${this.taille} %`,
      page: this.lieu?.start.displayed ? `${this.lieu.start.displayed.page} / ${this.lieu.start.displayed.total} du chapitre` : undefined,
    };
  }
  position() { return { cfi: this.cfi, taille: this.taille }; }
  imprimer() { notify('Les livres EPUB ne s\'impriment pas depuis Mímir (leurs pages dépendent de la fenêtre).', 'info', 5000); }
  sommaire() {
    const out = [];
    const parcourir = (items, niveau) => { for (const it of items) { out.push({ titre: it.label.trim(), niveau, href: it.href }); if (it.subitems) parcourir(it.subitems, niveau + 1); } };
    parcourir(this.livre.navigation?.toc || [], 0);
    return out;
  }
  // Le texte d'un chapitre (numéro dans l'ordre de lecture, à partir de 1), ou du chapitre affiché.
  async texte({ chapitre } = {}) {
    const index = chapitre ? chapitre - 1 : (this.lieu?.start.index ?? 0);
    const item = this.livre.spine.get(index);
    if (!item) return `Pas de chapitre ${chapitre} (le livre en a ${this.livre.spine.spineItems.length}).`;
    const docu = await item.load(this.livre.load.bind(this.livre));
    const racine = docu.body || docu.querySelector?.('body') || docu.documentElement || docu;
    const t = racine.textContent.replace(/\n\s*\n\s*/g, '\n\n').trim();
    item.unload();
    return `Chapitre ${index + 1} sur ${this.livre.spine.spineItems.length} :\n\n${t}`;
  }
  async chercherTexte(q) {
    return (await this.trouver(q)).slice(0, 40).map((r) => ({ chapitre: r.chapitre + 1, extrait: r.excerpt }));
  }
  infos() { return { ...super.infos(), titre: this.titre, auteur: this.auteur, chapitres: this.livre.spine.spineItems.length, chapitre_affiche: (this.lieu?.start.index ?? 0) + 1 }; }
  detruire() { this.rendu?.destroy(); this.livre?.destroy(); super.detruire(); }
}
Lecteurs.ajouter('epub', LecteurEpub);
