// Vercel serverless function: receives a lead from the landing page and creates it in amoCRM.
// Required environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   AMO_SUBDOMAIN  - amoCRM account subdomain, e.g. "platoestate" for platoestate.amocrm.ru
//   AMO_TOKEN      - long-lived token of a private amoCRM integration
// Optional:
//   AMO_DOMAIN       - "amocrm.ru" (default) or "kommo.com"
//   AMO_PIPELINE_ID  - numeric pipeline id (otherwise the default pipeline is used)
//   AMO_STATUS_ID    - numeric status id inside that pipeline
//   CAPTCHA_PROVIDER - "smartcaptcha" or "turnstile" (leave empty to skip the captcha check)
//   CAPTCHA_SECRET   - server secret of the chosen captcha

const hits = new Map(); // ip -> timestamps (best-effort limit, resets when the instance restarts)

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

async function captchaOk(token, ip) {
  const provider = process.env.CAPTCHA_PROVIDER;
  if (!provider) return true;
  const secret = process.env.CAPTCHA_SECRET;
  if (!secret || !token) return false;
  try {
    if (provider === 'smartcaptcha') {
      const r = await fetch('https://smartcaptcha.yandexcloud.net/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, token, ip: ip || '' }),
      });
      const j = await r.json();
      return j.status === 'ok';
    }
    if (provider === 'turnstile') {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip || '' }),
      });
      const j = await r.json();
      return j.success === true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

async function amo(path, method, body) {
  const domain = process.env.AMO_DOMAIN || 'amocrm.ru';
  const r = await fetch(`https://${process.env.AMO_SUBDOMAIN}.${domain}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.AMO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* keep null */ }
  if (!r.ok) {
    const err = new Error(`amoCRM ${r.status}`);
    err.detail = text.slice(0, 300);
    throw err;
  }
  return json;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  if (!process.env.AMO_SUBDOMAIN || !process.env.AMO_TOKEN) {
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'bad_request' });

  const ip = clean((req.headers['x-forwarded-for'] || '').split(',')[0], 64);

  // Bots: filled honeypot or form submitted too fast for a human.
  if (clean(b.website, 200) || Number(b.elapsed) < 1500) {
    return res.status(200).json({ ok: true }); // pretend success, store nothing
  }
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'rate' });

  const name = clean(b.name, 80);
  const contact = clean(b.contact, 120);
  if (name.length < 2 || contact.replace(/[\s\-().]/g, '').length < 5) {
    return res.status(422).json({ ok: false, error: 'invalid' });
  }
  if (!(await captchaOk(clean(b.captcha, 4000), ip))) {
    return res.status(403).json({ ok: false, error: 'captcha' });
  }

  const answers = Array.isArray(b.answers) ? b.answers.slice(0, 10) : [];
  const lines = ['Заявка с лендинга «Недвижимость Камбоджи»', ''];
  answers.forEach((a) => {
    if (a && a.q) lines.push(`${clean(a.q, 60)}: ${clean(a.a, 120) || 'не указано'}`);
  });
  lines.push('', `Имя: ${name}`, `Контакт: ${contact}`);
  const utm = b.utm && typeof b.utm === 'object' ? b.utm : {};
  const utmLine = Object.keys(utm).slice(0, 12).map((k) => `${clean(k, 30)}=${clean(utm[k], 100)}`).join(', ');
  if (utmLine) lines.push(`Метки: ${utmLine}`);
  if (b.referrer) lines.push(`Источник перехода: ${clean(b.referrer, 200)}`);

  const digits = contact.replace(/\D/g, '');
  const looksLikePhone = digits.length >= 10 && digits.length <= 15 && /^[+\d\s().\-]+$/.test(contact);
  const contactEntity = { first_name: name };
  if (looksLikePhone) {
    contactEntity.custom_fields_values = [{ field_code: 'PHONE', values: [{ value: '+' + digits, enum_code: 'WORK' }] }];
  }
  const lead = {
    name: `Заявка с сайта: ${name}`,
    _embedded: { contacts: [contactEntity], tags: [{ name: 'Камбоджа лендинг' }] },
  };
  if (process.env.AMO_PIPELINE_ID) lead.pipeline_id = Number(process.env.AMO_PIPELINE_ID);
  if (process.env.AMO_STATUS_ID) lead.status_id = Number(process.env.AMO_STATUS_ID);

  try {
    const created = await amo('/api/v4/leads/complex', 'POST', [lead]);
    const id = created && created[0] && created[0].id;
    if (id) {
      try {
        await amo(`/api/v4/leads/${id}/notes`, 'POST', [{ note_type: 'common', params: { text: lines.join('\n') } }]);
      } catch (e) {
        console.error('amo note failed', e.message, e.detail);
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('amo lead failed', e.message, e.detail);
    return res.status(502).json({ ok: false, error: 'crm' });
  }
};
