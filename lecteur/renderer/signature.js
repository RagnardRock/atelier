// La fenêtre « Signer » : tu choisis une signature déjà enregistrée, ou tu en fais une nouvelle,
// de trois façons :
// - Dessiner : à la souris, au pavé tactile ou au stylet (le trait s'affine avec la pression du stylet) ;
// - Taper : ton nom, écrit dans une police manuscrite (Great Vibes ou Caveat, incluses dans Mímir) ;
// - Image : une photo ou un scan de ta signature ; le fond blanc est retiré tout seul.
// Le résultat est une image PNG transparente, recadrée au plus près, que le lecteur PDF pose sur la
// page (on la déplace et on la redimensionne ensuite à la souris).
// Les signatures gardées vivent dans les réglages de Mímir (config.json › signatures), sur ton PC.

const Signature = (() => {
  const LARGEUR = 640, HAUTEUR = 220;
  const ENCRES = [['#1d1d1f', 'Noir'], ['#1f3fbf', 'Bleu'], ['#0b5d3b', 'Vert']];

  // Rogner les bords transparents, avec une petite marge.
  function rogner(canvas, marge = 6) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - marge); y0 = Math.max(0, y0 - marge); x1 = Math.min(w - 1, x1 + marge); y1 = Math.min(h - 1, y1 + marge);
    const out = el('canvas', { width: x1 - x0 + 1, height: y1 - y0 + 1 });
    out.getContext('2d').drawImage(canvas, -x0, -y0);
    return out;
  }
  const versBlob = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));
  const versDataUrl = (canvas) => canvas.toDataURL('image/png');
  async function blobDe(dataUrl) { return (await fetch(dataUrl)).blob(); }

  // --- Dessiner ---
  function zoneDessin(etat) {
    const canvas = el('canvas', { className: 'signature-toile', width: LARGEUR * 2, height: HAUTEUR * 2 });
    const g = canvas.getContext('2d');
    g.scale(2, 2);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    let precedent = null;
    const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * LARGEUR / r.width, y: (e.clientY - r.top) * HAUTEUR / r.height, p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5 }; };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); precedent = point(e); etat.vide = false; });
    canvas.addEventListener('pointermove', (e) => {
      if (!precedent) return;
      // Les événements groupés par le navigateur (stylet rapide) donnent un trait plus fidèle.
      for (const ev of e.getCoalescedEvents?.() || [e]) {
        const p = point(ev);
        g.strokeStyle = etat.encre;
        g.lineWidth = 1.2 + p.p * 3.2;
        g.beginPath();
        g.moveTo(precedent.x, precedent.y);
        g.quadraticCurveTo(precedent.x, precedent.y, (precedent.x + p.x) / 2, (precedent.y + p.y) / 2);
        g.lineTo(p.x, p.y);
        g.stroke();
        precedent = p;
      }
    });
    const fin = () => { precedent = null; };
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    const effacer = () => { g.clearRect(0, 0, LARGEUR, HAUTEUR); etat.vide = true; };
    return { element: el('div', { className: 'signature-cadre' }, canvas, el('span', { className: 'signature-ligne' }), el('span', { className: 'signature-aide', textContent: 'Signe ici' })), canvas, effacer };
  }

  // --- Taper ---
  function zoneTexte(etat, nomParDefaut) {
    const input = el('input', { type: 'text', className: 'signature-nom', value: nomParDefaut, placeholder: 'Ton nom', spellcheck: false });
    const police = el('select', {}, new Option('Great Vibes (élégante)', 'Great Vibes'), new Option('Caveat (écriture à la main)', 'Caveat'));
    const apercu = el('canvas', { className: 'signature-toile', width: LARGEUR * 2, height: HAUTEUR * 2 });
    const dessiner = async () => {
      await document.fonts.load(`64px "${police.value}"`).catch(() => {});
      const g = apercu.getContext('2d');
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, LARGEUR, HAUTEUR);
      g.fillStyle = etat.encre;
      let taille = police.value === 'Caveat' ? 84 : 92;
      g.font = `${taille}px "${police.value}"`;
      while (g.measureText(input.value).width > LARGEUR - 40 && taille > 20) { taille -= 4; g.font = `${taille}px "${police.value}"`; }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(input.value, LARGEUR / 2, HAUTEUR / 2 + 6);
    };
    input.addEventListener('input', dessiner);
    police.addEventListener('change', dessiner);
    return { element: el('div', { className: 'signature-taper' }, el('div', { className: 'field' }, el('span', { className: 'field-label', textContent: 'Nom' }), input), el('div', { className: 'field' }, el('span', { className: 'field-label', textContent: 'Écriture' }), police), el('div', { className: 'signature-cadre' }, apercu, el('span', { className: 'signature-ligne' }))), canvas: apercu, dessiner, input };
  }

  // --- Image ---
  function zoneImage(etat) {
    const apercu = el('canvas', { className: 'signature-toile', width: LARGEUR * 2, height: HAUTEUR * 2 });
    const choisir = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const seuil = el('input', { type: 'range', min: 120, max: 250, value: 205, title: 'Ce qui est plus clair que ce seuil devient transparent' });
    let image = null;
    const dessiner = () => {
      const g = apercu.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, apercu.width, apercu.height);
      if (!image) return;
      const s = Math.min(apercu.width / image.width, apercu.height / image.height, 1) * 0.94;
      const w = image.width * s, h = image.height * s;
      g.drawImage(image, (apercu.width - w) / 2, (apercu.height - h) / 2, w, h);
      // Retirer le fond : les pixels clairs deviennent transparents, les autres prennent la couleur de l'encre.
      const data = g.getImageData(0, 0, apercu.width, apercu.height);
      const d = data.data, s0 = Number(seuil.value);
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum >= s0) d[i + 3] = 0;
        else d[i + 3] = Math.min(255, d[i + 3] * Math.min(1, (s0 - lum) / 40));
      }
      g.putImageData(data, 0, 0);
      etat.vide = false;
    };
    choisir.addEventListener('change', async () => {
      const f = choisir.files[0];
      if (!f) return;
      image = await createImageBitmap(f);
      dessiner();
    });
    seuil.addEventListener('input', dessiner);
    const bouton = el('button', { type: 'button', className: 'button', onclick: () => choisir.click() }, el('i', { className: 'codicon codicon-folder-opened' }), el('span', { textContent: 'Choisir une image…' }));
    return {
      element: el('div', { className: 'signature-image' }, el('div', { className: 'field' }, bouton, el('span', { className: 'option-libelle', textContent: 'Fond retiré' }), seuil, choisir), el('div', { className: 'signature-cadre damier' }, apercu)),
      canvas: apercu,
      aUneImage: () => Boolean(image),
    };
  }

  // Ouvre la fenêtre. Renvoie l'image PNG (Blob) de la signature à poser, ou null.
  async function choisir() {
    const config = App.config();
    const gardees = [...(config.signatures || [])];
    const etat = { mode: gardees.length ? 'gardees' : 'dessiner', encre: ENCRES[0][0], vide: true, choisie: null };

    const contenu = el('div', { className: 'signature' });
    const onglets = el('div', { className: 'signature-onglets' });
    const panneaux = el('div', { className: 'signature-panneaux' });
    const dessin = zoneDessin(etat);
    const texte = zoneTexte(etat, config.auteur || '');
    const image = zoneImage(etat);

    const liste = el('div', { className: 'signature-gardees' });
    const remplirListe = () => {
      liste.innerHTML = '';
      if (!gardees.length) liste.append(el('p', { className: 'vide-texte', textContent: 'Aucune signature gardée pour l\'instant.' }));
      gardees.forEach((s, i) => {
        const carte = el('button', { type: 'button', className: `signature-carte${etat.choisie === i ? ' actif' : ''}`, title: 'Choisir cette signature (double-clic : la poser)', onclick: () => { etat.choisie = i; remplirListe(); }, ondblclick: () => { etat.choisie = i; form?.requestSubmit(); } },
          el('img', { src: s.png, alt: '' }),
          el('span', { className: 'signature-suppr', title: 'Oublier cette signature', onclick: async (e) => {
            e.stopPropagation();
            gardees.splice(i, 1);
            if (etat.choisie === i) etat.choisie = null;
            await App.ecrireConfig({ signatures: gardees });
            remplirListe();
          } }, el('i', { className: 'codicon codicon-trash' })));
        liste.append(carte);
      });
    };
    if (gardees.length) etat.choisie = 0;
    remplirListe();

    const pages = { gardees: liste, dessiner: dessin.element, taper: texte.element, image: image.element };
    const libelles = { gardees: ['bookmark', 'Mes signatures'], dessiner: ['edit', 'Dessiner'], taper: ['whole-word', 'Taper'], image: ['file-media', 'Image'] };
    const encres = el('div', { className: 'signature-encres' }, el('span', { className: 'option-libelle', textContent: 'Encre' }));
    for (const [c, nom] of ENCRES) {
      encres.append(el('button', { type: 'button', className: `pastille${c === etat.encre ? ' actif' : ''}`, title: nom, style: { background: c }, onclick: (e) => {
        etat.encre = c;
        $$('.pastille', encres).forEach((p) => p.classList.remove('actif'));
        e.currentTarget.classList.add('actif');
        texte.dessiner();
      } }));
    }
    const effacer = el('button', { type: 'button', className: 'button small', onclick: () => dessin.effacer() }, el('i', { className: 'codicon codicon-clear-all' }), el('span', { textContent: 'Effacer' }));
    const garder = el('label', { className: 'signature-garder' }, el('input', { type: 'checkbox', checked: true }), el('span', { textContent: 'Garder cette signature pour la prochaine fois' }));
    const montrer = (mode) => {
      etat.mode = mode;
      for (const [m, p] of Object.entries(pages)) p.hidden = m !== mode;
      $$('button', onglets).forEach((b) => b.classList.toggle('actif', b.dataset.mode === mode));
      encres.hidden = mode === 'gardees' || mode === 'image';
      effacer.hidden = mode !== 'dessiner';
      garder.hidden = mode === 'gardees';
      if (mode === 'taper') { texte.dessiner(); setTimeout(() => texte.input.focus()); }
    };
    for (const m of Object.keys(pages)) onglets.append(el('button', { type: 'button', className: 'signature-onglet', dataset: { mode: m }, onclick: () => montrer(m) }, el('i', { className: `codicon codicon-${libelles[m][0]}` }), el('span', { textContent: libelles[m][1] })));
    panneaux.append(...Object.values(pages));
    contenu.append(onglets, panneaux, el('div', { className: 'signature-pied' }, encres, effacer, el('span', { className: 'spacer' }), garder));

    let form = null;
    setTimeout(() => { form = contenu.closest('form'); montrer(etat.mode); });
    const ok = await Dialogs.form({ title: 'Signer', okLabel: 'Placer sur la page', width: 720, fields: [{ type: 'element', element: contenu }] });
    if (!ok) return null;

    if (etat.mode === 'gardees') {
      if (etat.choisie === null || !gardees[etat.choisie]) { notify('Choisis une signature, ou fais-en une nouvelle.', 'info'); return choisir(); }
      return blobDe(gardees[etat.choisie].png);
    }
    const source = { dessiner: dessin.canvas, taper: texte.canvas, image: image.canvas }[etat.mode];
    if (etat.mode === 'taper' && !texte.input.value.trim()) { notify('Tape d\'abord ton nom.', 'info'); return choisir(); }
    if (etat.mode === 'image' && !image.aUneImage()) { notify('Choisis d\'abord une image de ta signature.', 'info'); return choisir(); }
    const finale = rogner(source);
    if (!finale) { notify('La signature est vide : dessine-la d\'abord.', 'info'); return choisir(); }
    if ($('input', garder).checked) {
      gardees.unshift({ png: versDataUrl(finale), creee: Date.now() });
      await App.ecrireConfig({ signatures: gardees.slice(0, 8), ...(etat.mode === 'taper' && !config.auteur ? { auteur: texte.input.value.trim() } : {}) });
    }
    return versBlob(finale);
  }

  return { choisir };
})();
