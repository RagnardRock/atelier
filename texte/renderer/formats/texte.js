// Les formats « texte » : Markdown (.md), page web (.html) et texte brut (.txt).
//
// - Markdown : lu avec marked (titres #, **gras**, listes, tableaux |…|), écrit avec turndown.
//   Il ne garde ni les couleurs, ni les polices, ni l'alignement (Edda prévient). Les images, vidéos
//   et sons sont rangés dans « <document>-medias/ » à côté du fichier.
// - HTML : une page complète et autonome (styles compris), lisible dans n'importe quel navigateur.
//   Les médias sont rangés à côté, comme pour le Markdown.
// - Texte brut : chaque ligne devient un paragraphe ; à l'enregistrement, seule la mise en forme
//   « visible en texte » reste (puces « - », numéros, colonnes de tableau séparées par des tabulations).

(() => {
  // ======================================================================
  // Markdown
  // ======================================================================
  function lireMarkdown(bytes, ctx) {
    const { texte } = decoderTexte(bytes);
    // Un saut de page écrit par Edda : <div class="saut-page"></div> (gardé tel quel par marked).
    const html = marked.parse(texte.replace(/\r\n?/g, '\n'), { gfm: true, breaks: false });
    return { html, alertes: [] };
  }

  let turndown = null;
  function convertisseur() {
    if (turndown) return turndown;
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**', hr: '---' });
    turndown.addRule('barre', { filter: ['s', 'del', 'strike'], replacement: (c) => `~~${c}~~` });
    turndown.addRule('saut', { filter: (n) => n.nodeName === 'HR' && n.classList.contains('saut-page'), replacement: () => '\n\n<div class="saut-page"></div>\n\n' });
    turndown.addRule('tab', { filter: (n) => n.nodeName === 'SPAN' && n.classList.contains('tab'), replacement: () => '\t' });
    // Vidéo, son : le Markdown n'en a pas, on écrit la balise HTML (lue par la plupart des visionneuses).
    turndown.addRule('media', {
      filter: ['video', 'audio'],
      replacement: (_c, n) => `\n\n<${n.nodeName.toLowerCase()} controls src="${n.getAttribute('src')}"></${n.nodeName.toLowerCase()}>\n\n`,
    });
    turndown.addRule('image', {
      filter: 'img',
      replacement: (_c, n) => {
        const w = Unites.lire(n.style.width);
        const src = n.getAttribute('src') || '';
        // Une image redimensionnée : <img width>, sinon la syntaxe Markdown classique.
        return w ? `<img src="${src}" width="${Math.round(w)}" alt="${escapeHtml(n.getAttribute('alt') || '')}">` : `![${(n.getAttribute('alt') || '').replace(/[[\]]/g, '')}](${src.replace(/ /g, '%20')})`;
      },
    });
    turndown.keep(['u', 'sub', 'sup', 'mark']);
    // Un paragraphe seul dans un élément de liste : pas de ligne vide autour (liste « serrée »).
    turndown.addRule('paraListe', { filter: (n) => n.nodeName === 'P' && n.parentNode?.nodeName === 'LI', replacement: (c, n) => (n.nextElementSibling?.nodeName === 'P' ? `${c}\n\n` : `${c}\n`) });
    turndown.addRule('elementListe', {
      filter: 'li',
      replacement: (c, n) => {
        const parent = n.parentNode;
        const prefixe = parent.nodeName === 'OL' ? `${(Number(parent.getAttribute('start')) || 1) + [...parent.children].indexOf(n)}. ` : '- ';
        const corps = c.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(prefixe.length)}`).replace(/ +$/, '');
        return prefixe + corps + (n.nextSibling && !/\n$/.test(corps) ? '\n' : '');
      },
    });
    // Tableaux GFM : | a | b |, avec la ligne |---| sous la première ligne. Une cellule fusionnée
    // n'existe pas en Markdown : les cases qu'elle couvrait restent vides.
    turndown.addRule('table', {
      filter: 'table',
      replacement: (_c, n) => {
        const grille = [];
        [...n.rows].forEach((tr, r) => {
          grille[r] = grille[r] || [];
          let c = 0;
          for (const td of tr.cells) {
            while (grille[r][c] !== undefined) c++;
            const texte = convertisseur().turndown(td.innerHTML).replace(/\n+/g, ' <br> ').replace(/\|/g, '\\|').trim();
            for (let dr = 0; dr < (td.rowSpan || 1); dr++) for (let dc = 0; dc < (td.colSpan || 1); dc++) {
              grille[r + dr] = grille[r + dr] || [];
              grille[r + dr][c + dc] = dr === 0 && dc === 0 ? texte : '';
            }
            c += td.colSpan || 1;
          }
        });
        const colonnes = Math.max(...grille.map((l) => l.length));
        const ligne = (l) => `| ${Array.from({ length: colonnes }, (_, k) => l[k] ?? '').join(' | ')} |`;
        return `\n\n${[ligne(grille[0] || []), `|${' --- |'.repeat(colonnes)}`, ...grille.slice(1, n.rows.length).map(ligne)].join('\n')}\n\n`;
      },
    });
    return turndown;
  }

  async function ecrireMarkdown(ctx) {
    const alertes = new Set();
    const page = await avecMediasRanges(ctx, alertes);
    if (perdu(page)) alertes.add('Le Markdown ne garde pas les couleurs, les polices, les tailles ni l\'alignement : enregistre en .docx ou .odt pour les garder.');
    const md = convertisseur().turndown(page);
    return { bytes: encoderTexte(`${md.trim()}\n`), alertes: [...alertes] };
  }

  // La page contient-elle de la mise en forme que le Markdown ou le texte perdent ?
  const perdu = (page) => Boolean(page.querySelector('[style*="color"], [style*="font-family"], [style*="font-size"], [style*="text-align"]'));

  // Une copie de la page où chaque média pointe vers son fichier rangé à côté du document.
  async function avecMediasRanges(ctx, alertes) {
    // La copie vit dans un document à part : ses images ne se chargent pas (leurs adresses rangées sont
    // relatives au document enregistré, pas à la fenêtre d'Edda).
    const page = document.implementation.createHTMLDocument('').importNode(ctx.page, true);
    for (const m of page.querySelectorAll('img, video, audio')) {
      const src = m.getAttribute('src');
      if (!src) { m.remove(); continue; }
      try {
        const chemin = await Formats.cheminMedia(ctx, { src, nom: Medias.nom(m) });
        m.setAttribute('src', /^https?:/i.test(chemin) ? chemin : encodeURI(chemin));
      } catch (err) {
        alertes.add(`${Medias.nom(m)} n'a pas pu être rangé à côté du document : ${err.message}`);
      }
      m.removeAttribute('data-nom');
      m.removeAttribute('contenteditable');
      m.classList.remove('media', 'choisi');
      if (!m.classList.length) m.removeAttribute('class');
    }
    if (page.querySelector('img, video, audio')) alertes.add(`Les images, vidéos et sons sont rangés dans le dossier « ${ctx.dossierMedias} », à côté du document.`);
    return page;
  }

  // ======================================================================
  // HTML
  // ======================================================================
  function lireHtml(bytes, ctx) {
    const { texte } = decoderTexte(bytes);
    const doc = new DOMParser().parseFromString(texte, 'text/html');
    const alertes = [];
    if (doc.querySelector('script')) alertes.push('Les scripts de la page sont retirés.');
    const ecritParEdda = doc.querySelector('meta[name=generator]')?.content === 'Edda';
    if (!ecritParEdda && doc.querySelector('link[rel=stylesheet], style')) alertes.push('La mise en forme venue des feuilles de style (CSS) n\'est pas gardée, seulement celle posée sur le texte.');
    const titre = doc.querySelector('title')?.textContent?.trim() || null;
    // La mise en page écrite par Edda (@page) : on la relit.
    const miseEnPage = lireMiseEnPageCss(doc);
    const police = doc.body?.style?.fontFamily ? doc.body.style.fontFamily.split(',')[0].replace(/['"]/g, '').trim() : null;
    const taille = taillePt(doc.body?.style?.fontSize);
    return { html: doc.body ? doc.body.innerHTML : texte, titre, miseEnPage, police, taille, alertes };
  }
  function lireMiseEnPageCss(doc) {
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const m = css.match(/@page\s*\{([^}]*)\}/);
    if (!m) return null;
    const mp = structuredClone(Formats.MISE_EN_PAGE);
    const size = m[1].match(/size:\s*([^;]+)/);
    if (size) {
      const v = size[1].trim().split(/\s+/);
      if (Formats.PAPIERS[v[0]]) mp.format = v[0];
      if (v.includes('landscape')) mp.orientation = 'paysage';
    }
    const marge = m[1].match(/margin:\s*([^;]+)/);
    if (marge) {
      const v = marge[1].trim().split(/\s+/).map((x) => Math.round(Unites.pxEnCm(Unites.lire(x) || 0) * 100) / 100);
      const [h, d = h, b = h, g = d] = v;
      mp.marges = { haut: h, droite: d, bas: b, gauche: g };
    }
    return mp;
  }

  // Le CSS d'une page enregistrée par Edda (aussi utilisé pour imprimer et faire le PDF).
  function cssDocument({ miseEnPage, police, taille }, { ecran = true } = {}) {
    const mp = miseEnPage || Formats.MISE_EN_PAGE;
    const { largeur } = Formats.dimensions(mp);
    const f = /\s/.test(police) ? `'${police}'` : police;
    return `@page { size: ${mp.format} ${mp.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: ${mp.marges.haut}cm ${mp.marges.droite}cm ${mp.marges.bas}cm ${mp.marges.gauche}cm; }
body { font-family: ${f}, 'Segoe UI', sans-serif; font-size: ${taille}pt; line-height: 1.4; color: #1a1a1a; margin: 0; }
${ecran ? `@media screen { body { max-width: ${(largeur - mp.marges.gauche - mp.marges.droite).toFixed(2)}cm; margin: 2.5cm auto; padding: 0 1rem; } }` : ''}
p { margin: 0 0 0.6em; }
h1 { font-size: 20pt; color: #1f3864; margin: 0.8em 0 0.4em; } h2 { font-size: 16pt; color: #2f5496; margin: 0.7em 0 0.35em; }
h3 { font-size: 14pt; color: #2f5496; margin: 0.6em 0 0.3em; } h4, h5, h6 { font-size: 12pt; color: #2f5496; margin: 0.5em 0 0.25em; }
blockquote { margin: 0.6em 1cm; padding-left: 0.4cm; border-left: 3px solid #a0a0a0; color: #595959; font-style: italic; }
pre { font-family: Consolas, monospace; font-size: 10pt; background: #f2f2f2; padding: 0.4em 0.6em; white-space: pre-wrap; }
table { border-collapse: collapse; width: 100%; margin: 0.4em 0 0.8em; } td, th { border: 1px solid #a0a0a0; padding: 4px 7px; vertical-align: top; } td > p:last-child, th > p:last-child { margin-bottom: 0; }
img, video { max-width: 100%; height: auto; vertical-align: bottom; } audio { width: 320px; max-width: 100%; }
a { color: #0563c1; } hr { border: none; border-top: 1px solid #a0a0a0; margin: 0.8em 0; }
hr.saut-page { border: none; margin: 0; height: 0; page-break-after: always; break-after: page; }
.tab { white-space: pre; tab-size: 4; } ul, ol { margin: 0 0 0.6em; padding-left: 24px; } li > p { margin: 0; }`;
  }

  function documentHtml(ctx, corps, { ecran = true } = {}) {
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Edda">
<title>${escapeHtml(ctx.titre || 'Document')}</title>
<style>
${cssDocument(ctx, { ecran })}
</style>
</head>
<body>
${corps}
</body>
</html>
`;
  }

  async function ecrireHtml(ctx) {
    const alertes = new Set();
    const page = await avecMediasRanges(ctx, alertes);
    return { bytes: encoderTexte(documentHtml(ctx, page.innerHTML)), alertes: [...alertes] };
  }

  // ======================================================================
  // Texte brut
  // ======================================================================
  function lireTxt(bytes) {
    const { texte, encodage } = decoderTexte(bytes);
    const lignes = texte.replace(/\r\n?/g, '\n').split('\n');
    if (lignes.length > 1 && lignes.at(-1) === '') lignes.pop();
    const html = lignes.map((l) => `<p>${l ? escapeHtml(l).replace(/\t/g, '<span class="tab">\t</span>').replace(/ {2}/g, '  ') : '<br>'}</p>`).join('');
    return { html, encodage, alertes: [] };
  }

  async function ecrireTxt(ctx) {
    const blocs = Formats.blocs(ctx.page);
    const lignes = [];
    const compteurs = new Map();
    for (const b of blocs) {
      if (b.type === 'saut') { lignes.push('\f'); continue; }
      if (b.type === 'ligne') { lignes.push('----------'); continue; }
      if (b.type === 'table') {
        for (const ligne of b.lignes) lignes.push(ligne.map((c) => c.blocs.map((x) => (x.type === 'p' ? Formats.texteDe(x.runs) : '')).join(' ').replace(/\s+/g, ' ').trim()).join('\t'));
        lignes.push('');
        continue;
      }
      let prefixe = '';
      if (b.liste && !b.liste.suite) {
        const indent = '  '.repeat(b.liste.niveau);
        if (b.liste.type === 'ol') {
          const cle = `${b.liste.id}:${b.liste.niveau}`;
          const n = (compteurs.get(cle) ?? ((b.liste.debut || 1) - 1)) + 1;
          compteurs.set(cle, n);
          prefixe = `${indent}${n}. `;
        } else prefixe = `${indent}- `;
      } else if (b.liste) prefixe = '  '.repeat(b.liste.niveau + 1);
      const medias = b.runs.filter((r) => r.t === 'media');
      lignes.push(prefixe + Formats.texteDe(b.runs).replace(/\n/g, `\n${' '.repeat(prefixe.length)}`) + medias.map((m) => `[${m.type === 'image' ? 'Image' : m.type === 'video' ? 'Vidéo' : 'Son'} : ${m.nom}]`).join(' '));
    }
    const alertes = [];
    if (ctx.page.querySelector('img, video, audio')) alertes.push('Le texte brut ne garde pas les images, vidéos et sons (seulement leur nom entre crochets).');
    if (ctx.page.querySelector('strong, b, em, i, u, s, [style], h1, h2, h3, table')) alertes.push('Le texte brut ne garde aucune mise en forme : enregistre en .docx ou .odt pour la garder.');
    // Fins de ligne de Windows : le Bloc-notes d'avant 2018 n'en comprend pas d'autres.
    const texte = lignes.join('\r\n').replace(/\r\n\f\r\n/g, '\r\n\f');
    const bom = ctx.encodage === 'utf-8-bom' ? '﻿' : '';
    let bytes;
    if (ctx.encodage === 'windows-1252' && !/[^\u0000-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(texte)) bytes = encoderWindows1252(texte);
    else bytes = encoderTexte(bom + texte + '\r\n');
    return { bytes, alertes };
  }
  // Un fichier ouvert en Windows-1252 (accents d'un vieux fichier) est réenregistré pareil, pour ne
  // pas le transformer dans le dos des autres logiciels.
  function encoderWindows1252(texte) {
    const speciaux = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
    const out = new Uint8Array(texte.length + 2);
    let k = 0;
    for (const ch of `${texte}\r\n`) out[k++] = speciaux[ch] ?? ch.charCodeAt(0);
    return out.subarray(0, k);
  }

  Formats.ajouter('md', { nom: 'Markdown', extensions: ['md', 'markdown'], lire: lireMarkdown, ecrire: ecrireMarkdown, garde: 'partiel' });
  Formats.ajouter('html', { nom: 'Page web (HTML)', extensions: ['html', 'htm'], lire: lireHtml, ecrire: ecrireHtml, garde: 'tout' });
  Formats.ajouter('txt', { nom: 'Texte brut', extensions: ['txt', 'text', 'log'], lire: lireTxt, ecrire: ecrireTxt, garde: 'rien' });
  Formats.cssDocument = cssDocument;
  Formats.documentHtml = documentHtml;
  // Pour Claude : la page (ou une partie) en Markdown, telle qu'elle est à l'écran.
  Formats.versMarkdown = (noeud) => {
    const copie = noeud.cloneNode(true);
    for (const m of copie.querySelectorAll('[contenteditable]')) m.removeAttribute('contenteditable');
    return convertisseur().turndown(copie).trim();
  };
})();
