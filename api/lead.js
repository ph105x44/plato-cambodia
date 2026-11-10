// Vercel serverless function: receives a lead from the landing page and creates it in amoCRM.
// Required environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   AMO_SUBDOMAIN  - amoCRM account subdomain, e.g. "platoestate" for platoestate.amocrm.ru
//   AMO_TOKEN      - long-lived token of a private amoCRM integration
// Optional:
//   AMO_DOMAIN       - "amocrm.ru" (default) or "kommo.com"
//   AMO_PIPELINE_ID  - numeric pipeline id (otherwise the default pipeline is used)
//   AMO_STATUS_ID    - numeric status id inside that pipeline
//   AMO_RESPONSIBLE_ID   - numeric amoCRM user id to assign every new lead to
//   AMO_RESPONSIBLE_NAME - or a name to look up among amoCRM users (default "Евгений"); used only if it matches exactly one user
//   RESEND_API_KEY   - key from resend.com; when set, every lead is also e-mailed
//   LEAD_EMAIL_TO    - recipients, comma separated (default ph105x44@gmail.com)
//   LEAD_EMAIL_FROM  - sender, default "Plato Estate <onboarding@resend.dev>"
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


async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = (process.env.LEAD_EMAIL_TO || 'ph105x44@gmail.com').split(',').map((x) => x.trim()).filter(Boolean);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_EMAIL_FROM || 'Plato Estate <onboarding@resend.dev>',
        to,
        subject,
        text,
      }),
    });
    if (!r.ok) console.error('email failed', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.error('email failed', e.message);
    return false;
  }
}

async function amo(path, method, body) {
  const domain = process.env.AMO_DOMAIN || 'amocrm.ru';
  const r = await fetch(`https://${process.env.AMO_SUBDOMAIN}.${domain}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.AMO_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
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

// Approximate location from Vercel geo-IP headers and the browser time zone.
function safeDecode(v) { try { return decodeURIComponent(v); } catch (e) { return v; } }
function tzInfo(zone) {
  if (!zone || typeof zone !== 'string' || zone.length > 64) return null;
  try {
    const now = new Date();
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(now);
    const off = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now)
      .find((p) => p.type === 'timeZoneName');
    const utm = off ? off.value.replace('GMT', 'UTC') : '';
    return { zone, time, utc: utm === 'UTC' ? 'UTC+0' : utm };
  } catch (e) { return null; }
}

let responsibleCache = null;
async function resolveResponsible() {
  if (process.env.AMO_RESPONSIBLE_ID) return Number(process.env.AMO_RESPONSIBLE_ID);
  if (responsibleCache) return responsibleCache;
  const wanted = (process.env.AMO_RESPONSIBLE_NAME || 'Евгений').trim().toLowerCase();
  try {
    const data = await amo('/api/v4/users?limit=250', 'GET');
    const users = (data && data._embedded && data._embedded.users) || [];
    const found = users.filter((u) => (u.name || '').toLowerCase().includes(wanted));
    if (found.length === 1) { responsibleCache = found[0].id; return responsibleCache; }
    console.error('amo responsible: expected 1 match for', wanted, 'got', found.map((u) => `${u.id}:${u.name}`).join(', ') || 'none');
  } catch (e) {
    console.error('amo responsible lookup failed', e.message, e.detail);
  }
  return null;
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
  if (b.consent !== true) return res.status(422).json({ ok: false, error: 'consent' });
  if (name.length < 2 || contact.replace(/[\s\-().]/g, '').length < 5) {
    return res.status(422).json({ ok: false, error: 'invalid' });
  }
  if (!(await captchaOk(clean(b.captcha, 4000), ip))) {
    return res.status(403).json({ ok: false, error: 'captcha' });
  }

  const h = req.headers;
  const ipCity = clean(safeDecode(h['x-vercel-ip-city'] || ''), 60);
  const ipRegion = clean(safeDecode(h['x-vercel-ip-country-region'] || ''), 20);
  const ipCountry = clean(h['x-vercel-ip-country'] || '', 4);
  const ipTz = tzInfo(clean(h['x-vercel-ip-timezone'] || '', 64));
  const devTz = tzInfo(clean(b.tz, 64));
  const clientTz = devTz || ipTz;

  const answers = Array.isArray(b.answers) ? b.answers.slice(0, 10) : [];
  const lines = ['Заявка с лендинга «Недвижимость Камбоджи»', ''];
  answers.forEach((a) => {
    if (a && a.q) lines.push(`${clean(a.q, 60)}: ${clean(a.a, 120) || 'не указано'}`);
  });
  lines.push('', `Имя: ${name}`, `Контакт: ${contact}`);
  if (b.channel) lines.push(`Удобный способ связи: ${clean(b.channel, 40)}`);
  if (b.location) lines.push(`Интересующий район: ${clean(b.location, 80)}`);
  const place = [ipCity, ipCountry].filter(Boolean).join(', ');
  if (place) lines.push(`Город клиента (по IP): ${place}${ipRegion && ipCity ? ' (' + ipRegion + ')' : ''}`);
  if (clientTz) lines.push(`Часовой пояс клиента: ${clientTz.zone} (${clientTz.utc}), сейчас у клиента ${clientTz.time}`);
  if (ipTz && devTz && ipTz.zone !== devTz.zone) lines.push(`Часовой пояс по IP: ${ipTz.zone} (${ipTz.utc}); по устройству: ${devTz.zone}. Возможно, включён VPN`);
  lines.push(`Согласие на обработку персональных данных: дано, ${new Date().toISOString()}`);
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
  if (clientTz && clientTz.utc) lead._embedded.tags.push({ name: clientTz.utc });
  if (ipCity) lead._embedded.tags.push({ name: ipCity });
  const responsibleId = await resolveResponsible();
  if (responsibleId) {
    lead.responsible_user_id = responsibleId;
    contactEntity.responsible_user_id = responsibleId;
  }
  if (process.env.AMO_PIPELINE_ID) lead.pipeline_id = Number(process.env.AMO_PIPELINE_ID);
  if (process.env.AMO_STATUS_ID) lead.status_id = Number(process.env.AMO_STATUS_ID);

  const emailPromise = sendEmail(`Новая заявка: ${name}`, lines.join('\n'));
  let crmOk = false;
  try {
    const created = await amo('/api/v4/leads/complex', 'POST', [lead]);
    crmOk = true;
    const id = created && created[0] && created[0].id;
    if (id) {
      try {
        await amo(`/api/v4/leads/${id}/notes`, 'POST', [{ note_type: 'common', params: { text: lines.join('\n') } }]);
      } catch (e) {
        console.error('amo note failed', e.message, e.detail);
      }
    }
  } catch (e) {
    console.error('amo lead failed', e.message, e.detail);
  }
  const emailOk = await emailPromise;
  if (crmOk || emailOk) return res.status(200).json({ ok: true });
  return res.status(502).json({ ok: false, error: 'crm' });
};
