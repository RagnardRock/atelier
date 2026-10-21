// Les sprites des personnages sur la carte (Tafl 0.12).
//
// Un sprite, c'est une planche PNG : 4 rangées (face, gauche, droite, dos : la direction où il
// regarde), et dans chaque rangée quelques images de la même taille. L'image 0 est le personnage
// debout ; les suivantes sont les pas de la marche. Avec 3 images (le plus courant, comme dans
// Pokémon) : debout, pied gauche, pied droit. Voir ../FORMAT.md, « personnages.json ».
//
// Dans les données, un personnage a donc :
//   sprite: { largeur, hauteur, images, planche: "data:image/png;base64,..." }   (ou null)
// largeur × hauteur : la taille d'UNE image, en pixels (souvent 16 × 16 ou 16 × 32).
//
// Ici : lire et écrire ces planches, l'éditeur de sprite de la fiche du personnage (dessiner pixel
// par pixel, importer, miroir, aperçu animé), et une image toute prête pour la carte de Tafl.

const Sprites = (() => {
  const DIRECTIONS = ['bas', 'gauche', 'droite', 'haut'];
  const NOMS = { bas: 'Face', gauche: 'Gauche', droite: 'Droite', haut: 'Dos' };
  const MAX_IMAGES = 8;
  const entier = (v, min, max, defaut) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? clamp(n, min, max) : defaut;
  };

  // Ce qu'on lit dans un fichier : un sprite propre, ou null.
  function norm(s, tileSize = 16) {
    if (!s || typeof s !== 'object' || !/^data:image\/png;base64,/.test(s.planche)) return null;
    return {
      largeur: entier(s.largeur, 1, 256, tileSize),
      hauteur: entier(s.hauteur, 1, 256, tileSize),
      images: entier(s.images, 1, MAX_IMAGES, 3),
      planche: s.planche,
    };
  }

  // --- Les images ---
  // La planche chargée, gardée en mémoire (la carte de Tafl la dessine à chaque image).
  const cache = new Map();
  function charger(planche) {
    if (!cache.has(planche)) {
      const img = new Image();
      const pret = new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Planche du sprite illisible.'));
      });
      img.src = planche;
      cache.set(planche, { img, pret });
      if (cache.size > 64) cache.delete(cache.keys().next().value);
    }
    return cache.get(planche).pret;
  }
  // Pour dessiner tout de suite : l'image si elle est déjà chargée, sinon null (et `ensuite` sera
  // appelé quand elle le sera, pour redessiner).
  function imageSiPrete(planche, ensuite) {
    const c = cache.get(planche);
    if (c?.img.complete && c.img.naturalWidth) return c.img;
    charger(planche).then(() => ensuite?.(), () => {});
    return null;
  }

  const toile = (w, h) => el('canvas', { width: w, height: h });
  // La planche → images[direction][k] (des canvas de largeur × hauteur).
  async function decouper(sprite) {
    const img = await charger(sprite.planche);
    return DIRECTIONS.map((_, r) => Array.from({ length: sprite.images }, (_, k) => {
      const c = toile(sprite.largeur, sprite.hauteur);
      c.getContext('2d').drawImage(img, k * sprite.largeur, r * sprite.hauteur, sprite.largeur, sprite.hauteur, 0, 0, sprite.largeur, sprite.hauteur);
      return c;
    }));
  }
  // images[direction][k] → la planche (data URL).
  function assembler(images, largeur, hauteur) {
    const n = images[0].length;
    const c = toile(largeur * n, hauteur * 4);
    const g = c.getContext('2d');
    images.forEach((rang, r) => rang.forEach((im, k) => g.drawImage(im, k * largeur, r * hauteur)));
    return c.toDataURL('image/png');
  }
  const copie = (im) => { const c = toile(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
  const miroir = (im) => {
    const c = toile(im.width, im.height);
    const g = c.getContext('2d');
    g.translate(im.width, 0);
    g.scale(-1, 1);
    g.drawImage(im, 0, 0);
    return c;
  };
  // Un sprite vide (tout transparent).
  const vide = (largeur, hauteur, images) => ({ largeur, hauteur, images, planche: toile(largeur * images, hauteur * 4).toDataURL('image/png') });

  // Une planche importée : on devine la découpe (4 rangées ; 3 images par rangée si ça tombe juste,
  // sinon 4, 2, ou une seule).
  async function depuisPlanche(png, images = 0) {
    const img = await charger(png);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (h % 4) throw new Error(`La planche fait ${w} × ${h} px : sa hauteur doit se partager en 4 rangées (face, gauche, droite, dos).`);
    const n = images || [3, 4, 2, 1].find((k) => w % k === 0 && w / k <= h / 4 * 2) || 1;
    if (w % n) throw new Error(`La planche fait ${w} px de large : elle ne se partage pas en ${n} images.`);
    // On la recopie en PNG (une planche en JPEG ou GIF devient un PNG).
    const c = toile(w, h);
    c.getContext('2d').drawImage(img, 0, 0);
    return { largeur: w / n, hauteur: h / 4, images: n, planche: c.toDataURL('image/png') };
  }

  // L'image à montrer : debout (0), ou, pendant un pas, l'image de marche du pas.
  // pas = combien de pas il a déjà faits (pour alterner pied gauche / pied droit).
  const imageDeMarche = (images, pas) => (images > 1 ? 1 + (pas % (images - 1)) : 0);

  // --- Pour la carte de Tafl : dessiner le personnage d'un événement, regardant `direction` ---
  // Les pieds en bas de la case, centré ; un sprite plus haut qu'une case dépasse vers le haut.
  function dessinerSurCase(ctx, sprite, direction, px, py, cell, tileSize, ensuite) {
    const img = imageSiPrete(sprite.planche, ensuite);
    if (!img) return false;
    const r = Math.max(0, DIRECTIONS.indexOf(direction));
    const k = cell / tileSize;
    const w = sprite.largeur * k, h = sprite.hauteur * k;
    const lisse = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, r * sprite.hauteur, sprite.largeur, sprite.hauteur, px + (cell - w) / 2, py + cell - h, w, h);
    ctx.imageSmoothingEnabled = lisse;
    return true;
  }

  // --- L'éditeur, dans la fiche du personnage (Jeu › Données du jeu › Personnages) ---
  // p : le personnage (modifié sur place : p.sprite) ; palette : les couleurs du jeu de tuiles ;
  // tuile() : le canvas de sa tuile (ou null), pour partir de lui quand on crée le sprite.
  function editeur(p, { tileSize, palette, change, tuile }) {
    const boite = el('div', { className: 'sprite-editeur' });
    let images = null; // [direction][k] : des canvas
    let dir = 0, k = 0, outil = 'crayon', couleur = palette[0] || '#000000';
    const historique = [];
    let enregistrer = null; // pour regrouper les coups de crayon : on réécrit la planche au lâcher

    function ecrire() {
      p.sprite = { largeur: p.sprite.largeur, hauteur: p.sprite.hauteur, images: images[0].length, planche: assembler(images, p.sprite.largeur, p.sprite.hauteur) };
      change?.();
    }
    function memoriser() {
      historique.push(images.map((rang) => rang.map(copie)));
      if (historique.length > 50) historique.shift();
    }

    async function render() {
      boite.replaceChildren();
      if (!p.sprite) { renderVide(); return; }
      try {
        images = await decouper(p.sprite);
      } catch (err) {
        boite.append(el('p', { className: 'modal-info', textContent: cleanError(err) }));
        return;
      }
      k = Math.min(k, images[0].length - 1);
      renderPlein();
    }

    // Pas encore de sprite : en créer un vide, ou importer une planche.
    function renderVide() {
      const hauteur = el('select');
      hauteur.add(new Option(`${tileSize} × ${tileSize} (une case)`, String(tileSize)));
      hauteur.add(new Option(`${tileSize} × ${tileSize * 2} (une case et la tête au-dessus, comme dans Pokémon)`, String(tileSize * 2)));
      hauteur.value = String(tileSize * 2);
      const nb = el('select');
      for (const n of [1, 2, 3, 4]) nb.add(new Option(n === 1 ? '1 (pas d\'animation)' : n === 3 ? '3 (debout, pied gauche, pied droit)' : String(n), String(n)));
      nb.value = '3';
      const creer = el('button', { className: 'button primary' }, [icon('add'), el('span', { textContent: 'Créer le sprite' })]);
      creer.onclick = () => {
        const h = Number(hauteur.value), m = Number(nb.value);
        // On part de sa tuile, s'il en a une : posée en bas de chaque image (les pieds dans la case).
        const t = tuile?.();
        if (t) {
          const c = toile(tileSize * m, h * 4);
          const g = c.getContext('2d');
          for (let r = 0; r < 4; r++) for (let j = 0; j < m; j++) g.drawImage(t, j * tileSize, r * h + h - tileSize);
          p.sprite = { largeur: tileSize, hauteur: h, images: m, planche: c.toDataURL('image/png') };
        } else p.sprite = vide(tileSize, h, m);
        change?.();
        render();
      };
      const importer = el('button', { className: 'button' }, [icon('folder-opened'), el('span', { textContent: 'Importer une planche…' })]);
      importer.onclick = importerPlanche;
      boite.append(
        el('p', { className: 'modal-info', textContent: 'Le personnage tel qu\'on le voit sur la carte, dans les 4 directions, avec sa marche. Dessine-le ici pixel par pixel, ou importe une planche faite dans Skald ou Photoshop : 4 rangées (face, gauche, droite, dos), et dans chaque rangée l\'image debout puis les pas.' }),
        el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Taille d\'une image' }), hauteur]),
        el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Images par direction' }), nb]),
        el('div', { className: 'sprite-actions' }, [creer, importer]),
      );
    }

    async function importerPlanche() {
      const f = await window.tafl.openFile({ kind: 'image', titre: `Planche du sprite de ${p.nom}` });
      if (!f) return;
      try {
        const png = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error('Image illisible'));
          r.readAsDataURL(new Blob([f.bytes], { type: /\.gif$/i.test(f.name) ? 'image/gif' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.webp$/i.test(f.name) ? 'image/webp' : 'image/png' }));
        });
        if (images) memoriser();
        p.sprite = await depuisPlanche(png);
        change?.();
        notify(`Planche importée : ${p.sprite.images} image(s) de ${p.sprite.largeur} × ${p.sprite.hauteur} px par direction.`);
        render();
      } catch (err) { notify(cleanError(err), 'error'); }
    }

    function renderPlein() {
      boite.replaceChildren();
      const { largeur, hauteur } = p.sprite;
      const n = images[0].length;

      // Les images, rangée par rangée : un clic choisit celle qu'on dessine.
      const grille = el('div', { className: 'sprite-grille', style: `grid-template-columns: auto repeat(${n}, auto)` });
      grille.append(el('span'), ...Array.from({ length: n }, (_, j) => el('span', { className: 'sprite-col', textContent: j === 0 ? 'debout' : `pas ${j}` })));
      DIRECTIONS.forEach((d, r) => {
        grille.append(el('span', { className: 'sprite-rang', textContent: NOMS[d] }));
        images[r].forEach((im, j) => {
          const c = toile(largeur, hauteur);
          c.getContext('2d').drawImage(im, 0, 0);
          const b = el('button', { className: `sprite-case checker${r === dir && j === k ? ' actif' : ''}`, title: `${NOMS[d]}, ${j === 0 ? 'debout' : `pas ${j}`}` }, [c]);
          c.style.width = `${largeur * 2}px`;
          c.style.height = `${hauteur * 2}px`;
          b.onclick = () => { dir = r; k = j; renderPlein(); };
          grille.append(b);
        });
      });

      // La grande image, où l'on dessine.
      const zoom = Math.max(4, Math.floor(320 / Math.max(largeur, hauteur)));
      const grand = toile(largeur * zoom, hauteur * zoom);
      grand.className = 'sprite-grand';
      const g = grand.getContext('2d');
      function dessinerGrand() {
        g.clearRect(0, 0, grand.width, grand.height);
        drawChecker(g, 0, 0, grand.width, grand.height, zoom);
        g.imageSmoothingEnabled = false;
        // En transparence, l'image debout de la même direction : pour caler les pas dessus.
        if (k > 0) {
          g.globalAlpha = 0.22;
          g.drawImage(images[dir][0], 0, 0, grand.width, grand.height);
          g.globalAlpha = 1;
        }
        g.drawImage(images[dir][k], 0, 0, grand.width, grand.height);
        g.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        g.lineWidth = 1;
        g.beginPath();
        for (let x = 1; x < largeur; x++) { g.moveTo(x * zoom + 0.5, 0); g.lineTo(x * zoom + 0.5, grand.height); }
        for (let y = 1; y < hauteur; y++) { g.moveTo(0, y * zoom + 0.5); g.lineTo(grand.width, y * zoom + 0.5); }
        g.stroke();
        // La case du jeu (les pieds sont en bas) : un repère quand le sprite est plus haut qu'une case.
        if (hauteur > tileSize) {
          g.strokeStyle = 'rgba(155, 107, 255, 0.55)';
          g.setLineDash([6, 4]);
          g.strokeRect(0.5, (hauteur - tileSize) * zoom + 0.5, Math.min(largeur, tileSize) * zoom - 1, tileSize * zoom - 1);
          g.setLineDash([]);
        }
      }
      dessinerGrand();

      const pixel = (e) => {
        const r = grand.getBoundingClientRect();
        return [Math.floor((e.clientX - r.left) / r.width * largeur), Math.floor((e.clientY - r.top) / r.height * hauteur)];
      };
      const im = () => images[dir][k];
      function poser(x, y, efface) {
        if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return;
        const c = im().getContext('2d');
        if (efface) c.clearRect(x, y, 1, 1);
        else { c.fillStyle = couleur; c.fillRect(x, y, 1, 1); }
      }
      function remplir(x, y, efface) {
        const c = im().getContext('2d');
        const d = c.getImageData(0, 0, largeur, hauteur);
        const at = (i, j) => (j * largeur + i) * 4;
        const cible = d.data.slice(at(x, y), at(x, y) + 4).join();
        const [r0, g0, b0] = hexToRgba(couleur);
        const nouvelle = efface ? [0, 0, 0, 0] : [r0, g0, b0, 255];
        if (cible === nouvelle.join()) return;
        const pile = [[x, y]];
        while (pile.length) {
          const [i, j] = pile.pop();
          if (i < 0 || j < 0 || i >= largeur || j >= hauteur) continue;
          const a = at(i, j);
          if (d.data.slice(a, a + 4).join() !== cible) continue;
          d.data.set(nouvelle, a);
          pile.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
        }
        c.putImageData(d, 0, 0);
      }
      function pipette(x, y) {
        const [r, gg, b, a] = im().getContext('2d').getImageData(x, y, 1, 1).data;
        if (a) { couleur = rgbaToHex(r, gg, b).slice(0, 7); majCouleurs(); }
        outil = 'crayon';
        majOutils();
      }
      let trace = null; // { efface, dernier: [x, y] }
      grand.oncontextmenu = (e) => e.preventDefault();
      grand.onpointerdown = (e) => {
        const [x, y] = pixel(e);
        const efface = e.button === 2 || outil === 'gomme';
        if (outil === 'pipette' || e.altKey) { pipette(x, y); return; }
        memoriser();
        if (outil === 'seau') { remplir(x, y, efface); dessinerGrand(); finir(); return; }
        grand.setPointerCapture(e.pointerId);
        trace = { efface, dernier: [x, y] };
        poser(x, y, efface);
        dessinerGrand();
      };
      grand.onpointermove = (e) => {
        if (!trace) return;
        const [x, y] = pixel(e);
        // Une ligne depuis le dernier pixel, pour ne pas laisser de trous quand on va vite.
        const [x0, y0] = trace.dernier;
        const pas = Math.max(Math.abs(x - x0), Math.abs(y - y0), 1);
        for (let s = 1; s <= pas; s++) poser(Math.round(x0 + (x - x0) * s / pas), Math.round(y0 + (y - y0) * s / pas), trace.efface);
        trace.dernier = [x, y];
        dessinerGrand();
      };
      grand.onpointerup = () => { if (trace) { trace = null; finir(); } };
      // Après un coup de crayon : la planche est réécrite, et les vignettes suivent.
      function finir() {
        clearTimeout(enregistrer);
        enregistrer = setTimeout(() => { ecrire(); renderPlein(); }, 0);
      }

      // Les outils et les couleurs.
      const outils = el('div', { className: 'sprite-outils' });
      const OUTILS = [['crayon', 'edit', 'Crayon (clic droit : gomme)'], ['gomme', 'eraser', 'Gomme'], ['seau', 'paintcan', 'Remplir'], ['pipette', 'symbol-color', 'Pipette (ou Alt + clic)']];
      function majOutils() {
        outils.replaceChildren(...OUTILS.map(([id, ic, titre]) => {
          const b = el('button', { className: `icon-button${outil === id ? ' actif' : ''}`, title: titre }, [icon(ic)]);
          b.onclick = (e) => { e.preventDefault(); outil = id; majOutils(); };
          return b;
        }));
      }
      majOutils();
      const couleurs = el('div', { className: 'sprite-couleurs' });
      const choix = el('input', { type: 'color', value: couleur, title: 'Une autre couleur' });
      choix.oninput = () => { couleur = choix.value; majCouleurs(); };
      function majCouleurs() {
        choix.value = couleur;
        couleurs.replaceChildren(...palette.map((c) => {
          const b = el('button', { className: `sprite-couleur${c.toLowerCase() === couleur.toLowerCase() ? ' actif' : ''}`, title: c, style: `background: ${c}` });
          b.onclick = (e) => { e.preventDefault(); couleur = c; if (outil === 'gomme' || outil === 'pipette') outil = 'crayon'; majOutils(); majCouleurs(); };
          return b;
        }), choix);
      }
      majCouleurs();

      // Ce qu'on fait sur l'image choisie, ou sur tout le sprite.
      const bouton = (ic, texte, run) => {
        const b = el('button', { className: 'button' }, [icon(ic), el('span', { textContent: texte })]);
        b.onclick = (e) => { e.preventDefault(); run(); };
        return b;
      };
      const actions = el('div', { className: 'sprite-actions' }, [
        bouton('discard', 'Annuler', () => {
          const h = historique.pop();
          if (!h) { notify('Rien à annuler dans le sprite.'); return; }
          images = h;
          ecrire();
          renderPlein();
        }),
        bouton('copy', 'Copier l\'image debout ici', () => {
          if (k === 0) { notify('C\'est déjà l\'image debout.'); return; }
          memoriser();
          images[dir][k] = copie(images[dir][0]);
          ecrire();
          renderPlein();
        }),
        bouton('arrow-swap', 'Droite = Gauche en miroir', () => {
          memoriser();
          const [g0, d0] = [DIRECTIONS.indexOf('gauche'), DIRECTIONS.indexOf('droite')];
          images[d0] = images[g0].map(miroir);
          ecrire();
          renderPlein();
        }),
        bouton('clear-all', 'Effacer cette image', () => {
          memoriser();
          images[dir][k] = toile(largeur, hauteur);
          ecrire();
          renderPlein();
        }),
      ]);

      // Le nombre d'images par direction (on ajoute des copies de l'image debout, ou on retire la fin).
      const nb = el('select', { title: 'Images par direction' });
      for (let j = 1; j <= MAX_IMAGES; j++) nb.add(new Option(`${j} image${j > 1 ? 's' : ''} par direction`, String(j)));
      nb.value = String(n);
      nb.onchange = () => {
        memoriser();
        const m = Number(nb.value);
        images = images.map((rang) => (m <= rang.length ? rang.slice(0, m) : [...rang, ...Array.from({ length: m - rang.length }, () => copie(rang[0]))]));
        ecrire();
        render();
      };
      const fichier = el('div', { className: 'sprite-actions' }, [
        el('span', { className: 'unit', textContent: `${largeur} × ${hauteur} px` }),
        nb,
        bouton('folder-opened', 'Importer une planche…', importerPlanche),
        bouton('desktop-download', 'Exporter la planche…', async () => {
          const path = await window.tafl.saveDialog({ defaultName: `${p.id}-sprite.png`, format: 'png' });
          if (!path) return;
          const c = toile(largeur * n, hauteur * 4);
          c.getContext('2d').drawImage(await charger(p.sprite.planche), 0, 0);
          const ok = await window.tafl.writeFile(path, await IO.canvasBytes(c));
          if (ok !== false) notify('Planche exportée : retouche-la dans Skald ou Photoshop, puis réimporte-la.');
        }),
        bouton('trash', 'Retirer le sprite', async () => {
          const go = await Dialogs.ask('Retirer le sprite', `Retirer le sprite de ${p.nom} ? Sur la carte, il reprendra sa tuile (ou le petit bonhomme de Saga).`, [
            { label: 'Annuler', value: false },
            { label: 'Retirer', value: true, primary: true },
          ]);
          if (!go) return;
          p.sprite = null;
          images = null;
          change?.();
          render();
        }),
      ]);

      // L'aperçu : il marche dans la direction choisie, comme dans le jeu.
      const apercu = toile(largeur * 3, hauteur * 3);
      apercu.className = 'sprite-apercu checker';
      const ga = apercu.getContext('2d');
      ga.imageSmoothingEnabled = false;
      let t0 = performance.now();
      const animer = (t) => {
        if (!apercu.isConnected) return;
        // Un pas toutes les 260 ms : la première moitié sur l'image du pas, la seconde debout.
        const pas = Math.floor((t - t0) / 260);
        const moitie = ((t - t0) % 260) < 130;
        const j = moitie ? imageDeMarche(n, pas) : 0;
        ga.clearRect(0, 0, apercu.width, apercu.height);
        ga.drawImage(images[dir][j], 0, 0, apercu.width, apercu.height);
        requestAnimationFrame(animer);
      };
      requestAnimationFrame((t) => { t0 = t; animer(t); });

      boite.append(
        fichier,
        el('div', { className: 'sprite-corps' }, [
          el('div', { className: 'sprite-gauche' }, [grille, el('div', { className: 'sprite-apercu-boite' }, [apercu, el('span', { className: 'unit', textContent: `${NOMS[DIRECTIONS[dir]]} : la marche` })])]),
          el('div', { className: 'sprite-droite' }, [el('div', { className: 'sprite-barre' }, [outils, couleurs]), grand, actions]),
        ]),
        el('p', { className: 'modal-info', textContent: 'Clic : dessiner · clic droit : gommer · Alt + clic : prendre une couleur. Sur les pas, l\'image debout apparaît en transparence pour caler le personnage. Le cadre violet, c\'est la case du jeu : les pieds vont dedans.' }),
      );
    }

    render();
    return boite;
  }

  return { DIRECTIONS, NOMS, norm, charger, decouper, assembler, vide, depuisPlanche, imageDeMarche, dessinerSurCase, editeur, miroir, copie };
})();
