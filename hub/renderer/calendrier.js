// Widget « Calendrier » : le mois en cours (semaines du lundi au dimanche), et sous la grille les
// évènements du jour choisi, puis ceux des 14 prochains jours.
// - Double-clic sur un jour, ou « + » : nouvel évènement (titre, date, heure facultative, note).
// - Clic sur un évènement : le modifier ou le supprimer.
// - Si Atelier est ouvert, une notification te prévient 10 minutes avant un évènement qui a une heure.
// Tout est gardé dans %APPDATA%\atelier-hub\calendrier.json, sur ton PC.

const Calendrier = (() => {
  const grille = $('#cal-grille');
  const listeJour = $('#cal-evenements');
  let evenements = [];
  const aujourdhui = () => new Date();
  let mois = new Date(aujourdhui().getFullYear(), aujourdhui().getMonth(), 1);
  let choisi = cle(aujourdhui());
  const prevenus = new Set(); // évènements déjà annoncés (pour ne prévenir qu'une fois)

  // « 2026-10-20 » pour une date, en heure locale.
  function cle(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const depuisCle = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const duJour = (k) => evenements.filter((e) => e.date === k).sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));
  const enregistrer = () => window.atelier.ecrireDonnees('calendrier', evenements).catch((err) => notify(cleanError(err), 'error'));

  function renderGrille() {
    $('#cal-mois').textContent = mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
    const cases = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((j) => el('div', { className: 'cal-entete', textContent: j }));
    // Premier lundi affiché : on recule jusqu'au lundi de la semaine du 1er du mois.
    const debut = new Date(mois);
    debut.setDate(1 - ((mois.getDay() + 6) % 7));
    const auj = cle(aujourdhui());
    for (let i = 0; i < 42; i++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      const k = cle(d);
      const evs = duJour(k);
      const classes = ['cal-case'];
      if (d.getMonth() !== mois.getMonth()) classes.push('autre-mois');
      if (k === auj) classes.push('aujourdhui');
      if (k === choisi) classes.push('choisi');
      if (d.getDay() === 0 || d.getDay() === 6) classes.push('week-end');
      const c = el('div', { className: classes.join(' '), title: evs.map((e) => `${e.heure ? `${e.heure} ` : ''}${e.titre}`).join('\n') },
        el('span', { className: 'cal-num', textContent: d.getDate() }),
        ...evs.slice(0, 2).map((e) => el('span', { className: 'cal-ev', textContent: e.titre })),
        evs.length > 2 ? el('span', { className: 'cal-plus', textContent: `+${evs.length - 2}` }) : null);
      c.onclick = () => { choisi = k; if (d.getMonth() !== mois.getMonth()) mois = new Date(d.getFullYear(), d.getMonth(), 1); render(); };
      c.ondblclick = () => editer({ date: k });
      cases.push(c);
    }
    grille.replaceChildren(...cases);
  }

  function ligne(e, avecDate = false) {
    const li = el('li', { className: 'cal-ligne', title: 'Clic pour modifier' },
      el('span', { className: 'cal-heure', textContent: avecDate ? depuisCle(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : (e.heure || 'Journée') }),
      el('span', { className: 'cal-titre' }, e.titre, avecDate && e.heure ? el('span', { className: 'discret', textContent: ` · ${e.heure}` }) : null),
      e.note ? el('span', { className: 'cal-note discret', textContent: e.note }) : null);
    li.onclick = () => editer(e);
    return li;
  }

  function renderJour() {
    const d = depuisCle(choisi);
    $('#cal-jour-nom').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());
    const items = duJour(choisi).map((e) => ligne(e));
    if (!items.length) items.push(el('li', { className: 'vide', textContent: 'Rien de prévu. Double-clic sur un jour pour ajouter un évènement.' }));
    // Les 14 prochains jours (sans le jour choisi s'il est aujourd'hui).
    const auj = cle(aujourdhui());
    const fin = new Date(); fin.setDate(fin.getDate() + 14);
    const aVenir = evenements.filter((e) => e.date >= auj && e.date <= cle(fin) && e.date !== choisi)
      .sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
    if (aVenir.length) {
      items.push(el('li', { className: 'cal-section', textContent: 'À venir' }));
      items.push(...aVenir.map((e) => ligne(e, true)));
    }
    listeJour.replaceChildren(...items);
  }

  function render() {
    renderGrille();
    renderJour();
  }

  async function editer(e) {
    const existe = Boolean(e.id);
    let supprimer = false;
    const v = await Dialogs.form({
      title: existe ? 'Modifier l\'évènement' : 'Nouvel évènement',
      okLabel: existe ? 'Enregistrer' : 'Ajouter',
      fields: [
        { key: 'titre', label: 'Titre', type: 'text', value: e.titre || '', placeholder: 'Rendez-vous, livraison, mise en ligne…' },
        { key: 'date', label: 'Date', type: 'date', value: e.date || choisi },
        { key: 'heure', label: 'Heure (facultatif)', type: 'time', value: e.heure || '' },
        { key: 'note', label: 'Note', type: 'textarea', value: e.note || '', rows: 2 },
      ],
      buttons: existe ? [{ label: 'Supprimer', run: () => { supprimer = true; Dialogs.close(null); } }] : [],
    });
    if (supprimer) {
      evenements = evenements.filter((x) => x.id !== e.id);
      render();
      return enregistrer();
    }
    if (!v) return;
    if (!v.titre.trim() || !v.date) return notify('Il faut au moins un titre et une date.', 'warning');
    const donnees = { titre: v.titre.trim(), date: v.date, heure: v.heure, note: v.note.trim() };
    if (existe) Object.assign(evenements.find((x) => x.id === e.id), donnees);
    else evenements.push({ id: crypto.randomUUID(), ...donnees });
    choisi = v.date;
    const d = depuisCle(v.date);
    mois = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    enregistrer();
  }

  // Rappels : 10 minutes avant un évènement qui a une heure (vérifié toutes les 30 secondes).
  function rappels() {
    const maintenant = Date.now();
    for (const e of evenements) {
      if (!e.heure || prevenus.has(e.id + e.date + e.heure)) continue;
      const [h, m] = e.heure.split(':').map(Number);
      const quand = depuisCle(e.date).setHours(h, m, 0, 0);
      if (quand - maintenant <= 10 * 60_000 && quand - maintenant > -60_000) {
        prevenus.add(e.id + e.date + e.heure);
        const dans = Math.max(0, Math.round((quand - maintenant) / 60_000));
        const message = dans ? `Dans ${dans} min (${e.heure})` : `Maintenant (${e.heure})`;
        notify(`${e.titre} : ${message}`, 'info', 20000);
        try { new Notification(e.titre, { body: message }); } catch { /* notifications refusées */ }
        window.atelier.attention();
      }
    }
  }
  setInterval(rappels, 30_000);
  // À minuit, « aujourd'hui » change.
  let jourAffiche = cle(aujourdhui());
  setInterval(() => { if (cle(aujourdhui()) !== jourAffiche) { jourAffiche = cle(aujourdhui()); render(); } }, 60_000);

  $('#btn-cal-prec').onclick = () => { mois = new Date(mois.getFullYear(), mois.getMonth() - 1, 1); renderGrille(); };
  $('#btn-cal-suiv').onclick = () => { mois = new Date(mois.getFullYear(), mois.getMonth() + 1, 1); renderGrille(); };
  $('#btn-cal-auj').onclick = () => { mois = new Date(aujourdhui().getFullYear(), aujourdhui().getMonth(), 1); choisi = cle(aujourdhui()); render(); };
  $('#btn-cal-ajout').onclick = () => editer({ date: choisi });

  async function start() {
    evenements = await window.atelier.lireDonnees('calendrier', []);
    render();
    rappels();
  }

  // --- Pour les actions de Claude (widget Claude) ---
  function verifier({ date, heure }) {
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Date invalide : ${date} (format AAAA-MM-JJ)`);
    if (heure && !/^\d{2}:\d{2}$/.test(heure)) throw new Error(`Heure invalide : ${heure} (format HH:MM)`);
  }
  function montrer(date) {
    choisi = date;
    const d = depuisCle(date);
    mois = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  }
  const trouver = (id) => {
    const e = evenements.find((x) => x.id === id);
    if (!e) throw new Error(`Aucun évènement n'a l'id ${id}`);
    return e;
  };
  async function ajouter({ titre, date, heure = '', note = '' }) {
    if (!String(titre || '').trim()) throw new Error('Il faut un titre');
    verifier({ date, heure });
    const e = { id: crypto.randomUUID(), titre: String(titre).trim(), date, heure: heure || '', note: String(note || '').trim() };
    evenements.push(e);
    montrer(date);
    await enregistrer();
    return `Évènement « ${e.titre} » ajouté le ${date}${e.heure ? ` à ${e.heure}` : ''} (id : ${e.id}).`;
  }
  async function modifier(id, champs) {
    const e = trouver(id);
    verifier(champs);
    for (const k of ['titre', 'date', 'heure', 'note']) if (champs[k] !== undefined) e[k] = String(champs[k]).trim();
    montrer(e.date);
    await enregistrer();
    return `Évènement « ${e.titre} » modifié.`;
  }
  async function supprimer(id) {
    const e = trouver(id);
    evenements = evenements.filter((x) => x !== e);
    render();
    await enregistrer();
    return `Évènement « ${e.titre} » supprimé.`;
  }
  const decrire = (id) => { const e = evenements.find((x) => x.id === id); return e ? `« ${e.titre} » (${e.date}${e.heure ? ` ${e.heure}` : ''})` : null; };

  return { start, ajouter, modifier, supprimer, decrire };
})();
