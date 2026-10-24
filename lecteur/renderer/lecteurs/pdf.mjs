// Lecteur PDF, avec pdf.js (le moteur PDF de Firefox, https://mozilla.github.io/pdf.js/).
//
// pdf.js s'occupe de dessiner les pages, du texte sélectionnable, des liens, des formulaires (les
// champs se remplissent directement dans la page) et des outils d'annotation : surligner, écrire du
// texte, dessiner à main levée, poser une image. Mímir y ajoute la signature (signature.js : on la
// dessine, on la tape ou on prend une image, et elle se pose comme une image), les miniatures, le
// sommaire, la recherche, l'impression et l'enregistrement.
//
// Enregistrer écrit les annotations et les champs remplis DANS le PDF (comme Acrobat) : n'importe
// quel lecteur PDF les verra. Rien n'est écrit tant que tu n'enregistres pas (Ctrl+S).

const PDFJS = new URL('../../node_modules/pdfjs-dist/', import.meta.url).href;
const lib = await import(`${PDFJS}build/pdf.mjs`);
// pdf_viewer.mjs (les composants de la visionneuse de Firefox) cherche pdf.js dans globalThis.pdfjsLib.
globalThis.pdfjsLib = lib;
const visionneuse = await import(`${PDFJS}web/pdf_viewer.mjs`);
lib.GlobalWorkerOptions.workerSrc = `${PDFJS}build/pdf.worker.mjs`;

const { AnnotationEditorType: OUTIL, AnnotationEditorParamsType: PARAM, AnnotationMode } = lib;
const { EventBus, PDFViewer, PDFLinkService, PDFFindController, GenericL10n, LinkTarget, ScrollMode, SpreadMode } = visionneuse;

// Les textes de pdf.js en français (renderer/l10n/fr.ftl), partagés par tous les onglets.
const l10n = new GenericL10n('fr');

// Les couleurs de surlignage proposées (les noms servent à pdf.js pour ses infobulles).
const SURLIGNAGES = { yellow: '#FFE066', green: '#7CF29A', blue: '#7FD6FF', pink: '#FFA8D6', red: '#FF7A7A' };
const COULEURS_TRAIT = ['#1d1d1f', '#2f6bff', '#e5383b', '#1f9d55', '#ff8c1a', '#8f5bff', '#ffffff'];

const ZOOMS = [['auto', 'Automatique'], ['page-width', 'Largeur de page'], ['page-fit', 'Page entière'], ['page-actual', 'Taille réelle'], ['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %'], ['2', '200 %'], ['3', '300 %'], ['4', '400 %']];

const rgb = (h) => { const m = String(h).replace('#', '').match(/../g) || ['00', '00', '00']; return m.map((x) => parseInt(x, 16)); };

class LecteurPdf extends LecteurBase {
  type = 'pdf';

  async ouvrir() {
    // --- Charger le document ---
    // pdf.js prend les octets pour son « worker » : on lui donne une copie, l'original peut resservir.
    const tache = lib.getDocument({
      data: this.doc.bytes.slice(),
      cMapUrl: `${PDFJS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS}standard_fonts/`,
      wasmUrl: `${PDFJS}wasm/`,
      iccUrl: `${PDFJS}iccs/`,
      enableXfa: true,
    });
    tache.onPassword = async (repondre, raison) => {
      const v = await Dialogs.form({
        title: `${this.doc.nom} est protégé`,
        okLabel: 'Ouvrir',
        fields: [
          { type: 'info', text: raison === lib.PasswordResponses.INCORRECT_PASSWORD ? 'Mot de passe incorrect, réessaie.' : 'Ce PDF demande un mot de passe pour s\'ouvrir.' },
          { key: 'mdp', label: 'Mot de passe', type: 'password', value: '' },
        ],
      });
      if (v) repondre(v.mdp);
      else tache.destroy();
    };
    try {
      this.pdf = await tache.promise;
    } catch (err) {
      if (err?.name === 'PasswordException' || /destroyed/i.test(err?.message)) throw new Error(`${this.doc.nom} n'a pas été ouvert (mot de passe).`);
      throw new Error(`Ce PDF ne s'ouvre pas : ${err.message}`);
    }
    this.nbPages = this.pdf.numPages;
    this.metadonnees = await this.pdf.getMetadata().catch(() => null);

    // --- La visionneuse ---
    this.zone = el('div', { className: 'pdf-zone' }, el('div', { className: 'pdfViewer' }));
    this.racine.append(this.zone);
    this.racine.classList.add('vue-pdf');
    this.bus = new EventBus();
    this.liens = new PDFLinkService({ eventBus: this.bus, externalLinkTarget: LinkTarget.BLANK });
    this.trouveur = new PDFFindController({ eventBus: this.bus, linkService: this.liens });
    this.vue = new PDFViewer({
      container: this.zone,
      eventBus: this.bus,
      linkService: this.liens,
      findController: this.trouveur,
      l10n,
      annotationMode: AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: OUTIL.NONE,
      annotationEditorHighlightColors: Object.entries(SURLIGNAGES).map(([n, c]) => `${n}=${c}`).join(','),
      enableHighlightFloatingButton: true, // sélectionne du texte : un bouton « Surligner » apparaît
      imageResourcesPath: `${PDFJS}web/images/`,
      maxCanvasPixels: 2 ** 25,
    });
    this.liens.setViewer(this.vue);

    this.bus.on('annotationeditoruimanager', ({ uiManager }) => { this.ui = uiManager; });
    this.bus.on('pagesinit', () => this.debut());
    this.bus.on('pagechanging', ({ pageNumber }) => { this.page = pageNumber; this.majPage(); this.ctx.changement(); });
    this.bus.on('scalechanging', () => { this.majZoom(); this.ctx.changement(); });
    this.bus.on('annotationeditormodechanged', ({ mode }) => this.majOutil(mode));
    // pdf.js demande lui-même de changer d'outil : bouton « Surligner » qui apparaît sur une sélection,
    // double-clic sur une annotation existante pour la modifier.
    this.bus.on('showannotationeditorui', ({ mode }) => { this.vue.annotationEditorMode = { mode }; });
    this.bus.on('switchannotationeditormode', ({ source, ...demande }) => { void source; this.vue.annotationEditorMode = demande; });
    this.bus.on('editingstateschanged', ({ details }) => {
      this.etats = details;
      this.boutonAnnuler.disabled = !details.hasSomethingToUndo;
      this.boutonRetablir.disabled = !details.hasSomethingToRedo;
      this.boutonSupprimer.disabled = !details.hasSelectedEditor;
    });
    this.bus.on('updatefindmatchescount', ({ matchesCount }) => this.majRecherche(matchesCount));
    this.bus.on('updatefindcontrolstate', ({ state, matchesCount }) => {
      if (state === 1) this.recherche.compte.textContent = 'Aucun résultat'; // FindState.NOT_FOUND
      else if (matchesCount) this.majRecherche(matchesCount);
    });
    // Annotations ou champs modifiés depuis le dernier enregistrement : l'onglet le montre (•).
    this.pdf.annotationStorage.onSetModified = () => { this.modifie = true; this.ctx.changement(); };
    this.pdf.annotationStorage.onResetModified = () => { this.modifie = false; this.ctx.changement(); };

    this.construireBarre();
    this.construireCote();
    this.zone.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) this.vue.increaseScale({ drawingDelay: 300 }); else this.vue.decreaseScale({ drawingDelay: 300 });
    }, { passive: false });

    this.vue.setDocument(this.pdf);
    this.liens.setDocument(this.pdf);
    this.couleurs(this.config.lecture);
  }

  // Les pages sont prêtes : zoom et page où tu t'étais arrêté.
  debut() {
    const p = this.ctx.position;
    this.vue.currentScaleValue = p.zoom || this.config.zoom || 'page-width';
    if (p.rotation) this.vue.pagesRotation = p.rotation;
    if (p.defilement !== undefined) this.vue.scrollMode = p.defilement;
    if (p.doublePage) this.vue.spreadMode = SpreadMode.ODD;
    if (p.page && p.page <= this.nbPages && p.page > 1) this.vue.currentPageNumber = p.page;
    this.page = this.vue.currentPageNumber;
    this.majPage();
    this.majZoom();
    this.ctx.changement();
  }

  // --- Barre d'outils ---
  construireBarre() {
    this.numero = Barre.page((v) => this.allerPage(Number(v)));
    this.selectZoom = el('select', { className: 'zoom-choix', title: 'Zoom', onchange: () => { this.vue.currentScaleValue = this.selectZoom.value; } });
    for (const [v, l] of ZOOMS) this.selectZoom.add(new Option(l, v));
    this.selectZoom.add(new Option('', 'perso'));
    this.selectZoom.options[this.selectZoom.options.length - 1].hidden = true;
    this.recherche = Barre.recherche((t, o) => this.chercher(t, o));

    // Les outils d'annotation : lire (rien), surligner, texte, dessin, image, signature.
    const outil = (mode, icone, titre, texte) => {
      const b = bouton(icone, titre, () => this.choisirOutil(this.vue.annotationEditorMode === mode ? OUTIL.NONE : mode), { texte, classe: 'icon-button outil' });
      b.dataset.mode = mode;
      return b;
    };
    this.outils = [
      outil(OUTIL.HIGHLIGHT, 'symbol-color', 'Surligner du texte (sélectionne-le), ou à main levée ailleurs', 'Surligner'),
      outil(OUTIL.FREETEXT, 'whole-word', 'Écrire du texte ou une note sur la page (clique où écrire)', 'Texte'),
      outil(OUTIL.INK, 'edit', 'Dessiner à main levée (stylet ou souris)', 'Dessin'),
      outil(OUTIL.STAMP, 'file-media', 'Ajouter une image', 'Image'),
    ];
    this.boutonSignature = bouton('signature', 'Signer : dessine, tape ou importe ta signature, puis place-la', () => this.signer(), { texte: 'Signer', classe: 'icon-button outil' });
    this.options = el('div', { className: 'groupe options-outil' });
    this.boutonAnnuler = bouton('discard', 'Annuler (Ctrl+Z)', () => this.ui?.undo());
    this.boutonRetablir = bouton('redo', 'Rétablir (Ctrl+Y)', () => this.ui?.redo());
    this.boutonSupprimer = bouton('trash', 'Supprimer l\'annotation choisie (Suppr)', () => this.ui?.delete());
    for (const b of [this.boutonAnnuler, this.boutonRetablir, this.boutonSupprimer]) b.disabled = true;
    this.boutonEnregistrer = bouton('save', 'Enregistrer les annotations, la signature et les champs dans le PDF (Ctrl+S)', () => this.enregistrer(), { texte: 'Enregistrer', classe: 'button small enregistrer' });

    this.barre.append(
      Barre.groupe(bouton('layout-sidebar-left', 'Miniatures et sommaire', () => this.ctx.basculerCote())),
      Barre.groupe(bouton('chevron-up', 'Page précédente', () => this.vue.previousPage()), this.numero.element, bouton('chevron-down', 'Page suivante', () => this.vue.nextPage())),
      Barre.sep(),
      Barre.groupe(bouton('zoom-out', 'Dézoomer (Ctrl+-)', () => this.vue.decreaseScale()), this.selectZoom, bouton('zoom-in', 'Zoomer (Ctrl++)', () => this.vue.increaseScale())),
      Barre.groupe(bouton('ellipsis', 'Affichage : rotation, deux pages, défilement', (e) => this.menuAffichage(e.currentTarget))),
      Barre.sep(),
      Barre.groupe(...this.outils, this.boutonSignature),
      this.options,
      Barre.groupe(this.boutonAnnuler, this.boutonRetablir, this.boutonSupprimer),
      Barre.espace(),
      this.recherche.element,
      Barre.sep(),
      Barre.groupe(bouton('print', 'Imprimer (Ctrl+P)', () => this.imprimer()), bouton('info', 'Propriétés du document', () => this.proprietes()), this.boutonEnregistrer),
    );
  }

  menuAffichage(ancre) {
    const r = ancre.getBoundingClientRect();
    const menu = el('div', { className: 'menu', style: { left: `${r.left}px`, top: `${r.bottom + 4}px` } });
    const item = (icone, texte, faire, actif) => {
      const b = el('button', { className: 'menu-item', onclick: () => { fermer(); faire(); this.ctx.changement(); } },
        el('i', { className: `codicon codicon-${actif ? 'check' : icone}`, style: { marginRight: '8px' } }), el('span', { className: 'menu-label', textContent: texte }));
      menu.append(b);
    };
    item('debug-restart', 'Tourner les pages à droite', () => { this.vue.pagesRotation = (this.vue.pagesRotation + 90) % 360; });
    item('debug-restart', 'Tourner les pages à gauche', () => { this.vue.pagesRotation = (this.vue.pagesRotation + 270) % 360; });
    menu.append(el('div', { className: 'menu-sep' }));
    item('book', 'Deux pages côte à côte', () => { this.vue.spreadMode = this.vue.spreadMode === SpreadMode.NONE ? SpreadMode.ODD : SpreadMode.NONE; }, this.vue.spreadMode !== SpreadMode.NONE);
    item('list-flat', 'Défilement continu', () => { this.vue.scrollMode = ScrollMode.VERTICAL; }, this.vue.scrollMode === ScrollMode.VERTICAL);
    item('files', 'Une page à la fois', () => { this.vue.scrollMode = ScrollMode.PAGE; }, this.vue.scrollMode === ScrollMode.PAGE);
    item('layout', 'Pages en mosaïque', () => { this.vue.scrollMode = ScrollMode.WRAPPED; }, this.vue.scrollMode === ScrollMode.WRAPPED);
    item('arrow-right', 'Défilement horizontal', () => { this.vue.scrollMode = ScrollMode.HORIZONTAL; }, this.vue.scrollMode === ScrollMode.HORIZONTAL);
    menu.append(el('div', { className: 'menu-sep' }));
    item('screen-full', 'Plein écran (F11)', () => window.mimir.pleinEcran());
    document.body.append(menu);
    const fermer = () => { menu.remove(); window.removeEventListener('pointerdown', dehors, true); };
    const dehors = (e) => { if (!menu.contains(e.target)) fermer(); };
    setTimeout(() => window.addEventListener('pointerdown', dehors, true));
  }

  choisirOutil(mode) {
    if (!this.ui) return notify('Les annotations ne sont pas disponibles pour ce PDF.', 'warning');
    if (this.pdf.isPureXfa) return notify('Ce formulaire (XFA) se remplit, mais ne s\'annote pas.', 'info');
    this.vue.annotationEditorMode = { mode };
    // L'outil Image demande tout de suite quelle image poser.
    if (mode === OUTIL.STAMP) setTimeout(() => this.bus.dispatch('switchannotationeditorparams', { source: this, type: PARAM.CREATE, value: null }), 50);
  }
  parametre(type, value) { this.bus.dispatch('switchannotationeditorparams', { source: this, type, value }); }
  // Passer à un outil et attendre que pdf.js ait fini de basculer.
  async passerEn(mode) {
    if (this.vue.annotationEditorMode === mode) return;
    const fait = new Promise((r) => { const f = (e) => { if (e.mode === mode) { this.bus.off('annotationeditormodechanged', f); r(); } }; this.bus.on('annotationeditormodechanged', f); });
    this.vue.annotationEditorMode = { mode };
    await Promise.race([fait, attendre(2000)]);
  }

  // Les réglages de l'outil choisi (couleur, épaisseur, taille), à côté des outils.
  majOutil(mode) {
    this.mode = mode;
    for (const b of this.outils) b.classList.toggle('actif', Number(b.dataset.mode) === mode);
    this.racine.classList.toggle('en-edition', mode !== OUTIL.NONE);
    // En revenant à la lecture, une sélection restée du surligneur garderait le calque de texte
    // au-dessus des champs du formulaire (on ne pourrait plus cliquer dedans) : on la retire.
    if (mode === OUTIL.NONE) {
      document.getSelection()?.removeAllRanges();
      for (const t of $$('.textLayer.selecting', this.racine)) t.classList.remove('selecting');
    }
    const o = this.options;
    o.innerHTML = '';
    const pastilles = (couleurs, actuelle, choisir) => {
      for (const c of couleurs) {
        const p = el('button', { type: 'button', className: `pastille${c.toLowerCase() === String(actuelle).toLowerCase() ? ' actif' : ''}`, style: { background: c }, title: c, onclick: () => { $$('.pastille', o).forEach((x) => x.classList.remove('actif')); p.classList.add('actif'); choisir(c); } });
        o.append(p);
      }
    };
    const curseur = (titre, min, max, valeur, changer) => {
      const r = el('input', { type: 'range', min, max, value: valeur, title: titre, className: 'mini-curseur', oninput: () => changer(Number(r.value)) });
      o.append(el('span', { className: 'option-libelle', textContent: titre }), r);
    };
    const r = this.reglagesOutils ||= { surlignage: this.config.surlignage || SURLIGNAGES.yellow, trait: COULEURS_TRAIT[1], epaisseur: 2, texte: COULEURS_TRAIT[0], taille: 14 };
    if (mode === OUTIL.HIGHLIGHT) {
      pastilles(Object.values(SURLIGNAGES), r.surlignage, (c) => { r.surlignage = c; this.parametre(PARAM.HIGHLIGHT_COLOR, c); });
      this.parametre(PARAM.HIGHLIGHT_COLOR, r.surlignage);
    } else if (mode === OUTIL.INK) {
      pastilles(COULEURS_TRAIT, r.trait, (c) => { r.trait = c; this.parametre(PARAM.INK_COLOR, c); });
      curseur('Épaisseur', 1, 20, r.epaisseur, (v) => { r.epaisseur = v; this.parametre(PARAM.INK_THICKNESS, v); });
      this.parametre(PARAM.INK_COLOR, r.trait);
      this.parametre(PARAM.INK_THICKNESS, r.epaisseur);
    } else if (mode === OUTIL.FREETEXT) {
      pastilles(COULEURS_TRAIT, r.texte, (c) => { r.texte = c; this.parametre(PARAM.FREETEXT_COLOR, c); });
      curseur('Taille', 6, 48, r.taille, (v) => { r.taille = v; this.parametre(PARAM.FREETEXT_SIZE, v); });
      this.parametre(PARAM.FREETEXT_COLOR, r.texte);
      this.parametre(PARAM.FREETEXT_SIZE, r.taille);
    }
    o.hidden = !o.childElementCount;
  }

  // --- Signature ---
  async signer() {
    if (!this.ui) return notify('Ce PDF ne peut pas être signé ici.', 'warning');
    const png = await Signature.choisir();
    if (!png) return;
    await this.poserImage(png, { page: this.page, largeur: 0.22, description: 'Signature' });
    notify('Signature posée : déplace-la et redimensionne-la à la souris, puis enregistre (Ctrl+S).', 'success', 6000);
  }
  // Poser une image (signature, tampon) sur une page : elle devient une annotation « image » de pdf.js,
  // qu'on déplace et redimensionne, et qui s'enregistre dans le PDF.
  async poserImage(blob, { page = this.page, largeur, x, y, description } = {}) {
    await this.passerEn(OUTIL.STAMP);
    if (page !== this.vue.currentPageNumber) { this.vue.currentPageNumber = page; await attendre(250); }
    const fichier = new File([blob], 'signature.png', { type: 'image/png' });
    const layer = await this.calqueEdition(page);
    const vue = this.vue.getPageView(page - 1);
    const w = vue.div.clientWidth, h = vue.div.clientHeight;
    const editeur = layer.createAndAddNewEditor({ offsetX: (x ?? 0.5) * w, offsetY: (y ?? 0.5) * h }, x === undefined, { bitmapFile: fichier });
    // Une fois l'image chargée, on lui donne la largeur voulue (en part de la page), au même centre.
    if (editeur && largeur) {
      for (let i = 0; i < 60 && !editeur.width; i++) await attendre(50);
      await attendre(80);
      if (editeur.width) {
        // x, y donnés : le centre voulu (en part de la page) ; sinon, le centre où pdf.js l'a posée.
        const cx = x ?? editeur.x + editeur.width / 2, cy = y ?? editeur.y + editeur.height / 2;
        const hauteur = editeur.height * largeur / editeur.width;
        editeur.width = largeur;
        editeur.height = hauteur;
        editeur.x = cx - largeur / 2;
        editeur.y = cy - hauteur / 2;
        editeur.setDims();
        editeur.fixAndSetPosition();
      }
    }
    if (editeur && description) editeur.altTextData = { altText: description, decorative: false };
    return editeur;
  }
  // Le calque d'annotations d'une page (il n'existe que quand la page est affichée).
  async calqueEdition(page) {
    for (let i = 0; i < 60; i++) {
      const layer = this.ui?.getLayer(page - 1);
      if (layer) return layer;
      if (i === 0) this.vue.currentPageNumber = page;
      await attendre(50);
    }
    throw new Error(`La page ${page} n'est pas prête à être annotée.`);
  }

  // --- Colonne de gauche : miniatures et sommaire ---
  construireCote() {
    this.cote = el('div', { className: 'cote-pdf' });
    const onglets = el('div', { className: 'cote-onglets' });
    this.liste = el('div', { className: 'miniatures-liste' });
    this.arbre = el('div', { className: 'sommaire', hidden: true });
    const choisir = (quoi) => {
      this.liste.hidden = quoi !== 'pages';
      this.arbre.hidden = quoi !== 'sommaire';
      $$('button', onglets).forEach((b) => b.classList.toggle('actif', b.dataset.quoi === quoi));
    };
    for (const [quoi, icone, titre] of [['pages', 'files', 'Pages'], ['sommaire', 'list-tree', 'Sommaire']]) {
      onglets.append(el('button', { className: 'cote-onglet', dataset: { quoi }, onclick: () => choisir(quoi) }, el('i', { className: `codicon codicon-${icone}` }), el('span', { textContent: titre })));
    }
    this.cote.append(onglets, this.liste, this.arbre);
    choisir('pages');

    // Miniatures : un emplacement par page, dessiné seulement quand il devient visible.
    this.pdf.getPage(1).then((p1) => {
      const vp = p1.getViewport({ scale: 1 });
      const ratio = vp.height / vp.width;
      const observateur = new IntersectionObserver((entrees) => {
        for (const e of entrees) if (e.isIntersecting) { observateur.unobserve(e.target); this.dessinerMiniature(e.target); }
      }, { root: this.liste, rootMargin: '400px' });
      for (let i = 1; i <= this.nbPages; i++) {
        const c = el('canvas', { width: 120, height: Math.round(120 * ratio) });
        const b = el('button', { className: 'miniature', title: `Page ${i}`, dataset: { page: i }, onclick: () => { this.vue.currentPageNumber = i; } }, c, el('span', { textContent: i }));
        this.liste.append(b);
        observateur.observe(b);
      }
      this.majPage();
    });

    // Sommaire (les signets du PDF).
    this.pdf.getOutline().then((plan) => {
      this.plan = plan || [];
      const ajouter = (items, niveau) => {
        for (const it of items) {
          this.arbre.append(el('button', {
            className: 'sommaire-item', style: { paddingLeft: `${10 + niveau * 14}px`, fontWeight: it.bold ? '600' : '' }, textContent: it.title, title: it.title,
            onclick: () => (it.dest ? this.liens.goToDestination(it.dest) : it.url && window.open(it.url)),
          }));
          if (it.items?.length) ajouter(it.items, niveau + 1);
        }
      };
      ajouter(this.plan, 0);
      if (!this.plan.length) this.arbre.append(el('p', { className: 'vide-texte', textContent: 'Ce PDF n\'a pas de sommaire.' }));
    });
  }
  async dessinerMiniature(bouton) {
    const n = Number(bouton.dataset.page);
    const page = await this.pdf.getPage(n);
    const canvas = $('canvas', bouton);
    const vp = page.getViewport({ scale: canvas.width / page.getViewport({ scale: 1 }).width * 2 });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise.catch(() => {});
  }

  // --- Mises à jour de l'affichage ---
  majPage() {
    this.numero.input.value = this.page || 1;
    this.numero.total.textContent = `/ ${this.nbPages}`;
    const actuel = $('.miniature.actif', this.liste);
    if (actuel?.dataset.page === String(this.page)) return;
    actuel?.classList.remove('actif');
    const m = $(`.miniature[data-page="${this.page}"]`, this.liste);
    m?.classList.add('actif');
    m?.scrollIntoView({ block: 'nearest' });
  }
  majZoom() {
    const v = this.vue.currentScaleValue;
    const option = [...this.selectZoom.options].find((o) => o.value === String(v));
    if (option && !option.hidden) this.selectZoom.value = option.value;
    else {
      const perso = this.selectZoom.options[this.selectZoom.options.length - 1];
      perso.textContent = `${Math.round(this.vue.currentScale * 100)} %`;
      perso.hidden = false;
      this.selectZoom.value = 'perso';
    }
  }
  majRecherche({ current, total }) {
    this.recherche.compte.textContent = total ? `${current} / ${total}${total >= 1000 ? '+' : ''}` : 'Aucun résultat';
  }
  // Couleurs de lecture : les pages inversées (sombre) ou teintées (sépia). Seul l'affichage change.
  couleurs(lecture) {
    this.racine.classList.toggle('lecture-sombre', lecture === 'sombre');
    this.racine.classList.toggle('lecture-sepia', lecture === 'sepia');
  }

  // --- Ce que l'application demande à chaque lecteur ---
  allerPage(n) {
    const p = Math.round(Number(n));
    if (p >= 1 && p <= this.nbPages) this.vue.currentPageNumber = p;
    else this.majPage();
  }
  zoomer(sens) {
    if (sens > 0) this.vue.increaseScale();
    else if (sens < 0) this.vue.decreaseScale();
    else this.vue.currentScaleValue = 'page-width';
  }
  chercher(texte, { precedent = false, nouveau = true } = {}) {
    if (texte === undefined) return this.recherche.focus();
    if (!texte) { this.recherche.compte.textContent = ''; }
    this.bus.dispatch('find', { source: this, type: nouveau ? '' : 'again', query: texte, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: precedent, matchDiacritics: false });
  }
  clavier(e) {
    if (e.target.closest?.('.annotationLayer, .annotationEditorLayer, input, textarea, select, [contenteditable]')) return false;
    if (e.key === 'Escape' && this.mode && this.mode !== OUTIL.NONE) { this.choisirOutil(OUTIL.NONE); return true; }
    if (e.ctrlKey || e.altKey) return false;
    if (e.key === 'PageDown' || (e.key === 'ArrowRight' && this.vue.scrollMode === ScrollMode.PAGE)) { this.vue.nextPage(); return true; }
    if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && this.vue.scrollMode === ScrollMode.PAGE)) { this.vue.previousPage(); return true; }
    if (e.key === 'Home' && !e.shiftKey) { this.vue.currentPageNumber = 1; return true; }
    if (e.key === 'End' && !e.shiftKey) { this.vue.currentPageNumber = this.nbPages; return true; }
    return false;
  }
  montrer() { requestAnimationFrame(() => { if (this.vue.pdfDocument) this.vue.update(); }); }

  etat() {
    return {
      page: this.page || 1,
      pages: this.nbPages,
      zoom: `${Math.round((this.vue.currentScale || 1) * 100)} %`,
      info: `${formatSize(this.doc.taille)}${this.modifie ? ' · modifié, pas encore enregistré' : ''}`,
    };
  }
  position() {
    return {
      page: this.page || 1,
      zoom: this.vue.currentScaleValue,
      rotation: this.vue.pagesRotation || 0,
      defilement: this.vue.scrollMode,
      doublePage: this.vue.spreadMode !== SpreadMode.NONE,
    };
  }

  // --- Enregistrer ---
  // pdf.js écrit le PDF avec ses annotations et ses champs remplis (mise à jour « incrémentale » :
  // le contenu d'origine reste tel quel, les ajouts sont mis à la suite, comme le fait Acrobat).
  async enregistrer({ sous = false } = {}) {
    this.ui?.commitOrRemove?.();
    // Le texte en cours d'écriture est validé avant d'enregistrer.
    if (this.mode === OUTIL.FREETEXT) { this.vue.annotationEditorMode = { mode: OUTIL.NONE }; await attendre(100); }
    const octets = await this.pdf.saveDocument();
    const info = sous
      ? await window.mimir.enregistrerSous(this.doc.chemin, octets, { titre: 'Enregistrer une copie du PDF', extension: 'pdf' })
      : await window.mimir.enregistrer(this.doc.chemin, octets);
    if (!info) return false;
    if (!sous) { this.doc.taille = info.taille; this.modifie = false; }
    this.ctx.changement();
    notify(sous ? `Copie enregistrée : ${info.nom}` : `${info.nom} est enregistré, avec ses annotations.`, 'success', 3500);
    return info;
  }

  // --- Imprimer ---
  // Chaque page est dessinée (avec les annotations et les champs remplis) en image à 150 points par
  // pouce, puis la fenêtre d'impression de Windows s'ouvre.
  async imprimer() {
    if (this.pdf.isPureXfa) return notify('Ce formulaire XFA ne s\'imprime pas depuis Mímir.', 'warning');
    const n = this.nbPages;
    notify(`Préparation de l'impression (${n} page${n > 1 ? 's' : ''})…`, 'info', 2500);
    const stockage = this.pdf.annotationStorage.print;
    const urls = [];
    for (let i = 1; i <= n; i++) {
      const page = await this.pdf.getPage(i);
      const vp = page.getViewport({ scale: 150 / 72, rotation: (page.rotate + (this.vue.pagesRotation || 0)) % 360 });
      const canvas = el('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: g, viewport: vp, intent: 'print', annotationMode: AnnotationMode.ENABLE_STORAGE, printAnnotationStorage: stockage }).promise;
      urls.push(URL.createObjectURL(await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92))));
    }
    await Impression.images(urls);
    for (const u of urls) URL.revokeObjectURL(u);
  }

  async proprietes() {
    const i = this.metadonnees?.info || {};
    const date = (d) => { const x = lib.PDFDateString.toDateObject(d); return x ? x.toLocaleString('fr') : ''; };
    const p1 = await this.pdf.getPage(1);
    const [w, h] = [p1.view[2] - p1.view[0], p1.view[3] - p1.view[1]].map((v) => Math.round(v / 72 * 25.4));
    const lignes = [
      ['Fichier', this.doc.chemin],
      ['Taille', formatSize(this.doc.taille)],
      ['Titre', i.Title], ['Auteur', i.Author], ['Sujet', i.Subject], ['Mots-clés', i.Keywords],
      ['Créé le', date(i.CreationDate)], ['Modifié le', date(i.ModDate)],
      ['Créé avec', i.Creator], ['Producteur', i.Producer], ['Version PDF', i.PDFFormatVersion],
      ['Pages', `${this.nbPages} (${w} × ${h} mm)`],
      ['Formulaire', this.pdf.isPureXfa ? 'XFA' : ((await this.champsPdf()).length ? 'oui, avec des champs à remplir' : 'non')],
    ].filter(([, v]) => v);
    await Dialogs.form({ title: 'Propriétés du document', okLabel: 'Fermer', cancelLabel: '', width: 560, fields: [{ type: 'info', text: lignes.map(([k, v]) => `${k} : ${v}`).join('\n') }] });
  }

  // --- Pour Claude (claude-actions.js) ---
  infos() {
    const i = this.metadonnees?.info || {};
    return { ...super.infos(), titre: i.Title || undefined, auteur: i.Author || undefined, modifie_pas_enregistre: this.modifie, a_un_sommaire: Boolean(this.plan?.length) };
  }
  async texte({ de = 1, a } = {}) {
    const fin = Math.min(this.nbPages, a || de);
    const out = [];
    for (let n = Math.max(1, de); n <= fin; n++) {
      const page = await this.pdf.getPage(n);
      const contenu = await page.getTextContent();
      const t = contenu.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim();
      out.push(`--- Page ${n} ---\n${t || '(pas de texte : page scannée ou image)'}`);
    }
    return out.join('\n\n');
  }
  async image(n = this.page) {
    const page = await this.pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2, 1100 / base.width) });
    const canvas = el('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp, annotationMode: AnnotationMode.ENABLE_STORAGE }).promise;
    return canvas;
  }
  async chercherTexte(q) {
    const out = [];
    for (let n = 1; n <= this.nbPages && out.length < 40; n++) {
      const t = (await this.texte({ de: n })).replace(/^--- Page \d+ ---\n/, '');
      for (const e of extraits(t, q, 40 - out.length)) out.push({ page: n, extrait: e });
    }
    return out;
  }
  sommaire() {
    const out = [];
    const parcourir = (items, niveau) => { for (const it of items) { out.push({ titre: it.title, niveau }); if (it.items) parcourir(it.items, niveau + 1); } };
    parcourir(this.plan || [], 0);
    return out;
  }
  // pdf.js donne les champs dans une Map (nom → ses « widgets », les zones de la page).
  async champsPdf() {
    const objets = await this.pdf.getFieldObjects();
    return objets instanceof Map ? [...objets] : Object.entries(objets || {});
  }
  // Les champs du formulaire : nom, type, valeur, page.
  async champs() {
    const valeurs = this.pdf.annotationStorage;
    const out = [];
    for (const [nom, tous] of await this.champsPdf()) {
      // Le premier élément est parfois le champ « parent », sans type : on garde les zones de la page.
      const widgets = tous.filter((x) => x.type && x.id);
      const w = widgets[0];
      if (!w || w.type === 'button') continue;
      const stocke = (x) => valeurs.getRawValue(x.id)?.value;
      let valeur;
      if (w.type === 'checkbox') valeur = stocke(w) ?? (w.value !== 'Off' && w.value === w.exportValues);
      else if (w.type === 'radiobutton') valeur = widgets.find((x) => stocke(x) === true || (stocke(x) === undefined && x.value === x.exportValues))?.exportValues ?? '';
      else valeur = stocke(w) ?? w.value ?? '';
      out.push({
        nom,
        type: w.type, // text, checkbox, radiobutton, combobox, listbox, signature
        valeur,
        choix: w.type === 'radiobutton' ? widgets.map((x) => x.exportValues) : w.items?.map((it) => it.displayValue ?? it.exportValue),
        page: (w.page ?? 0) + 1,
        modifiable: w.editable !== false && !w.readOnly,
      });
    }
    return out;
  }
  // Remplir un champ : la valeur va dans le PDF (au prochain enregistrement) et dans la page affichée.
  async remplir(nom, valeur) {
    const widgets = new Map(await this.champsPdf()).get(nom)?.filter((x) => x.type && x.id);
    if (!widgets?.length) throw new Error(`Pas de champ « ${nom} » dans ce PDF.`);
    const stockage = this.pdf.annotationStorage;
    for (const w of widgets) {
      let v;
      if (w.type === 'checkbox') v = { value: valeur === true || valeur === 'true' || valeur === 'oui' || valeur === w.exportValues || valeur === 1 };
      else if (w.type === 'radiobutton') v = { value: String(valeur) === String(w.exportValues) };
      else if (w.type === 'combobox' || w.type === 'listbox') v = { value: Array.isArray(valeur) ? valeur.map(String) : [String(valeur)] };
      else v = { value: String(valeur ?? ''), formattedValue: null };
      stockage.setValue(w.id, v);
      // La page affichée se met à jour aussi.
      for (const champ of $$(`[data-element-id="${w.id}"]`, this.racine)) {
        if (champ.type === 'checkbox' || champ.type === 'radio') champ.checked = v.value;
        else if (champ.tagName === 'SELECT') for (const o of champ.options) o.selected = v.value.includes(o.value) || v.value.includes(o.textContent);
        else champ.value = v.value;
      }
    }
    return widgets[0]?.page !== undefined ? widgets[0].page + 1 : null;
  }
  // Surligner un passage (trouvé dans le texte de la page) avec le surligneur de pdf.js.
  async surligner(texte, { page, couleur } = {}) {
    const pages = page ? [page] : Array.from({ length: this.nbPages }, (_, i) => i + 1);
    for (const n of pages) {
      const t = (await this.texte({ de: n })).toLocaleLowerCase('fr');
      if (!t.includes(texte.toLocaleLowerCase('fr').trim())) continue;
      await this.passerEn(OUTIL.HIGHLIGHT);
      this.vue.currentPageNumber = n;
      const vue = this.vue.getPageView(n - 1);
      let calque = null;
      for (let i = 0; i < 60 && !calque; i++) { calque = vue.textLayer?.div?.childElementCount ? vue.textLayer.div : null; if (!calque) await attendre(50); }
      if (!calque) continue;
      const range = rangeDuTexte(calque, texte);
      if (!range) continue;
      if (couleur) this.parametre(PARAM.HIGHLIGHT_COLOR, SURLIGNAGES[couleur] || couleur);
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      this.ui.highlightSelection('claude');
      return n;
    }
    throw new Error(`Passage introuvable dans le texte du PDF : « ${texte} ». Copie-le exactement (lire_texte), sur une seule ligne si possible.`);
  }
  // Écrire un texte (une note) sur une page. x, y : position en part de la page (0 à 1, depuis le haut à gauche).
  async ecrire(texte, { page = this.page, x = 0.1, y = 0.1, taille = 12, couleur = '#1d1d1f' } = {}) {
    const p = await this.pdf.getPage(page);
    const [x0, y0, x1, y1] = p.view;
    const W = x1 - x0, H = y1 - y0;
    const lignes = String(texte).split('\n');
    const largeur = Math.max(...lignes.map((l) => l.length)) * taille * 0.55 + 8;
    const hauteur = lignes.length * taille * 1.35 + 6;
    const gauche = x0 + x * W, haut = y1 - y * H;
    await this.passerEn(OUTIL.FREETEXT);
    const calque = await this.calqueEdition(page);
    const editeur = await calque.deserialize({
      annotationType: OUTIL.FREETEXT, color: rgb(couleur), fontSize: taille, value: String(texte),
      pageIndex: page - 1, rect: [gauche, haut - hauteur, gauche + largeur, haut], rotation: 0,
      // « copie » : pdf.js remplit alors le texte tout de suite (comme pour un copier-coller).
      isCopy: true,
    });
    if (!editeur) throw new Error('Le texte n\'a pas pu être posé.');
    calque.add(editeur);
    // pdf.js décale un peu les « copies » : on remet le texte exactement où il était demandé.
    editeur.x = x;
    editeur.y = y;
    editeur.fixAndSetPosition();
    return page;
  }
}

// Un « Range » du DOM qui couvre la première occurrence d'un texte dans un calque de texte de pdf.js
// (le texte d'une ligne est souvent découpé en plusieurs morceaux).
function rangeDuTexte(calque, texte) {
  const noeuds = [];
  const walker = document.createTreeWalker(calque, NodeFilter.SHOW_TEXT);
  let tout = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    noeuds.push({ n, debut: tout.length });
    tout += n.nodeValue;
  }
  // Le texte de la page garde sa longueur (chaque espace reste un caractère) pour retrouver les positions.
  const cherche = texte.toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
  const k = tout.toLocaleLowerCase('fr').replace(/\s/g, ' ').indexOf(cherche);
  if (k < 0) return null;
  const fin = k + cherche.length;
  const trouver = (pos) => { const x = noeuds.findLast((e) => e.debut <= pos); return x ? [x.n, Math.min(pos - x.debut, x.n.nodeValue.length)] : null; };
  const a = trouver(k), b = trouver(fin);
  if (!a || !b) return null;
  const r = new Range();
  r.setStart(...a);
  r.setEnd(...b);
  return r;
}

Lecteurs.ajouter('pdf', LecteurPdf);
