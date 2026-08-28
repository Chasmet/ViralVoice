const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const db = require('./database');
const { normalizeEmail } = require('./utils');

const CACHE_TTL_MS = 20 * 60 * 1000;
const DB_TTL_MS = 2 * 60 * 60 * 1000;
const results = new Map();
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

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

async function findClientId(email) {
  if (!supabase) return null;
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  const result = await supabase
    .from('clients')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.id || null;
}

async function persistRecovery(req, body, token) {
  if (!supabase || !token || !body?.ok) return;
  const email = normalizeEmail(body.clientEmail || req.body?.clientEmail || req.body?.email);
  const clientId = await findClientId(email);
  if (!clientId) return;

  const latest = await supabase
    .from('generations')
    .select('id, created_at')
    .eq('client_id', clientId)
    .in('status', ['completed', 'admin_free'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw latest.error;
  if (!latest.data?.id) return;

  const expiresAt = new Date(Date.now() + DB_TTL_MS).toISOString();
  const update = await supabase
    .from('generations')
    .update({
      recovery_token: token,
      result_payload: body,
      recovery_expires_at: expiresAt
    })
    .eq('id', latest.data.id);
  if (update.error) throw update.error;

  console.log(`[RESULT RECOVERY] PERSISTED token=${shortToken(token)} generation=${latest.data.id}`);
}

async function recoverPersistent(token) {
  try {
    const row = await db.getGenerationByRecoveryToken(token);
    if (!row) return null;
    if (row.result_payload?.ok) return row.result_payload;
    if (row.result_url) {
      return {
        ok: true,
        recovered: true,
        dubbedVideoUrl: String(row.result_url).endsWith('.mp4') ? row.result_url : null,
        dubbedAudioUrl: String(row.result_url).endsWith('.mp3') ? row.result_url : null
      };
    }
  } catch (error) {
    console.warn('[RESULT RECOVERY] persistent read error', error.message || error);
  }
  return null;
}

async function recoverLatestForAdmin(req) {
  const secret = String(req.headers['x-admin-secret'] || req.query.adminSecret || '');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    const error = new Error('Accès admin refusé.');
    error.statusCode = 403;
    throw error;
  }

  const email = normalizeEmail(req.query.email);
  if (!email) {
    const error = new Error('Email obligatoire.');
    error.statusCode = 400;
    throw error;
  }

  const row = await db.getLatestCompletedGenerationByEmail(email);
  if (!row) return null;

  const maxAgeMs = Math.max(60 * 1000, Number(req.query.maxAgeMs || 30 * 60 * 1000));
  if (Date.now() - new Date(row.created_at).getTime() > maxAgeMs) return null;

  const { wallet } = await db.ensureClientAndWallet(email);
  if (row.result_payload?.ok) {
    return { ...row.result_payload, wallet, recovered: true, recoverySource: 'supabase-latest' };
  }

  const resultUrl = String(row.result_url || '');
  return {
    ok: true,
    recovered: true,
    recoverySource: 'supabase-latest',
    clientEmail: email,
    durationSeconds: Number(row.duration_seconds || 0),
    autoEngine: row.model_route || null,
    wallet,
    dubbedVideoUrl: resultUrl.endsWith('.mp4') ? resultUrl : null,
    dubbedAudioUrl: resultUrl.endsWith('.mp3') ? resultUrl : null,
    translation: ''
  };
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
        persistRecovery(req, body, token).catch(error => {
          console.warn('[RESULT RECOVERY] persist error', error.message || error);
        });
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

    this.get('/api/recover-result', async (req, res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');

      const token = cleanToken(req.query.token);
      if (!token) {
        return res.status(400).json({ ok: false, error: 'Jeton de récupération invalide.' });
      }

      cleanup();
      const item = results.get(token);
      if (item) {
        console.log(`[RESULT RECOVERY] RECOVERED memory token=${shortToken(token)}`);
        return res.json({ ...item.payload, recovered: true, recoverySource: 'memory' });
      }

      const persistent = await recoverPersistent(token);
      if (persistent?.ok) {
        console.log(`[RESULT RECOVERY] RECOVERED supabase token=${shortToken(token)}`);
        return res.json({ ...persistent, recovered: true, recoverySource: 'supabase-token' });
      }

      return res.status(202).json({ ok: false, pending: true });
    });

    this.get('/api/admin/recover-latest', async (req, res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      try {
        const payload = await recoverLatestForAdmin(req);
        if (!payload) return res.status(404).json({ ok: false, error: 'Aucun résultat récent trouvé.' });
        console.log(`[RESULT RECOVERY] ADMIN LATEST email=${normalizeEmail(req.query.email)}`);
        return res.json(payload);
      } catch (error) {
        return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Erreur récupération.' });
      }
    });

    console.log('[RESULT RECOVERY] endpoints actifs · mémoire 20 min · Supabase persistant');
  }
  return originalListen.apply(this, args);
};

module.exports = { results };
