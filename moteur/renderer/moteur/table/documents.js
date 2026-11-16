// Saga 1.37 : les documents du MJ (une image, une lettre, une carte, un indice), donnés à un joueur, à
// plusieurs ou à tous. L'état vit dans la partie (table.documents, gardé dans la sauvegarde) :
//
//   { id, titre, texte, image (data: URL ou ''), pour ('tous' | [prénoms], [] = un brouillon), t, donne }
//
// Ici : ce qui est pur (normaliser, qui voit quoi, la vue) et la visionneuse, la même chez le MJ, chez un
// ami (son navigateur) et sur l'écran des joueurs (la télé). Le compagnon (le téléphone) a la sienne.

const TableDocuments = (() => {
  const MAX = 60;
  const MAX_TEXTE = 4000;
  const MAX_IMAGE = 6e6;
  const IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  const texte = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
  function normPour(p) {
    if (p === 'tous') return 'tous';
    if (!Array.isArray(p)) return [];
    const vus = new Set();
    const l = [];
    for (const x of p) {
      const n = texte(x, 24).trim();
      if (n && !vus.has(n.toLowerCase())) { vus.add(n.toLowerCase()); l.push(n); }
    }
    return l.slice(0, 16);
  }
  const imageValide = (v) => typeof v === 'string' && v.length <= MAX_IMAGE && IMAGE.test(v);

  // La liste de la partie (réparée si besoin : une sauvegarde abîmée ne casse rien).
  function liste(table) {
    if (!Array.isArray(table.documents)) table.documents = [];
    table.documents = table.documents.filter((d) => d && typeof d === 'object' && d.id).slice(0, MAX);
    for (const d of table.documents) {
      d.titre = texte(d.titre, 80);
      d.texte = texte(d.texte, MAX_TEXTE);
      if (!imageValide(d.image)) d.image = '';
      d.pour = normPour(d.pour);
    }
    return table.documents;
  }
  const brouillon = (d) => Array.isArray(d.pour) && !d.pour.length;
  function voit(d, nom, mj = false) {
    if (mj || d.pour === 'tous') return true;
    const n = String(nom || '').toLowerCase();
    return Boolean(n) && Array.isArray(d.pour) && d.pour.some((x) => x.toLowerCase() === n);
  }
  const pourTexte = (d) => (d.pour === 'tous' ? 'Tous' : brouillon(d) ? 'Brouillon (personne ne l\'a)' : d.pour.join(', '));

  // Une empreinte courte d'une image (la vue ne porte qu'elle ; l'image passe à part).
  function empreinte(t) {
    if (!t) return '';
    let x = t.length;
    for (let i = 0; i < t.length; i += 997) x = (x * 31 + t.charCodeAt(i)) | 0;
    return `${t.length}-${x >>> 0}`;
  }
  // Ce qu'un joueur reçoit : les documents qu'il a (le MJ : tous, avec à qui), et celui que le MJ montre.
  function vue(table, nom, mj, montre) {
    const l = liste(table).filter((d) => !brouillon(d) || mj).filter((d) => voit(d, nom, mj))
      .map((d) => ({ id: d.id, titre: d.titre, texte: d.texte, image: empreinte(d.image), t: d.donne || d.t || 0, ...(mj ? { pour: d.pour } : {}) }));
    const m = montre && l.some((d) => d.id === montre.id) ? montre : null;
    return { documents: l, ...(m ? { montre: m } : {}) };
  }

  // Ce que fait le MJ (son panneau, son téléphone). a : { type, id, titre, texte, image, pour, montrer }.
  // Rend { ok, doc?, montre? (true : à montrer maintenant), erreur? }.
  function agir(table, a, maintenant = Date.now()) {
    const l = liste(table);
    const d = l.find((x) => x.id === a.id);
    if (a.type === 'doc_nouveau' || a.type === 'doc_modifier') {
      if (a.type === 'doc_nouveau' && l.length >= MAX) return { ok: false, erreur: `${MAX} documents au plus : retire ceux qui ne servent plus.` };
      if (a.type === 'doc_modifier' && !d) return { ok: false, erreur: 'Ce document n\'existe plus.' };
      const image = a.image === '' ? '' : imageValide(a.image) ? a.image : null;
      if (a.image && image == null) return { ok: false, erreur: 'Cette image est trop lourde ou illisible.' };
      const titre = texte(a.titre, 80).trim(), corps = texte(a.texte, MAX_TEXTE).trim();
      const doc = d || { id: `doc-${maintenant.toString(36)}${Math.random().toString(36).slice(2, 6)}`, pour: [], t: maintenant };
      if (a.titre != null || !d) doc.titre = titre || (d ? d.titre : '') || (image || doc.image ? 'Image' : 'Note');
      if (a.texte != null || !d) doc.texte = corps;
      if (image != null) doc.image = image;
      if (!doc.image && !doc.texte && !d) return { ok: false, erreur: 'Une image ou un texte, au moins.' };
      if (!d) l.push(doc);
      if (a.pour != null) { doc.pour = normPour(a.pour); if (!brouillon(doc)) doc.donne = maintenant; }
      return { ok: true, doc, montre: Boolean(a.montrer) && !brouillon(doc) };
    }
    if (!d) return { ok: false, erreur: 'Ce document n\'existe plus.' };
    if (a.type === 'doc_donner') {
      d.pour = normPour(a.pour);
      if (!brouillon(d)) d.donne = maintenant;
      return { ok: true, doc: d, montre: Boolean(a.montrer) && !brouillon(d) };
    }
    if (a.type === 'doc_montrer') {
      // Montrer un brouillon : on le donne à tous.
      if (brouillon(d)) { d.pour = 'tous'; d.donne = maintenant; }
      return { ok: true, doc: d, montre: true };
    }
    if (a.type === 'doc_retirer') {
      table.documents = l.filter((x) => x !== d);
      return { ok: true, doc: d };
    }
    return { ok: false, erreur: 'Je ne sais pas faire ça.' };
  }

  // Une image choisie (un fichier), réduite et en JPEG : légère dans la sauvegarde et sur le réseau.
  function reduire(fichier, cote = 1600, qualite = 0.85) {
    return new Promise((resoudre, rejeter) => {
      const url = URL.createObjectURL(fichier);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, cote / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resoudre(c.toDataURL('image/jpeg', qualite));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rejeter(new Error('image illisible')); };
      img.src = url;
    });
  }

  // --- La visionneuse : le document en grand, par-dessus tout. image : une URL (ou une promesse d'URL). ---
  let ouverte = null;
  function ouvrir(d, { image = '', grand = false, fermable = true, pied = null } = {}) {
    fermer();
    const fond = el('div', { className: `doc-visionneuse${grand ? ' grand' : ''}` });
    const carte = el('div', { className: `doc-carte${d.texte && !d.image ? ' lettre' : ''}` });
    const croix = fermable ? el('button', { type: 'button', className: 'doc-fermer', title: 'Fermer (Échap)' }, el('i', { className: 'codicon codicon-close' })) : null;
    carte.append(el('div', { className: 'doc-tete' }, el('i', { className: `codicon codicon-${d.image ? 'file-media' : 'note'}` }), el('b', { textContent: d.titre || 'Document' }), croix));
    if (d.image) {
      const img = el('img', { className: 'doc-image', alt: d.titre || '' });
      Promise.resolve(image).then((u) => { if (u) img.src = u; }).catch(() => {});
      const cadre = el('div', { className: 'doc-image-cadre', title: 'Molette ou double-clic : zoomer · glisser : se déplacer' }, img);
      carte.append(cadre);
      // Saga 1.37.1 : un vrai zoom (molette, double-clic, pincer, glisser).
      if (typeof ZoomImage !== 'undefined') img.addEventListener('load', () => { if (!cadre.zoom) cadre.zoom = ZoomImage.brancher(cadre, img); });
    }
    if (d.texte) carte.append(el('div', { className: 'doc-texte', textContent: d.texte }));
    if (pied) carte.append(pied);
    fond.append(carte);
    const quitter = () => { if (ouverte?.fond === fond) fermer(); };
    if (croix) croix.onclick = quitter;
    if (fermable) fond.onclick = (e) => { if (e.target === fond) quitter(); };
    document.body.append(fond);
    ouverte = { fond, id: d.id };
    return ouverte;
  }
  function fermer() { ouverte?.fond.remove(); ouverte = null; }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouverte && ouverte.fond.querySelector('.doc-fermer')) { e.stopPropagation(); fermer(); } }, true);

  // Une ligne de liste (le MJ, un ami) : la vignette, le titre, et ce qu'on veut à droite.
  function ligne(d, { image = '', sous = '', boutons = [], ouvrir: faire = null, nouveau = false } = {}) {
    const vignette = el('span', { className: `doc-vignette${d.image ? '' : ' texte'}` });
    if (d.image) { const img = el('img', { alt: '' }); Promise.resolve(image).then((u) => { if (u) img.src = u; }).catch(() => {}); vignette.append(img); } else vignette.append(el('i', { className: 'codicon codicon-note' }));
    const corps = el('div', { className: 'doc-ligne-corps' }, el('b', { textContent: d.titre || 'Document' }), sous ? el('small', { textContent: sous }) : null);
    const l = el('div', { className: `doc-ligne${nouveau ? ' nouveau' : ''}` }, vignette, corps, boutons.length ? el('div', { className: 'doc-actions' }, ...boutons) : null);
    if (faire) { vignette.onclick = faire; corps.onclick = faire; l.classList.add('ouvrable'); }
    return l;
  }

  return { MAX, MAX_TEXTE, liste, normPour, voit, brouillon, pourTexte, empreinte, vue, agir, reduire, ouvrir, fermer, ligne, get ouverte() { return ouverte; } };
})();
if (typeof module !== 'undefined') module.exports = TableDocuments;
