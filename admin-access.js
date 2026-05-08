(() => {
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';

  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const ADMIN_FREE_MODE_KEY = 'viralvoice-admin-free-mode';
  const ADMIN_LOGOUT_KEY = 'viralvoice-admin-logged-out';

  const $ = id => document.getElementById(id);

  const clientEmail = $('clientEmail');
  const adminPanel = $('adminPanel');
  const adminClientEmail = $('adminClientEmail');
  const walletStatus = $('walletStatus');
  const walletBadge = $('walletBadge');
  const adminSecretInput = $('adminSecretInput');
  const adminFreeMode = $('adminFreeMode');
  const dubBtn = $('dubBtn');

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isAdmin() {
    return norm(clientEmail?.value) === ADMIN_EMAIL;
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function showNotice(message, type = 'success') {
    if (!walletStatus) return;
    walletStatus.textContent = message;
    walletStatus.className = `notice ${type}`;
    walletStatus.classList.remove('hidden');
  }

  function createSpaceSwitch() {
    if ($('vvSpaceSwitch')) return;

    const accountCard = document.querySelector('.account-card');
    if (!accountCard) return;

    const box = document.createElement('section');
    box.id = 'vvSpaceSwitch';
    box.className = 'card vv-space-switch';
    box.innerHTML = `
      <div class="section-title">
        <h2>Choisir un espace</h2>
        <span class="badge">ViralVoice</span>
      </div>
      <div class="actions two">
        <button id="vvUserBtn" class="secondary" type="button">Espace utilisateur</button>
        <button id="vvAdminBtn" class="secondary" type="button">Espace admin</button>
      </div>
      <div id="vvSpaceNote" class="notice hidden">Connecte-toi avec l’email admin pour ouvrir cette zone.</div>
    `;

    accountCard.parentNode.insertBefore(box, accountCard);

    $('vvUserBtn')?.addEventListener('click', () => {
      accountCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('vvAdminBtn')?.addEventListener('click', () => {
      if (isAdmin()) {
        openAdmin(true);
      } else {
        const note = $('vvSpaceNote');
        if (note) {
          note.textContent = 'Écris skypieachannel@gmail.com dans Email client pour ouvrir l’admin.';
          note.className = 'notice warning';
          note.classList.remove('hidden');
        }
        clientEmail?.focus();
      }
    });
  }

  function createUserBar() {
    if ($('vvUserBar')) return;

    const card = document.querySelector('.account-card');
    const title = card?.querySelector('.section-title');
    if (!card || !title) return;

    const bar = document.createElement('div');
    bar.id = 'vvUserBar';
    bar.className = 'notice';
    bar.innerHTML = `
      <strong>Espace utilisateur</strong><br>
      <span id="vvUserEmail">Aucun utilisateur connecté</span>
      <div class="actions" style="margin-bottom:0">
        <button id="vvUserLogout" class="secondary" type="button">Déconnexion utilisateur</button>
      </div>
    `;

    title.insertAdjacentElement('afterend', bar);
    $('vvUserLogout')?.addEventListener('click', logoutUser);
  }

  function createAdminHeader() {
    if (!adminPanel || $('vvAdminHeader')) return;

    const header = document.createElement('div');
    header.id = 'vvAdminHeader';
    header.className = 'notice success';
    header.innerHTML = `
      <strong>Espace admin illimité</strong><br>
      <span>${ADMIN_EMAIL}</span>
      <div class="actions" style="margin-bottom:0">
        <button id="vvAdminLogout" class="secondary" type="button">Déconnexion admin</button>
      </div>
    `;

    adminPanel.prepend(header);
    $('vvAdminLogout')?.addEventListener('click', () => logoutAdmin(true));
  }

  function refreshUserEmail() {
    setText($('vvUserEmail'), norm(clientEmail?.value) || 'Aucun utilisateur connecté');
  }

  function openAdmin(force = false) {
    if (!adminPanel || !isAdmin()) return;

    if (sessionStorage.getItem(ADMIN_LOGOUT_KEY) === 'true' && !force) return;

    sessionStorage.removeItem(ADMIN_LOGOUT_KEY);
    adminPanel.classList.remove('hidden');
    document.body.classList.add('admin-email-active');

    if (adminClientEmail && !adminClientEmail.value) {
      adminClientEmail.value = ADMIN_EMAIL;
    }

    showNotice('Compte administrateur détecté. Mode admin illimité visible.', 'success');
  }

  function logoutUser() {
    if (clientEmail) clientEmail.value = '';

    localStorage.removeItem(CLIENT_EMAIL_KEY);

    if (walletBadge) {
      walletBadge.textContent = '0 min';
      walletBadge.classList.remove('ok-badge');
      walletBadge.classList.add('muted-badge');
    }

    refreshUserEmail();
    logoutAdmin(false);
    showNotice('Utilisateur déconnecté.', 'warning');
  }

  function logoutAdmin(showMessage) {
    sessionStorage.setItem(ADMIN_LOGOUT_KEY, 'true');

    localStorage.removeItem(ADMIN_SECRET_KEY);
    localStorage.removeItem(ADMIN_FREE_MODE_KEY);

    if (adminSecretInput) adminSecretInput.value = '';
    if (adminFreeMode) adminFreeMode.checked = false;
    if (adminPanel) adminPanel.classList.add('hidden');
    if (dubBtn) dubBtn.textContent = '⚡ Créer mon doublage';

    document.body.classList.remove('admin-free-active');
    document.body.classList.remove('admin-email-active');

    if (showMessage) {
      showNotice('Admin déconnecté. L’espace utilisateur reste disponible.', 'warning');
    }
  }

  function setMinutesUi() {
    setText(walletBadge, '0 min');

    setText(document.querySelector('.prices h2'), 'Acheter des minutes');
    setText(
      document.querySelector('.prices .hint'),
      'Tes minutes sont consommées selon la durée de ton fichier, arrondie à la minute supérieure.'
    );

    setText($('checkWalletBtn'), 'Vérifier mes minutes');

    const walletHint = document.querySelector('.account-card .hint');
    setText(walletHint, 'Utilise le même email après paiement pour retrouver tes minutes.');

    setText(document.querySelector('label[for="adminTokens"]'), 'Nombre de minutes');
    setText($('adminAddTokensBtn'), 'Ajouter les minutes');

    const subtitles = Array.from(document.querySelectorAll('.admin-subtitle'));
    const addTitle = subtitles.find(el => el.textContent.includes('Ajouter'));
    setText(addTitle, 'Ajouter des minutes à un client');

    const adminFreeSmall = document.querySelector('label[for="adminFreeMode"] small');
    setText(
      adminFreeSmall,
      'Quand ce mode est actif, tes doublages sont illimités et ne consomment aucune minute.'
    );

    const plans = {
      decouverte: ['1,99 €', '5 minutes'],
      createur: ['6,99 €', '30 minutes'],
      viral: ['11,99 €', '60 minutes'],
      pro: ['29,99 €', '180 minutes']
    };

    document.querySelectorAll('.buy-btn').forEach(button => {
      const plan = plans[button.dataset.plan];
      const article = button.closest('.plan');
      if (!plan || !article) return;

      setText(article.querySelector('strong'), plan[0]);
      setText(article.querySelector('p'), plan[1]);
    });
  }

  function boot() {
    createSpaceSwitch();
    createUserBar();
    createAdminHeader();
    setMinutesUi();
    refreshUserEmail();

    clientEmail?.addEventListener('input', () => {
      sessionStorage.removeItem(ADMIN_LOGOUT_KEY);
      localStorage.setItem(CLIENT_EMAIL_KEY, norm(clientEmail.value));
      refreshUserEmail();
      openAdmin(false);
    });

    openAdmin(false);
  }

  boot();
})();
