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
      walletStatus.textContent = 'Compte administrateur détecté. Mode admin visible.';
      walletStatus.className = 'notice success';
      walletStatus.classList.remove('hidden');
    }
  }

  if (clientEmail) {
    clientEmail.addEventListener('input', showAdminByEmail);
    showAdminByEmail();
  }
})();
