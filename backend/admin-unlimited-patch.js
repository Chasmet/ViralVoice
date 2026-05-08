const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');
let code = fs.readFileSync(filePath, 'utf8');

const oldRequireSupabaseBlock = `    requireSupabase();

    if (!uploaded) {`;

const newRequireSupabaseBlock = `    if (!uploaded) {
      return res.status(400).json({
        error: 'Aucun fichier reçu.'
      });
    }

    adminFreeMode = isAdminFreeRequest(req);

    if (!adminFreeMode) {
      requireSupabase();
    }

    if (false) {`;

if (code.includes(oldRequireSupabaseBlock)) {
  code = code.replace(oldRequireSupabaseBlock, newRequireSupabaseBlock);
}

const oldAdminWalletBlock = `    if (adminFreeMode) {
      const { client } = await ensureClientAndWallet(effectiveClientEmail, 'Admin ViralVoice');
      chargedClient = client;
      charged = false;
      console.log(\`[\${jobId}] ADMIN FREE MODE\`);
    } else {`;

const newAdminWalletBlock = `    if (adminFreeMode) {
      chargedClient = {
        id: 'admin-local',
        email: effectiveClientEmail,
        name: 'Admin ViralVoice'
      };
      charged = false;
      console.log(\`[\${jobId}] ADMIN UNLIMITED MODE\`);
    } else {`;

if (code.includes(oldAdminWalletBlock)) {
  code = code.replace(oldAdminWalletBlock, newAdminWalletBlock);
}

const oldRecordBlock = `    await recordGeneration({
      clientId: chargedClient.id,
      prompt: adminFreeMode
        ? \`Admin gratuit - doublage vers \${targetLanguage}\`
        : \`Doublage vers \${targetLanguage}\`,
      voiceStyle: voice,
      resultUrl: responsePayload.dubbedVideoUrl || responsePayload.dubbedAudioUrl,
      status: adminFreeMode ? 'admin_free' : 'completed',
      tokensUsed: adminFreeMode ? 0 : 1
    });

    const wallet = await getWalletByClientId(chargedClient.id);
    responsePayload.wallet = wallet;`;

const newRecordBlock = `    if (adminFreeMode) {
      responsePayload.adminUnlimited = true;
      responsePayload.wallet = {
        token_balance: 999999,
        total_tokens_purchased: 999999,
        total_tokens_used: 0,
        admin_unlimited: true
      };
    } else {
      await recordGeneration({
        clientId: chargedClient.id,
        prompt: \`Doublage vers \${targetLanguage}\`,
        voiceStyle: voice,
        resultUrl: responsePayload.dubbedVideoUrl || responsePayload.dubbedAudioUrl,
        status: 'completed',
        tokensUsed: 1
      });

      const wallet = await getWalletByClientId(chargedClient.id);
      responsePayload.wallet = wallet;
    }`;

if (code.includes(oldRecordBlock)) {
  code = code.replace(oldRecordBlock, newRecordBlock);
}

code = code.replace(
  "version: '1.2.0-client-admin-wallet',",
  "version: '1.3.0-admin-unlimited',"
);

code = code.replace(
  "adminSecret: Boolean(ADMIN_SECRET),",
  "adminSecret: Boolean(ADMIN_SECRET),\n    adminUnlimited: Boolean(ADMIN_SECRET),"
);

fs.writeFileSync(filePath, code);
console.log('Patch admin illimité appliqué.');
