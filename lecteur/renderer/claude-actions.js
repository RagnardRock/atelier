// Ce que Claude peut faire dans Mímir (panneau Claude, ../commun/claude-panneau.js).
//
// Lire ne demande jamais la permission (infos, lire_texte, voir_page, chercher, champs, aller_page) :
// Claude peut résumer un document ou répondre à une question dessus sans te déranger. Ce qui modifie
// un document (surligner, écrire, remplir un champ) ou l'enregistre sur le disque affiche la carte
// Autoriser / Refuser. Les modifications se voient tout de suite dans la page et s'annulent avec
// Ctrl+Z ; elles ne vont dans le fichier qu'à l'enregistrement.
// Claude ne signe jamais à ta place : la signature reste un geste à toi (bouton Signer).
//
// Un document se désigne par son numéro d'onglet (0 = le premier), son nom, ou pas du tout
// (= le document affiché).

(() => {
  const C = App.claude;
  const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
  const refDoc = { type: ['number', 'string'], description: 'Numéro de l\'onglet (0 = le premier) ou nom du fichier. Sans : le document affiché.' };

  const ongletDe = (ref) => {
    const liste = C.onglets();
    if (!liste.length) throw new Error('Aucun document ouvert dans Mímir. Ouvre-en un avec ouvrir_document.');
    let o;
    if (ref === undefined || ref === null || ref === '') o = C.actif();
    else if (typeof ref === 'number' || /^\d+$/.test(ref)) o = liste[Number(ref)];
    else o = liste.find((x) => x.nom === ref || x.chemin === ref) || liste.find((x) => x.nom.toLowerCase().includes(String(ref).toLowerCase()));
    if (!o) throw new Error(`Pas de document « ${ref} ». Ouverts : ${liste.map((x, i) => `${i} = ${x.nom}`).join(', ')}.`);
    return o;
  };
  const lecteurDe = async (ref) => C.attendre(ongletDe(ref));
  const pdfDe = async (ref) => {
    const l = await lecteurDe(ref);
    if (l.type !== 'pdf') throw new Error(`${l.doc.nom} n'est pas un PDF : cette action ne marche que sur les PDF.`);
    return l;
  };
  // On montre à Ragna le document sur lequel Claude travaille.
  const montrer = (ref) => { const o = ongletDe(ref); if (o !== C.actif()) C.activer(o); return o; };

  ClaudePanneau.actions({
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde les documents ouverts',
      description: 'Les documents ouverts dans Mímir (onglets), celui qui est affiché, et pour chacun : type, nombre de pages, page affichée, titre, auteur, modifié ou non. Avec document : le détail de ce document, avec son sommaire.',
      schema: obj({ document: refDoc }),
      faire: async ({ document } = {}) => {
        const liste = C.onglets();
        if (!liste.length) return 'Aucun document ouvert dans Mímir.';
        if (document !== undefined) {
          const l = await lecteurDe(document);
          const s = l.sommaire();
          return JSON.stringify({ ...l.infos(), sommaire: s.length ? s.map((x) => `${'  '.repeat(x.niveau)}${x.titre}`).join('\n') : '(pas de sommaire)' }, null, 1);
        }
        const actif = C.actif();
        return [
          `Document affiché : ${actif ? actif.nom : 'aucun'}`,
          ...liste.map((o, i) => `${i} = ${JSON.stringify(o.lecteur ? o.lecteur.infos() : { nom: o.nom, chemin: o.chemin, etat: 'en cours d\'ouverture' })}`),
        ].join('\n');
      },
    },
    lire_texte: {
      lecture: true,
      icone: 'book',
      libelle: ({ de, a, chapitre }) => (chapitre ? `Lit le chapitre ${chapitre}` : de ? `Lit les pages ${de}${a && a !== de ? ` à ${a}` : ''}` : 'Lit le document'),
      description: 'Le texte d\'un document. PDF : pages de « de » à « a » (au plus 30 pages par appel ; sans rien, la page affichée). EPUB : un chapitre (numéro dans l\'ordre de lecture, ou le chapitre affiché). Word, Markdown, texte : tout le texte. Les pages scannées (images) n\'ont pas de texte : regarde-les avec voir_page.',
      schema: obj({ document: refDoc, de: { type: 'number' }, a: { type: 'number' }, chapitre: { type: 'number' } }),
      faire: async ({ document, de, a, chapitre } = {}) => {
        const l = await lecteurDe(document);
        if (l.type === 'pdf') {
          const debut = de || l.page || 1;
          const fin = Math.min(a || debut, debut + 29, l.nbPages);
          return `${l.doc.nom} (${l.nbPages} pages)\n\n${await l.texte({ de: debut, a: fin })}${fin < (a || debut) ? `\n\n(Arrêté à la page ${fin} : redemande la suite.)` : ''}`;
        }
        const t = await l.texte({ chapitre });
        return t.length > 120000 ? `${t.slice(0, 120000)}\n\n(Texte coupé : il est trop long pour un seul appel.)` : t;
      },
    },
    voir_page: {
      lecture: true,
      icone: 'eye',
      libelle: ({ page }) => (page ? `Regarde la page ${page}` : 'Regarde la page affichée'),
      description: 'Une image de la page (PDF, BD) ou de l\'image affichée, pour voir la mise en page, un schéma, un tableau ou une page scannée. Sans page : la page affichée.',
      schema: obj({ document: refDoc, page: { type: 'number' } }),
      faire: async ({ document, page } = {}) => {
        const l = await lecteurDe(document);
        const image = await l.image(page);
        if (!image) return `${l.doc.nom} ne se regarde pas en image (lis son texte avec lire_texte).`;
        return { texte: `${l.doc.nom}${page ? `, page ${page}` : ''}`, image };
      },
    },
    chercher: {
      lecture: true,
      icone: 'search',
      libelle: ({ texte }) => `Cherche « ${texte} »`,
      description: 'Cherche un mot ou une phrase dans un document (insensible à la casse) : les pages (ou chapitres) où il apparaît, avec un extrait autour. Au plus 40 résultats.',
      schema: obj({ document: refDoc, texte: { type: 'string' } }, ['texte']),
      faire: async ({ document, texte }) => {
        if (!texte) throw new Error('Il faut le texte à chercher.');
        const r = await (await lecteurDe(document)).chercherTexte(texte);
        if (!r.length) return `« ${texte} » n'apparaît pas dans le document.`;
        return r.map((x) => `${x.page ? `p. ${x.page}` : x.chapitre ? `chap. ${x.chapitre}` : '-'} : ${x.extrait}`).join('\n');
      },
    },
    aller_page: {
      lecture: true,
      icone: 'go-to-file',
      libelle: ({ page }) => `Montre la page ${page}`,
      description: 'Affiche une page du document à Ragna (PDF, BD ; pour un EPUB, un pourcentage du livre). Montre aussi ce document s\'il est dans un autre onglet.',
      schema: obj({ document: refDoc, page: { type: 'number' } }, ['page']),
      faire: async ({ document, page }) => {
        montrer(document);
        const l = await lecteurDe(document);
        l.allerPage(page);
        return `Page ${page} affichée.`;
      },
    },
    ouvrir_document: {
      icone: 'folder-opened',
      libelle: ({ chemin }) => `Ouvre ${nomFichier(chemin || '')}`,
      description: 'Ouvre un fichier dans un nouvel onglet de Mímir (chemin complet). Formats : PDF, EPUB, CBZ, CBR, DOCX, images, TXT, MD…',
      schema: obj({ chemin: { type: 'string' } }, ['chemin']),
      faire: async ({ chemin }) => {
        const o = await C.ouvrir(String(chemin));
        if (!o?.lecteur) throw new Error(`${chemin} n'a pas pu s'ouvrir.`);
        return `Ouvert : ${JSON.stringify(o.lecteur.infos())}`;
      },
    },
    champs: {
      lecture: true,
      icone: 'checklist',
      libelle: () => 'Regarde les champs du formulaire',
      description: 'Les champs à remplir d\'un formulaire PDF : nom, type (text, checkbox, radiobutton, combobox, listbox, signature), valeur actuelle, choix possibles, page. Regarde aussi la page (voir_page) pour comprendre à quoi correspond chaque champ.',
      schema: obj({ document: refDoc }),
      faire: async ({ document } = {}) => {
        const l = await pdfDe(document);
        const c = await l.champs();
        if (!c.length) return `${l.doc.nom} n'a pas de champs de formulaire. Pour écrire sur la page, utilise ecrire_texte.`;
        return JSON.stringify(c, null, 1);
      },
    },
    remplir_champs: {
      icone: 'edit',
      libelle: ({ valeurs }) => `Remplit ${Object.keys(valeurs || {}).length} champ(s) du formulaire`,
      description: 'Remplit des champs d\'un formulaire PDF : valeurs = { "nom du champ": valeur }. Texte : une chaîne ; case à cocher : true/false ; bouton radio : la valeur du choix ; liste : le texte du choix. Ragna voit les champs se remplir ; rien n\'est écrit dans le fichier avant enregistrer.',
      schema: obj({ document: refDoc, valeurs: { type: 'object' } }, ['valeurs']),
      faire: async ({ document, valeurs }) => {
        montrer(document);
        const l = await pdfDe(document);
        const faits = [], pages = new Set();
        for (const [nom, v] of Object.entries(valeurs || {})) {
          const p = await l.remplir(nom, v);
          faits.push(nom);
          if (p) pages.add(p);
        }
        if (pages.size) l.allerPage(Math.min(...pages));
        return `${faits.length} champ(s) remplis : ${faits.join(', ')}. Pas encore enregistré dans le fichier.`;
      },
    },
    surligner: {
      icone: 'symbol-color',
      libelle: ({ texte }) => `Surligne « ${String(texte || '').slice(0, 60)}${String(texte || '').length > 60 ? '…' : ''} »`,
      description: 'Surligne un passage d\'un PDF, comme au surligneur. texte = le passage exact (copié du texte de la page, de préférence sur une seule ligne) ; page = où le chercher (sinon tout le document, première occurrence). couleur : yellow, green, blue, pink ou red.',
      schema: obj({ document: refDoc, texte: { type: 'string' }, page: { type: 'number' }, couleur: { type: 'string', enum: ['yellow', 'green', 'blue', 'pink', 'red'] } }, ['texte']),
      faire: async ({ document, texte, page, couleur }) => {
        montrer(document);
        const l = await pdfDe(document);
        const p = await l.surligner(String(texte), { page, couleur });
        return `Passage surligné page ${p}. Pas encore enregistré dans le fichier.`;
      },
    },
    ecrire_texte: {
      icone: 'whole-word',
      libelle: ({ texte }) => `Écrit « ${String(texte || '').slice(0, 50)} » sur la page`,
      description: 'Écrit un texte (une note, une date, une réponse sur un formulaire sans champs) sur une page d\'un PDF. x, y = position du coin en haut à gauche du texte, en part de la page (0 à 1, depuis le haut à gauche ; regarde la page avec voir_page pour viser). taille en points (12 par défaut), couleur en #rrggbb.',
      schema: obj({ document: refDoc, texte: { type: 'string' }, page: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, taille: { type: 'number' }, couleur: { type: 'string' } }, ['texte']),
      faire: async ({ document, texte, page, x, y, taille, couleur }) => {
        montrer(document);
        const l = await pdfDe(document);
        const p = await l.ecrire(String(texte), { page: page || l.page, x, y, taille, couleur });
        return `Texte posé page ${p} (Ragna peut le déplacer à la souris). Pas encore enregistré dans le fichier.`;
      },
    },
    enregistrer: {
      icone: 'save',
      libelle: ({ copie }) => (copie ? 'Enregistre une copie du PDF' : 'Enregistre le PDF'),
      description: 'Enregistre un PDF avec ses annotations et ses champs remplis. Par défaut : dans le même fichier. copie = true : Ragna choisit où enregistrer une copie.',
      schema: obj({ document: refDoc, copie: { type: 'boolean' } }),
      faire: async ({ document, copie } = {}) => {
        const l = await pdfDe(document);
        const r = await l.enregistrer({ sous: Boolean(copie) });
        return r ? `Enregistré : ${r.chemin}` : 'Enregistrement annulé par Ragna.';
      },
    },
  });
})();
