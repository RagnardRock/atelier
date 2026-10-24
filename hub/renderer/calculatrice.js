// Widget « Calculatrice » : un calcul qu'on tape (ou qu'on clique), et le résultat pendant la frappe.
// - Opérations : + − × ÷, puissance (^), racine (√), parenthèses, pourcentage, π.
//   Le pourcentage marche comme sur une calculatrice de poche : 200 + 10 % = 220, 200 × 10 % = 20,
//   et 15 % tout seul = 0,15.
// - On peut écrire « 2(3+4) » ou « 3√16 » : la multiplication est sous-entendue.
// - « Rés » reprend le dernier résultat. Après « = », taper un opérateur continue à partir du résultat.
// - La virgule et le point marchent tous les deux ; * et / aussi, à la place de × et ÷.
// - Clavier : Entrée = calculer, Échap = effacer, ↑ / ↓ = parcourir les calculs précédents.
// - Historique : les 30 derniers calculs, gardés dans calculatrice.json. Clic = le reprendre.
//
// Le calcul se fait avec un petit interpréteur écrit ici (pas de eval : la sécurité de la page
// l'interdit, et un eval exécuterait n'importe quel code tapé dans la case).

const Calculatrice = (() => {
  const saisie = $('#calc-saisie');
  const apercu = $('#calc-resultat');
  const touches = $('#calc-touches');
  const listeHisto = $('#calc-historique');
  const MAX_HISTO = 30;
  let historique = [];
  let dernier = 0; // dernier résultat (touche « Rés »)
  let vientDeCalculer = false; // vrai juste après « = » : un chiffre repart de zéro, un opérateur continue
  let positionHisto = -1; // pour ↑ / ↓

  // --- L'interpréteur ---
  // 1. On découpe le texte en morceaux (nombres, opérateurs, parenthèses…).
  function decouper(texte) {
    const t = texte.replace(/\s+/g, '').replace(/[*x]/g, '×').replace(/\//g, '÷').replace(/[−–]/g, '-').replace(/pi/gi, 'π').replace(/r[ée]s|ans/gi, 'R');
    const morceaux = [];
    let i = 0;
    while (i < t.length) {
      const c = t[i];
      const nombre = /^(\d+([.,]\d*)?|[.,]\d+)(e[+-]?\d+)?/i.exec(t.slice(i));
      if (nombre) {
        morceaux.push({ type: 'nombre', valeur: Number(nombre[0].replace(',', '.')) });
        i += nombre[0].length;
      } else if ('+-×÷^%()√πR'.includes(c)) {
        morceaux.push({ type: c });
        i += 1;
      } else {
        throw new Error(`« ${c} » n'est pas compris`);
      }
    }
    return morceaux;
  }

  // 2. On lit les morceaux selon les priorités habituelles :
  //    somme → produit → signe → puissance → pourcentage → nombre / parenthèses / racine.
  function evaluer(texte) {
    const m = decouper(texte);
    let i = 0;
    const voir = () => m[i]?.type;
    const prendre = (type) => {
      if (voir() !== type) throw new Error(type === ')' ? 'Il manque une parenthèse fermante' : 'Calcul incomplet');
      i += 1;
    };

    function somme() {
      let gauche = produit();
      while (voir() === '+' || voir() === '-') {
        const op = m[i++].type;
        const droite = produit();
        // « 200 + 10 % » : 10 % de 200, pas 0,1.
        const v = droite.pourcent ? gauche.v * droite.v : droite.v;
        gauche = { v: op === '+' ? gauche.v + v : gauche.v - v };
      }
      return gauche;
    }
    // Ce qui peut suivre un nombre sans signe entre les deux (« 2(3) », « 3√16 », « 2π »).
    const debutDeFacteur = () => ['nombre', '(', '√', 'π', 'R'].includes(voir());
    function produit() {
      let gauche = signe();
      for (;;) {
        if (voir() === '×' || voir() === '÷') {
          const op = m[i++].type;
          const droite = signe();
          if (op === '÷' && droite.v === 0) throw new Error('Division par zéro');
          gauche = { v: op === '×' ? gauche.v * droite.v : gauche.v / droite.v };
        } else if (debutDeFacteur()) {
          gauche = { v: gauche.v * signe().v };
        } else {
          return gauche;
        }
      }
    }
    function signe() {
      if (voir() === '-') { i += 1; const r = signe(); return { v: -r.v, pourcent: r.pourcent }; }
      if (voir() === '+') { i += 1; return signe(); }
      return puissance();
    }
    function puissance() {
      const base = pourcentage();
      if (voir() !== '^') return base;
      i += 1;
      const exposant = signe(); // 2^-1, et 2^3^2 = 2^(3^2) comme en maths
      return { v: base.v ** exposant.v };
    }
    function pourcentage() {
      const r = atome();
      if (voir() !== '%') return r;
      i += 1;
      return { v: r.v / 100, pourcent: true };
    }
    function atome() {
      const type = voir();
      if (type === 'nombre') return { v: m[i++].valeur };
      if (type === 'π') { i += 1; return { v: Math.PI }; }
      if (type === 'R') { i += 1; return { v: dernier }; }
      if (type === '√') {
        i += 1;
        const r = signe();
        if (r.v < 0) throw new Error('Pas de racine d\'un nombre négatif');
        return { v: Math.sqrt(r.v) };
      }
      if (type === '(') {
        i += 1;
        const r = somme();
        // Parenthèse oubliée à la fin : on la ferme, comme les calculatrices de téléphone.
        if (voir() === undefined) return r;
        prendre(')');
        return r;
      }
      throw new Error('Calcul incomplet');
    }

    if (!m.length) return null;
    const r = somme();
    if (i < m.length) throw new Error(voir() === ')' ? 'Parenthèse fermante en trop' : 'Calcul incomplet');
    if (!Number.isFinite(r.v)) throw new Error('Résultat trop grand');
    // 0,1 + 0,2 = 0,3 et pas 0,30000000000000004 : on garde 12 chiffres significatifs.
    return Number(r.v.toPrecision(12));
  }

  // 1234567.5 → « 1 234 567,5 » à l'écran ; « 1234567,5 » quand on copie (pas d'espaces gênantes).
  const afficher = (n) => n.toLocaleString('fr-FR', { maximumSignificantDigits: 12 });
  const pourCopier = (n) => String(n).replace('.', ',');

  // --- Écran ---
  function majApercu() {
    apercu.classList.remove('erreur');
    try {
      const r = evaluer(saisie.value);
      apercu.textContent = r === null ? '0' : `= ${afficher(r)}`;
    } catch (err) {
      // Pendant la frappe, un calcul pas fini n'est pas une erreur : on attend la suite.
      apercu.textContent = /incomplet|parenthèse/i.test(err.message) ? '…' : err.message;
      apercu.classList.toggle('erreur', !/incomplet|parenthèse/i.test(err.message));
    }
  }

  function calculer() {
    const texte = saisie.value.trim();
    if (!texte) return;
    let r;
    try {
      r = evaluer(texte);
    } catch (err) {
      apercu.textContent = err.message;
      apercu.classList.add('erreur');
      return;
    }
    if (r === null) return;
    dernier = r;
    historique.unshift({ calcul: texte, resultat: r, quand: Date.now() });
    historique = historique.slice(0, MAX_HISTO);
    enregistrer();
    renderHisto();
    saisie.value = pourCopier(r);
    apercu.textContent = `= ${afficher(r)}`;
    vientDeCalculer = true;
    positionHisto = -1;
  }

  // Une touche du pavé (ou du clavier) : on l'ajoute au calcul, là où est le curseur.
  function inserer(texte) {
    if (vientDeCalculer && /^[\d.,(√π]/.test(texte)) saisie.value = ''; // nouveau calcul
    vientDeCalculer = false;
    const debut = saisie.selectionStart ?? saisie.value.length;
    const fin = saisie.selectionEnd ?? saisie.value.length;
    saisie.setRangeText(texte, debut, fin, 'end');
    majApercu();
    saisie.focus();
  }

  function effacer() {
    saisie.value = '';
    vientDeCalculer = false;
    majApercu();
    saisie.focus();
  }

  function retour() {
    vientDeCalculer = false;
    const debut = saisie.selectionStart, fin = saisie.selectionEnd;
    if (debut !== fin) saisie.setRangeText('', debut, fin, 'end');
    else if (debut > 0) saisie.setRangeText('', debut - 1, debut, 'end');
    majApercu();
    saisie.focus();
  }

  // Le pavé : [libellé, ce qui est ajouté au calcul (ou une action), classe, titre].
  const PAVE = [
    ['C', effacer, 'fonction', 'Tout effacer (Échap)'],
    ['⌫', retour, 'fonction', 'Effacer le dernier caractère (Retour arrière)'],
    ['(', '('], [')', ')'],
    ['÷', '÷', 'operateur', 'Diviser (/)'],
    ['7', '7'], ['8', '8'], ['9', '9'],
    ['xʸ', '^', 'fonction', 'Puissance (^) : 2^10 = 1 024'],
    ['×', '×', 'operateur', 'Multiplier (*)'],
    ['4', '4'], ['5', '5'], ['6', '6'],
    ['√', '√', 'fonction', 'Racine carrée : √16 = 4'],
    ['−', '-', 'operateur', 'Soustraire (-)'],
    ['1', '1'], ['2', '2'], ['3', '3'],
    ['%', '%', 'fonction', 'Pourcentage : 200 + 10 % = 220'],
    ['+', '+', 'operateur', 'Additionner (+)'],
    ['0', '0', 'zero'], [',', ','],
    ['Rés', 'Rés', 'fonction', 'Le dernier résultat'],
    ['=', calculer, 'egal', 'Calculer (Entrée)'],
  ];
  for (const [label, action, classe = '', title = ''] of PAVE) {
    const b = el('button', { type: 'button', className: `calc-touche ${classe}`, textContent: label, title });
    // mousedown + preventDefault : la case de saisie garde le focus (et la position du curseur).
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => (typeof action === 'function' ? action() : inserer(action));
    touches.append(b);
  }

  saisie.addEventListener('beforeinput', (e) => {
    // Après « = », taper un chiffre au clavier commence un nouveau calcul.
    if (vientDeCalculer && e.inputType === 'insertText' && /^[\d.,(√π]/.test(e.data || '')) {
      saisie.value = '';
    }
    vientDeCalculer = false;
  });
  saisie.addEventListener('input', majApercu);
  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === '=' && !e.ctrlKey)) { e.preventDefault(); calculer(); }
    else if (e.key === 'Escape') { e.preventDefault(); effacer(); }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && historique.length) {
      e.preventDefault();
      positionHisto = Math.max(-1, Math.min(historique.length - 1, positionHisto + (e.key === 'ArrowUp' ? 1 : -1)));
      saisie.value = positionHisto < 0 ? '' : historique[positionHisto].calcul;
      vientDeCalculer = false;
      majApercu();
    }
  });

  // --- Historique ---
  function renderHisto() {
    listeHisto.replaceChildren(...historique.map((h) => {
      const li = el('li', { className: 'calc-ligne', title: `${dateRelative(h.quand)} · clic pour reprendre ce calcul, clic droit pour plus` },
        el('span', { className: 'calc-ligne-calcul', textContent: h.calcul }),
        el('span', { className: 'calc-ligne-resultat', textContent: `= ${afficher(h.resultat)}` }));
      li.onclick = () => { saisie.value = h.calcul; vientDeCalculer = false; majApercu(); saisie.focus(); };
      li.oncontextmenu = (e) => {
        e.preventDefault();
        ouvrirMenu(e.clientX, e.clientY, [
          ['Reprendre le résultat', () => inserer(pourCopier(h.resultat))],
          ['Copier le résultat', () => copier(h.resultat)],
          ['Copier le calcul', () => window.atelier.copier(`${h.calcul} = ${pourCopier(h.resultat)}`).then(() => notify('Calcul copié.', 'success', 2000))],
          null,
          ['Retirer de l\'historique', () => { historique = historique.filter((x) => x !== h); enregistrer(); renderHisto(); }],
        ]);
      };
      return li;
    }));
    if (!historique.length) listeHisto.append(el('li', { className: 'calc-vide discret', textContent: 'Tes calculs s\'afficheront ici.' }));
  }

  const enregistrer = () => window.atelier.ecrireDonnees('calculatrice', historique).catch((err) => notify(cleanError(err), 'error'));

  async function copier(n) {
    await window.atelier.copier(pourCopier(n));
    notify(`${afficher(n)} copié.`, 'success', 2000);
  }

  $('#btn-calc-copier').onclick = () => {
    try {
      const r = evaluer(saisie.value);
      if (r !== null) copier(r);
    } catch (err) {
      notify(err.message, 'error', 3000);
    }
  };
  $('#btn-calc-vider').onclick = () => {
    historique = [];
    enregistrer();
    renderHisto();
  };

  async function start() {
    historique = await window.atelier.lireDonnees('calculatrice', []).catch(() => []);
    if (!Array.isArray(historique)) historique = [];
    dernier = historique[0]?.resultat ?? 0;
    renderHisto();
    majApercu();
  }

  return { start, evaluer };
})();
