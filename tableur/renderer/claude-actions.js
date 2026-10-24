// Ce que Claude peut faire dans Reikna (panneau Claude, ../commun/claude-panneau.js).
//
// Chaque action est décrite pour Claude (description, paramètres) et faite ici, dans la fenêtre,
// avec les mêmes fonctions que les boutons (Classeur, Grille, App.claude), mais sans leurs fenêtres.
// Les actions « lecture » (infos, lire_plage, capture, selectionner) ne demandent pas la permission ;
// les autres affichent la carte Autoriser / Refuser du panneau. Tout ce que Claude change s'annule
// avec Ctrl+Z, comme ce que tu fais toi-même.
//
// Une feuille se désigne par son nom (sans : la feuille affichée), une plage comme dans Excel :
// A1, B2:D10, C:E (colonnes entières), 3:5 (lignes entières).

(() => {
  const C = App.claude;
  const MAX_CELLULES_LUES = 3000;
  const refFeuille = { type: 'string', description: 'Nom de la feuille. Sans : la feuille affichée.' };
  const refPlage = { type: 'string', description: 'Plage comme dans Excel : A1, B2:D10, C:E, 3:5. Sans : la sélection.' };

  const feuilleDe = (nom) => {
    if (nom === undefined || nom === null || nom === '') return C.feuille();
    const id = Classeur.idFeuille(String(nom));
    if (id === undefined || id === null) throw new Error(`Pas de feuille « ${nom} ». Les feuilles : ${Classeur.feuilles().map((f) => f.nom).join(', ')}.`);
    return id;
  };
  const plageDe = (texte) => {
    if (texte === undefined || texte === null || texte === '') return C.selection().plage;
    const p = lirePlage(String(texte));
    if (!p) throw new Error(`Plage « ${texte} » illisible. Exemples : A1, B2:D10, C:E, 3:5.`);
    return p;
  };
  // Montre à Ragna la feuille où Claude travaille.
  const montrer = (feuille) => { if (feuille !== C.feuille()) C.changerFeuille(feuille); };
  const nomDe = (feuille) => Classeur.nomFeuille(feuille);

  // Une cellule pour Claude : le texte affiché, la valeur brute si elle diffère, la formule.
  function decrireCellule(feuille, r, c) {
    const v = Classeur.valeur(feuille, r, c);
    const formule = Classeur.aFormule(feuille, r, c) ? Classeur.moteur().getCellFormula({ sheet: feuille, row: r, col: c }) : null;
    if ((v === null || v === undefined) && !formule) return null;
    const t = Classeur.texte(feuille, r, c);
    const parts = [`${adresse(r, c)} : ${JSON.stringify(t)}`];
    if (typeof v === 'number' && String(v) !== t) parts.push(`valeur ${v}`);
    if (v && typeof v === 'object') parts.push(`erreur ${v.type || v.value}${v.message ? ` (${v.message})` : ''}`);
    if (formule) parts.push(`formule ${formule}`);
    const s = Classeur.style(feuille, r, c);
    if (s?.format) parts.push(`format ${s.format}`);
    return parts.join(' · ');
  }

  function lire(feuille, plage) {
    const { width, height } = Classeur.dimensions(feuille);
    const p = { r1: plage.r1, c1: plage.c1, r2: Math.min(plage.r2, height - 1), c2: Math.min(plage.c2, width - 1) };
    if (p.r2 < p.r1 || p.c2 < p.c1) return { lignes: [], coupe: false };
    const lignes = [];
    let vues = 0, coupe = false;
    for (let r = p.r1; r <= p.r2 && !coupe; r++) {
      for (let c = p.c1; c <= p.c2; c++) {
        if (++vues > MAX_CELLULES_LUES * 4) { coupe = adresse(r, c); break; }
        const d = decrireCellule(feuille, r, c);
        if (!d) continue;
        lignes.push(d);
        if (lignes.length >= MAX_CELLULES_LUES) { coupe = adresse(r, c); break; }
      }
    }
    return { lignes, coupe };
  }

  const decrireGraphique = (g) => `${g.id} = ${Graphiques.TYPES[g.type]?.nom || g.type}${g.titre ? ` « ${g.titre} »` : ''}, données ${g.donnees.feuille !== undefined ? `${nomDe(g.donnees.feuille)}!` : ''}${adressePlage(g.donnees.plage)}, en ${adresse(g.ancre.r, g.ancre.c)}, ${g.largeur} × ${g.hauteur} px`;
  const grapheDe = (id) => {
    const t = id ? Graphiques.trouver(String(id)) : null;
    if (t) return t;
    const tous = Classeur.feuilles().flatMap((f) => Classeur.meta(f.id).graphiques.map((g) => ({ g, feuille: f.id })));
    if (!id && tous.length === 1) return tous[0];
    throw new Error(tous.length ? `Graphique « ${id ?? ''} » introuvable. Les graphiques : ${tous.map((x) => decrireGraphique(x.g)).join(' ; ')}.` : 'Il n\'y a aucun graphique dans le classeur.');
  };
  // Une borne de règle donnée par Claude : nombre JSON, texte, ou formule (FR ou EN).
  const borneClaude = (x) => (typeof x === 'string' && x.startsWith('=') ? Formules.versMoteur(x, { auto: true }) : x ?? null);

  // Les réglages de mise en forme, avec les noms du modèle (classeur.js).
  const ALIGN_H = { gauche: 'left', centre: 'center', droite: 'right', left: 'left', center: 'center', right: 'right' };
  const ALIGN_V = { haut: 'top', milieu: 'middle', bas: 'bottom', top: 'top', middle: 'middle', bottom: 'bottom' };
  const couleurOk = (c) => {
    if (c === null || c === '') return null;
    if (!/^#[0-9a-fA-F]{6}$/.test(String(c))) throw new Error(`Couleur « ${c} » : donne-la en #rrggbb.`);
    return String(c).toLowerCase();
  };

  ClaudePanneau.actions({
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde le classeur',
      description: 'Le classeur ouvert dans Reikna : nom, chemin, format, modifications non enregistrées, ses feuilles (taille des données, volets figés, filtre), la feuille affichée, la sélection, la langue des formules à l\'écran.',
      faire: () => {
        const d = C.doc();
        const { plage, actif } = C.selection();
        const feuilles = Classeur.feuilles().map((f) => {
          const { width, height } = Classeur.dimensions(f.id);
          const m = Classeur.meta(f.id);
          const bits = [height && width ? `données A1:${adresse(height - 1, width - 1)}` : 'vide'];
          if (m.figer?.lignes || m.figer?.colonnes) bits.push(`volets figés : ${m.figer.lignes} ligne(s), ${m.figer.colonnes} colonne(s)`);
          if (m.filtre) bits.push(`filtre sur ${adressePlage(m.filtre.plage)}`);
          if (m.fusions.length) bits.push(`${m.fusions.length} fusion(s)`);
          if (m.mfc.length) bits.push(`${m.mfc.length} règle(s) de mise en forme conditionnelle`);
          if (m.graphiques.length) bits.push(`graphiques : ${m.graphiques.map(decrireGraphique).join(' ; ')}`);
          return `- ${f.nom}${f.id === C.feuille() ? ' (affichée)' : ''} : ${bits.join(', ')}`;
        });
        return [
          `Classeur : ${d.nom}${d.chemin ? ` (${d.chemin})` : ' (jamais enregistré)'}, format ${d.format}${d.modifie ? ', modifications non enregistrées' : ''}.`,
          `Feuilles :\n${feuilles.join('\n')}`,
          `Sélection : ${adressePlage(plage)} (cellule active ${adresse(actif.r, actif.c)}).`,
          `Formules à l'écran : ${Formules.getLangue() === 'fr' ? 'en français (SOMME, « ; »)' : 'en anglais'}. Tu peux écrire les tiennes en anglais (=SUM(A1:A3,2.5)) ou en français (=SOMME(A1:A3;2,5)).`,
        ].join('\n');
      },
    },
    lire_plage: {
      lecture: true,
      icone: 'table',
      libelle: (a) => `Lit ${a.plage || 'la sélection'}${a.feuille ? ` (${a.feuille})` : ''}`,
      description: `Lit des cellules : pour chaque cellule non vide, le texte affiché, la valeur brute (les dates sont des numéros de série Excel), la formule (en anglais) et le format. Sans plage : la sélection ; tout = true : toutes les données de la feuille. Au plus ${MAX_CELLULES_LUES} cellules par appel.`,
      schema: { type: 'object', properties: { feuille: refFeuille, plage: refPlage, tout: { type: 'boolean' } } },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const plage = a.tout ? { r1: 0, c1: 0, r2: MAX_LIGNES - 1, c2: MAX_COLONNES - 1 } : plageDe(a.plage);
        const { lignes, coupe } = lire(feuille, plage);
        const titre = `Feuille ${nomDe(feuille)}, ${a.tout ? 'toutes les données' : adressePlage(plage)}`;
        if (!lignes.length) return `${titre} : aucune cellule remplie.`;
        return `${titre} (${lignes.length} cellule(s) remplie(s)) :\n${lignes.join('\n')}${coupe ? `\n… coupé à ${coupe} : relis la suite avec une plage plus petite.` : ''}`;
      },
    },
    capture: {
      lecture: true,
      icone: 'device-camera',
      libelle: () => 'Regarde la feuille à l\'écran',
      description: 'Une image de la grille telle que Ragna la voit (couleurs, bordures, largeurs). Pour vérifier une mise en forme.',
      faire: () => {
        // La grille, avec les graphiques posés dessus (ce sont des éléments à part).
        const grille = Grille.canvas();
        const image = document.createElement('canvas');
        image.width = grille.width;
        image.height = grille.height;
        const g = image.getContext('2d');
        g.drawImage(grille, 0, 0);
        const k = grille.width / grille.getBoundingClientRect().width;
        const origine = grille.getBoundingClientRect();
        for (const c of document.querySelectorAll('#graphiques .graphique canvas')) {
          const r = c.getBoundingClientRect();
          if (r.width) g.drawImage(c, (r.left - origine.left) * k, (r.top - origine.top) * k, r.width * k, r.height * k);
        }
        return { texte: `Feuille ${nomDe(C.feuille())}, sélection ${adressePlage(C.selection().plage)}.`, image };
      },
    },
    selectionner: {
      lecture: true,
      icone: 'target',
      libelle: (a) => `Sélectionne ${a.plage}${a.feuille ? ` (${a.feuille})` : ''}`,
      description: 'Affiche une feuille et sélectionne une plage (pour montrer quelque chose à Ragna). Ne change rien dans le classeur.',
      schema: { type: 'object', properties: { feuille: refFeuille, plage: { type: 'string' } }, required: ['plage'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const plage = plageDe(a.plage);
        montrer(feuille);
        Grille.selectionner(plage, { r: plage.r1, c: plage.c1 });
        return `Sélection : ${adressePlage(plage)}.`;
      },
    },
    ecrire: {
      icone: 'edit',
      libelle: (a) => `Écrit dans ${a.cellule || 'la sélection'}${a.feuille ? ` (${a.feuille})` : ''}`,
      description: 'Écrit des valeurs et des formules, à partir d\'une cellule (le coin en haut à gauche). valeurs : un tableau de lignes, chaque ligne un tableau de cellules. Une cellule : un nombre JSON (12.5), true/false, null (vide la cellule), un texte, ou une formule qui commence par = (en anglais =SUM(A1:A3,2.5) ou en français =SOMME(A1:A3;2,5)). Un texte comme « 24/10/2026 », « 15 % » ou « 12 € » est compris comme quand Ragna le tape (date, pourcentage, montant) ; pour garder un texte tel quel, commence-le par une apostrophe.',
      schema: {
        type: 'object',
        properties: {
          feuille: refFeuille,
          cellule: { type: 'string', description: 'Coin en haut à gauche (A1). Sans : la cellule active.' },
          valeurs: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } } },
        },
        required: ['valeurs'],
      },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const depart = a.cellule ? plageDe(a.cellule) : (() => { const { r, c } = C.selection().actif; return { r1: r, c1: c }; })();
        const valeurs = Array.isArray(a.valeurs?.[0]) ? a.valeurs : [a.valeurs];
        if (!valeurs.length || !valeurs[0]?.length) throw new Error('Rien à écrire : valeurs est vide.');
        const largeur = Math.max(...valeurs.map((l) => l.length));
        const matrice = valeurs.map((l) => Array.from({ length: largeur }, (_, j) => (l[j] === undefined ? null : l[j])));
        montrer(feuille);
        Classeur.saisir(feuille, depart.r1, depart.c1, matrice, 'Loki : écrire', { formulesAuto: true });
        const fin = { r1: depart.r1, c1: depart.c1, r2: depart.r1 + matrice.length - 1, c2: depart.c1 + largeur - 1 };
        Grille.selectionner(fin, { r: fin.r1, c: fin.c1 });
        // Les formules en erreur : Claude doit le savoir tout de suite.
        const erreurs = [];
        for (let r = fin.r1; r <= fin.r2; r++) {
          for (let c = fin.c1; c <= fin.c2; c++) {
            const v = Classeur.valeur(feuille, r, c);
            if (v && typeof v === 'object' && v.type) erreurs.push(`${adresse(r, c)} : ${Formules.texteErreur(v)} ${Formules.explicationErreur(v) || ''}`.trim());
          }
        }
        return `Écrit dans ${adressePlage(fin)}.${erreurs.length ? `\nAttention, ${erreurs.length} cellule(s) en erreur :\n${erreurs.slice(0, 30).join('\n')}` : ''}`;
      },
    },
    recopier: {
      icone: 'arrow-down',
      libelle: (a) => `Recopie ${a.source} vers ${a.cible}`,
      description: 'Comme la poignée de recopie : recopie une cellule ou une plage (source) sur une plage voisine (cible, juste en dessous, au-dessus ou à côté). Les formules s\'adaptent (A2 devient A3…). serie = true prolonge les suites (1, 2 → 3, 4 ; janvier → février).',
      schema: { type: 'object', properties: { feuille: refFeuille, source: { type: 'string' }, cible: { type: 'string' }, serie: { type: 'boolean' } }, required: ['source', 'cible'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const source = plageDe(a.source), cible = plageDe(a.cible);
        const memesColonnes = source.c1 === cible.c1 && source.c2 === cible.c2;
        const memesLignes = source.r1 === cible.r1 && source.r2 === cible.r2;
        if (!memesColonnes && !memesLignes) throw new Error('La cible doit être dans le prolongement de la source (mêmes colonnes ou mêmes lignes).');
        if (croise(source, cible)) throw new Error('La cible ne doit pas contenir la source (ex. source A2, cible A3:A20).');
        montrer(feuille);
        Classeur.recopier(feuille, source, cible, { serie: Boolean(a.serie) });
        return `Recopié vers ${adressePlage(cible)}.`;
      },
    },
    mettre_en_forme: {
      icone: 'symbol-color',
      libelle: (a) => `Met en forme ${a.plage || 'la sélection'}${a.feuille ? ` (${a.feuille})` : ''}`,
      description: 'Change l\'apparence des cellules. Donne seulement ce qui change ; false ou null retire un réglage. format : un code de format Excel (0.00, #,##0.00 "€", 0%, dd/mm/yyyy, @ pour texte ; "" = Standard). couleur et fond en #rrggbb. bordures : toutes, contour, contour_epais, aucune, bas, haut, gauche, droite, double_bas. Pour des colonnes entières, utilise C:E.',
      schema: {
        type: 'object',
        properties: {
          feuille: refFeuille,
          plage: refPlage,
          gras: { type: 'boolean' }, italique: { type: 'boolean' }, souligne: { type: 'boolean' }, barre: { type: 'boolean' },
          taille: { type: 'number' }, police: { type: 'string' },
          couleur: { type: ['string', 'null'] }, fond: { type: ['string', 'null'] },
          alignement: { type: 'string', enum: ['gauche', 'centre', 'droite', 'standard'] },
          vertical: { type: 'string', enum: ['haut', 'milieu', 'bas'] },
          retour_a_la_ligne: { type: 'boolean' },
          retrait: { type: 'number' },
          format: { type: 'string' },
          bordures: { type: 'string', enum: ['toutes', 'contour', 'contour_epais', 'aucune', 'bas', 'haut', 'gauche', 'droite', 'double_bas'] },
          couleur_bordures: { type: 'string' },
        },
      },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const plage = plageDe(a.plage);
        const patch = {};
        for (const k of ['gras', 'italique', 'souligne', 'barre', 'police']) if (k in a) patch[k] = a[k] || null;
        if ('taille' in a) patch.taille = a.taille ? Math.max(6, Math.min(72, Number(a.taille))) : null;
        if ('couleur' in a) patch.couleur = couleurOk(a.couleur);
        if ('fond' in a) patch.fond = couleurOk(a.fond);
        if ('alignement' in a) patch.alignH = ALIGN_H[a.alignement] || null;
        if ('vertical' in a) patch.alignV = ALIGN_V[a.vertical] || null;
        if ('retour_a_la_ligne' in a) patch.retour = a.retour_a_la_ligne || null;
        if ('retrait' in a) patch.retrait = Number(a.retrait) || null;
        if ('format' in a) patch.format = a.format && a.format !== 'General' ? String(a.format) : null;
        if (!Object.keys(patch).length && !a.bordures) throw new Error('Rien à changer : donne au moins un réglage (gras, fond, format, bordures…).');
        montrer(feuille);
        if (Object.keys(patch).length) Classeur.styler(feuille, plage, patch, 'Loki : mettre en forme');
        if (a.bordures) {
          const p = plage.r2 - plage.r1 > 100000 || plage.c2 - plage.c1 > 1000 ? null : plage;
          if (!p) throw new Error('Les bordures se posent sur une plage précise (ex. A1:F20), pas sur des colonnes entières.');
          Classeur.bordures(feuille, p, a.bordures, a.couleur_bordures ? couleurOk(a.couleur_bordures) : null);
        }
        return `Mis en forme : ${adressePlage(plage)}.`;
      },
    },
    effacer: {
      icone: 'clear-all',
      libelle: (a) => `Efface ${a.quoi === 'formats' ? 'les formats de' : a.quoi === 'tout' ? 'tout dans' : ''} ${a.plage || 'la sélection'}`.replace(/\s+/g, ' '),
      description: 'Efface des cellules. quoi : contenu (comme la touche Suppr, par défaut), formats, ou tout.',
      schema: { type: 'object', properties: { feuille: refFeuille, plage: refPlage, quoi: { type: 'string', enum: ['contenu', 'formats', 'tout'] } } },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const plage = plageDe(a.plage);
        montrer(feuille);
        Classeur.effacer(feuille, plage, a.quoi || 'contenu');
        return `Effacé (${a.quoi || 'contenu'}) : ${adressePlage(plage)}.`;
      },
    },
    inserer: {
      icone: 'diff-added',
      libelle: (a) => `Insère ${a.nombre || 1} ${a.axe === 'colonnes' ? 'colonne(s)' : 'ligne(s)'} avant ${a.avant}`,
      description: 'Insère des lignes ou des colonnes vides. avant : le numéro de ligne (5) ou la lettre de colonne (C) devant laquelle insérer. Les formules s\'adaptent.',
      schema: { type: 'object', properties: { feuille: refFeuille, axe: { type: 'string', enum: ['lignes', 'colonnes'] }, avant: { type: ['string', 'number'] }, nombre: { type: 'number' } }, required: ['axe', 'avant'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const index = indexDe(a.axe, a.avant);
        const n = Math.max(1, Math.min(10000, Number(a.nombre) || 1));
        montrer(feuille);
        Classeur.inserer(feuille, a.axe, index, n);
        return `${n} ${a.axe} insérée(s).`;
      },
    },
    supprimer: {
      icone: 'diff-removed',
      libelle: (a) => `Supprime ${a.nombre || 1} ${a.axe === 'colonnes' ? 'colonne(s)' : 'ligne(s)'} à partir de ${a.a_partir_de}`,
      description: 'Supprime des lignes ou des colonnes entières (avec leur contenu). a_partir_de : numéro de ligne (5) ou lettre de colonne (C).',
      schema: { type: 'object', properties: { feuille: refFeuille, axe: { type: 'string', enum: ['lignes', 'colonnes'] }, a_partir_de: { type: ['string', 'number'] }, nombre: { type: 'number' } }, required: ['axe', 'a_partir_de'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const index = indexDe(a.axe, a.a_partir_de);
        const n = Math.max(1, Math.min(100000, Number(a.nombre) || 1));
        montrer(feuille);
        Classeur.supprimer(feuille, a.axe, index, n);
        return `${n} ${a.axe} supprimée(s).`;
      },
    },
    trier: {
      icone: 'list-ordered',
      libelle: (a) => `Trie ${a.plage}`,
      description: 'Trie les lignes d\'une plage. cles : les colonnes de tri dans l\'ordre, ex. [{"colonne": "B", "croissant": false}, {"colonne": "A"}]. entete = true : la première ligne (les titres) ne bouge pas. Les cellules vides vont à la fin.',
      schema: {
        type: 'object',
        properties: {
          feuille: refFeuille,
          plage: { type: 'string' },
          cles: { type: 'array', items: { type: 'object', properties: { colonne: { type: 'string' }, croissant: { type: 'boolean' } }, required: ['colonne'] } },
          entete: { type: 'boolean' },
        },
        required: ['plage', 'cles'],
      },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        let plage = plageDe(a.plage);
        const { width, height } = Classeur.dimensions(feuille);
        plage = { ...plage, r2: Math.min(plage.r2, height - 1), c2: Math.min(plage.c2, width - 1) };
        const cles = (a.cles || []).map((k) => {
          const colonne = numeroColonne(String(k.colonne).toUpperCase());
          if (!(colonne >= plage.c1 && colonne <= plage.c2)) throw new Error(`La colonne ${k.colonne} n'est pas dans la plage ${adressePlage(plage)}.`);
          return { colonne, croissant: k.croissant !== false };
        });
        if (!cles.length) throw new Error('Il faut au moins une colonne de tri.');
        montrer(feuille);
        Classeur.trier(feuille, plage, cles, Boolean(a.entete));
        return `Trié : ${adressePlage(plage)}.`;
      },
    },
    largeur_colonnes: {
      icone: 'arrow-both',
      libelle: (a) => `Change la largeur de ${a.colonnes}`,
      description: 'Largeur de colonnes (ex. "A", "B:E"). largeur : en pixels (92 par défaut), ou "auto" pour ajuster au contenu.',
      schema: { type: 'object', properties: { feuille: refFeuille, colonnes: { type: 'string' }, largeur: { type: ['number', 'string'] } }, required: ['colonnes', 'largeur'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const t = String(a.colonnes).toUpperCase().replace(/\s/g, '');
        const p = lirePlage(t.includes(':') ? t : `${t}:${t}`);
        if (!p) throw new Error(`Colonnes « ${a.colonnes} » illisibles (ex. A, B:E).`);
        montrer(feuille);
        if (String(a.largeur).toLowerCase() === 'auto') {
          const cols = [];
          for (let c = p.c1; c <= p.c2; c++) cols.push(c);
          Grille.ajusterColonnes(cols);
        } else {
          const px = Math.max(0, Math.min(2000, Math.round(Number(a.largeur))));
          if (Number.isNaN(px)) throw new Error('largeur : un nombre de pixels ou "auto".');
          Classeur.changerLargeurs(feuille, p.c1, p.c2, px);
        }
        return `Largeur changée : ${adressePlage(p)}.`;
      },
    },
    hauteur_lignes: {
      icone: 'arrow-both',
      libelle: (a) => `Change la hauteur des lignes ${a.lignes}`,
      description: 'Hauteur de lignes (ex. "1", "2:10"), en pixels (24 par défaut).',
      schema: { type: 'object', properties: { feuille: refFeuille, lignes: { type: 'string' }, hauteur: { type: 'number' } }, required: ['lignes', 'hauteur'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const t = String(a.lignes).replace(/\s/g, '');
        const p = lirePlage(t.includes(':') ? t : `${t}:${t}`);
        if (!p) throw new Error(`Lignes « ${a.lignes} » illisibles (ex. 1, 2:10).`);
        montrer(feuille);
        Classeur.changerHauteurs(feuille, p.r1, p.r2, Math.max(0, Math.min(1000, Math.round(Number(a.hauteur) || 24))));
        return `Hauteur changée : lignes ${p.r1 + 1} à ${p.r2 + 1}.`;
      },
    },
    fusionner: {
      icone: 'merge',
      libelle: (a) => (a.defaire ? `Annule la fusion de ${a.plage}` : `Fusionne ${a.plage}`),
      description: 'Fusionne une plage en une seule cellule (seule la valeur en haut à gauche est gardée, centrée). defaire = true : annule les fusions dans la plage.',
      schema: { type: 'object', properties: { feuille: refFeuille, plage: { type: 'string' }, defaire: { type: 'boolean' } }, required: ['plage'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const plage = plageDe(a.plage);
        montrer(feuille);
        if (a.defaire) Classeur.defusionner(feuille, plage);
        else Classeur.fusionner(feuille, plage, true);
        return a.defaire ? `Fusions annulées dans ${adressePlage(plage)}.` : `Fusionné : ${adressePlage(plage)}.`;
      },
    },
    figer: {
      icone: 'pinned',
      libelle: (a) => (a.lignes || a.colonnes ? `Fige ${a.lignes || 0} ligne(s) et ${a.colonnes || 0} colonne(s)` : 'Libère les volets'),
      description: 'Fige les premières lignes et/ou colonnes (elles restent visibles quand on fait défiler). 0 et 0 : libère.',
      schema: { type: 'object', properties: { feuille: refFeuille, lignes: { type: 'number' }, colonnes: { type: 'number' } } },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        montrer(feuille);
        Classeur.figer(feuille, Math.min(1000, Number(a.lignes) || 0), Math.min(200, Number(a.colonnes) || 0));
        return 'Fait.';
      },
    },
    filtre: {
      icone: 'filter',
      libelle: (a) => (a.plage ? `Pose un filtre sur ${a.plage}` : 'Retire le filtre'),
      description: 'Pose les boutons de filtre (comme Ctrl+Maj+L) sur un tableau dont la première ligne contient les titres. Sans plage : retire le filtre de la feuille.',
      schema: { type: 'object', properties: { feuille: refFeuille, plage: { type: 'string' } } },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const actuel = Classeur.meta(feuille).filtre;
        montrer(feuille);
        if (!a.plage) {
          if (actuel) Classeur.basculerFiltre(feuille, actuel.plage);
          return 'Filtre retiré.';
        }
        const plage = plageDe(a.plage);
        if (actuel) Classeur.basculerFiltre(feuille, actuel.plage);
        Classeur.basculerFiltre(feuille, plage);
        return `Filtre posé sur ${adressePlage(plage)}.`;
      },
    },
    regles: {
      lecture: true,
      icone: 'color-mode',
      libelle: (a) => `Regarde les règles de mise en forme${a.feuille ? ` (${a.feuille})` : ''}`,
      description: 'Les règles de mise en forme conditionnelle d\'une feuille, dans l\'ordre de priorité (la première l\'emporte), avec leur numéro, leur plage et leur style.',
      schema: { type: 'object', properties: { feuille: refFeuille } },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const regles = Classeur.meta(feuille).mfc;
        if (!regles.length) return `Aucune règle sur la feuille ${nomDe(feuille)}.`;
        return `Feuille ${nomDe(feuille)} :\n${regles.map((r, i) => `${i}. ${MFC.decrire(r)} · sur ${r.plages.map(adressePlage).join(' ')}${r.style && Object.keys(r.style).length ? ` · style ${JSON.stringify(r.style)}` : ''}${r.couleurs ? ` · couleurs ${r.couleurs.filter(Boolean).join(', ')}` : ''}${r.couleur ? ` · couleur ${r.couleur}` : ''}`).join('\n')}`;
      },
    },
    mise_en_forme_conditionnelle: {
      icone: 'color-mode',
      libelle: (a) => `Ajoute une règle « ${MFC.TYPES[a.type] || a.type} » sur ${a.plage || 'la sélection'}`,
      description: 'Ajoute une règle de mise en forme conditionnelle (elle passe avant les règles existantes). type : valeur (op sup, inf, supEgal, infEgal, egal, different, entre, horsDe ; v1, v2 : nombre JSON, texte, ou formule « =… » relative à la cellule en haut à gauche), texte (op contient, neContientPas, commencePar, finitPar ; texte), date (periode hier, aujourdhui, demain, septJours, semaineDerniere, semaine, semaineProchaine, moisDernier, mois, moisProchain), doublons, uniques, top (sens haut ou bas ; n ; pourcent), moyenne (sens dessus ou dessous), vides, nonVides, erreurs, formule (formule vraie = mise en forme, écrite pour la cellule en haut à gauche, ex. =$C2>100 pour colorer toute la ligne), echelle (couleurs [min, milieu ou null, max] en #rrggbb), barres (couleur). style (sauf echelle et barres) : { fond, couleur, gras, italique } ; ou modele : rouge, jaune, vert, rougeFond, texteRouge, texteVert, gras.',
      schema: {
        type: 'object',
        properties: {
          feuille: refFeuille, plage: refPlage,
          type: { type: 'string', enum: Object.keys(MFC.TYPES) },
          op: { type: 'string' }, v1: { type: ['number', 'string'] }, v2: { type: ['number', 'string'] }, texte: { type: 'string' }, periode: { type: 'string' },
          sens: { type: 'string' }, n: { type: 'number' }, pourcent: { type: 'boolean' }, formule: { type: 'string' },
          couleurs: { type: 'array', items: { type: ['string', 'null'] } }, couleur: { type: 'string' },
          style: { type: 'object', properties: { fond: { type: 'string' }, couleur: { type: 'string' }, gras: { type: 'boolean' }, italique: { type: 'boolean' } } },
          modele: { type: 'string', enum: Object.keys(MFC.STYLES) },
          arreter: { type: 'boolean' },
        },
        required: ['type'],
      },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const plage = plageDe(a.plage);
        const r = { type: a.type, plages: [plage] };
        if (!MFC.TYPES[a.type]) throw new Error(`Type de règle inconnu : ${a.type}.`);
        if (a.type === 'valeur') { if (!MFC.OPERATEURS[a.op]) throw new Error(`op : ${Object.keys(MFC.OPERATEURS).join(', ')}.`); Object.assign(r, { op: a.op, v1: borneClaude(a.v1), v2: borneClaude(a.v2) }); }
        if (a.type === 'texte') Object.assign(r, { op: MFC.OPS_TEXTE[a.op] ? a.op : 'contient', texte: String(a.texte ?? '') });
        if (a.type === 'date') { if (!MFC.PERIODES[a.periode]) throw new Error(`periode : ${Object.keys(MFC.PERIODES).join(', ')}.`); r.periode = a.periode; }
        if (a.type === 'top') Object.assign(r, { sens: a.sens === 'bas' ? 'bas' : 'haut', n: Math.max(1, Math.round(a.n || 10)), pourcent: Boolean(a.pourcent) });
        if (a.type === 'moyenne') r.sens = a.sens === 'dessous' ? 'dessous' : 'dessus';
        if (a.type === 'formule') { if (!a.formule) throw new Error('Il faut la formule.'); r.formule = Formules.versMoteur(a.formule.startsWith('=') ? a.formule : `=${a.formule}`, { auto: true }).replace(/^=/, ''); }
        if (a.type === 'echelle') {
          const cs = a.couleurs?.length ? a.couleurs : MFC.ECHELLES.vertJauneRouge.couleurs;
          r.couleurs = cs.length === 2 ? [couleurOk(cs[0]), null, couleurOk(cs[1])] : [couleurOk(cs[0]), cs[1] ? couleurOk(cs[1]) : null, couleurOk(cs[2])];
        }
        if (a.type === 'barres') r.couleur = a.couleur ? couleurOk(a.couleur) : MFC.BARRES.bleu;
        if (!['echelle', 'barres'].includes(a.type)) {
          if (a.style) {
            r.style = {};
            if (a.style.fond) r.style.fond = couleurOk(a.style.fond);
            if (a.style.couleur) r.style.couleur = couleurOk(a.style.couleur);
            if (a.style.gras) r.style.gras = true;
            if (a.style.italique) r.style.italique = true;
          } else r.style = { ...MFC.STYLES[a.modele || 'rouge'].style };
          if (a.arreter) r.arreter = true;
        }
        montrer(feuille);
        MFC.ajouter(feuille, r, 'Loki : mise en forme conditionnelle');
        return `Règle ajoutée : ${MFC.decrire(r)} sur ${adressePlage(plage)}.`;
      },
    },
    effacer_regles: {
      icone: 'clear-all',
      libelle: (a) => (a.numeros?.length ? `Retire les règles ${a.numeros.join(', ')}` : `Efface les règles de ${a.plage || 'la feuille'}`),
      description: 'Retire des règles de mise en forme conditionnelle : numeros (voir regles), ou toutes celles qui touchent plage, ou sans rien toutes celles de la feuille.',
      schema: { type: 'object', properties: { feuille: refFeuille, plage: { type: 'string' }, numeros: { type: 'array', items: { type: 'number' } } } },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        montrer(feuille);
        if (a.numeros?.length) {
          const garder = Classeur.meta(feuille).mfc.filter((_, i) => !a.numeros.includes(i));
          MFC.remplacerTout(feuille, garder, 'Loki : retirer des règles');
          return `${Classeur.meta(feuille).mfc.length} règle(s) restante(s).`;
        }
        const n = MFC.effacer(feuille, a.plage ? plageDe(a.plage) : null);
        return `${n} règle(s) effacée(s).`;
      },
    },
    graphique: {
      icone: 'graph',
      libelle: (a) => `Insère un graphique ${Graphiques.TYPES[a.type]?.nom?.toLowerCase() || ''} de ${a.donnees}`.replace(/\s+/g, ' '),
      description: 'Insère un graphique sur la feuille. type : colonnes (histogramme), barres, lignes, aires, secteurs, anneau, nuage (points). donnees : la plage, titres compris (ex. A1:C13 ; « Feuil2!A1:B5 » pour une autre feuille) : la première ligne et la première colonne servent de noms quand elles contiennent du texte. series : colonnes ou lignes (sans : deviné). titre, legende (bas, droite, haut, aucune), empile (colonnes, barres, aires). position : la cellule du coin en haut à gauche (sans : à droite des données). largeur et hauteur en pixels (480 × 288 par défaut).',
      schema: {
        type: 'object',
        properties: {
          feuille: { type: 'string', description: 'Feuille où poser le graphique. Sans : la feuille affichée.' },
          type: { type: 'string', enum: Object.keys(Graphiques.TYPES) }, donnees: { type: 'string' }, series: { type: 'string', enum: ['colonnes', 'lignes'] },
          titre: { type: 'string' }, legende: { type: 'string', enum: ['bas', 'droite', 'haut', 'aucune'] }, empile: { type: 'boolean' },
          position: { type: 'string' }, largeur: { type: 'number' }, hauteur: { type: 'number' },
        },
        required: ['type', 'donnees'],
      },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        const donnees = refDonnees(a.donnees, feuille);
        const pos = a.position ? plageDe(a.position) : { r1: donnees.plage.r1, c1: Math.min(MAX_COLONNES - 8, donnees.plage.c2 + 2) };
        montrer(feuille);
        const g = Graphiques.ajouter(feuille, {
          type: Graphiques.TYPES[a.type] ? a.type : 'colonnes', donnees, series: a.series || null, titre: a.titre || '', legende: a.legende || null, empile: Boolean(a.empile),
          ancre: { r: pos.r1, c: pos.c1, dx: 0, dy: 0 }, largeur: Math.max(160, Math.min(2000, a.largeur || Graphiques.LARGEUR)), hauteur: Math.max(110, Math.min(1500, a.hauteur || Graphiques.HAUTEUR)),
        });
        const d = Graphiques.lire(g);
        return `Graphique ${g.id} inséré.${d.erreur ? ` Attention : ${d.erreur}` : ` ${d.series.length} série(s) : ${d.series.map((s) => s.nom).join(', ')}${d.categories.length ? ` ; ${d.categories.length} catégorie(s)` : ''}.`}`;
      },
    },
    modifier_graphique: {
      icone: 'edit',
      libelle: (a) => `Modifie le graphique ${a.id || ''}`.trim(),
      description: 'Change un graphique (id : voir infos ; sans id s\'il n\'y en a qu\'un). Donne seulement ce qui change : type, donnees, series, titre, legende, empile, position (cellule), largeur, hauteur.',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' }, type: { type: 'string', enum: Object.keys(Graphiques.TYPES) }, donnees: { type: 'string' }, series: { type: 'string', enum: ['colonnes', 'lignes', 'auto'] },
          titre: { type: 'string' }, legende: { type: 'string', enum: ['bas', 'droite', 'haut', 'aucune', 'auto'] }, empile: { type: 'boolean' },
          position: { type: 'string' }, largeur: { type: 'number' }, hauteur: { type: 'number' },
        },
      },
      faire: (a) => {
        const { g, feuille } = grapheDe(a.id);
        const patch = {};
        if (a.type) patch.type = a.type;
        if (a.donnees) patch.donnees = refDonnees(a.donnees, feuille);
        if (a.series) patch.series = a.series === 'auto' ? null : a.series;
        if ('titre' in a) patch.titre = a.titre || '';
        if (a.legende) patch.legende = a.legende === 'auto' ? null : a.legende;
        if ('empile' in a) patch.empile = Boolean(a.empile);
        if (a.position) { const p = plageDe(a.position); patch.ancre = { r: p.r1, c: p.c1, dx: 0, dy: 0 }; }
        if (a.largeur) patch.largeur = Math.max(160, Math.min(2000, a.largeur));
        if (a.hauteur) patch.hauteur = Math.max(110, Math.min(1500, a.hauteur));
        montrer(feuille);
        Graphiques.changer(feuille, g.id, patch, 'Loki : modifier le graphique');
        return `Graphique modifié : ${decrireGraphique(Graphiques.trouver(g.id).g)}.`;
      },
    },
    supprimer_graphique: {
      icone: 'trash',
      libelle: (a) => `Supprime le graphique ${a.id || ''}`.trim(),
      description: 'Supprime un graphique (id : voir infos ; sans id s\'il n\'y en a qu\'un). Les données ne bougent pas.',
      schema: { type: 'object', properties: { id: { type: 'string' } } },
      faire: (a) => {
        const { g, feuille } = grapheDe(a.id);
        montrer(feuille);
        Graphiques.supprimer(g.id);
        return 'Graphique supprimé.';
      },
    },
    ajouter_feuille: {
      icone: 'add',
      libelle: (a) => `Ajoute la feuille ${a.nom || ''}`.trim(),
      description: 'Ajoute une feuille vide à la fin (31 caractères au plus, sans \\ / ? * [ ] :) et l\'affiche.',
      schema: { type: 'object', properties: { nom: { type: 'string' } } },
      faire: (a) => {
        const id = Classeur.ajouterFeuille(a.nom ? String(a.nom) : undefined);
        C.changerFeuille(id ?? Classeur.feuilles().at(-1).id);
        return `Feuille ajoutée : ${nomDe(C.feuille())}.`;
      },
    },
    renommer_feuille: {
      icone: 'edit',
      libelle: (a) => `Renomme ${a.feuille || 'la feuille'} en ${a.nom}`,
      description: 'Renomme une feuille. Les formules qui la citent suivent.',
      schema: { type: 'object', properties: { feuille: refFeuille, nom: { type: 'string' } }, required: ['nom'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        Classeur.renommerFeuille(feuille, String(a.nom));
        C.rendreOnglets();
        return `Feuille renommée : ${nomDe(feuille)}.`;
      },
    },
    supprimer_feuille: {
      icone: 'trash',
      libelle: (a) => `Supprime la feuille ${a.feuille}`,
      description: 'Supprime une feuille et tout son contenu (Ctrl+Z la fait revenir). Il doit rester au moins une feuille.',
      schema: { type: 'object', properties: { feuille: { type: 'string' } }, required: ['feuille'] },
      faire: (a) => {
        const feuille = feuilleDe(a.feuille);
        if (Classeur.feuilles().length < 2) throw new Error('C\'est la seule feuille du classeur : impossible de la supprimer.');
        const nom = nomDe(feuille);
        Classeur.supprimerFeuille(feuille);
        return `Feuille supprimée : ${nom}.`;
      },
    },
    afficher_feuille: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Affiche la feuille ${a.feuille}`,
      description: 'Affiche une autre feuille dans la fenêtre (ne change rien dans le classeur).',
      schema: { type: 'object', properties: { feuille: { type: 'string' } }, required: ['feuille'] },
      faire: (a) => { C.changerFeuille(feuilleDe(a.feuille)); return 'Fait.'; },
    },
    ouvrir: {
      icone: 'folder-opened',
      libelle: (a) => `Ouvre ${a.chemin}`,
      description: 'Ouvre un classeur (xlsx, xlsm, xls, ods, csv, tsv) à la place de celui affiché (chemin absolu). Refusé si le classeur affiché a des modifications non enregistrées.',
      schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        if (C.doc().modifie) throw new Error('Le classeur ouvert a des modifications non enregistrées : demande à Ragna de l\'enregistrer d\'abord.');
        await C.ouvrir(String(a.chemin));
        const d = C.doc();
        return `Ouvert : ${d.nom} (${Classeur.feuilles().length} feuille(s) : ${Classeur.feuilles().map((f) => f.nom).join(', ')}).`;
      },
    },
    enregistrer: {
      icone: 'save',
      libelle: () => 'Enregistre le classeur',
      description: 'Enregistre le classeur à sa place actuelle, dans son format (comme Ctrl+S). Seulement s\'il a déjà été enregistré une fois ; sinon c\'est à Ragna de choisir où.',
      faire: async () => {
        await C.enregistrer();
        const d = C.doc();
        return `Enregistré : ${d.chemin}.`;
      },
    },
    nouveau: {
      icone: 'new-file',
      libelle: () => 'Commence un nouveau classeur',
      description: 'Remplace le classeur affiché par un classeur vide. Refusé s\'il a des modifications non enregistrées.',
      faire: async () => { await C.nouveau(); return `Nouveau classeur : ${C.doc().nom}.`; },
    },
  });

  // « A1:C9 » ou « 'Ventes 2026'!A1:C9 » → { feuille, plage }.
  function refDonnees(texte, feuilleParDefaut) {
    const t = String(texte).trim();
    const m = t.match(/^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/);
    const feuille = m ? feuilleDe((m[1] || m[2]).replace(/''/g, '\'')) : feuilleParDefaut;
    const plage = lirePlage(m ? m[3] : t);
    if (!plage) throw new Error(`Données « ${texte} » illisibles (ex. A1:C13).`);
    return { feuille, plage };
  }

  // « 5 » → ligne 4 (index), « C » → colonne 2.
  function indexDe(axe, ref) {
    const t = String(ref).trim().toUpperCase();
    if (axe === 'lignes') {
      const n = Number(t);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIGNES) throw new Error(`Ligne « ${ref} » : donne un numéro de ligne (1, 2…).`);
      return n - 1;
    }
    if (!/^[A-Z]{1,3}$/.test(t)) throw new Error(`Colonne « ${ref} » : donne une lettre (A, B… AA).`);
    return numeroColonne(t);
  }
})();
