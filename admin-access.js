(() => {
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';
  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const ADMIN_FREE_MODE_KEY = 'viralvoice-admin-free-mode';
  const ADMIN_LOGGED_OUT_KEY = 'viralvoice-admin-logged-out';

  const clientEmail = document.getElementById('clientEmail');
  const adminPanel = document.getElementById('adminPanel');
  const adminClientEmail = document.getElementById('adminClientEmail');
  const walletStatus = document.getElementById('walletStatus');
  const walletBadge = document.getElementById('walletBadge');
  const adminSecretInput = document.getElementById('adminSecretInput');
  const adminFreeMode = document.getElementById('adminFreeMode');

  function normalizeAdminEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isAdminEmail() {
    return normalizeAdminEmail(clientEmail?.value) === ADMIN_EMAIL;
  }

  function injectAdminUiStyles() {
    if (document.getElementById('vvAdminUiStyles')) return;

    const style = document.createElement('style');
    style.id = 'vvAdminUiStyles';
    style.textContent = `
      .vv-space-switch {
        margin-top: 16px;
        padding: 14px;
        border: 1px solid rgba(0,229,255,.22);
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(0,229,255,.08), rgba(139,92,246,.05));
        display: grid;
        gap: 10px;
      }
      .vv-space-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        color: #ffffff;
        font-weight: 950;
      }
      .vv-space-title small {
        color: #a6a7c7;
        font-weight: 800;
      }
      .vv-space-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .vv-space-btn,
      .vv-logout-btn {
        min-height: 48px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 16px;
        background: rgba(255,255,255,.07);
        color: #ffffff;
        font-weight: 950;
        cursor: pointer;
      }
      .vv-space-btn.active {
        background: linear-gradient(135deg, #8b5cf6, #00e5ff);
        box-shadow: 0 12px 32px rgba(0,229,255,.18);
      }
      .vv-entity-bar {
        margin: 0 0 14px;
        padding: 13px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 18px;
        background: rgba(0,0,0,.22);
        display: grid;
        gap: 10px;
      }
      .vv-entity-bar strong {
        display: block;
        color: #ffffff;
        font-size: 15px;
      }
      .vv-entity-bar span {
        color: #a6a7c7;
        font-size: 13px;
        font-weight: 800;
        word-break: break-word;
      }
      .vv-logout-btn {
        width: 100%;
        color: #fb7185;
        border-color: rgba(251,113,133,.35);
      }
      .vv-admin-header {
        margin-bottom: 16px;
        padding: 14px;
        border-radius: 20px;
        border: 1px solid rgba(49,214,123,.35);
        background: rgba(49,214,123,.08);
        display: grid;
        gap: 10px;
      }
      .vv-admin-header strong {
        color: #31d67b;
        font-size: 16px;
      }
      .vv-admin-header span {
        color: #a6a7c7;
        font-size: 13px;
        font-weight: 800;
      }
      .vv-admin-hidden-note {
        margin-top: 10px;
        padding: 12px;
        border-radius: 16px;
        background: rgba(250,204,21,.08);
        border: 1px solid rgba(250,204,21,.28);
        color: #facc15;
        font-weight: 850;
        font-size: 13px;
      }
    `;

    document.head.appendChild(style);
  }

  function createMainSpaceSwitch() {
    if (document.getElementById('vvSpaceSwitch')) return;

    const accountCard = document.querySelector('.account-card');
    if (!accountCard) return;

    const switchBox = document.createElement('section');
    switchBox.id = 'vvSpaceSwitch';
    switchBox.className = 'vv-space-switch';
    switchBox.innerHTML = `
      <div class="vv-space-title">
        <span>Choisir un espace</span>
        <small>Utilisateur / Admin</small>
      </div>
      <div class="vv-space-buttons">
        <button id="vvUserSpaceBtn" class="vv-space-btn active" type="button">Espace utilisateur</button>
        <button id="vvAdminSpaceBtn" class="vv-space-btn" type="button">Espace admin</button>
      </div>
      <div id="vvAdminLockedNote" class="vv-admin-hidden-note hidden">
        Pour ouvrir l’admin, connecte-toi avec l’email administrateur.
      </div>
    `;

    accountCard.parentNode.insertBefore(switchBox, accountCard);

    document.getElementById('vvUserSpaceBtn')?.addEventListener('click', () => {
      setActiveSpace('user');
      accountCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('vvAdminSpaceBtn')?.addEventListener('click', () => {
      setActiveSpace('admin');
    });
  }

  function createUserEntityBar() {
    const accountCard = document.querySelector('.account-card');
    if (!accountCard || document.getElementById('vvUserEntityBar')) return;

    const bar = document.createElement('div');
    bar.id = 'vvUserEntityBar';
    bar.className = 'vv-entity-bar';
    bar.innerHTML = `
      <div>
        <strong>Espace utilisateur</strong>
        <span id="vvUserEntityEmail">Aucun utilisateur connecté</span>
      </div>
      <button id="vvUserLogoutBtn" class="vv-logout-btn" type="button">Déconnexion utilisateur</button>
    `;

    const title = accountCard.querySelector('.section-title');
    if (title) {
      title.insertAdjacentElement('afterend', bar);
    } else {
      accountCard.prepend(bar);
    }

    document.getElementById('vvUserLogoutBtn')?.addEventListener('click', logoutUser);
  }

  function createAdminHeader() {
    if (!adminPanel || document.getElementById('vvAdminHeader')) return;

    const header = document.createElement('div');
    header.id = 'vvAdminHeader';
    header.className = 'vv-admin-header';
    header.innerHTML = `
      <div>
        <strong>Espace admin illimité</strong>
        <span>Connecté avec ${ADMIN_EMAIL}</span>
      </div>
      <button id="vvAdminLogoutBtn" class="vv-logout-btn" type="button">Déconnexion admin</button>
    `;

    adminPanel.prepend(header);
    document.getElementById('vvAdminLogoutBtn')?.addEventListener('click', logoutAdmin);
  }

  function updateUserEntityBar() {
    const emailText = document.getElementById('vvUserEntityEmail');
    if (!emailText) return;

    const email = normalizeAdminEmail(clientEmail?.value);
    emailText.textContent = email ? email : 'Aucun utilisateur connecté';
  }

  function setActiveSpace(space) {
    const userBtn = document.getElementById('vvUserSpaceBtn');
    const adminBtn = document.getElementById('vvAdminSpaceBtn');
    const lockedNote = document.getElementById('vvAdminLockedNote');
    const accountCard = document.querySelector('.account-card');

    userBtn?.classList.toggle('active', space === 'user');
    adminBtn?.classList.toggle('active', space === 'admin');

    if (space === 'admin') {
      if (isAdminEmail()) {
        sessionStorage.removeItem(ADMIN_LOGGED_OUT_KEY);
        showAdminByEmail(true);
        adminPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        lockedNote?.classList.add('hidden');
      } else {
        lockedNote?.classList.remove('hidden');
        clientEmail?.focus();
        accountCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      lockedNote?.classList.add('hidden');
    }
  }

  function showAdminByEmail(force = false) {
    if (!clientEmail || !adminPanel) return;

    const adminLoggedOut = sessionStorage.getItem(ADMIN_LOGGED_OUT_KEY) === 'true';
    const canOpenAdmin = isAdminEmail() && (!adminLoggedOut || force);

    if (!canOpenAdmin) return;

    sessionStorage.removeItem(ADMIN_LOGGED_OUT_KEY);
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

  function logoutUser() {
    if (clientEmail) clientEmail.value = '';
    localStorage.removeItem(CLIENT_EMAIL_KEY);

    if (walletBadge) {
      walletBadge.textContent = '0 min';
      walletBadge.classList.remove('ok-badge');
      walletBadge.classList.add('muted-badge');
    }

    if (walletStatus) {
      walletStatus.textContent = 'Utilisateur déconnecté.';
      walletStatus.className = 'notice warning';
      walletStatus.classList.remove('hidden');
    }

    updateUserEntityBar();
    logoutAdmin(false);
    setActiveSpace('user');
  }

  function logoutAdmin(showMessage = true) {
    sessionStorage.setItem(ADMIN_LOGGED_OUT_KEY, 'true');
    localStorage.removeItem(ADMIN_SECRET_KEY);
    localStorage.removeItem(ADMIN_FREE_MODE_KEY);

    if (adminSecretInput) adminSecretInput.value = '';
    if (adminFreeMode) adminFreeMode.checked = false;

    document.body.classList.remove('admin-free-active');
    document.body.classList.remove('admin-email-active');

    if (adminPanel) adminPanel.classList.add('hidden');

    if (showMessage && walletStatus) {
      walletStatus.textContent = 'Admin déconnecté. L’espace utilisateur reste disponible.';
      walletStatus.className = 'notice warning';
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

    while (walker.nextNode()) nodes.push(walker.currentNode);
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

    if (adminTokensLabel) adminTokensLabel.textContent = 'Nombre de minutes';
    if (adminAddTokensBtn) adminAddTokensBtn.textContent = 'Ajouter les minutes';
    if (adminFreeText) adminFreeText.textContent = 'Quand ce mode est actif, tes doublages sont illimités et ne consomment aucune minute.';
    if (pricesHint) pricesHint.textContent = 'Tes minutes sont consommées selon la durée de ton fichier, arrondie à la minute supérieure.';
  }

  function applyMinutesMode() {
    walkAndReplace(document.body);
    setPlanMinutes();
    setMinuteLabels();
    updateUserEntityBar();
  }

  function boot() {
    injectAdminUiStyles();
    createMainSpaceSwitch();
    createUserEntityBar();
    createAdminHeader();

    if (clientEmail) {
      clientEmail.addEventListener('input', () => {
        sessionStorage.removeItem(ADMIN_LOGGED_OUT_KEY);
        updateUserEntityBar();
        showAdminByEmail();
      });

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
  }

  boot();
})();
