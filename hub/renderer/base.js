// Petits raccourcis communs à tous les scripts de l'interface.
const $ = (sel, root = document) => root.querySelector(sel);

// Crée un élément : el('button', { className: 'button', textContent: 'OK' }, enfant1, enfant2…)
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

// « il y a 5 min », « hier à 14:32 », « 3 oct. »…
function dateRelative(ms) {
  const d = new Date(ms);
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const aujourdhui = new Date();
  if (d.toDateString() === aujourdhui.toDateString()) return `aujourd'hui à ${heure}`;
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return `hier à ${heure}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== aujourdhui.getFullYear() ? { year: 'numeric' } : {}) });
}
