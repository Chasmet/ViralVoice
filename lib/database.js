const { createClient } = require('@supabase/supabase-js');
const { normalizeEmail } = require('./utils');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && serviceKey ? createClient(url, serviceKey) : null;

function isConfigured() {
  return Boolean(supabase);
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase non configuré. Vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans Render.'
    );
  }
}

async function ensureClientAndWallet(email, name = '') {
  requireSupabase();
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) throw new Error('Email client obligatoire.');

  let { data: client, error } = await supabase
    .from('clients').select('*').eq('email', cleanEmail).maybeSingle();
  if (error) throw error;

  if (!client) {
    const inserted = await supabase
      .from('clients')
      .insert({ email: cleanEmail, name: name || null })
      .select('*')
      .single();
    if (inserted.error) throw inserted.error;
    client = inserted.data;
  }

  let walletResult = await supabase
    .from('token_wallets').select('*').eq('client_id', client.id).maybeSingle();
  if (walletResult.error) throw walletResult.error;
  let wallet = walletResult.data;

  if (!wallet) {
    walletResult = await supabase
      .from('token_wallets')
      .insert({
        client_id: client.id,
        token_balance: 0,
        total_tokens_purchased: 0,
        total_tokens_used: 0
      })
      .select('*')
      .single();
    if (walletResult.error) throw walletResult.error;
    wallet = walletResult.data;
  }

  return { client, wallet };
}

async function getWalletByClientId(clientId) {
  requireSupabase();
  const result = await supabase
    .from('token_wallets').select('*').eq('client_id', clientId).single();
  if (result.error) throw result.error;
  return result.data;
}

async function addMinutesToWallet({ email, minutes, packName, amountEur, revolutPaymentId }) {
  const { client, wallet } = await ensureClientAndWallet(email);
  const update = await supabase
    .from('token_wallets')
    .update({
      token_balance: Number(wallet.token_balance || 0) + minutes,
      total_tokens_purchased: Number(wallet.total_tokens_purchased || 0) + minutes,
      updated_at: new Date().toISOString()
    })
    .eq('client_id', client.id)
    .select('*')
    .single();
  if (update.error) throw update.error;

  const payment = await supabase.from('payments').insert({
    client_id: client.id,
    revolut_payment_id: revolutPaymentId || null,
    pack_name: packName,
    amount_eur: amountEur,
    tokens_added: minutes,
    payment_status: 'paid'
  });
  if (payment.error) throw payment.error;
  return { client, wallet: update.data };
}

async function consumeMinutes(email, minutesNeeded) {
  const { client, wallet } = await ensureClientAndWallet(email);
  const balance = Number(wallet.token_balance || 0);
  if (balance < minutesNeeded) {
    throw new Error(`Solde insuffisant. Il faut ${minutesNeeded} minute(s) pour ce fichier.`);
  }

  const update = await supabase
    .from('token_wallets')
    .update({
      token_balance: balance - minutesNeeded,
      total_tokens_used: Number(wallet.total_tokens_used || 0) + minutesNeeded,
      updated_at: new Date().toISOString()
    })
    .eq('client_id', client.id)
    .select('*')
    .single();
  if (update.error) throw update.error;
  return { client, wallet: update.data };
}

async function refundMinutes(clientId, minutes) {
  const wallet = await getWalletByClientId(clientId);
  const update = await supabase
    .from('token_wallets')
    .update({
      token_balance: Number(wallet.token_balance || 0) + minutes,
      total_tokens_used: Math.max(0, Number(wallet.total_tokens_used || 0) - minutes),
      updated_at: new Date().toISOString()
    })
    .eq('client_id', clientId)
    .select('*')
    .single();
  if (update.error) throw update.error;
  return update.data;
}

async function recordGeneration({
  clientId,
  prompt,
  voiceStyle,
  resultUrl,
  status,
  tokensUsed,
  durationSeconds = null,
  apiCostEstimateUsd = null,
  apiCostPerMinuteUsd = null,
  apiCostBreakdown = null,
  modelRoute = null,
  recoveryToken = null,
  resultPayload = null,
  recoveryExpiresAt = null
}) {
  requireSupabase();
  const result = await supabase.from('generations').insert({
    client_id: clientId,
    prompt,
    voice_style: voiceStyle,
    tokens_used: tokensUsed,
    result_url: resultUrl,
    status,
    duration_seconds: durationSeconds,
    api_cost_estimate_usd: apiCostEstimateUsd,
    api_cost_per_minute_usd: apiCostPerMinuteUsd,
    api_cost_breakdown: apiCostBreakdown,
    model_route: modelRoute,
    recovery_token: recoveryToken || null,
    result_payload: resultPayload || null,
    recovery_expires_at: recoveryExpiresAt || null
  });
  if (result.error) throw result.error;
}

async function getGenerationByRecoveryToken(token) {
  requireSupabase();
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return null;

  const result = await supabase
    .from('generations')
    .select('id, created_at, status, result_url, result_payload, recovery_expires_at')
    .eq('recovery_token', cleanToken)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  if (result.data.recovery_expires_at && new Date(result.data.recovery_expires_at).getTime() < Date.now()) {
    return null;
  }
  return result.data;
}

async function getLatestCompletedGenerationByEmail(email) {
  requireSupabase();
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const clientResult = await supabase
    .from('clients')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();
  if (clientResult.error) throw clientResult.error;
  if (!clientResult.data?.id) return null;

  const result = await supabase
    .from('generations')
    .select('id, created_at, status, result_url, result_payload, duration_seconds, model_route')
    .eq('client_id', clientResult.data.id)
    .in('status', ['completed', 'admin_free'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function getAdminCostLog(limit = 50) {
  requireSupabase();
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)));

  const result = await supabase
    .from('generations')
    .select(`
      id,
      client_id,
      status,
      created_at,
      duration_seconds,
      api_cost_estimate_usd,
      api_cost_per_minute_usd,
      api_cost_breakdown,
      model_route,
      clients ( email, name )
    `)
    .not('api_cost_estimate_usd', 'is', null)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (result.error) throw result.error;

  const rows = Array.isArray(result.data) ? result.data : [];
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(item => String(item.created_at || '').slice(0, 10) === today);
  const totalUsdToday = todayRows.reduce(
    (sum, item) => sum + Number(item.api_cost_estimate_usd || 0),
    0
  );
  const totalMinutes = rows.reduce(
    (sum, item) => sum + Number(item.duration_seconds || 0) / 60,
    0
  );
  const totalUsd = rows.reduce(
    (sum, item) => sum + Number(item.api_cost_estimate_usd || 0),
    0
  );

  return {
    rows,
    summary: {
      count: rows.length,
      todayCount: todayRows.length,
      totalUsdToday,
      averageCostPerMinuteUsd: totalMinutes > 0 ? totalUsd / totalMinutes : 0,
      lastCostUsd: Number(rows[0]?.api_cost_estimate_usd || 0)
    }
  };
}

async function saveDeviceBackup(backupKey, payload) {
  requireSupabase();
  const cleanKey = String(backupKey || '').trim().slice(0, 180);
  if (!cleanKey) throw new Error('Clé de sauvegarde obligatoire.');
  const serialized = JSON.stringify(payload || {});
  if (serialized.length > 100000) {
    throw new Error('Sauvegarde trop volumineuse.');
  }

  const result = await supabase
    .from('app_device_backups')
    .upsert({
      backup_key: cleanKey,
      payload: payload || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'backup_key' })
    .select('backup_key, updated_at')
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function getDeviceBackup(backupKey) {
  requireSupabase();
  const cleanKey = String(backupKey || '').trim().slice(0, 180);
  if (!cleanKey) throw new Error('Clé de sauvegarde obligatoire.');

  const result = await supabase
    .from('app_device_backups')
    .select('payload, updated_at')
    .eq('backup_key', cleanKey)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

module.exports = {
  isConfigured,
  requireSupabase,
  ensureClientAndWallet,
  getWalletByClientId,
  addMinutesToWallet,
  consumeMinutes,
  refundMinutes,
  recordGeneration,
  getGenerationByRecoveryToken,
  getLatestCompletedGenerationByEmail,
  getAdminCostLog,
  saveDeviceBackup,
  getDeviceBackup
};