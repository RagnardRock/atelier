// Les fenêtres de la mise en forme conditionnelle : le menu du bouton (règles toutes prêtes, comme
// dans Excel), la fenêtre d'une règle, et « Gérer les règles » (ordre, plages, modifier, supprimer).
// Le calcul lui-même est dans mfc.js.

const Regles = (() => {
  const C = () => App.claude;
  const feuille = () => C().feuille();
  const plageSel = () => C().selection().plage;
  const essayer = (fn) => { try { return fn(); } catch (err) { notify(err.message || String(err), 'error'); return null; } };

  // Ce que tu tapes comme borne : nombre, texte, ou formule (=B1, =MOYENNE(A:A)).
  function lireBorne(t) {
    const s = String(t ?? '').trim();
    if (s === '') return null;
    if (s.startsWith('=')) return Formules.versMoteur(s, { auto: true });
    const { contenu } = Formules.lireSaisie(s);
    return typeof contenu === 'string' ? contenu.replace(/^'/, '') : contenu;
  }
  function texteBorne(x) {
    if (x === null || x === undefined) return '';
    if (typeof x === 'number') return Formules.texteValeur(x);
    if (typeof x === 'string' && x.startsWith('=')) return Formules.versAffichage(x);
    return String(x);
  }

  // --- La fenêtre d'une règle ---
  function editer(depart) {
    const r = { type: 'valeur', op: 'sup', plages: [plageSel()], style: { ...MFC.STYLES.rouge.style }, ...depart };
    const presetDe = (style) => Object.entries(MFC.STYLES).find(([, p]) => JSON.stringify(p.style) === JSON.stringify(style || {}))?.[0] || 'perso';
    const preset = presetDe(r.style);
    const choixEchelles = Object.entries(MFC.ECHELLES).map(([k, e]) => [k, e.libelle]);
    const echelleDe = (couleurs) => Object.entries(MFC.ECHELLES).find(([, e]) => JSON.stringify(e.couleurs) === JSON.stringify(couleurs))?.[0] || 'vertJauneRouge';
    const champs = [
      { key: 'plage', label: 'S\'applique à', type: 'text', value: r.plages.map(adressePlage).join(' ; ') },
      { key: 'type', label: 'Mettre en forme les cellules dont', type: 'select', value: r.type, choices: Object.entries(MFC.TYPES) },
      { key: 'op', label: 'La valeur est', type: 'select', value: r.op || 'sup', choices: Object.entries(MFC.OPERATEURS) },
      { key: 'v1', label: 'Valeur', type: 'text', value: texteBorne(r.v1), placeholder: '100, un texte, ou =B1' },
      { key: 'v2', label: 'Et', type: 'text', value: texteBorne(r.v2) },
      { key: 'opTexte', label: 'Le texte', type: 'select', value: r.op && MFC.OPS_TEXTE[r.op] ? r.op : 'contient', choices: Object.entries(MFC.OPS_TEXTE) },
      { key: 'texte', label: 'Texte', type: 'text', value: r.texte || '' },
      { key: 'periode', label: 'La date est', type: 'select', value: r.periode || 'aujourdhui', choices: Object.entries(MFC.PERIODES) },
      { key: 'sens', label: 'Valeurs', type: 'select', value: r.sens || 'haut', choices: [['haut', 'Les plus grandes'], ['bas', 'Les plus petites']] },
      { key: 'n', label: 'Combien', type: 'number', value: r.n || 10, min: 1, max: 1000 },
      { key: 'pourcent', label: 'En pourcentage (les 10 % plutôt que les 10)', type: 'checkbox', value: Boolean(r.pourcent) },
      { key: 'sensMoyenne', label: 'Par rapport à la moyenne', type: 'select', value: r.sens === 'dessous' ? 'dessous' : 'dessus', choices: [['dessus', 'Au-dessus'], ['dessous', 'En dessous']] },
      { key: 'formule', label: 'Formule (pour la cellule en haut à gauche ; vraie = mise en forme)', type: 'text', value: r.formule ? Formules.versAffichage(`=${r.formule.replace(/^=/, '')}`) : '=', placeholder: '=$C2>100' },
      { key: 'echelle', label: 'Couleurs', type: 'select', value: echelleDe(r.couleurs), choices: choixEchelles },
      { key: 'barre', label: 'Couleur des barres', type: 'color', value: r.couleur || MFC.BARRES.bleu },
      { key: 'preset', label: 'Avec la mise en forme', type: 'select', value: preset, choices: [...Object.entries(MFC.STYLES).map(([k, p]) => [k, p.libelle]), ['perso', 'Personnalisée…']] },
      { key: 'avecFond', label: 'Couleur de fond', type: 'checkbox', value: Boolean(r.style?.fond) },
      { key: 'fond', label: 'Fond', type: 'color', value: r.style?.fond || '#ffc7ce' },
      { key: 'avecCouleur', label: 'Couleur du texte', type: 'checkbox', value: Boolean(r.style?.couleur) },
      { key: 'couleur', label: 'Texte', type: 'color', value: r.style?.couleur || '#9c0006' },
      { key: 'gras', label: 'Gras', type: 'checkbox', value: Boolean(r.style?.gras) },
      { key: 'italique', label: 'Italique', type: 'checkbox', value: Boolean(r.style?.italique) },
      { key: 'arreter', label: 'Arrêter si vrai (les règles suivantes ne s\'appliquent pas)', type: 'checkbox', value: Boolean(r.arreter) },
    ];
    const visibles = (v) => {
      const t = v.type;
      const avecStyle = !['echelle', 'barres'].includes(t);
      return {
        op: t === 'valeur', v1: t === 'valeur', v2: t === 'valeur' && (v.op === 'entre' || v.op === 'horsDe'),
        opTexte: t === 'texte', texte: t === 'texte', periode: t === 'date',
        sens: t === 'top', n: t === 'top', pourcent: t === 'top', sensMoyenne: t === 'moyenne', formule: t === 'formule',
        echelle: t === 'echelle', barre: t === 'barres',
        preset: avecStyle, arreter: avecStyle,
        avecFond: avecStyle && v.preset === 'perso', fond: avecStyle && v.preset === 'perso' && v.avecFond,
        avecCouleur: avecStyle && v.preset === 'perso', couleur: avecStyle && v.preset === 'perso' && v.avecCouleur,
        gras: avecStyle && v.preset === 'perso', italique: avecStyle && v.preset === 'perso',
      };
    };
    return Dialogs.form({
      title: depart?.id ? 'Modifier la règle' : 'Nouvelle règle de mise en forme',
      okLabel: depart?.id ? 'Enregistrer' : 'Ajouter',
      width: 520,
      fields: champs,
      onInput: (v, api) => {
        const vis = visibles(v);
        for (const [k, { row }] of Object.entries(api.inputs)) if (k in vis) row.hidden = !vis[k];
      },
    }).then((v) => {
      if (!v) return null;
      const plages = String(v.plage).split(/[;,]/).map((x) => lirePlage(x)).filter(Boolean);
      if (!plages.length) { notify('La plage est illisible (exemple : B2:B20).', 'error'); return null; }
      const out = { id: depart?.id, type: v.type, plages };
      switch (v.type) {
        case 'valeur': out.op = v.op; out.v1 = lireBorne(v.v1); if (v.op === 'entre' || v.op === 'horsDe') out.v2 = lireBorne(v.v2); break;
        case 'texte': out.op = v.opTexte; out.texte = v.texte; break;
        case 'date': out.periode = v.periode; break;
        case 'top': out.sens = v.sens; out.n = Math.max(1, Math.round(v.n || 10)); out.pourcent = v.pourcent; break;
        case 'moyenne': out.sens = v.sensMoyenne; break;
        case 'formule': out.formule = Formules.versMoteur(v.formule.startsWith('=') ? v.formule : `=${v.formule}`, { auto: true }).replace(/^=/, ''); break;
        case 'echelle': out.couleurs = MFC.ECHELLES[v.echelle].couleurs; break;
        case 'barres': out.couleur = v.barre; break;
        default:
      }
      if (!['echelle', 'barres'].includes(v.type)) {
        out.style = v.preset === 'perso'
          ? { ...(v.avecFond ? { fond: v.fond } : {}), ...(v.avecCouleur ? { couleur: v.couleur } : {}), ...(v.gras ? { gras: true } : {}), ...(v.italique ? { italique: true } : {}) }
          : { ...MFC.STYLES[v.preset].style };
        if (v.arreter) out.arreter = true;
      }
      return out;
    });
  }

  async function nouvelle(depart) {
    const r = await editer(depart);
    if (r) essayer(() => MFC.ajouter(feuille(), r));
  }
  // Une règle toute prête, appliquée tout de suite à la sélection.
  const directe = (regle) => essayer(() => MFC.ajouter(feuille(), { plages: [plageSel()], ...regle }));

  function menu(ancre) {
    const surbrillance = [
      ['Supérieur à…', () => nouvelle({ type: 'valeur', op: 'sup' })],
      ['Inférieur à…', () => nouvelle({ type: 'valeur', op: 'inf' })],
      ['Entre…', () => nouvelle({ type: 'valeur', op: 'entre' })],
      ['Égal à…', () => nouvelle({ type: 'valeur', op: 'egal' })],
      ['Texte qui contient…', () => nouvelle({ type: 'texte', op: 'contient' })],
      ['Une date…', () => nouvelle({ type: 'date', periode: 'aujourdhui' })],
      ['Valeurs en double', () => directe({ type: 'doublons', style: { ...MFC.STYLES.rouge.style } })],
      ['Valeurs uniques', () => directe({ type: 'uniques', style: { ...MFC.STYLES.vert.style } })],
    ];
    const hautes = [
      ['Les 10 plus grandes', () => directe({ type: 'top', sens: 'haut', n: 10, style: { ...MFC.STYLES.vert.style } })],
      ['Les 10 % plus grandes', () => directe({ type: 'top', sens: 'haut', n: 10, pourcent: true, style: { ...MFC.STYLES.vert.style } })],
      ['Les 10 plus petites', () => directe({ type: 'top', sens: 'bas', n: 10, style: { ...MFC.STYLES.rouge.style } })],
      ['Les 10 % plus petites', () => directe({ type: 'top', sens: 'bas', n: 10, pourcent: true, style: { ...MFC.STYLES.rouge.style } })],
      ['Au-dessus de la moyenne', () => directe({ type: 'moyenne', sens: 'dessus', style: { ...MFC.STYLES.vert.style } })],
      ['En dessous de la moyenne', () => directe({ type: 'moyenne', sens: 'dessous', style: { ...MFC.STYLES.rouge.style } })],
      ['Autre…', () => nouvelle({ type: 'top', sens: 'haut' })],
    ];
    const barres = Object.entries({ Bleu: 'bleu', Vert: 'vert', Émeraude: 'emeraude', Orange: 'orange', Rouge: 'rouge', Violet: 'violet' })
      .map(([nom, k]) => [nom, () => directe({ type: 'barres', couleur: MFC.BARRES[k] })]);
    const echelles = Object.values(MFC.ECHELLES).map((e) => [e.libelle, () => directe({ type: 'echelle', couleurs: e.couleurs })]);
    const n = Classeur.meta(feuille()).mfc.length;
    Fenetres.menu(ancre, [
      ['Mettre en surbrillance', null, null, { icone: 'symbol-color', sous: surbrillance }],
      ['Plus grandes, plus petites', null, null, { icone: 'arrow-swap', sous: hautes }],
      ['Barres de données', null, null, { icone: 'graph-left', sous: barres }],
      ['Nuances de couleurs', null, null, { icone: 'color-mode', sous: echelles }],
      null,
      ['Nouvelle règle…', () => nouvelle({}), null, { icone: 'add' }],
      ['Effacer les règles de la sélection', () => essayer(() => notifierEffacees(MFC.effacer(feuille(), plageSel()))), null, { icone: 'clear-all', desactive: !n }],
      ['Effacer les règles de la feuille', () => essayer(() => notifierEffacees(MFC.effacer(feuille()))), null, { icone: 'trash', desactive: !n }],
      ['Gérer les règles…', gerer, null, { icone: 'list-unordered' }],
    ]);
  }
  const notifierEffacees = (n) => notify(n ? `${n} règle${n > 1 ? 's' : ''} effacée${n > 1 ? 's' : ''}.` : 'Aucune règle ici.');

  // Un petit aperçu de la mise en forme d'une règle.
  function apercu(regle) {
    const a = el('span', { className: 'mfc-apercu' });
    if (regle.type === 'echelle') {
      const cs = regle.couleurs.filter(Boolean);
      a.style.background = `linear-gradient(90deg, ${cs.join(', ')})`;
      a.textContent = '';
    } else if (regle.type === 'barres') {
      a.style.background = `linear-gradient(90deg, ${regle.couleur} 60%, transparent 60%)`;
    } else {
      const s = regle.style || {};
      if (s.fond) a.style.background = s.fond;
      if (s.couleur) a.style.color = s.couleur;
      if (s.gras) a.style.fontWeight = '700';
      if (s.italique) a.style.fontStyle = 'italic';
      a.textContent = 'AaBb 123';
    }
    return a;
  }

  // --- Gérer les règles de la feuille ---
  async function gerer() {
    const f = feuille();
    let regles = JSON.parse(JSON.stringify(Classeur.meta(f).mfc));
    const liste = el('div', { className: 'mfc-liste' });
    const rendre = () => {
      liste.innerHTML = '';
      if (!regles.length) { liste.append(el('p', { className: 'modal-info', textContent: 'Aucune règle sur cette feuille. « Nouvelle règle » en ajoute une sur la sélection.' })); return; }
      regles.forEach((regle, i) => {
        const plage = el('input', { type: 'text', value: regle.plages.map(adressePlage).join(' ; '), title: 'S\'applique à' });
        plage.onchange = () => {
          const p = plage.value.split(/[;,]/).map((x) => lirePlage(x)).filter(Boolean);
          if (p.length) regle.plages = p; else plage.value = regle.plages.map(adressePlage).join(' ; ');
        };
        const bouton = (icone, titre, fn, desactive) => {
          const b = el('button', { type: 'button', className: 'icon-button', title: titre }, el('i', { className: `codicon codicon-${icone}` }));
          b.disabled = Boolean(desactive);
          b.onclick = fn;
          return b;
        };
        liste.append(el('div', { className: 'mfc-ligne' },
          el('span', { className: 'mfc-desc', textContent: MFC.decrire(regle) }),
          apercu(regle),
          plage,
          bouton('arrow-up', 'Plus prioritaire', () => { [regles[i - 1], regles[i]] = [regles[i], regles[i - 1]]; rendre(); }, i === 0),
          bouton('arrow-down', 'Moins prioritaire', () => { [regles[i + 1], regles[i]] = [regles[i], regles[i + 1]]; rendre(); }, i === regles.length - 1),
          bouton('edit', 'Modifier', async () => {
            const copie = regles;
            const r = await editer(regle);
            regles = copie;
            if (r) regles[i] = r;
            ouvrir();
          }),
          bouton('trash', 'Supprimer', () => { regles.splice(i, 1); rendre(); })));
      });
    };
    // La fenêtre se rouvre après « Modifier » (une seule fenêtre à la fois).
    const ouvrir = () => {
      rendre();
      Dialogs.form({
        title: `Règles de mise en forme · ${Classeur.nomFeuille(f)}`,
        okLabel: 'Appliquer',
        width: 760,
        fields: [{ type: 'info', text: 'La règle du haut passe avant les autres. Change la plage directement dans la liste.' }, { type: 'element', element: liste }],
        buttons: [{ label: 'Nouvelle règle…', run: async () => { const r = await editer({}); if (r) regles.unshift(r); ouvrir(); } }],
      }).then((v) => {
        if (v) essayer(() => MFC.remplacerTout(f, regles));
      });
    };
    ouvrir();
  }

  return { menu, gerer, nouvelle, editer };
})();
