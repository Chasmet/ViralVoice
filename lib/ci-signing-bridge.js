const express = require('express');
const config = require('./config');
const db = require('./database');

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const EXPECTED_REPOSITORY = 'Chasmet/ViralVoice';
const EXPECTED_REF = 'refs/heads/main';
const EXPECTED_WORKFLOW = '.github/workflows/android-apk.yml';
const DEVICE_BACKUP_KEY = 'viralvoice-admin-primary-device';

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

function requireAdminSecret(req) {
  if (!config.ADMIN_SECRET) {
    throw new Error('ADMIN_SECRET non configuré.');
  }
  const candidate = String(req.headers['x-admin-secret'] || req.body?.adminSecret || '');
  if (candidate !== config.ADMIN_SECRET) {
    throw new Error('Accès admin refusé.');
  }
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

function installBridgeRoutes(app) {
  if (app.__viralVoiceBridgeRoutesInstalled) return;
  app.__viralVoiceBridgeRoutesInstalled = true;

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

  app.post('/api/admin/device-backup', async (req, res) => {
    try {
      requireAdminSecret(req);
      const payload = req.body?.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({ error: 'Sauvegarde invalide.' });
      }
      const saved = await db.saveDeviceBackup(DEVICE_BACKUP_KEY, payload);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.json({ ok: true, updatedAt: saved.updated_at });
    } catch (error) {
      console.warn('[DEVICE BACKUP] SAVE ERROR', error.message || error);
      return res.status(403).json({ error: error.message || 'Sauvegarde refusée.' });
    }
  });

  app.get('/api/admin/device-backup', async (req, res) => {
    try {
      requireAdminSecret(req);
      const backup = await db.getDeviceBackup(DEVICE_BACKUP_KEY);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      return res.json({
        ok: true,
        exists: Boolean(backup),
        payload: backup?.payload || null,
        updatedAt: backup?.updated_at || null
      });
    } catch (error) {
      console.warn('[DEVICE BACKUP] READ ERROR', error.message || error);
      return res.status(403).json({ error: error.message || 'Restauration refusée.' });
    }
  });
}

// server-v3.js possède déjà toute la configuration Express. Ce module est
// préchargé par Node et ajoute les routes sécurisées juste avant app.listen().
const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  installBridgeRoutes(this);
  return originalListen.apply(this, args);
};

module.exports = {
  verifyGitHubOidc,
  installBridgeRoutes
};