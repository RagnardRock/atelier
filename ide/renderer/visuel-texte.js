// Mode visuel de l'aperçu : retrouver dans le texte d'une page l'élément cliqué dans l'aperçu, et
// calculer les retouches (déplacer une section, insérer un bloc à un endroit précis).
// Fonctions pures (texte en entrée, retouches en sortie), testées dans verif/essais.
//
// Le serveur de l'aperçu (../preview.js) marque chaque balise de la page servie avec data-rune="N",
// N étant la position de la balise dans le texte (fichier enregistré ou brouillon en cours de
// frappe). Le fichier lui-même n'est jamais modifié par ces marques.

const VisuelTexte = (() => {
  // dans l'interface, BifrostFlags est chargé juste avant ; côté Node (serveur de l'aperçu), on le demande
  const BF = typeof BifrostFlags !== 'undefined' ? BifrostFlags : require('./bifrost-flags').BifrostFlags;

  // Toutes les balises, avec la fin de l'élément entier (après sa balise fermante).
  function elements(html) {
    return BF.balises(html).map((b) => {
      let finEl = b.fin;
      if (b.ferme !== undefined && b.ferme > b.fin) {
        const fermante = `</${b.tag}`;
        finEl = html.slice(b.ferme, b.ferme + fermante.length).toLowerCase() === fermante ? html.indexOf('>', b.ferme) + 1 || html.length : b.ferme;
      } else if (b.ferme === undefined) finEl = b.fin; // jamais fermée : on s'en tient à la balise ouvrante
      return { tag: b.tag, attrs: b.attrs, debut: b.debut, fin: b.fin, finEl, ligne: b.ligne, col: b.col };
    });
  }

  // La page servie dans l'aperçu : chaque balise reçoit data-rune="<position dans le texte>".
  function annoter(html) {
    let res = '';
    let pos = 0;
    for (const b of BF.balises(html)) {
      const i = b.debut + 1 + b.tag.length;
      res += `${html.slice(pos, i)} data-rune="${b.debut}"`;
      pos = i;
    }
    return res + html.slice(pos);
  }

  // L'élément qui commence à cette position, s'il a bien ce nom de balise (sinon le texte a changé).
  function trouver(html, debut, tag) {
    const e = elements(html).find((x) => x.debut === Number(debut));
    return e && (!tag || e.tag === String(tag).toLowerCase()) ? e : null;
  }

  const debutLigne = (html, i) => html.lastIndexOf('\n', i - 1) + 1;
  const finLigne = (html, i) => { const n = html.indexOf('\n', i); return n < 0 ? html.length : n; };
  const blanc = (s) => /^[ \t]*$/.test(s);

  // Indentation de la ligne où commence la position.
  function indentation(html, i) {
    return /^[ \t]*/.exec(html.slice(debutLigne(html, i), i))[0];
  }

  // L'élément occupe-t-il ses lignes à lui seul (rien d'autre avant ni après sur ces lignes) ?
  function seul(html, e) {
    return blanc(html.slice(debutLigne(html, e.debut), e.debut)) && blanc(html.slice(e.finEl, finLigne(html, e.finEl)));
  }

  // Ce qu'il faut retirer pour enlever l'élément : ses lignes entières s'il est seul dessus.
  function plage(html, e) {
    if (!seul(html, e)) return { debut: e.debut, fin: e.finEl };
    const f = finLigne(html, e.finEl);
    return { debut: debutLigne(html, e.debut), fin: f < html.length ? f + 1 : f };
  }

  // Ré-indente un morceau écrit avec l'indentation « de » pour qu'il ait l'indentation « vers ».
  function reindenter(texte, de, vers) {
    return texte.split('\n').map((l, i) => (i === 0 ? l : l.startsWith(de) ? vers + l.slice(de.length) : l)).join('\n');
  }

  // Où et comment insérer un morceau avant / après l'élément e.
  // → { offset, avant, apres, indent } : on insère avant + morceau (indenté) + apres à offset.
  function place(html, e, apres) {
    const indent = indentation(html, e.debut);
    if (!seul(html, e)) return { offset: apres ? e.finEl : e.debut, avant: '', apres: '', indent };
    if (apres) return { offset: finLigne(html, e.finEl), avant: `\n${indent}`, apres: '', indent };
    return { offset: debutLigne(html, e.debut), avant: indent, apres: '\n', indent };
  }

  // Déplace l'élément qui commence à « de » avant (ou après) celui qui commence à « vers ».
  // → liste de retouches { debut, fin, texte } (sans chevauchement), ou null si rien à faire / impossible.
  function deplacer(html, de, vers, apres) {
    const els = elements(html);
    const a = els.find((x) => x.debut === Number(de));
    const b = els.find((x) => x.debut === Number(vers));
    if (!a || !b || a === b) return null;
    if (b.debut >= a.debut && b.debut < a.finEl) return null; // dans lui-même
    const p = place(html, b, apres);
    const r = plage(html, a);
    if (p.offset >= r.debut && p.offset <= r.fin) return null; // il est déjà là
    const morceau = reindenter(html.slice(a.debut, a.finEl), indentation(html, a.debut), p.indent);
    const retouches = [
      { debut: r.debut, fin: r.fin, texte: '' },
      { debut: p.offset, fin: p.offset, texte: p.avant + morceau + p.apres },
    ].sort((x, y) => x.debut - y.debut);
    return appliquer(html, retouches) === html ? null : retouches;
  }

  // Applique des retouches (pour les essais ; l'éditeur les applique lui-même, avec Ctrl+Z).
  function appliquer(html, retouches) {
    let res = html;
    for (const r of [...retouches].sort((x, y) => y.debut - x.debut)) res = res.slice(0, r.debut) + r.texte + res.slice(r.fin);
    return res;
  }

  return { elements, annoter, trouver, indentation, seul, plage, place, deplacer, appliquer, reindenter };
})();

if (typeof module !== 'undefined') module.exports = { VisuelTexte };
