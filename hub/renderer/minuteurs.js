// Widget « Minuteurs » : des comptes à rebours qui tournent en même temps.
// - Raccourcis : 5, 15, 25 minutes, et Pomodoro (25 min de travail, 5 min de pause, et une grande
//   pause de 15 min toutes les 4 séances ; il enchaîne tout seul).
// - « + » : un minuteur avec la durée et le nom de ton choix.
// - Quand un minuteur sonne : un petit carillon, une notification de Windows, et l'icône d'Atelier
//   clignote dans la barre des tâches.
// Les minuteurs sont gardés dans minuteurs.json avec leur heure de fin : ils continuent de compter
// même si tu fermes et rouvres Atelier.

const Minuteurs = (() => {
  const conteneur = $('#minuteurs-liste');
  let minuteurs = [];
  const MIN = 60_000;
  const POMODORO = { travail: 25 * MIN, pause: 5 * MIN, grandePause: 15 * MIN, seances: 4 };

  const restant = (m) => (m.fin ? Math.max(0, m.fin - Date.now()) : m.restant);
  function format(ms) {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600), mn = Math.floor((total % 3600) / 60), sec = total % 60;
    const deux = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${deux(mn)}:${deux(sec)}` : `${deux(mn)}:${deux(sec)}`;
  }
  const libellePhase = (m) => (m.phase === 'travail' ? `Travail · séance ${m.seance}/${POMODORO.seances}` : m.phase === 'grandePause' ? 'Grande pause' : 'Pause');

  const enregistrer = () => window.atelier.ecrireDonnees('minuteurs', minuteurs).catch((err) => notify(cleanError(err), 'error'));

  function creer(nom, duree, type = 'simple') {
    const m = { id: crypto.randomUUID(), nom, type, duree, restant: duree, fin: Date.now() + duree };
    if (type === 'pomodoro') Object.assign(m, { phase: 'travail', seance: 1 });
    minuteurs.push(m);
    render();
    enregistrer();
  }

  // Carillon : trois notes douces, jouées par le navigateur (pas besoin de fichier son).
  function carillon() {
    try {
      const audio = new AudioContext();
      [880, 1108.73, 1318.51].forEach((freq, i) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = audio.currentTime + i * 0.22;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + 1);
      });
      setTimeout(() => audio.close(), 2000);
    } catch { /* pas de son disponible */ }
  }

  function sonner(titre, message) {
    carillon();
    notify(`${titre} : ${message}`, 'info', 15000);
    try { new Notification(titre, { body: message, silent: true }); } catch { /* notifications refusées */ }
    window.atelier.attention();
  }

  // Un minuteur arrivé à zéro : un Pomodoro passe à la phase suivante, les autres s'arrêtent.
  function terminer(m) {
    if (m.type === 'pomodoro') {
      let message;
      if (m.phase === 'travail') {
        const grande = m.seance >= POMODORO.seances;
        m.phase = grande ? 'grandePause' : 'pause';
        message = grande ? 'Bravo, 4 séances ! Grande pause de 15 minutes.' : 'Séance finie, pause de 5 minutes.';
      } else {
        m.seance = m.phase === 'grandePause' ? 1 : m.seance + 1;
        m.phase = 'travail';
        message = `Au travail : séance ${m.seance}/${POMODORO.seances}.`;
      }
      m.duree = POMODORO[m.phase];
      m.restant = m.duree;
      m.fin = Date.now() + m.duree;
      sonner(m.nom, message);
    } else {
      m.fin = null;
      m.restant = 0;
      m.fini = true;
      sonner(m.nom, `C'est fini (${format(m.duree)}).`);
    }
    enregistrer();
  }

  function bouton(icon, title, run) {
    const b = el('button', { className: 'icon-button', title }, el('i', { className: `codicon codicon-${icon}` }));
    b.onclick = run;
    return b;
  }

  function render() {
    conteneur.replaceChildren(...minuteurs.map((m) => {
      const enMarche = Boolean(m.fin);
      const carte = el('div', { className: `minuteur${enMarche ? ' en-marche' : ''}${m.fini ? ' fini' : ''}${m.phase && m.phase !== 'travail' ? ' pause' : ''}`},
        el('div', { className: 'minuteur-haut' },
          el('span', { className: 'minuteur-nom', textContent: m.nom }),
          m.type === 'pomodoro' ? el('span', { className: 'discret', textContent: libellePhase(m) }) : null),
        el('div', { className: 'minuteur-temps', textContent: format(restant(m)) }),
        el('div', { className: 'minuteur-barre' }, el('div')),
        el('div', { className: 'minuteur-actions' },
          bouton(enMarche ? 'debug-pause' : 'play', enMarche ? 'Mettre en pause' : (m.fini ? 'Relancer' : 'Reprendre'), () => {
            if (m.fin) { m.restant = restant(m); m.fin = null; }
            else { if (m.fini) { m.restant = m.duree; m.fini = false; } m.fin = Date.now() + m.restant; }
            render();
            enregistrer();
          }),
          bouton('debug-restart', 'Remettre à zéro', () => {
            if (m.type === 'pomodoro') Object.assign(m, { phase: 'travail', seance: 1, duree: POMODORO.travail });
            m.restant = m.duree;
            m.fin = null;
            m.fini = false;
            render();
            enregistrer();
          }),
          el('span', { className: 'spacer' }),
          bouton('trash', 'Supprimer ce minuteur', () => {
            minuteurs = minuteurs.filter((x) => x !== m);
            render();
            enregistrer();
          })));
      carte.dataset.id = m.id;
      return carte;
    }));
    if (!minuteurs.length) conteneur.append(el('p', { className: 'discret vide-minuteurs', textContent: 'Lance un minuteur avec un des boutons ci-dessus.' }));
    tick();
  }

  // Quatre fois par seconde : met à jour les chiffres et les barres, et fait sonner ce qui est fini.
  function tick() {
    for (const m of minuteurs) {
      if (m.fin && m.fin <= Date.now()) { terminer(m); render(); return; }
      const carte = conteneur.querySelector(`[data-id="${m.id}"]`);
      if (!carte) continue;
      carte.querySelector('.minuteur-temps').textContent = format(restant(m));
      carte.querySelector('.minuteur-barre > div').style.width = `${100 - (restant(m) / m.duree) * 100}%`;
    }
    const actif = minuteurs.find((m) => m.fin);
    document.title = actif ? `${format(restant(actif))} · Atelier` : 'Atelier';
  }
  setInterval(tick, 250);

  // Raccourcis
  const raccourcis = $('#minuteurs-raccourcis');
  for (const [label, run] of [
    ['5 min', () => creer('5 minutes', 5 * MIN)],
    ['15 min', () => creer('15 minutes', 15 * MIN)],
    ['25 min', () => creer('25 minutes', 25 * MIN)],
    ['Pomodoro', () => creer('Pomodoro', POMODORO.travail, 'pomodoro')],
  ]) {
    const b = el('button', { className: 'button small', textContent: label });
    b.onclick = run;
    raccourcis.append(b);
  }

  $('#btn-minuteur-perso').onclick = async () => {
    const v = await Dialogs.form({
      title: 'Nouveau minuteur',
      okLabel: 'Lancer',
      fields: [
        { key: 'nom', label: 'Nom', type: 'text', value: 'Minuteur', placeholder: 'Thé, cuisson, build…' },
        { key: 'heures', label: 'Heures', type: 'number', value: 0, min: 0, max: 23 },
        { key: 'minutes', label: 'Minutes', type: 'number', value: 10, min: 0, max: 59 },
        { key: 'secondes', label: 'Secondes', type: 'number', value: 0, min: 0, max: 59 },
      ],
    });
    if (!v) return;
    const duree = ((v.heures * 60 + v.minutes) * 60 + v.secondes) * 1000;
    if (duree <= 0) return notify('Choisis une durée plus longue que zéro.', 'warning');
    creer(v.nom.trim() || 'Minuteur', duree);
  };

  async function start() {
    minuteurs = await window.atelier.lireDonnees('minuteurs', []);
    // Un minuteur fini pendant qu'Atelier était fermé : il sonne maintenant.
    render();
  }

  // Pour les actions de Claude (widget Claude).
  function lancer(nom, minutes) {
    const duree = Math.round(Number(minutes) * MIN);
    if (!(duree > 0) || duree > 24 * 60 * MIN) throw new Error('Durée invalide (entre quelques secondes et 24 h)');
    creer(String(nom || '').trim() || 'Minuteur', duree);
    return `Minuteur « ${String(nom || '').trim() || 'Minuteur'} » lancé pour ${format(duree)}.`;
  }

  return { start, lancer };
})();
