(() => {
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';
  const clientEmail = document.getElementById('clientEmail');
  const adminPanel = document.getElementById('adminPanel');
  const adminClientEmail = document.getElementById('adminClientEmail');
  const walletStatus = document.getElementById('walletStatus');

  function normalizeAdminEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function showAdminByEmail() {
    if (!clientEmail || !adminPanel) return;

    const email = normalizeAdminEmail(clientEmail.value);
    const isAdmin = email === ADMIN_EMAIL;

    if (!isAdmin) return;

    adminPanel.classList.remove('hidden');
    document.body.classList.add('admin-email-active');

    if (adminClientEmail && !adminClientEmail.value) {
      adminClientEmail.value = ADMIN_EMAIL;
    }

    if (walletStatus) {
      walletStatus.textContent = 'Compte administrateur détecté. Mode admin illimité visible.';
      walletStatus.className = 'notice success';
      walletStatus.classList.remove('hidden');
    }
  }

  function replaceTextInNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    let text = node.nodeValue;
    text = text.replace(/crédit\(s\)/gi, 'minute(s)');
    text = text.replace(/crédits/gi, 'minutes');
    text = text.replace(/crédit/gi, 'minute');
    text = text.replace(/Solde disponible : 999999 minute\(s\)\./gi, 'Admin illimité');
    node.nodeValue = text;
  }

  function walkAndReplace(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(replaceTextInNode);
  }

  function setPlanMinutes() {
    const planButtons = document.querySelectorAll('.buy-btn');

    planButtons.forEach(button => {
      const plan = button.dataset.plan;
      const article = button.closest('.plan');
      if (!article) return;

      const strong = article.querySelector('strong');
      const info = article.querySelector('p');

      if (plan === 'decouverte') {
        if (strong) strong.textContent = '1,99 €';
        if (info) info.textContent = '5 minutes';
      }

      if (plan === 'createur') {
        if (strong) strong.textContent = '6,99 €';
        if (info) info.textContent = '30 minutes';
      }

      if (plan === 'viral') {
        if (strong) strong.textContent = '11,99 €';
        if (info) info.textContent = '60 minutes';
      }

      if (plan === 'pro') {
        if (strong) strong.textContent = '29,99 €';
        if (info) info.textContent = '180 minutes';
      }
    });
  }

  function setMinuteLabels() {
    const adminTokensLabel = document.querySelector('label[for="adminTokens"]');
    const adminAddTokensBtn = document.getElementById('adminAddTokensBtn');
    const adminFreeText = document.querySelector('label[for="adminFreeMode"] small');
    const pricesHint = document.querySelector('.prices .hint');

    if (adminTokensLabel) {
      adminTokensLabel.textContent = 'Nombre de minutes';
    }

    if (adminAddTokensBtn) {
      adminAddTokensBtn.textContent = 'Ajouter les minutes';
    }

    if (adminFreeText) {
      adminFreeText.textContent = 'Quand ce mode est actif, tes doublages sont illimités et ne consomment aucune minute.';
    }

    if (pricesHint) {
      pricesHint.textContent = 'Tes minutes sont consommées selon la durée de ton fichier, arrondie à la minute supérieure.';
    }
  }

  function applyMinutesMode() {
    walkAndReplace(document.body);
    setPlanMinutes();
    setMinuteLabels();
  }

  if (clientEmail) {
    clientEmail.addEventListener('input', showAdminByEmail);
    showAdminByEmail();
  }

  applyMinutesMode();

  const observer = new MutationObserver(() => {
    applyMinutesMode();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
