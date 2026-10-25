// Tafl 0.30 : chercher partout (Ctrl+K). Une seule case pour trouver un espace, une carte, un
// événement (par son nom ou une phrase de ses dialogues), une donnée du pack de règles du jeu, une
// tuile, un tampon, ou une commande des menus. Entrée y va ; ↑ et ↓ choisissent ; Échap ferme.
const Recherche = (() => {
  let ouvert = null; // { root, input, liste, resultats, choisi }
  const MAX_PAR_GROUPE = 6;
  const MAX = 60;

  // Sans accents ni majuscules, un caractère pour un caractère (pour surligner au bon endroit).
  const plat = (s) => Array.from(String(s || ''), (c) => c.normalize('NFD')[0].toLowerCase()).join('');
  // Le morceau trouvé, surligné.
  function surligne(texte, q) {
    const i = plat(texte).indexOf(q);
    if (!q || i < 0) return [texte];
    return [texte.slice(0, i), el('mark', { textContent: texte.slice(i, i + q.length) }), texte.slice(i + q.length)];
  }
  // Un extrait autour du mot trouvé dans un long texte (un dialogue).
  function extrait(texte, q) {
    const i = plat(texte).indexOf(q);
    if (i < 0) return '';
    const a = Math.max(0, i - 28), b = Math.min(texte.length, i + q.length + 40);
    return `${a ? '…' : ''}${texte.slice(a, b)}${b < texte.length ? '…' : ''}`;
  }

  // Tout ce qui peut se trouver : [{ groupe, icone, nom, cle (texte cherché), detail, keys, aller }].
  function sources() {
    const doc = App.doc;
    const out = [];
    for (const [i, e] of Espaces.LISTE.entries()) {
      if (!doc && e.id !== 'accueil') continue;
      out.push({ groupe: 'Espaces', icone: e.icone, nom: `Espace ${e.nom}`, detail: e.aide, keys: `Alt+${i + 1}`, aller: () => Espaces.aller(e.id) });
    }
    if (doc) {
      doc.maps.forEach((m, i) => out.push({ groupe: 'Cartes', icone: m.interieur ? 'home' : 'map', nom: m.name, cle: `${m.name} ${m.id} ${m.groupe || ''}`, detail: `${m.width} × ${m.height}${m.groupe ? ` · ${m.groupe}` : ''}${m.interieur ? ' · intérieur' : ''}`, aller: () => { App.selectMap(i); Espaces.aller('cartes'); } }));
      for (const m of doc.maps) {
        for (const e of m.events) {
          const perso = Events.perso(doc, e.apparence?.personnage);
          const nom = e.nom || perso?.nom || e.id;
          // Les phrases de ses dialogues et de ses choix.
          const textes = [];
          for (const p of e.pages) Events.parcourir(p.commandes, (c) => {
            if (c.type === 'dire' && c.texte) textes.push(c.texte);
            if (c.type === 'choix') for (const o of c.options || []) if (o.texte) textes.push(o.texte);
          });
          out.push({ groupe: 'Événements', icone: Events.TYPE_ICONS[e.type] || 'circle', nom, cle: `${nom} ${e.id} ${perso?.nom || ''}`, textes, detail: `${m.name} · case ${e.x}, ${e.y}`, aller: () => Espaces.aller('evenements', { carte: m.id, evenement: e.id }) });
        }
      }
      if (doc.game) {
        for (const d of Espaces.ongletsDuPack(doc)) {
          const titre = Espaces.libelle(doc, d);
          if (d.unique) { out.push({ groupe: 'Données', icone: d.icon, nom: titre, detail: 'Données du jeu', aller: () => Espaces.aller('donnees', { tab: d.key }) }); continue; }
          for (const o of doc.data[d.key] || []) {
            const nom = o[d.nomKey || 'nom'] || o.id;
            out.push({ groupe: 'Données', icone: d.icon, nom, cle: `${nom} ${o.id}`, detail: `Données › ${titre}`, aller: () => Espaces.aller('donnees', { tab: d.key, id: o.id }) });
          }
        }
      }
      doc.tiles.forEach((t, i) => out.push({ groupe: 'Tuiles', icone: 'symbol-color', nom: t.name || `Tuile ${i}`, cle: `${t.name} ${t.categorie || ''} ${i}`, detail: `n° ${i}${t.categorie ? ` · ${t.categorie}` : ''}`, aller: () => { Espaces.aller('tuiles'); App.selectTile(i); } }));
      doc.stamps.forEach((st, i) => out.push({ groupe: 'Tampons', icone: 'layers', nom: st.name, detail: `${st.w} × ${st.h} cases`, aller: () => { Espaces.aller('cartes'); App.selectStamp(i); } }));
    }
    // Les commandes de tous les menus (celles qui ne sont pas grisées).
    for (const [menu, items] of Object.entries(App.MENUS)) {
      let liste = [];
      try { liste = items(); } catch { /* un menu qui a besoin d'un jeu ouvert */ }
      for (const it of liste) {
        if (!it || it.disabled || !it.run || it.submenu) continue;
        out.push({ groupe: 'Commandes', icone: 'symbol-event', nom: it.label.replace(/…$/, ''), cle: `${it.label} ${menu}`, detail: menu, keys: it.keys, aller: () => App.run(it.run) });
      }
    }
    return out;
  }

  function chercher(texte) {
    const q = plat(texte.trim());
    const tout = sources();
    if (!q) return tout.filter((r) => r.groupe === 'Espaces' || (r.groupe === 'Cartes' && App.doc?.maps.length <= 8));
    const trouves = [];
    for (const r of tout) {
      const cle = plat(r.cle || r.nom);
      let score = -1;
      if (plat(r.nom).startsWith(q)) score = 3;
      else if (plat(r.nom).includes(q)) score = 2;
      else if (cle.includes(q)) score = 1;
      else if (r.textes) {
        const t = r.textes.find((x) => plat(x).includes(q));
        if (t) { score = 0.5; r.detail = `${r.detail} · « ${extrait(t, q)} »`; }
      }
      if (score >= 0) trouves.push({ r, score });
    }
    const ordre = ['Espaces', 'Cartes', 'Événements', 'Données', 'Tuiles', 'Tampons', 'Commandes'];
    trouves.sort((a, b) => ordre.indexOf(a.r.groupe) - ordre.indexOf(b.r.groupe) || b.score - a.score);
    const parGroupe = {};
    return trouves.filter(({ r }) => (parGroupe[r.groupe] = (parGroupe[r.groupe] || 0) + 1) <= MAX_PAR_GROUPE).slice(0, MAX).map(({ r }) => r);
  }

  function rendre() {
    const { input, liste } = ouvert;
    const q = plat(input.value.trim());
    ouvert.resultats = chercher(input.value);
    ouvert.choisi = Math.min(ouvert.choisi, Math.max(0, ouvert.resultats.length - 1));
    liste.replaceChildren();
    let groupe = '';
    ouvert.resultats.forEach((r, i) => {
      if (r.groupe !== groupe) { groupe = r.groupe; liste.append(el('div', { className: 'recherche-groupe', textContent: groupe })); }
      const b = el('button', { className: `recherche-ligne${i === ouvert.choisi ? ' active' : ''}` }, [
        icon(r.icone),
        el('span', { className: 'recherche-nom' }, surligne(r.nom, q)),
        el('span', { className: 'recherche-detail', textContent: r.detail || '' }),
        r.keys ? el('kbd', { textContent: r.keys }) : null,
      ]);
      b.onmousemove = () => { if (ouvert.choisi !== i) { ouvert.choisi = i; marquer(); } };
      b.onclick = () => choisir(i);
      liste.append(b);
    });
    if (!ouvert.resultats.length) liste.append(el('p', { className: 'recherche-vide', textContent: 'Rien trouvé. Essaie un autre mot : le nom d\'une carte, d\'un personnage, d\'un objet, une phrase d\'un dialogue, une commande…' }));
  }
  function marquer() {
    const lignes = ouvert.liste.querySelectorAll('.recherche-ligne');
    lignes.forEach((b, i) => b.classList.toggle('active', i === ouvert.choisi));
    lignes[ouvert.choisi]?.scrollIntoView({ block: 'nearest' });
  }
  function choisir(i) {
    const r = ouvert?.resultats[i];
    fermer();
    if (r) App.run(r.aller);
  }

  function ouvrir() {
    if (ouvert) { ouvert.input.select(); return; }
    Menus.close();
    const input = el('input', { type: 'text', className: 'recherche-input', placeholder: App.doc ? 'Chercher une carte, un événement, un dialogue, une donnée, une tuile ou une commande…' : 'Chercher une commande…', spellcheck: false });
    const liste = el('div', { className: 'recherche-liste' });
    const card = el('div', { className: 'recherche' }, [el('div', { className: 'recherche-tete' }, [icon('search'), input, el('kbd', { textContent: 'Échap' })]), liste]);
    const root = el('div', { className: 'recherche-fond' }, [card]);
    root.onpointerdown = (e) => { if (e.target === root) fermer(); };
    document.body.append(root);
    ouvert = { root, input, liste, resultats: [], choisi: 0 };
    input.oninput = () => { ouvert.choisi = 0; rendre(); };
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fermer(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); ouvert.choisi = Math.min(ouvert.resultats.length - 1, ouvert.choisi + 1); marquer(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ouvert.choisi = Math.max(0, ouvert.choisi - 1); marquer(); }
      else if (e.key === 'Enter') { e.preventDefault(); choisir(ouvert.choisi); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); fermer(); }
    };
    rendre();
    input.focus();
  }
  function fermer() {
    ouvert?.root.remove();
    ouvert = null;
  }

  return { ouvrir, fermer, isOpen: () => Boolean(ouvert), chercher };
})();
