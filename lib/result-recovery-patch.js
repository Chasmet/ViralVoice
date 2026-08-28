const express = require('express');

const CACHE_TTL_MS = 20 * 60 * 1000;
const results = new Map();

function cleanToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,160}$/.test(token) ? token : '';
}

function shortToken(token) {
  return token ? `${token.slice(0, 8)}…${token.slice(-4)}` : 'none';
}

function cleanup() {
  const now = Date.now();
  for (const [token, item] of results.entries()) {
    if (!item || item.expiresAt <= now) results.delete(token);
  }
}

const originalJson = express.response.json;
express.response.json = function patchedJson(body) {
  try {
    const req = this.req;
    if (req?.path === '/api/dub-video' && body?.ok) {
      const token = cleanToken(req.body?.recoveryToken);
      if (token) {
        results.set(token, {
          payload: body,
          expiresAt: Date.now() + CACHE_TTL_MS
        });
        cleanup();
        console.log(
          `[RESULT RECOVERY] CACHE token=${shortToken(token)} ` +
          `video=${Boolean(body.dubbedVideoUrl)} audio=${Boolean(body.dubbedAudioUrl)} ttl=20m`
        );
      } else {
        console.warn('[RESULT RECOVERY] génération terminée sans recoveryToken valide');
      }
    }
  } catch (error) {
    console.warn('[RESULT RECOVERY] cache error', error.message || error);
  }
  return originalJson.call(this, body);
};

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  if (!this.__viralvoiceRecoveryInstalled) {
    this.__viralvoiceRecoveryInstalled = true;
    this.get('/api/recover-result', (req, res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');

      const token = cleanToken(req.query.token);
      if (!token) {
        return res.status(400).json({ ok: false, error: 'Jeton de récupération invalide.' });
      }

      cleanup();
      const item = results.get(token);
      if (!item) {
        return res.status(202).json({ ok: false, pending: true });
      }

      console.log(`[RESULT RECOVERY] RECOVERED token=${shortToken(token)}`);
      return res.json({ ...item.payload, recovered: true });
    });

    console.log('[RESULT RECOVERY] endpoint /api/recover-result actif · TTL 20 min');
  }
  return originalListen.apply(this, args);
};

module.exports = { results };
