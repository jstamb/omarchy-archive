/**
 * POST /api/ingest-x-trigger
 *
 * GitHub Actions → this Function → Grok Bot webhook routine
 * (scrape-x-via-webhook-trigger). No X secrets here; the Bot still does
 * OAuth MCP scrape + commit/push.
 *
 * Auth (inbound from Actions): Authorization: Bearer <INGEST_X_TRIGGER_SECRET>
 *
 * Outbound to Grok Bot (Cursor docs): Authorization: Bearer <sender key>.
 * Also sends X-Webhook-Secret with the same value for clients that prefer a
 * custom header; official expectation is Bearer.
 *
 * Pages encrypted Secrets (dashboard — never wrangler [vars]):
 *   INGEST_X_TRIGGER_SECRET, OMARCHY_BOT_WEBHOOK_URL, OMARCHY_BOT_WEBHOOK_SECRET
 */

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Constant-time string compare (length mismatch still returns false). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let out = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    out |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return out === 0;
}

function bearerToken(header) {
  if (!header || typeof header !== 'string') return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const inboundSecret = env.INGEST_X_TRIGGER_SECRET;
  const webhookUrl = env.OMARCHY_BOT_WEBHOOK_URL;
  const webhookSecret = env.OMARCHY_BOT_WEBHOOK_SECRET;

  if (!inboundSecret || !webhookUrl || !webhookSecret) {
    return json(500, { ok: false, error: 'secrets_missing' });
  }

  const presented = bearerToken(request.headers.get('Authorization'));
  if (!presented || !safeEqual(presented, inboundSecret)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const firedAt = new Date().toISOString();
  const body = JSON.stringify({
    source: 'omarchyarchive-ingest-x-trigger',
    fired_at: firedAt,
  });

  let upstream;
  try {
    upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
        'X-Webhook-Secret': webhookSecret,
        'Content-Type': 'application/json',
      },
      body,
    });
  } catch {
    return json(502, { ok: false, error: 'webhook_unreachable' });
  }

  if (!upstream.ok) {
    return json(502, {
      ok: false,
      error: 'webhook_failed',
      status: upstream.status,
    });
  }

  return json(200, { ok: true, fired_at: firedAt });
}
