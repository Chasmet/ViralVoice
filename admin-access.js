(() => {
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';

  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const ADMIN_FREE_MODE_KEY = 'viralvoice-admin-free-mode';

  const clientEmail = document.getElementById('clientEmail');
  const adminPanel = document.getElementById('adminPanel');
  const adminClientEmail = document.getElementById('adminClientEmail');
  const walletStatus = document.getElementById('walletStatus');
  const walletBadge = document.getElementById('walletBadge');
  const adminSecretInput = document.getElementById('adminSecretInput');
  const adminFreeMode = document.getElementById('adminFreeMode');
  const dubBtn = document.getElementById('dubBtn');

  function cleanEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function showMessage(message, type = 'success') {
    if (!walletStatus) return;

    walletStatus.textContent = message;
    walletStatus.className = 'notice';
    walletStatus.classList.add(type);
    walletStatus.classList.remove('hidden');
  }

  function isAdminEmail() {
    return cleanEmail(clientEmail?.value) === ADMIN_EMAIL;
  }

  function openAdminPanel() {
    if (!adminPanel || !isAdminEmail()) return;

    adminPanel.classList.remove('hidden');
    document.body.classList.add('admin-email-active');

    if (adminClientEmail && !adminClientEmail.value) {
      adminClientEmail.value = ADMIN_EMAIL;
    }

    showMessage('Admin détecté. Mode admin visible.', 'success');
  }

  function closeAdminPanel() {
    if (adminPanel) {
      adminPanel.classList.add('hidden');
    }

    document.body.classList.remove('admin-email-active');
    document.body.classList.remove('admin-free-active');

    if (adminSecretInput) {
      adminSecretInput.value = '';
    }

    if (adminFreeMode) {
      adminFreeMode.checked = false;
    }

    if (dubBtn) {
      dubBtn.textContent = '⚡ Créer mon doublage';
    }

    localStorage.removeItem(ADMIN_SECRET_KEY);
    localStorage.removeItem(ADMIN_FREE_MODE_KEY);
  }

  function logoutUser() {
    if (clientEmail) {
      clientEmail.value = '';
    }

    localStorage.removeItem(CLIENT_EMAIL_KEY);

    if (walletBadge) {
      walletBadge.textContent = '0 min';
      walletBadge.classList.remove('ok-badge');
      walletBadge.classList.add('muted-badge');
    }

    closeAdminPanel();
    showMessage('Utilisateur déconnecté.', 'warning');
  }

  function logoutAdmin() {
    closeAdminPanel();
    showMessage('Admin déconnecté. L’espace utilisateur reste disponible.', 'warning');
  }

  function addLogoutButtons() {
    const accountCard = document.querySelector('.account-card');
    const accountActions = accountCard?.querySelector('.actions.two');

    if (accountActions && !document.getElementById('logoutUserBtn')) {
      const userButton = document.createElement('button');
      userButton.id = 'logoutUserBtn';
      userButton.type = 'button';
      userButton.className = 'secondary full';
      userButton.textContent = 'Déconnexion utilisateur';
      userButton.addEventListener('click', logoutUser);

      accountActions.insertAdjacentElement('afterend', userButton);
    }

    if (adminPanel && !document.getElementById('logoutAdminBtn')) {
      const adminButton = document.createElement('button');
      adminButton.id = 'logoutAdminBtn';
      adminButton.type = 'button';
      adminButton.className = 'secondary full';
      adminButton.textContent = 'Déconnexion admin';
      adminButton.addEventListener('click', logoutAdmin);

      const firstHint = adminPanel.querySelector('.hint');

      if (firstHint) {
        firstHint.insertAdjacentElement('afterend', adminButton);
      } else {
        adminPanel.prepend(adminButton);
      }
    }
  }

  function applyMinuteLabels() {
    const pricesTitle = document.querySelector('.prices h2');
    const pricesHint = document.querySelector('.prices .hint');
    const accountHint = document.querySelector('.account-card .hint');
    const checkWalletBtn = document.getElementById('checkWalletBtn');
    const adminTokensLabel = document.querySelector('label[for="adminTokens"]');
    const adminAddTokensBtn = document.getElementById('adminAddTokensBtn');
    const adminFreeSmall = document.querySelector('label[for="adminFreeMode"] small');

    if (pricesTitle) {
      pricesTitle.textContent = 'Acheter des minutes';
    }

    if (pricesHint) {
      pricesHint.textContent = 'Tes minutes sont consommées selon la durée du fichier.';
    }

    if (accountHint) {
      accountHint.textContent = 'Utilise le même email après paiement pour retrouver tes minutes.';
    }

    if (checkWalletBtn) {
      checkWalletBtn.textContent = 'Vérifier mes minutes';
    }

    if (adminTokensLabel) {
      adminTokensLabel.textContent = 'Nombre de minutes';
    }

    if (adminAddTokensBtn) {
      adminAddTokensBtn.textContent = 'Ajouter les minutes';
    }

    if (adminFreeSmall) {
      adminFreeSmall.textContent = 'Quand ce mode est actif, tes doublages sont illimités et ne consomment aucune minute.';
    }

    const subtitles = Array.from(document.querySelectorAll('.admin-subtitle'));
    const addTitle = subtitles.find(item => item.textContent.toLowerCase().includes('ajouter'));

    if (addTitle) {
      addTitle.textContent = 'Ajouter des minutes à un client';
    }

    const plans = {
      decouverte: {
        price: '1,99 €',
        minutes: '5 minutes'
      },
      createur: {
        price: '6,99 €',
        minutes: '30 minutes'
      },
      viral: {
        price: '11,99 €',
        minutes: '60 minutes'
      },
      pro: {
        price: '29,99 €',
        minutes: '180 minutes'
      }
    };

    document.querySelectorAll('.buy-btn').forEach(button => {
      const plan = plans[button.dataset.plan];
      const planCard = button.closest('.plan');

      if (!plan || !planCard) return;

      const priceText = planCard.querySelector('strong');
      const minuteText = planCard.querySelector('p');

      if (priceText) {
        priceText.textContent = plan.price;
      }

      if (minuteText) {
        minuteText.textContent = plan.minutes;
      }
    });

    if (walletBadge && walletBadge.textContent.toLowerCase().includes('crédit')) {
      walletBadge.textContent = '0 min';
    }
  }

  function handleClientEmailInput() {
    if (!clientEmail) return;

    const email = cleanEmail(clientEmail.value);
    localStorage.setItem(CLIENT_EMAIL_KEY, email);

    if (email === ADMIN_EMAIL) {
      openAdminPanel();
    }
  }

  function init() {
    addLogoutButtons();
    applyMinuteLabels();

    if (clientEmail) {
      clientEmail.addEventListener('input', handleClientEmailInput);
      handleClientEmailInput();
    }
  }

  init();
})();
