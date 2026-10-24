// Ce que Claude peut faire dans Edda (panneau Claude, ../commun/claude-panneau.js).
//
// Chaque action est décrite pour Claude (description, paramètres) et faite ici, dans la fenêtre,
// avec les mêmes fonctions que les boutons d'Edda (App.claude, dans app.js), sans leurs fenêtres.
// Les actions « lecture » (documents, lire_document, lire_selection, choisir_document) ne demandent
// pas la permission ; les autres affichent la carte Autoriser / Refuser du panneau.
//
// Tout ce que Claude écrit dans la page passe par execCommand : Ctrl+Z l'annule, comme ta frappe.
// Claude écrit en Markdown (ou en HTML simple) : Edda le met en forme comme le reste de la page.
//
// Un document se désigne par son numéro dans les onglets (0 = le premier), par son nom, ou pas du
// tout (= l'onglet affiché).

(() => {
  const C = App.claude;
  const refDoc = { type: ['number', 'string'], description: 'Numéro de l\'onglet (0 = le premier) ou nom du document. Sans : celui affiché.' };
  const contenu = { type: 'string', description: 'Le texte à écrire, en Markdown (# titre, **gras**, listes, tableaux |…|), ou en HTML si html vaut true.' };
  const html = { type: 'boolean', description: 'true : contenu est du HTML (pour les couleurs, l\'alignement, les polices : <span style="color:#c00">, <p style="text-align:center">…).' };
  const LIMITE = 60000; // caractères rendus par lire_document en une fois

  const docDe = (ref) => {
    const liste = C.docs();
    let d;
    if (ref === undefined || ref === null || ref === '') d = C.actif();
    else if (typeof ref === 'number' || /^\d+$/.test(ref)) d = liste[Number(ref)];
    else d = liste.find((x) => x.nom === ref || x.chemin === ref) || liste.find((x) => x.nom.toLowerCase().startsWith(String(ref).toLowerCase()));
    if (!d) throw new Error(liste.length ? `Pas de document « ${ref ?? ''} ». Les onglets : ${liste.map((x, i) => `${i} = ${x.nom}`).join(', ')}.` : 'Aucun document ouvert dans Edda (nouveau_document ou ouvrir_document).');
    return d;
  };
  // Écrire dans un document : il passe au premier plan (tu vois ce que Claude fait).
  const docEcrit = (ref) => { const d = docDe(ref); C.activer(d); return d; };
  const versHtml = (a) => (a.html ? String(a.contenu ?? '') : marked.parse(String(a.contenu ?? ''), { gfm: true }));
  const mots = (t) => (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

  // Écrire au début ou à la fin de la page, dans un paragraphe à part (sans se mêler au titre du
  // début ou au dernier paragraphe). Au début : la page est réécrite avec le nouveau contenu devant
  // (en une seule étape, annulable). À la fin : le curseur va sur une nouvelle ligne vide.
  function placer(d, ou) {
    const s = window.getSelection();
    const curseur = (noeud, debut) => {
      const r = document.createRange();
      r.selectNodeContents(noeud);
      r.collapse(debut);
      s.removeAllRanges();
      s.addRange(r);
    };
    d.page.focus({ preventScroll: true });
    const dernier = d.page.lastElementChild;
    const vide = (b) => !b.textContent.trim() && !b.querySelector('img, video, audio, hr, table');
    if (dernier && /^(P|H[1-6]|BLOCKQUOTE|PRE)$/.test(dernier.tagName)) {
      curseur(dernier, false);
      if (!vide(dernier)) document.execCommand('insertParagraph');
      if (/^H[1-6]$/.test(Editeur.blocCourant()?.tagName || '')) document.execCommand('formatBlock', false, 'p');
    } else {
      // Après un tableau ou une liste : une ligne vide est ajoutée en dessous.
      Editeur.remplacerTout(`${d.page.innerHTML}<p><br></p>`);
      curseur(d.page.lastElementChild, true);
    }
    Editeur.memoriser();
  }
  function ecrireA(d, ou, html) {
    if (ou === 'debut') {
      Editeur.remplacerTout(html + d.page.innerHTML);
      return;
    }
    if (ou === 'fin' || !Editeur.selection() || !d.page.contains(Editeur.selection().startContainer)) placer(d, 'fin');
    Editeur.inserer(html);
  }

  // Un chemin donné par Claude : absolu, ou relatif au dossier du projet (celui du panneau Claude).
  async function cheminDe(chemin) {
    const c = String(chemin || '').trim();
    if (!c) throw new Error('Il faut un chemin.');
    if (/^([a-zA-Z]:)?[\\/]/.test(c)) return c;
    const p = await window.claude.projet().catch(() => null);
    if (!p?.dossier) throw new Error('Pas de projet : donne un chemin complet.');
    return `${p.dossier}/${c}`;
  }

  const decrire = (d, i) => ({
    numero: i, nom: d.nom, affiche: d === C.actif(), chemin: d.chemin || '(pas encore enregistré)', format: d.format || '-',
    modifie: d.modifie, mots: mots(d.page.innerText || ''),
    mise_en_page: `${d.miseEnPage.format} ${d.miseEnPage.orientation}, marges ${Object.values(d.miseEnPage.marges).join('/')} cm (haut/bas/gauche/droite), police ${d.police} ${d.taille} pt`,
  });

  ClaudePanneau.actions({
    documents: {
      lecture: true,
      icone: 'files',
      libelle: () => 'Regarde les documents ouverts',
      description: 'Les documents ouverts dans Edda (un onglet chacun) : numéro, nom, chemin, format, modifié ou non, nombre de mots, mise en page. Et les formats qu\'Edda sait lire et écrire.',
      faire: () => {
        const liste = C.docs().map(decrire);
        const formats = Object.values(Formats.liste).map((f) => `${f.id} (.${f.extensions.join(', .')})`).join(', ');
        return `${liste.length ? JSON.stringify(liste, null, 1) : 'Aucun document ouvert.'}\n\nFormats : ${formats}.`;
      },
    },
    lire_document: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Lit ${a.document ?? 'le document affiché'}`,
      description: `Le contenu d'un document : en markdown (par défaut, le plus court), en html (avec les couleurs, polices, tailles, alignements, et l'adresse des images) ou en texte brut. Au-delà de ${LIMITE} caractères, lis la suite avec debut.`,
      schema: { type: 'object', properties: { document: refDoc, format: { type: 'string', enum: ['markdown', 'html', 'texte'] }, debut: { type: 'number', description: 'À partir de quel caractère (0 par défaut).' } } },
      faire: (a) => {
        const d = docDe(a.document);
        const f = a.format || 'markdown';
        const tout = f === 'html' ? d.page.innerHTML : f === 'texte' ? d.page.innerText : Formats.versMarkdown(d.page);
        const debut = Math.max(0, Number(a.debut) || 0);
        const morceau = tout.slice(debut, debut + LIMITE);
        const suite = debut + LIMITE < tout.length ? `\n\n[… ${tout.length - debut - LIMITE} caractères de plus : lire_document avec debut ${debut + LIMITE}]` : '';
        return `${d.nom} (${f}, ${tout.length} caractères) :\n\n${morceau}${suite}`;
      },
    },
    lire_selection: {
      lecture: true,
      icone: 'selection',
      libelle: () => 'Lit le texte sélectionné',
      description: 'Le texte sélectionné dans le document affiché (en Markdown), avec le paragraphe autour. Vide : rien n\'est sélectionné, le curseur est dans ce paragraphe.',
      faire: () => {
        const d = docDe();
        const r = Editeur.selection();
        if (!r || !d.page.contains(r.startContainer)) return 'Pas de curseur dans la page.';
        const bloc = Editeur.blocCourant();
        const autour = bloc ? `\n\nParagraphe autour : ${bloc.innerText.trim()}` : '';
        if (r.collapsed) return `Rien n'est sélectionné.${autour}`;
        const div = el('div');
        div.append(r.cloneContents());
        return `Sélection :\n${Formats.versMarkdown(div)}${autour}`;
      },
    },
    choisir_document: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Affiche ${a.document}`,
      description: 'Affiche un des documents ouverts (change d\'onglet).',
      schema: { type: 'object', properties: { document: refDoc }, required: ['document'] },
      faire: (a) => { C.activer(docDe(a.document)); return 'Fait.'; },
    },
    inserer: {
      icone: 'insert',
      libelle: (a) => `Écrit dans ${a.document ?? 'le document'} (${a.ou === 'debut' ? 'au début' : a.ou === 'fin' ? 'à la fin' : 'au curseur'})`,
      description: 'Ajoute du texte dans un document : au curseur (par défaut, remplace la sélection s\'il y en a une), au début ou à la fin. Annulable avec Ctrl+Z.',
      schema: { type: 'object', properties: { contenu, html, ou: { type: 'string', enum: ['curseur', 'debut', 'fin'] }, document: refDoc }, required: ['contenu'] },
      faire: (a) => {
        const d = docEcrit(a.document);
        ecrireA(d, a.ou, versHtml(a));
        return `Écrit dans ${d.nom}.`;
      },
    },
    remplacer_selection: {
      icone: 'replace',
      libelle: () => 'Remplace le texte sélectionné',
      description: 'Remplace le texte sélectionné dans le document affiché (voir lire_selection) par contenu. Annulable avec Ctrl+Z.',
      schema: { type: 'object', properties: { contenu, html }, required: ['contenu'] },
      faire: (a) => {
        const d = docEcrit();
        const r = Editeur.selection();
        if (!r || r.collapsed || !d.page.contains(r.startContainer)) throw new Error('Rien n\'est sélectionné dans la page.');
        // Un seul paragraphe remplacé par un seul paragraphe : on garde le paragraphe (et son style).
        let h = versHtml(a);
        const seul = /^<p>([\s\S]*)<\/p>\s*$/.exec(h.trim());
        if (seul && !seul[1].includes('<p>')) h = seul[1];
        Editeur.inserer(h);
        return 'Sélection remplacée.';
      },
    },
    remplacer_texte: {
      icone: 'replace-all',
      libelle: (a) => `Remplace « ${String(a.chercher).slice(0, 40)} » par « ${String(a.remplacer).slice(0, 40)} »`,
      description: 'Cherche un texte exact dans un document et le remplace (la mise en forme autour est gardée). tout : toutes les occurrences (sinon la première). casse : respecter majuscules et minuscules (oui par défaut).',
      schema: { type: 'object', properties: { chercher: { type: 'string' }, remplacer: { type: 'string' }, tout: { type: 'boolean' }, casse: { type: 'boolean' }, document: refDoc }, required: ['chercher', 'remplacer'] },
      faire: (a) => {
        const d = docEcrit(a.document);
        const cherche = String(a.chercher);
        if (!cherche) throw new Error('chercher est vide.');
        const casse = a.casse !== false;
        // Le texte de la page, nœud par nœud (comme Rechercher, recherche.js).
        const noeuds = [];
        let texte = '';
        const w = document.createTreeWalker(d.page, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) { noeuds.push({ n, debut: texte.length }); texte += n.nodeValue; }
        const A = casse ? texte : texte.toLowerCase(), B = casse ? cherche : cherche.toLowerCase();
        const position = (i, fin) => {
          let k = noeuds.length - 1;
          while (k > 0 && (fin ? noeuds[k].debut >= i : noeuds[k].debut > i)) k--;
          return { node: noeuds[k].n, offset: i - noeuds[k].debut };
        };
        const trouves = [];
        for (let i = A.indexOf(B); i >= 0; i = A.indexOf(B, i + B.length)) {
          const r = document.createRange();
          const dd = position(i, false), ff = position(i + B.length, true);
          r.setStart(dd.node, dd.offset);
          r.setEnd(ff.node, ff.offset);
          trouves.push(r);
          if (!a.tout) break;
        }
        if (!trouves.length) throw new Error(`« ${cherche} » n'est pas dans ${d.nom}.`);
        d.page.focus({ preventScroll: true });
        const s = window.getSelection();
        // De la fin vers le début : les positions restent justes.
        for (const r of trouves.reverse()) {
          s.removeAllRanges();
          s.addRange(r);
          if (a.remplacer) document.execCommand('insertText', false, String(a.remplacer));
          else document.execCommand('delete');
        }
        Editeur.memoriser();
        return `${trouves.length} remplacement(s) dans ${d.nom}.`;
      },
    },
    ecrire_document: {
      icone: 'edit',
      libelle: (a) => `Réécrit tout ${a.document ?? 'le document'}`,
      description: 'Remplace tout le contenu d\'un document par contenu (pour une réécriture complète ; pour une partie, préfère remplacer_texte ou inserer). Annulable avec Ctrl+Z.',
      schema: { type: 'object', properties: { contenu, html, document: refDoc }, required: ['contenu'] },
      faire: (a) => {
        const d = docEcrit(a.document);
        Editeur.remplacerTout(versHtml(a));
        return `${d.nom} réécrit (${mots(d.page.innerText)} mots).`;
      },
    },
    nouveau_document: {
      icone: 'new-file',
      libelle: (a) => `Crée le document ${a.nom || 'sans nom'}`,
      description: 'Ouvre un nouveau document (pas encore enregistré), avec contenu si tu le donnes.',
      schema: { type: 'object', properties: { nom: { type: 'string' }, contenu, html } },
      faire: (a) => {
        const d = C.nouveau(a.nom ? String(a.nom) : null);
        if (a.contenu) Editeur.remplacerTout(versHtml(a));
        return `Document ${d.nom} ouvert (numéro ${C.docs().indexOf(d)}).`;
      },
    },
    inserer_media: {
      icone: 'file-media',
      libelle: (a) => `Insère ${nomFichier(String(a.chemin || ''))}`,
      description: 'Insère une image, une vidéo ou un son (chemin relatif au projet, ou absolu) au curseur, au début ou à la fin du document affiché. Images : png, jpg, gif, webp, svg… ; vidéos : mp4, webm… ; sons : mp3, wav, ogg…',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, ou: { type: 'string', enum: ['curseur', 'debut', 'fin'] } }, required: ['chemin'] },
      faire: async (a) => {
        const d = docEcrit();
        const chemin = await cheminDe(a.chemin);
        if (!(await window.edda.decrireMedia(chemin))) throw new Error(`Ce n'est pas une image, une vidéo ou un son (ou le fichier n'existe pas) : ${chemin}`);
        if (a.ou === 'debut') {
          // Au début : une ligne vide devant, puis le média dedans.
          Editeur.remplacerTout(`<p><br></p>${d.page.innerHTML}`);
          const r = document.createRange();
          r.selectNodeContents(d.page.firstElementChild);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(r);
          Editeur.memoriser();
        } else if (a.ou === 'fin' || !Editeur.selection() || !d.page.contains(Editeur.selection().startContainer)) placer(d, 'fin');
        await MediasPage.insererFichiers([chemin]);
        return `Inséré dans ${d.nom}.`;
      },
    },
    mise_en_page: {
      icone: 'layout',
      libelle: () => 'Change la mise en page',
      description: 'Change la mise en page d\'un document : papier (A4, A5, A3, Letter, Legal), orientation (portrait, paysage), marges en cm (seulement celles à changer), police et taille (pt) du texte courant.',
      schema: {
        type: 'object',
        properties: {
          document: refDoc,
          papier: { type: 'string', enum: Object.keys(Formats.PAPIERS) },
          orientation: { type: 'string', enum: ['portrait', 'paysage'] },
          marges: { type: 'object', properties: { haut: { type: 'number' }, bas: { type: 'number' }, gauche: { type: 'number' }, droite: { type: 'number' } } },
          police: { type: 'string' },
          taille: { type: 'number' },
        },
      },
      faire: (a) => {
        const d = docEcrit(a.document);
        const mp = {};
        if (a.papier) mp.format = a.papier;
        if (a.orientation) mp.orientation = a.orientation;
        if (a.marges) {
          mp.marges = {};
          for (const [k, v] of Object.entries(a.marges)) if (['haut', 'bas', 'gauche', 'droite'].includes(k) && Number(v) >= 0 && Number(v) < 10) mp.marges[k] = Number(v);
        }
        if (a.police) d.police = String(a.police);
        if (a.taille) d.taille = Math.min(72, Math.max(6, Number(a.taille)));
        C.appliquerMiseEnPage(d, mp);
        return `Mise en page : ${decrire(d, 0).mise_en_page}.`;
      },
    },
    enregistrer: {
      icone: 'save',
      libelle: (a) => `Enregistre ${a.document ?? 'le document'}`,
      description: 'Enregistre un document déjà enregistré une fois, à sa place et dans son format. Un document neuf : utilise enregistrer_sous.',
      schema: { type: 'object', properties: { document: refDoc } },
      faire: async (a) => {
        const d = docDe(a.document);
        if (!d.chemin) throw new Error(`${d.nom} n'a jamais été enregistré : utilise enregistrer_sous avec un chemin.`);
        if (!(await C.enregistrer(d))) throw new Error('L\'enregistrement n\'a pas été fait (voir le message dans Edda).');
        return `Enregistré : ${d.chemin}`;
      },
    },
    enregistrer_sous: {
      icone: 'save-as',
      libelle: (a) => `Enregistre sous ${a.chemin}`,
      description: 'Enregistre un document dans le dossier du projet (chemin relatif au projet). Le format vient de l\'extension : .docx (Word), .odt (LibreOffice), .rtf, .md, .html, .txt. Les images, vidéos et sons sont rangés à côté (dans « nom-medias » ou dans le fichier lui-même pour les images d\'un .docx/.odt/.rtf).',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, document: refDoc }, required: ['chemin'] },
      faire: async (a) => {
        const d = docDe(a.document);
        if (!Formats.deExtension(extension(String(a.chemin)))) throw new Error(`Extension inconnue. Possibles : ${Object.values(Formats.liste).map((f) => `.${f.extensions[0]}`).join(', ')}.`);
        // Le fichier est créé par le panneau Claude, qui n'écrit que dans le dossier du projet ;
        // ensuite Edda l'adopte (il a le droit de l'écrire, et de ranger ses médias à côté).
        let plein;
        try { plein = (await window.claude.lireFichier(String(a.chemin))).path; } catch { plein = await window.claude.ecrireFichier(String(a.chemin), new Uint8Array(0)); }
        const info = await window.edda.adopter(plein);
        if (!(await C.enregistrer(d, { vers: info.chemin }))) throw new Error('L\'enregistrement n\'a pas été fait (voir le message dans Edda).');
        return `Enregistré : ${d.chemin}`;
      },
    },
    ouvrir_document: {
      icone: 'folder-opened',
      libelle: (a) => `Ouvre ${a.chemin}`,
      description: 'Ouvre un document du dossier du projet (chemin relatif au projet) dans un nouvel onglet : .docx, .odt, .rtf, .md, .html, .txt.',
      schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        const f = await window.claude.lireFichier(String(a.chemin));
        const deja = C.docs().find((x) => x.chemin && x.chemin.toLowerCase() === f.path.toLowerCase());
        if (deja) { C.activer(deja); return `${deja.nom} était déjà ouvert : il est affiché.`; }
        const info = await window.edda.adopter(f.path);
        const d = await C.ouvrirOctets(info, new Uint8Array(f.bytes));
        if (!d) throw new Error(`${info.nom} n'a pas pu être ouvert (voir le message dans Edda).`);
        return `Ouvert : ${d.nom} (numéro ${C.docs().indexOf(d)}, ${mots(d.page.innerText)} mots).`;
      },
    },
  });
})();
