// Loki en local : la conversation avec un modèle d'Ollama (voir ollama.js), à la place de Claude Code.
//
// Claude Code fait tout seul la boucle « réfléchir → appeler une action → lire le résultat → continuer ».
// Ici, c'est nous qui la faisons :
// 1. on envoie la conversation au modèle, avec la liste des actions qu'il peut appeler ;
// 2. s'il en appelle, on les fait (avec la carte Autoriser / Refuser quand il le faut), on lui donne
//    les résultats, et on recommence ;
// 3. quand il répond sans action, c'est fini.
// Le panneau reçoit les mêmes événements qu'avec Claude Code (text, tool, tool-result, result…) :
// il n'a presque rien à savoir de la différence.
//
// Ses limites, dites franchement : un modèle de 8 à 14 milliards de paramètres se perd plus vite
// qu'un Claude dans une longue tâche en plusieurs étapes, et voit moins de choses à la fois. On lui
// donne donc moins d'outils (pas de web, pas de commandes), on raccourcit les longs résultats, et on
// l'arrête au bout de MAX_ETAPES actions dans une même réponse.
//
// Ce fichier sert aux outils (commun/claude.js) et à Atelier (hub/claude.js).

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const ollama = require('./ollama');

const MAX_ETAPES = 25;          // actions dans une même réponse, au plus
const MAX_RESULTAT = 6000;      // caractères d'un résultat d'action donnés au modèle
const MAX_ACTIONS_DIRECTES = 24; // au-delà, les actions de l'outil passent par un catalogue (creerCatalogue)

// Ce qu'on dit au modèle en plus des consignes de l'outil.
const CONSIGNES_LOCALES = [
  '',
  '## Mode local',
  '',
  'Tu tournes en local sur le PC de Ragna (Ollama), sans Internet.',
  '- Appelle les outils avec des arguments exacts, un pas à la fois. Lis le résultat avant de continuer.',
  '- Si une demande est longue, fais-la en petites étapes, et dis où tu en es.',
  '- Si tu ne sais pas faire, dis-le simplement : ne devine pas, n\'invente pas de résultat.',
  '- Tu ne peux ni lire le web ni lancer de commandes.',
].join('\n');

// --- Les fichiers du projet : lire, chercher, modifier (seulement dans le dossier du projet) ---
const IGNORES = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);
function dansLeDossier(cwd, chemin) {
  const full = path.resolve(cwd, String(chemin || ''));
  const rel = path.relative(cwd, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Seulement dans le dossier du projet (${cwd})`);
  return full;
}
function motifEnRegex(motif) {
  const s = String(motif || '**/*').replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '*' && s[i + 1] === '*') { re += '.*'; i++; if (s[i + 1] === '/') i++; } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}
async function listerFichiers(cwd, motif, max = 2000) {
  const re = motifEnRegex(motif && !String(motif).includes('/') ? `**/${motif}` : motif);
  const trouves = [];
  async function marcher(dir) {
    if (trouves.length >= max) return;
    let entrees;
    try { entrees = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      if (trouves.length >= max) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORES.has(e.name)) await marcher(full); } else {
        const rel = path.relative(cwd, full).replace(/\\/g, '/');
        if (re.test(rel)) trouves.push(rel);
      }
    }
  }
  await marcher(cwd);
  return trouves;
}

function outilsFichiers(cwd) {
  return [
    {
      name: 'lire_fichier', affiche: 'Read', lecture: true,
      description: 'Lit un fichier texte du projet (numéros de ligne en tête).',
      parameters: { type: 'object', properties: { chemin: { type: 'string', description: 'chemin dans le projet' }, debut: { type: 'integer', description: 'première ligne (1 par défaut)' }, lignes: { type: 'integer', description: 'nombre de lignes (400 par défaut)' } }, required: ['chemin'] },
      entree: (a) => ({ file_path: dansLeDossier(cwd, a.chemin) }),
      async faire(a) {
        const texte = await fsp.readFile(dansLeDossier(cwd, a.chemin), 'utf8');
        const toutes = texte.split(/\r?\n/);
        const debut = Math.max(1, Number(a.debut) || 1);
        const n = Math.min(2000, Math.max(1, Number(a.lignes) || 400));
        const morceau = toutes.slice(debut - 1, debut - 1 + n).map((l, i) => `${debut + i}\t${l}`).join('\n');
        return { texte: `${morceau}${debut - 1 + n < toutes.length ? `\n… (${toutes.length} lignes en tout)` : ''}` };
      },
    },
    {
      name: 'lister_fichiers', affiche: 'Glob', lecture: true,
      description: 'Liste les fichiers du projet qui correspondent à un motif (ex. « *.png », « cartes/**/*.json »).',
      parameters: { type: 'object', properties: { motif: { type: 'string' } } },
      entree: (a) => ({ pattern: a.motif || '**/*' }),
      async faire(a) {
        const liste = await listerFichiers(cwd, a.motif, 300);
        return { texte: liste.length ? liste.join('\n') : 'Aucun fichier.' };
      },
    },
    {
      name: 'chercher_texte', affiche: 'Grep', lecture: true,
      description: 'Cherche un texte dans les fichiers du projet (sans tenir compte des majuscules).',
      parameters: { type: 'object', properties: { texte: { type: 'string' }, motif: { type: 'string', description: 'fichiers où chercher, ex. « *.json » (tous par défaut)' } }, required: ['texte'] },
      entree: (a) => ({ pattern: a.texte }),
      async faire(a) {
        const cherche = String(a.texte || '').toLowerCase();
        if (!cherche) throw new Error('Rien à chercher');
        const sorties = [];
        for (const rel of await listerFichiers(cwd, a.motif, 1500)) {
          let texte;
          try {
            const full = path.join(cwd, rel);
            if ((await fsp.stat(full)).size > 2_000_000) continue;
            texte = await fsp.readFile(full, 'utf8');
          } catch { continue; }
          if (texte.includes('\u0000')) continue; // fichier binaire
          texte.split(/\r?\n/).forEach((l, i) => { if (sorties.length < 100 && l.toLowerCase().includes(cherche)) sorties.push(`${rel}:${i + 1}: ${l.trim().slice(0, 200)}`); });
          if (sorties.length >= 100) break;
        }
        return { texte: sorties.length ? sorties.join('\n') : 'Rien trouvé.' };
      },
    },
    {
      name: 'modifier_fichier', affiche: 'Edit', famille: 'fichiers',
      description: 'Remplace un passage exact d\'un fichier du projet par un autre (le passage doit y être une seule fois).',
      parameters: { type: 'object', properties: { chemin: { type: 'string' }, ancien: { type: 'string', description: 'texte exact à remplacer' }, nouveau: { type: 'string' } }, required: ['chemin', 'ancien', 'nouveau'] },
      entree: (a) => ({ file_path: dansLeDossier(cwd, a.chemin), old_string: String(a.ancien ?? ''), new_string: String(a.nouveau ?? '') }),
      async faire(a) {
        const full = dansLeDossier(cwd, a.chemin);
        const texte = await fsp.readFile(full, 'utf8');
        const ancien = String(a.ancien ?? '');
        const n = ancien ? texte.split(ancien).length - 1 : 0;
        if (n !== 1) throw new Error(n ? `Le passage est ${n} fois dans le fichier : donne-en un plus long.` : 'Passage introuvable : relis le fichier (lire_fichier) et copie-le exactement.');
        await fsp.writeFile(full, texte.replace(ancien, () => String(a.nouveau ?? '')), 'utf8');
        return { texte: 'Modifié.' };
      },
    },
    {
      name: 'ecrire_fichier', affiche: 'Write', famille: 'fichiers',
      description: 'Écrit un fichier texte du projet (le crée ou le remplace entièrement).',
      parameters: { type: 'object', properties: { chemin: { type: 'string' }, contenu: { type: 'string' } }, required: ['chemin', 'contenu'] },
      entree: (a) => ({ file_path: dansLeDossier(cwd, a.chemin), content: String(a.contenu ?? '') }),
      async faire(a) {
        const full = dansLeDossier(cwd, a.chemin);
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, String(a.contenu ?? ''), 'utf8');
        return { texte: 'Écrit.' };
      },
    },
  ];
}

// Beaucoup d'actions (Tafl en a plus de 60) : leurs descriptions complètes ne tiennent pas dans la
// mémoire d'un petit modèle. On lui donne donc :
// - un catalogue court dans ses consignes (nom + première phrase de chaque action) ;
// - les actions les plus utiles pour la demande en cours comme de vrais outils (avec leurs paramètres) :
//   celles que l'outil juge essentielles, celles dont les mots ressemblent à la demande, et celles déjà
//   utilisées ou regardées dans la conversation ;
// - voir_action (le mode d'emploi d'une action, qui la rend appelable directement) et faire_action
//   (appeler n'importe quelle action du catalogue, au cas où).
// Un modèle local ne sait appeler que ce qui est dans sa liste d'outils : avec seulement voir_action et
// faire_action, il répondait souvent qu'il « n'avait pas accès » aux actions que ses consignes nommaient.
const MAX_DESCRIPTION_OUTIL = 600; // caractères de description pour une action donnée en outil
const MAX_ACTIONS_ACTIVES = 12;
const MAX_DESCRIPTION_COMPLETE = 4000; // pour une action utilisée ou regardée

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VIDES = new Set(['les', 'des', 'une', 'pour', 'dans', 'avec', 'sur', 'par', 'est', 'que', 'qui', 'pas', 'tout', 'tous', 'fais', 'faire', 'peux', 'veux', 'moi', 'toi', 'mon', 'mes', 'ton', 'tes', 'son', 'ses', 'cette', 'ces', 'aux', 'du', 'de', 'la', 'le', 'un', 'et', 'ou', 'en', 'au', 'a', 'stp', 'merci', 'loki', 'peut', 'plus', 'comme', 'aussi', 'bien']);
// Les mots d'un texte, réduits à leur début (« cartes » et « carte », « posé » et « poser » se rejoignent).
function racines(texte) {
  return new Set(sansAccents(texte).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !VIDES.has(m)).map((m) => m.slice(0, 5)));
}

function creerCatalogue(actionsOutil, essentielles = []) {
  const parNom = new Map(actionsOutil.map((a) => [a.name, a]));
  const courte = (d) => String(d || '').split(/(?<=[.!?])\s|\n/)[0].slice(0, 140);
  const texte = [
    '', '## Actions de l\'outil', '',
    'Toutes les actions ci-dessous s\'appellent directement par leur nom, comme tes autres outils, même celles',
    'qui ne sont pas (encore) dans ta liste d\'outils. Si tu ne connais pas ses paramètres, appelle d\'abord',
    'voir_action avec son nom : elle devient alors un outil à part entière.',
    'N\'écris jamais que tu n\'as pas accès à une action de cette liste : appelle-la.',
    ...actionsOutil.map((a) => `- ${a.name} : ${courte(a.description)}`),
  ].join('\n');
  const mots = new Map(actionsOutil.map((a) => [a.name, { nom: racines(a.name.replace(/_/g, ' ')), desc: racines(String(a.description || '').slice(0, 400)) }]));
  // L'ordre de préférence des actions pour une demande : essentielles, déjà utilisées, puis par ressemblance.
  function choisir(demande, utilisees) {
    const d = racines(demande);
    const score = (nom) => {
      const m = mots.get(nom);
      let n = 0;
      for (const r of d) { if (m.nom.has(r)) n += 3; else if (m.desc.has(r)) n += 1; }
      if (sansAccents(demande).includes(nom)) n += 10; // l'action nommée telle quelle
      return n;
    };
    const parScore = actionsOutil.map((a) => [a.name, score(a.name)]).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const ordre = [...parScore.slice(0, 4), ...essentielles, ...[...utilisees].reverse(), ...parScore.slice(4)];
    // (seulement des actions de l'outil : une conversation reprise peut avoir appelé d'autres outils)
    return [...new Set(ordre)].filter((n) => parNom.has(n));
  }
  // complet : la description entière (une action que le modèle utilise ou a regardée : il lui faut tout
  // son mode d'emploi, pas seulement le début).
  function definition(a, complet = false) {
    const d = String(a.description || '');
    if (complet) return { type: 'function', function: { name: a.name, description: d.slice(0, MAX_DESCRIPTION_COMPLETE), parameters: a.parameters || { type: 'object', properties: {} } } };
    return {
      type: 'function',
      function: {
        name: a.name,
        description: d.length > MAX_DESCRIPTION_OUTIL ? `${d.slice(0, MAX_DESCRIPTION_OUTIL)}… (la suite : voir_action)` : d,
        parameters: a.parameters || { type: 'object', properties: {} },
      },
    };
  }
  const outils = [
    {
      name: 'voir_action', interne: true,
      description: 'Donne le mode d\'emploi complet (description et paramètres) d\'une action de l\'outil, et la rend appelable directement.',
      parameters: { type: 'object', properties: { nom: { type: 'string', description: 'le nom de l\'action, tel qu\'il est dans le catalogue' } }, required: ['nom'] },
    },
    {
      name: 'faire_action', relai: true,
      description: 'Fait une action de l\'outil par son nom. args : ses paramètres, en objet JSON (ex. { "nom": "infos", "args": {} }).',
      parameters: { type: 'object', properties: { nom: { type: 'string' }, args: { type: 'object', description: 'les paramètres de l\'action' } }, required: ['nom'] },
    },
  ];
  return { outils, texte, parNom, choisir, definition };
}

// Les paramètres d'un appel, tels qu'un petit modèle les écrit : parfois en texte JSON, parfois emballés
// dans { args } ou { arguments }, parfois à plat à côté du nom (faire_action).
function objetArgs(v) {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return {}; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
const CLE_NOM = (a) => ['nom', 'name', 'action'].find((k) => typeof a[k] === 'string' && a[k]);
function argsDeRelai(a) {
  const brut = a.args ?? a.arguments ?? a.parametres ?? a.parameters ?? a.params;
  if (brut !== undefined) return objetArgs(brut);
  const reste = { ...a };
  delete reste[CLE_NOM(a)];
  return reste;
}
function deballer(outil, args) {
  const props = outil.parameters?.properties || {};
  const cles = Object.keys(args);
  if (cles.length === 1 && ['args', 'arguments', 'parametres', 'parameters'].includes(cles[0]) && !props[cles[0]]) return objetArgs(args[cles[0]]);
  return args;
}

// Un modèle qui écrit son appel d'action dans le texte au lieu de l'envoyer à part (ça arrive, surtout
// pour une action qui n'est pas dans sa liste d'outils) : <tool_call>{…}</tool_call>, [TOOL_CALLS][…],
// un bloc ```json, ou toute la réponse en JSON.
function appelsDansLeTexte(contenu, noms) {
  const t = String(contenu || '');
  const morceaux = [...t.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g)].map((m) => m[1]);
  const tc = t.indexOf('[TOOL_CALLS]');
  if (tc >= 0) morceaux.push(t.slice(tc + 12).trim());
  for (const m of t.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) morceaux.push(m[1]);
  if (!morceaux.length && /^\s*[[{][\s\S]*[\]}]\s*$/.test(t)) morceaux.push(t.trim());
  const appels = [];
  for (const m of morceaux) {
    let o;
    try { o = JSON.parse(m); } catch { continue; }
    for (const x of Array.isArray(o) ? o : [o]) {
      const f = x?.function && typeof x.function === 'object' ? x.function : x;
      const nom = f?.name ?? f?.nom;
      if (noms.has(nom)) appels.push({ name: nom, arguments: objetArgs(f.arguments ?? f.parameters ?? f.args ?? {}) });
    }
  }
  return appels;
}

const tronquer = (t) => (t.length > MAX_RESULTAT ? `${t.slice(0, MAX_RESULTAT)}\n… (raccourci : ${t.length} caractères en tout)` : t);
const tailleTexte = (messages) => messages.reduce((n, m) => n + (m.content?.length || 0) + JSON.stringify(m.tool_calls || '').length, 0);

// emit(evenement) : vers le panneau. autoriser({ id, nomAffiche, entree, famille, lecture }) → true/false.
// dossier : où garder chaque conversation après chaque réponse (pour la reprendre depuis l'historique).
function creerSession({ log = () => {}, emit, autoriser, dossier }) {
  let messages = [];         // la conversation, sans le message « system » (refait à chaque envoi)
  let id = null;             // pour l'historique : « local:… »
  let controleur = null;
  let enCours = false;

  let utilisees = new Set(); // actions du catalogue appelées ou regardées dans cette conversation

  function reinitialiser() { messages = []; id = null; utilisees = new Set(); arreter(); }
  function arreter() { controleur?.abort(); }
  const exporter = () => ({ id, messages });
  function charger(sauvegarde) {
    messages = Array.isArray(sauvegarde?.messages) ? sauvegarde.messages : [];
    id = sauvegarde?.id || null;
    utilisees = new Set(messages.flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name)).filter(Boolean));
  }

  // Quand la conversation dépasse la mémoire du modèle, on vide d'abord les vieux résultats d'actions.
  function alleger(limiteCaracteres) {
    for (let i = 0; i < messages.length - 6 && tailleTexte(messages) > limiteCaracteres; i++) {
      const m = messages[i];
      if (m.role === 'tool' && m.content.length > 200) m.content = '(ancien résultat, retiré pour faire de la place)';
    }
    while (messages.length > 8 && tailleTexte(messages) > limiteCaracteres) messages.splice(0, 2);
    // (la conversation doit commencer par un message de Ragna, pas par la fin d'une action)
    while (messages.length > 1 && messages[0].role !== 'user') messages.shift();
  }

  // texte : le message de Ragna. consignes : le message « system ». outils : [{ name, description,
  // parameters, action? (une action de l'outil), affiche?, famille?, lecture?, entree?(args),
  // faire(args) → { texte, image } | { erreur } }]. essentielles : les noms des actions de l'outil
  // à toujours donner en outils quand il y en a trop (les plus utiles).
  // avantEtape (facultatif) : appelé avant chaque nouvelle étape après une action (Tafl y libère la
  // carte graphique de ComfyUI, qu'une action generer_tuiles vient peut-être d'occuper).
  async function envoyer(texte, { consignes, outils: outilsDonnes, essentielles = [], avantEtape }) {
    if (enCours) return;
    enCours = true;
    controleur = new AbortController();
    const signal = controleur.signal;
    const r = await ollama.reglages();
    const modele = r.modele;
    try {
      if (!(await ollama.demarrer(log))) {
        emit({ kind: 'error', ollamaAbsent: true, message: 'Ollama n\'est pas installé (ou ne démarre pas).' });
        return;
      }
      if (!id) id = `local:${crypto.randomUUID()}`;
      emit({ kind: 'init', model: `${modele} (local)`, sessionId: id, local: true });

      const actionsOutil = outilsDonnes.filter((o) => o.action);
      const base = outilsDonnes.filter((o) => !o.action);
      const cat = actionsOutil.length > MAX_ACTIONS_DIRECTES ? creerCatalogue(actionsOutil, essentielles) : null;
      const fixes = cat ? [...base, ...cat.outils] : outilsDonnes;
      const parNom = new Map([...outilsDonnes, ...fixes].map((o) => [o.name, o]));
      const defFixes = fixes.map((o) => ({ type: 'function', function: { name: o.name, description: o.description, parameters: o.parameters } }));
      const systeme = { role: 'system', content: `${consignes}${cat ? cat.texte : ''}${CONSIGNES_LOCALES}` };
      // ~3,5 caractères par jeton. La place des actions données en outils : un cinquième de la mémoire.
      const memoire = r.contexte * 3.5;
      const placeActions = Math.max(3000, memoire * 0.2);
      const limite = Math.max(8000, memoire - systeme.content.length - JSON.stringify(defFixes).length - placeActions - 6000);
      // Les actions du catalogue données en vrais outils pour cette étape.
      const actives = () => {
        if (!cat) return [];
        const defs = [];
        let place = placeActions;
        // D'abord les actions déjà utilisées ou regardées (en entier, sinon en court), puis les autres.
        const recentes = [...utilisees].reverse().filter((n) => cat.parNom.has(n)).slice(0, 4);
        const ordre = [...recentes, ...cat.choisir(texte, utilisees).filter((n) => !recentes.includes(n))];
        for (const nom of ordre) {
          if (defs.length >= MAX_ACTIONS_ACTIVES) break;
          const a = cat.parNom.get(nom);
          let d = cat.definition(a, recentes.includes(nom));
          if (JSON.stringify(d).length > place) d = cat.definition(a);
          const taille = JSON.stringify(d).length;
          if (taille > place) continue;
          place -= taille;
          defs.push(d);
        }
        return defs;
      };

      messages.push({ role: 'user', content: String(texte) });
      const total = { lus: 0, ecrits: 0, appels: 0 };
      let dernierTexte = '';
      for (let etape = 0; ; etape++) {
        alleger(limite);
        emit({ kind: 'status', text: 'Loki réfléchit…' });
        if (etape > 0 && avantEtape) { try { await avantEtape(); } catch { /* rien à libérer */ } }
        const definitions = [...defFixes, ...actives()];
        // Un texte qui commence comme un appel d'action écrit à la main (« <tool_call> », « [TOOL_CALLS] »,
        // « ``` » ou « { ») : on le garde pour soi tant qu'on ne sait pas ce que c'est.
        let ecrit = false;
        let retenu = '';
        const reponse = await ollama.discuter({
          modele, messages: [systeme, ...messages], outils: definitions, contexte: r.contexte, reflexion: r.reflexion, signal,
          surTexte: (t) => {
            if (!ecrit) {
              retenu += t;
              const debut = retenu.trimStart();
              if (!debut || ['<tool_call>', '[TOOL_CALLS]', '```'].some((m) => m.startsWith(debut.slice(0, m.length)) || debut.startsWith(m)) || /^[[{]/.test(debut)) return;
              t = retenu;
            }
            ecrit = true;
            emit({ kind: 'text', text: t });
          },
          surReflexion: () => { if (!ecrit) emit({ kind: 'status', text: 'Loki réfléchit…' }); },
        });
        total.lus += reponse.jetons.lus;
        total.ecrits += reponse.jetons.ecrits;
        total.appels++;
        let appels = reponse.appels;
        if (!appels.length) appels = appelsDansLeTexte(reponse.contenu, new Set(parNom.keys()));
        if (!appels.length && !ecrit && retenu) emit({ kind: 'text', text: retenu }); // ce n'était pas un appel
        const contenu = appels.length && !ecrit ? '' : reponse.contenu; // (un appel écrit en texte n'est pas une réponse)
        messages.push({ role: 'assistant', content: contenu, ...(appels.length ? { tool_calls: appels.map((a) => ({ function: { name: a.name, arguments: a.arguments } })) } : {}) });
        if (contenu.trim()) dernierTexte = contenu;
        if (!appels.length) break;
        if (etape >= MAX_ETAPES) {
          emit({ kind: 'text', text: `\n\n_(Arrêté après ${MAX_ETAPES} actions : en local, mieux vaut découper la demande. Dis « continue » pour la suite.)_` });
          break;
        }
        for (const appel of appels) {
          if (signal.aborted) break;
          messages.push({ role: 'tool', tool_name: appel.name, content: await faireAppel(appel, parNom, cat) });
        }
        if (signal.aborted) break;
      }
      emit({ kind: 'result', isError: false, text: dernierTexte, jetons: { lus: total.lus, enCache: 0, ecrits: total.ecrits, appels: total.appels, conversation: total.lus, local: true } });
    } catch (err) {
      if (signal.aborted) {
        emit({ kind: 'result', isError: false, text: '', jetons: null });
      } else {
        log('ERREUR', `Loki local : ${err.message}`);
        const absent = /not found|introuvable/i.test(err.message) && /model|modèle/i.test(err.message);
        const sansOutils = /does not support tools/i.test(err.message);
        emit({
          kind: 'result',
          isError: true,
          text: absent ? `Le modèle ${modele} n'est pas téléchargé : télécharge-le dans Atelier › Réglages › IA locale.`
            : sansOutils ? `Le modèle ${modele} ne sait pas appeler d'actions : choisis-en un autre dans Atelier › Réglages › IA locale (Qwen3 conseillé).`
              : err.message,
          modeleAbsent: absent,
        });
      }
    } finally {
      enCours = false;
      controleur = null;
      if (dossier) await sauver(dossier).catch((err) => log('ERREUR', `Loki local : conversation non gardée : ${err.message}`));
    }
  }

  // Une action demandée par le modèle : le panneau la montre, on demande la permission si besoin,
  // on la fait, et on renvoie le texte pour le modèle.
  async function faireAppel(appel, parNom, cat) {
    let outil = parNom.get(appel.name);
    let args = objetArgs(appel.arguments);
    if (outil?.relai) {
      const nom = String(args[CLE_NOM(args)] ?? '');
      outil = cat?.parNom.get(nom);
      if (!outil) return `Action inconnue : ${nom || '(sans nom)'}. Regarde la liste dans tes consignes.`;
      args = argsDeRelai(args);
    }
    if (!outil) return `Outil inconnu : ${appel.name}. ${cat ? 'Les actions de l\'outil sont listées dans tes consignes.' : ''}`.trim();
    if (outil.interne) { // voir_action
      const x = cat?.parNom.get(String(args.nom ?? args.name ?? ''));
      if (!x) return `Action inconnue : ${args.nom ?? args.name}. Elles sont listées dans tes consignes.`;
      utilisees.delete(x.name);
      utilisees.add(x.name);
      return `${x.name} : ${x.description}\nParamètres (JSON Schema) : ${JSON.stringify(x.parameters)}\n(Tu peux maintenant appeler ${x.name} directement.)`;
    }
    if (outil.action && cat) { utilisees.delete(outil.name); utilisees.add(outil.name); }
    args = deballer(outil, args);
    const idAppel = `l${crypto.randomBytes(6).toString('hex')}`;
    let entree = args;
    try { entree = outil.entree ? outil.entree(args) : args; } catch (err) { return `Erreur : ${err.message}`; }
    const nomAffiche = outil.affiche || `mcp__atelier__${outil.name}`;
    emit({ kind: 'tool', id: idAppel, name: nomAffiche, input: entree });
    const permis = await autoriser({ id: idAppel, nomAffiche, entree, famille: outil.famille, lecture: outil.lecture });
    if (!permis) {
      emit({ kind: 'tool-result', id: idAppel, isError: true });
      return 'Ragna a refusé. Ne recommence pas : demande ce que Ragna préfère.';
    }
    emit({ kind: 'status', text: 'Loki agit…' });
    let resultat;
    try { resultat = await outil.faire(args); } catch (err) { resultat = { erreur: err.message }; }
    emit({ kind: 'tool-result', id: idAppel, isError: Boolean(resultat?.erreur) });
    if (resultat?.erreur) return `Erreur : ${resultat.erreur}`;
    let texte = String(resultat?.texte ?? 'Fait.');
    if (resultat?.image) texte += '\n(Une image a été produite, mais tu ne vois pas les images en mode local.)';
    return tronquer(texte);
  }

  // Pour l'historique : la conversation est gardée dans un fichier à part (<dossier>/<id>.json).
  const fichier = (d, i) => path.join(d, `${String(i).replace(/[^\w-]/g, '_')}.json`);
  async function sauver(d) {
    if (!id || !messages.length) return;
    await fsp.mkdir(d, { recursive: true });
    await fsp.writeFile(fichier(d, id), JSON.stringify({ id, messages }), 'utf8');
  }
  async function reprendre(d, idLocal) {
    try { charger(JSON.parse(await fsp.readFile(fichier(d, idLocal), 'utf8'))); } catch { charger({ id: idLocal, messages: [] }); }
  }

  return { envoyer, arreter, reinitialiser, exporter, charger, sauver, reprendre, get enCours() { return enCours; }, get id() { return id; } };
}

// Un événement de Claude Code (déjà traduit pour le panneau) qui dit que Claude ne peut pas répondre ?
// Renvoie pourquoi (en « auto », on passe alors en local), sinon null.
function echecClaude(e) {
  if ((e.kind === 'error' || e.kind === 'exit') && e.notInstalled) return 'Claude Code n\'est pas installé';
  if (e.kind === 'retry' && !e.status) return 'pas de connexion aux serveurs de Claude';
  if (e.kind === 'retry' && e.status === 429) return 'la limite d\'utilisation de Claude est atteinte';
  if (e.kind === 'result' && e.isError && /limit|usage|quota|credit|rate.?limit|plafond/i.test(e.text || '')) return 'la limite d\'utilisation de Claude est atteinte';
  if ((e.kind === 'result' && e.isError) || e.kind === 'exit') {
    const t = `${e.text || ''} ${e.stderr || ''}`;
    if (/log ?in|auth|credential|not logged/i.test(t)) return 'Claude Code n\'est pas connecté à un compte Claude';
  }
  return null;
}

module.exports = { creerSession, outilsFichiers, echecClaude, MAX_ETAPES };
