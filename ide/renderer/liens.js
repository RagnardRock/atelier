// Ctrl+clic sur un lien d'une page HTML (href="vie.html", src="img/logo.png"…) : ouvre le fichier
// dans un onglet de Rune.
//
// Monaco sait repérer ces liens, mais il ne sait pas d'où part le fichier : « vie.html » devenait
// « \vie.html » (la racine du disque), refusé car hors du dossier ouvert. On remplace donc son
// repérage par le nôtre, qui part du bon endroit, comme le ferait un navigateur :
// - « vie.html », « ../css/style.css » : depuis le dossier du fichier ouvert ;
// - « /images/logo.png » : depuis le dossier ouvert dans Rune (la racine du site) ;
// - « blog/ » : le index.html de ce dossier ;
// - les adresses web (https://…), mailto:, tel:, #ancre… sont laissées au navigateur ou ignorées.
// Le fichier visé doit toujours être dans le dossier ouvert (main.js le vérifie).

const Liens = (() => {
  // Attributs qui pointent vers un fichier.
  const ATTRIBUT = /\b(href|src|action|poster|data)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  const WEB = /^(https?:)?\/\//i;
  const AUTRE_SCHEMA = /^[a-z][a-z0-9+.-]*:/i; // mailto:, tel:, data:, javascript:…
  const MODELE = /\{\{|\$\{|<\?|\{%/; // {{ var }}, ${var}… : pas un vrai chemin

  // Chemin complet du fichier visé par « ref », écrit dans le fichier « depuis ».
  // root : dossier ouvert. sep : « \ » sous Windows, « / » ailleurs. null si ce n'est pas un fichier.
  function resoudre(ref, depuis, root, sep) {
    let r = String(ref || '').trim();
    if (!r || r.startsWith('#') || WEB.test(r) || AUTRE_SCHEMA.test(r) || MODELE.test(r)) return null;
    r = r.replace(/[?#].*$/, '');
    if (!r) return null;
    try { r = decodeURIComponent(r); } catch { /* % sans code : on garde tel quel */ }
    if (r.endsWith('/')) r += 'index.html';
    const morceaux = r.split(/[\\/]/);
    let base;
    if (r.startsWith('/') || r.startsWith('\\')) {
      if (!root) return null;
      base = root;
    } else {
      const i = Math.max(depuis.lastIndexOf('/'), depuis.lastIndexOf('\\'));
      base = i >= 0 ? depuis.slice(0, i) : depuis;
    }
    const pile = base.split(/[\\/]/);
    const garde = pile.length > 0 && pile[0] === '' ? 1 : 0; // « /home/… » : le premier vide est la racine
    for (const m of morceaux) {
      if (!m || m === '.') continue;
      if (m === '..') { if (pile.length > garde + 1) pile.pop(); } else pile.push(m);
    }
    return pile.join(sep);
  }

  // Liens trouvés dans un texte HTML : [{ debut, fin, ref }] (positions dans le texte, sans les guillemets).
  function trouver(texte) {
    const liens = [];
    for (const m of texte.matchAll(ATTRIBUT)) {
      const ref = m[3] ?? m[4];
      if (!ref.trim()) continue;
      const debut = m.index + m[0].length - ref.length - 1;
      liens.push({ debut, fin: debut + ref.length, ref });
    }
    return liens;
  }

  // Appelé au démarrage (app.js), une fois Monaco chargé.
  function init() {
    const html = monaco.languages.html;
    // Le repérage de Monaco envoie les liens au mauvais endroit : on le coupe pour HTML.
    for (const d of [html?.htmlDefaults, html?.handlebarDefaults, html?.razorDefaults]) {
      d?.setModeConfiguration({ ...d.modeConfiguration, links: false });
    }
    const windows = window.atelier.platform === 'win32';
    const sep = windows ? '\\' : '/';
    // Monaco écrit la lettre du disque en minuscule (« d:\ ») : on reprend celle du dossier ouvert,
    // sinon le même fichier pourrait s'ouvrir dans deux onglets.
    const cheminRune = (p) => {
      const root = state.root;
      if (windows && root && p.toLowerCase().startsWith(root.toLowerCase())) return root + p.slice(root.length);
      return p;
    };
    monaco.languages.registerLinkProvider('html', {
      provideLinks(model) {
        // Le chemin tel que Rune le connaît (Monaco écrirait « d:\ » au lieu de « D:\ »).
        const depuis = [...state.files.values()].find((f) => f.model === model)?.path || model.uri.fsPath;
        const links = [];
        for (const lien of trouver(model.getValue())) {
          const debut = model.getPositionAt(lien.debut);
          const fin = model.getPositionAt(lien.fin);
          const range = new monaco.Range(debut.lineNumber, debut.column, fin.lineNumber, fin.column);
          if (WEB.test(lien.ref.trim())) {
            const url = lien.ref.trim().startsWith('//') ? `https:${lien.ref.trim()}` : lien.ref.trim();
            links.push({ range, url });
            continue;
          }
          const cible = resoudre(lien.ref, depuis, state.root, sep);
          if (cible) links.push({ range, url: monaco.Uri.file(cible), tooltip: 'Ouvrir le fichier' });
        }
        return { links };
      },
    });
    // Un lien vers un fichier : on l'ouvre dans un onglet de Rune (et pas dans l'explorateur).
    monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        if (resource.scheme !== 'file') return false;
        const sel = selectionOrPosition;
        const line = sel?.startLineNumber ?? sel?.lineNumber ?? 0;
        const col = sel?.startColumn ?? sel?.column ?? 1;
        openAt(cheminRune(resource.fsPath), line, col, 0, { preview: false });
        return true;
      },
    });
  }

  return { init, resoudre, trouver };
})();
