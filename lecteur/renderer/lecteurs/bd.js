// Lecteur de bandes dessinées : CBZ (archive ZIP d'images, ouverte ici avec JSZip) et CBR (archive
// RAR, décompressée par main.js). Une page ou deux côte à côte, ajustée à la hauteur ou à la
// largeur, de gauche à droite ou de droite à gauche (mangas), avec les miniatures à gauche.

class LecteurBd extends LecteurBase {
  type = 'bd';

  async ouvrir() {
    let fichiers;
    if (extensionDe(this.doc.nom) === 'cbr') {
      fichiers = (await window.mimir.pagesRar(this.doc.chemin)).map((p) => ({ nom: p.nom, data: p.bytes }));
    } else {
      let zip;
      try { zip = await JSZip.loadAsync(this.doc.bytes); } catch {
        throw new Error(`${this.doc.nom} n'est pas une archive ZIP lisible (un .cbz renommé en .cbr, peut-être ?).`);
      }
      const images = Object.values(zip.files).filter((f) => !f.dir && /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name));
      fichiers = await Promise.all(images.map(async (f) => ({ nom: f.name, data: await f.async('uint8array') })));
    }
    if (!fichiers.length) throw new Error(`Aucune image dans ${this.doc.nom}.`);
    // Ordre « naturel » : page2 avant page10.
    fichiers.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' }));
    this.pages = fichiers.map((f) => URL.createObjectURL(new Blob([f.data], { type: /\.png$/i.test(f.nom) ? 'image/png' : /\.webp$/i.test(f.nom) ? 'image/webp' : /\.gif$/i.test(f.nom) ? 'image/gif' : 'image/jpeg' })));
    this.noms = fichiers.map((f) => f.nom);

    this.double = this.ctx.position.double ?? this.config.bdDoublePage;
    this.manga = this.ctx.position.manga ?? this.config.bdSensManga;
    this.ajuste = this.ctx.position.ajuste || 'hauteur';
    this.i = Math.min(this.pages.length - 1, Math.max(0, (this.ctx.position.page || 1) - 1));

    this.planche = el('div', { className: 'bd-planche' });
    this.zone = el('div', { className: 'bd-zone' }, this.planche);
    this.racine.append(this.zone);
    this.zone.addEventListener('click', (e) => {
      // Un clic sur la moitié gauche ou droite tourne la page (dans le sens de lecture).
      const gauche = e.clientX < this.zone.getBoundingClientRect().left + this.zone.clientWidth / 2;
      this.tourner(gauche !== this.manga ? -1 : 1);
    });

    // Miniatures
    this.cote = el('div', { className: 'miniatures' });
    this.cote.append(el('div', { className: 'panel-header' }, el('span', { className: 'panel-title', textContent: 'Pages' })));
    this.liste = el('div', { className: 'miniatures-liste' });
    this.cote.append(this.liste);
    this.pages.forEach((url, i) => {
      const b = el('button', { className: 'miniature', title: `Page ${i + 1}`, onclick: () => this.allerPage(i + 1) },
        el('img', { src: url, loading: 'lazy', decoding: 'async' }), el('span', { textContent: i + 1 }));
      this.liste.append(b);
    });

    this.numero = Barre.page((v) => this.allerPage(Number(v)));
    this.boutonDouble = bouton('split-horizontal', 'Deux pages côte à côte (D)', () => { this.double = !this.double; this.afficher(); });
    this.boutonManga = bouton('arrow-swap', 'Sens de lecture : de droite à gauche, comme un manga (M)', () => { this.manga = !this.manga; this.afficher(); });
    this.selectAjuste = el('select', { className: 'zoom-choix', title: 'Ajuster', onchange: () => { this.ajuste = this.selectAjuste.value; this.afficher(); } });
    for (const [v, l] of [['hauteur', 'Page entière'], ['largeur', 'Largeur de la fenêtre'], ['reelle', 'Taille réelle']]) this.selectAjuste.add(new Option(l, v));
    this.barre.append(
      Barre.groupe(bouton('chevron-left', 'Page précédente (←)', () => this.tourner(this.manga ? 1 : -1)), this.numero.element, bouton('chevron-right', 'Page suivante (→)', () => this.tourner(this.manga ? -1 : 1))),
      Barre.sep(),
      Barre.groupe(this.selectAjuste, this.boutonDouble, this.boutonManga),
      Barre.espace(),
      Barre.groupe(bouton('screen-full', 'Plein écran (F11)', () => window.mimir.pleinEcran())),
    );
    this.afficher();
  }

  // Les pages affichées : la page i, et la suivante en mode deux pages (la couverture reste seule).
  visibles() {
    if (!this.double || this.i === 0) return [this.i];
    const debut = this.i % 2 === 1 ? this.i : this.i - 1;
    return [debut, debut + 1].filter((k) => k < this.pages.length);
  }
  afficher() {
    const vis = this.visibles();
    this.i = vis[0];
    this.planche.innerHTML = '';
    this.planche.className = `bd-planche ajuste-${this.ajuste}${vis.length > 1 ? ' double' : ''}`;
    const imgs = vis.map((k) => el('img', { src: this.pages[k], draggable: false }));
    this.planche.append(...(this.manga ? imgs.reverse() : imgs));
    this.zone.scrollTop = 0;
    this.numero.input.value = vis.map((k) => k + 1).join('-');
    this.numero.total.textContent = `/ ${this.pages.length}`;
    this.selectAjuste.value = this.ajuste;
    this.boutonDouble.classList.toggle('actif', this.double);
    this.boutonManga.classList.toggle('actif', this.manga);
    this.liste.classList.toggle('manga', this.manga);
    $$('.miniature', this.liste).forEach((m, k) => m.classList.toggle('actif', vis.includes(k)));
    $$('.miniature.actif', this.liste)[0]?.scrollIntoView({ block: 'nearest' });
    // On prépare la page suivante pour qu'elle s'affiche tout de suite.
    const suivante = vis[vis.length - 1] + 1;
    if (suivante < this.pages.length) new Image().src = this.pages[suivante];
    this.ctx.changement();
  }
  tourner(sens) {
    const vis = this.visibles();
    const cible = sens > 0 ? vis[vis.length - 1] + 1 : (this.double && vis[0] > 1 ? vis[0] - 2 : vis[0] - 1);
    if (cible < 0 || cible >= this.pages.length) return;
    this.i = cible;
    this.afficher();
  }
  allerPage(n) {
    const p = Math.round(Number(String(n).split('-')[0]));
    if (!p) return;
    this.i = Math.max(0, Math.min(this.pages.length - 1, p - 1));
    this.afficher();
  }
  zoomer(sens) {
    const ordre = ['hauteur', 'largeur', 'reelle'];
    this.ajuste = sens === 0 ? 'hauteur' : ordre[Math.max(0, Math.min(2, ordre.indexOf(this.ajuste) + sens))];
    this.afficher();
  }
  clavier(e) {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { this.tourner(k === 'ArrowRight' && this.manga ? -1 : 1); return true; }
    if (k === 'ArrowLeft' || k === 'PageUp') { this.tourner(k === 'ArrowLeft' && this.manga ? 1 : -1); return true; }
    if (k === 'Home') { this.allerPage(1); return true; }
    if (k === 'End') { this.allerPage(this.pages.length); return true; }
    if (k.toLowerCase() === 'd' && !e.ctrlKey) { this.double = !this.double; this.afficher(); return true; }
    if (k.toLowerCase() === 'm' && !e.ctrlKey) { this.manga = !this.manga; this.afficher(); return true; }
    return false;
  }
  etat() {
    return { page: this.i + 1, pages: this.pages.length, info: formatSize(this.doc.taille), zoom: { hauteur: 'Page entière', largeur: 'Largeur', reelle: 'Taille réelle' }[this.ajuste] };
  }
  position() { return { page: this.i + 1, double: this.double, manga: this.manga, ajuste: this.ajuste }; }
  imprimer() { Impression.images(this.visibles().map((k) => this.pages[k])); }
  async image(page) {
    const img = new Image();
    img.src = this.pages[(page || this.i + 1) - 1];
    await img.decode();
    const c = el('canvas', { width: img.naturalWidth, height: img.naturalHeight });
    c.getContext('2d').drawImage(img, 0, 0);
    return reduireCanvas(c);
  }
  async texte() { return `(Une bande dessinée : ${this.pages.length} pages d'images, sans texte lisible. Utilise voir_page pour regarder une page.)`; }
  detruire() { for (const u of this.pages || []) URL.revokeObjectURL(u); super.detruire(); }
}
Lecteurs.ajouter('bd', LecteurBd);
