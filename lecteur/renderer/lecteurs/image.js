// Lecteur d'images (PNG, JPEG, GIF animé, WebP, AVIF, BMP, SVG, ICO) : sur un damier qui montre la
// transparence, ajustée à la fenêtre ou en taille réelle, avec zoom (Ctrl+molette) et rotation.

class LecteurImage extends LecteurBase {
  type = 'image';

  async ouvrir() {
    const ext = extensionDe(this.doc.nom);
    const mime = { svg: 'image/svg+xml', jpg: 'image/jpeg', ico: 'image/x-icon' }[ext] || `image/${ext}`;
    this.url = URL.createObjectURL(new Blob([this.doc.bytes], { type: mime }));
    this.img = el('img', { className: 'image-doc', src: this.url, draggable: false });
    await this.img.decode().catch(() => { throw new Error(`Cette image ne s'ouvre pas : ${this.doc.nom}`); });
    this.zone = el('div', { className: 'image-zone checker' }, this.img);
    this.racine.append(this.zone);
    this.zoom = this.ctx.position.zoom || 'ajuste';
    this.rotation = 0;

    this.zone.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.zoomer(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    this.img.addEventListener('dblclick', () => this.zoomer(this.zoom === 'ajuste' ? 1 : 0));

    this.selectZoom = el('select', { className: 'zoom-choix', title: 'Zoom', onchange: () => { this.zoom = this.selectZoom.value === 'ajuste' ? 'ajuste' : Number(this.selectZoom.value); this.appliquer(); } });
    for (const [v, l] of [['ajuste', 'Ajuster à la fenêtre'], ['0.5', '50 %'], ['1', '100 % (taille réelle)'], ['2', '200 %'], ['4', '400 %']]) this.selectZoom.add(new Option(l, v));
    this.barre.append(
      Barre.groupe(bouton('zoom-out', 'Dézoomer (Ctrl+-)', () => this.zoomer(-1)), this.selectZoom, bouton('zoom-in', 'Zoomer (Ctrl++)', () => this.zoomer(1))),
      Barre.sep(),
      Barre.groupe(bouton('debug-restart', 'Tourner de 90° (R)', () => { this.rotation = (this.rotation + 90) % 360; this.appliquer(); })),
      Barre.espace(),
      Barre.groupe(bouton('folder-opened', 'Montrer dans l\'Explorateur', () => window.mimir.montrer(this.doc.chemin))),
    );
    this.appliquer();
  }

  appliquer() {
    const { naturalWidth: w, naturalHeight: h } = this.img;
    const tourne = this.rotation % 180 !== 0;
    this.img.style.transform = this.rotation ? `rotate(${this.rotation}deg)` : '';
    if (this.zoom === 'ajuste') {
      this.zone.classList.add('ajuste');
      const zw = this.zone.clientWidth - 40 || 800, zh = this.zone.clientHeight - 40 || 600;
      const s = Math.min(1, zw / (tourne ? h : w), zh / (tourne ? w : h));
      this.echelle = s;
    } else {
      this.zone.classList.remove('ajuste');
      this.echelle = this.zoom;
    }
    this.img.style.width = `${w * this.echelle}px`;
    this.img.style.height = `${h * this.echelle}px`;
    // Les petites images agrandies restent nettes (pixel art, icônes).
    this.img.style.imageRendering = this.echelle >= 2 ? 'pixelated' : 'auto';
    const v = this.zoom === 'ajuste' ? 'ajuste' : String(this.zoom);
    if (![...this.selectZoom.options].some((o) => o.value === v)) this.selectZoom.add(new Option(`${Math.round(this.zoom * 100)} %`, v));
    this.selectZoom.value = v;
    this.ctx.changement();
  }

  zoomer(sens) {
    const actuel = this.echelle || 1;
    if (sens === 0) this.zoom = 'ajuste';
    else this.zoom = Math.max(0.05, Math.min(32, Math.round(actuel * (sens > 0 ? 1.25 : 0.8) * 100) / 100));
    this.appliquer();
  }

  montrer() { requestAnimationFrame(() => this.appliquer()); }
  etat() {
    return {
      info: `${this.img.naturalWidth} × ${this.img.naturalHeight} px · ${formatSize(this.doc.taille)}`,
      zoom: `${Math.round((this.echelle || 1) * 100)} %`,
    };
  }
  position() { return { zoom: this.zoom }; }
  clavier(e) {
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey) { this.rotation = (this.rotation + 90) % 360; this.appliquer(); return true; }
    return false;
  }
  imprimer() { Impression.images([this.url]); }
  async image() {
    const c = el('canvas', { width: this.img.naturalWidth || 800, height: this.img.naturalHeight || 600 });
    c.getContext('2d').drawImage(this.img, 0, 0, c.width, c.height);
    return reduireCanvas(c);
  }
  detruire() { URL.revokeObjectURL(this.url); super.detruire(); }
}
Lecteurs.ajouter('image', LecteurImage);

// Impression : les pages (des images) sont posées dans #impression, que la feuille de style montre
// seule à l'impression, puis la fenêtre d'impression de Windows s'ouvre.
const Impression = {
  async images(urls) {
    const zone = $('#impression');
    zone.innerHTML = '';
    const imgs = urls.map((u) => el('img', { src: u }));
    zone.append(...imgs);
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    window.print();
    zone.innerHTML = '';
  },
  async html(contenu) {
    const zone = $('#impression');
    zone.innerHTML = '';
    zone.append(el('div', { className: 'impression-html' }, contenu));
    await Promise.all($$('img', zone).map((i) => i.decode().catch(() => {})));
    window.print();
    zone.innerHTML = '';
  },
};
