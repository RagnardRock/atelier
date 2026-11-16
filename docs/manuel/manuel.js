// Le mode d'emploi se met en forme tout seul : pieds de page numérotés, sommaire, versions et date.
// window.MANUEL (posé par generer.js) : { tafl, saga, date }. Ouvert à la main dans un navigateur, il s'en passe.
(() => {
  const infos = window.MANUEL || {};
  const pages = [...document.querySelectorAll('.page')];
  pages.forEach((p, i) => {
    if (i === 0) return; // la couverture
    const pied = document.createElement('div');
    pied.className = 'pied';
    pied.innerHTML = `<span><b>Tafl &amp; Saga</b> · ${p.dataset.titre || ''}</span><span class="num">${i + 1}</span>`;
    p.append(pied);
  });
  const som = document.getElementById('sommaire');
  for (const h of document.querySelectorAll('[data-sommaire]')) {
    const page = h.closest('.page');
    const ligne = document.createElement('div');
    const partie = h.dataset.niveau === 'partie';
    ligne.className = `som-ligne${partie ? ` partie ${page.classList.contains('saga') ? 'saga' : 'tafl'}` : ''}`;
    ligne.innerHTML = `<span></span><span class="points"></span><span class="n">${pages.indexOf(page) + 1}</span>`;
    ligne.firstChild.textContent = h.dataset.sommaire;
    som.append(ligne);
  }
  for (const v of document.querySelectorAll('[data-version]')) v.textContent = infos[v.dataset.version] ? `v${infos[v.dataset.version]}` : '';
  for (const d of document.querySelectorAll('[data-date]')) d.textContent = infos.date || '';
  // Les pages qui débordent (pour generer.js) : leur contenu dépasse la hauteur d'une feuille.
  window.debordements = () => pages.map((p, i) => ({ i: i + 1, titre: p.dataset.titre, trop: p.scrollHeight - p.clientHeight })).filter((x) => x.trop > 2);
})();
