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
const MAX_ACTIONS_DIRECTES = 24; // au-delà, les actions de l'outil passent par un catalogue

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

// Beaucoup d'actions (Tafl en a plus de 70) : un petit modèle s'y perd, et leur description remplit
// sa mémoire. On lui donne alors un catalogue court (nom + première phrase) et deux outils :
// voir_action (le mode d'emploi d'une action) et faire_action (l'appeler).
function regrouperActions(actionsOutil) {
  if (actionsOutil.length <= MAX_ACTIONS_DIRECTES) return { outils: actionsOutil, catalogue: '' };
  const parNom = new Map(actionsOutil.map((a) => [a.name, a]));
  const courte = (d) => String(d || '').split(/(?<=[.!?])\s|\n/)[0].slice(0, 140);
  const catalogue = [
    '', '## Actions de l\'outil', '',
    'Pour agir dans l\'outil : voir_action (une fois, pour connaître ses paramètres), puis faire_action.',
    ...actionsOutil.map((a) => `- ${a.name} : ${courte(a.description)}`),
  ].join('\n');
  const outils = [
    {
      name: 'voir_action', interne: true,
      description: 'Donne le mode d\'emploi (description et paramètres) d\'une action de l\'outil.',
      parameters: { type: 'object', properties: { nom: { type: 'string' } }, required: ['nom'] },
      async faire(a) {
        const x = parNom.get(String(a.nom));
        if (!x) throw new Error(`Action inconnue : ${a.nom}. Elles sont listées dans tes consignes.`);
        return { texte: `${x.name} : ${x.description}\nParamètres (JSON Schema) : ${JSON.stringify(x.parameters)}` };
      },
    },
    {
      name: 'faire_action', relai: true,
      description: 'Fait une action de l\'outil. args : ses paramètres, en objet.',
      parameters: { type: 'object', properties: { nom: { type: 'string' }, args: { type: 'object' } }, required: ['nom'] },
    },
  ];
  return { outils, catalogue, parNom };
}

// Un modèle qui écrit son appel d'action dans le texte au lieu de l'envoyer à part (ça arrive).
function appelsDansLeTexte(contenu, noms) {
  const morceaux = [...String(contenu).matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)].map((m) => m[1]);
  if (!morceaux.length && /^\s*\{[\s\S]*\}\s*$/.test(contenu)) morceaux.push(contenu.trim());
  const appels = [];
  for (const m of morceaux) {
    try {
      const o = JSON.parse(m);
      if (o && noms.has(o.name)) appels.push({ name: o.name, arguments: o.arguments || o.parameters || {} });
    } catch { /* pas un appel */ }
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

  function reinitialiser() { messages = []; id = null; arreter(); }
  function arreter() { controleur?.abort(); }
  const exporter = () => ({ id, messages });
  function charger(sauvegarde) {
    messages = Array.isArray(sauvegarde?.messages) ? sauvegarde.messages : [];
    id = sauvegarde?.id || null;
  }

  // Quand la conversation dépasse la mémoire du modèle, on vide d'abord les vieux résultats d'actions.
  function alleger(limiteCaracteres) {
    for (let i = 0; i < messages.length - 6 && tailleTexte(messages) > limiteCaracteres; i++) {
      const m = messages[i];
      if (m.role === 'tool' && m.content.length > 200) m.content = '(ancien résultat, retiré pour faire de la place)';
    }
    while (messages.length > 8 && tailleTexte(messages) > limiteCaracteres) messages.splice(0, 2);
  }

  // texte : le message de Ragna. consignes : le message « system ». outils : [{ name, description,
  // parameters, action? (une action de l'outil), affiche?, famille?, lecture?, entree?(args),
// faire(args) → { texte, image } | { erreur } }].
  async function envoyer(texte, { consignes, outils: outilsDonnes }) {
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

      const { outils: groupes, catalogue, parNom } = regrouperActions(outilsDonnes.filter((o) => o.action));
      const tous = [...outilsDonnes.filter((o) => !o.action), ...groupes];
      const parNomTous = new Map(tous.map((o) => [o.name, o]));
      const definitions = tous.map((o) => ({ type: 'function', function: { name: o.name, description: o.description, parameters: o.parameters } }));
      const systeme = { role: 'system', content: `${consignes}${catalogue}${CONSIGNES_LOCALES}` };
      // ~3,5 caractères par jeton, en gardant de la place pour la réponse.
      const limite = Math.max(8000, (r.contexte * 3.5) - systeme.content.length - JSON.stringify(definitions).length - 6000);

      messages.push({ role: 'user', content: String(texte) });
      const total = { lus: 0, ecrits: 0, appels: 0 };
      let dernierTexte = '';
      for (let etape = 0; ; etape++) {
        alleger(limite);
        emit({ kind: 'status', text: 'Loki réfléchit…' });
        // Un texte qui commence comme un appel d'action écrit à la main (« <tool_call> » ou « { ») :
        // on le garde pour soi tant qu'on ne sait pas ce que c'est.
        let ecrit = false;
        let retenu = '';
        const reponse = await ollama.discuter({
          modele, messages: [systeme, ...messages], outils: definitions, contexte: r.contexte, reflexion: r.reflexion, signal,
          surTexte: (t) => {
            if (!ecrit) {
              retenu += t;
              const debut = retenu.trimStart();
              if (!debut || '<tool_call>'.startsWith(debut.slice(0, 11)) || debut.startsWith('{')) return;
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
        if (!appels.length) appels = appelsDansLeTexte(reponse.contenu, new Set([...parNomTous.keys(), ...(parNom?.keys() || [])]));
        if (!appels.length && !ecrit && retenu) emit({ kind: 'text', text: retenu }); // ce n'était pas un appel
        messages.push({ role: 'assistant', content: reponse.contenu, ...(appels.length ? { tool_calls: appels.map((a) => ({ function: a })) } : {}) });
        if (reponse.contenu.trim()) dernierTexte = reponse.contenu;
        if (!appels.length) break;
        if (etape >= MAX_ETAPES) {
          emit({ kind: 'text', text: `\n\n_(Arrêté après ${MAX_ETAPES} actions : en local, mieux vaut découper la demande. Dis « continue » pour la suite.)_` });
          break;
        }
        for (const appel of appels) {
          if (signal.aborted) break;
          messages.push({ role: 'tool', tool_name: appel.name, content: await faireAppel(appel, parNomTous, parNom) });
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
        emit({ kind: 'result', isError: true, text: absent ? `Le modèle ${modele} n'est pas téléchargé : télécharge-le dans Atelier › Réglages › IA locale.` : err.message, modeleAbsent: absent });
      }
    } finally {
      enCours = false;
      controleur = null;
      if (dossier) await sauver(dossier).catch((err) => log('ERREUR', `Loki local : conversation non gardée : ${err.message}`));
    }
  }

  // Une action demandée par le modèle : le panneau la montre, on demande la permission si besoin,
  // on la fait, et on renvoie le texte pour le modèle.
  async function faireAppel(appel, parNomTous, parNom) {
    // (une action du catalogue appelée directement par son nom : on la fait quand même)
    let outil = parNomTous.get(appel.name) || parNom?.get(appel.name);
    let args = appel.arguments || {};
    if (outil?.relai) {
      outil = parNom?.get(String(args.nom));
      args = args.args && typeof args.args === 'object' ? args.args : {};
      if (!outil) return `Action inconnue : ${appel.arguments?.nom}. Regarde la liste dans tes consignes.`;
    }
    if (!outil) return `Outil inconnu : ${appel.name}.`;
    if (outil.interne) {
      try { return (await outil.faire(args)).texte; } catch (err) { return `Erreur : ${err.message}`; }
    }
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
