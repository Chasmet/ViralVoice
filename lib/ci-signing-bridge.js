const express = require('express');

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const EXPECTED_REPOSITORY = 'Chasmet/ViralVoice';
const EXPECTED_REF = 'refs/heads/main';
const EXPECTED_WORKFLOW = '.github/workflows/android-apk.yml';

let remoteJwks = null;

async function verifyGitHubOidc(token) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(GITHUB_OIDC_JWKS));
  }

  const audience = process.env.GITHUB_OIDC_AUDIENCE || 'viralvoice-android-signing';
  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: GITHUB_OIDC_ISSUER,
    audience
  });

  const repository = String(payload.repository || '');
  const ref = String(payload.ref || '');
  const workflowRef = String(payload.workflow_ref || payload.job_workflow_ref || '');
  const eventName = String(payload.event_name || '');

  if (repository !== EXPECTED_REPOSITORY) {
    throw new Error('Repository OIDC refusé.');
  }
  if (ref !== EXPECTED_REF) {
    throw new Error('Branche OIDC refusée.');
  }
  if (!workflowRef.includes(EXPECTED_WORKFLOW)) {
    throw new Error('Workflow OIDC refusé.');
  }
  if (eventName && eventName !== 'push' && eventName !== 'workflow_dispatch') {
    throw new Error('Événement OIDC refusé.');
  }

  return payload;
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function signingBundle() {
  const keystoreBase64 = String(process.env.ANDROID_SIGNING_KEYSTORE_B64 || '');
  const storePassword = String(process.env.ANDROID_SIGNING_STORE_PASSWORD || '');
  const keyAlias = String(process.env.ANDROID_SIGNING_KEY_ALIAS || '');
  const keyPassword = String(process.env.ANDROID_SIGNING_KEY_PASSWORD || '');

  if (!keystoreBase64 || !storePassword || !keyAlias || !keyPassword) {
    throw new Error('Signature Android non configurée sur Render.');
  }

  return {
    keystoreBase64,
    storePassword,
    keyAlias,
    keyPassword
  };
}

function installSigningRoute(app) {
  if (app.__viralVoiceSigningRouteInstalled) return;
  app.__viralVoiceSigningRouteInstalled = true;

  app.get('/api/ci/android-signing', async (req, res) => {
    try {
      const token = bearerToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Jeton GitHub OIDC requis.' });
      }

      const claims = await verifyGitHubOidc(token);
      const bundle = signingBundle();

      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      return res.json({
        ok: true,
        repository: claims.repository,
        ref: claims.ref,
        sha: claims.sha,
        ...bundle
      });
    } catch (error) {
      console.warn('[ANDROID SIGNING] ACCESS DENIED', error.message || error);
      return res.status(403).json({
        error: 'Accès à la signature Android refusé.'
      });
    }
  });
}

// server-v3.js possède déjà toute la configuration Express. Ce module est
// préchargé par Node et ajoute uniquement la route CI juste avant app.listen().
const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  installSigningRoute(this);
  return originalListen.apply(this, args);
};

module.exports = {
  verifyGitHubOidc,
  installSigningRoute
};
