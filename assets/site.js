
(function () {
  // Where the answers go: Telegram handle and WhatsApp number (digits only, with country code).
  var TG = 'platoestate';
  var WA = '85511730787';
  var MAX = 'https://max.ru/u/f9LHodD0cOKUeSflT9MxcSbnPGYqZRN3BnHyX4T1QvqFaFTnD3XJnfz3XuY';
  var config = window.PLATO_CONFIG || {leadEndpoint: null};

  var Q = [
    { label: 'Цель', q: 'Что для вас важнее?', help: '',
      o: ['Доход от аренды', 'Рост стоимости', 'Сохранение капитала', 'Пока изучаю рынок'] },
    { label: 'Бюджет', q: 'Какой бюджет вы рассматриваете?', help: 'Полная стоимость квартиры',
      o: ['До $60 000', '$60 000–100 000', '$100 000–200 000', 'От $200 000'] },
    { label: 'Срок покупки', q: 'Когда планируете покупку?', help: '',
      o: ['В течение месяца', '1–3 месяца', '3–6 месяцев', 'Надо продать своё'] },
    { label: 'Оплата', q: 'Как планируете оплачивать?', help: '',
      o: ['Сразу всю сумму', 'В рассрочку', 'Нужно обсудить варианты'] },
    { label: 'Готовность квартиры', q: 'Когда квартира должна быть готова?', help: '',
      o: ['Нужна готовая или почти готовая', 'Могу подождать 2–3 года', 'Срок не важен'] }
  ];

  var state = { step: 0, answers: [], name: '', contact: '', channel: 'Telegram', location: '', done: false };
  var root = document.getElementById('quizRoot');
  var heroBox = document.getElementById('heroOpts');
  var busy = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function arrow() {
    var a = el('span', 'arrow', '→');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function optButton(label, pressed, onClick) {
    var b = el('button', 'opt');
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.append(el('span', null, label), arrow());
    b.addEventListener('click', onClick);
    return b;
  }
  function goQuiz() {
    var target = document.getElementById('quiz');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  function normalizePhone(raw) {
    const value=raw.trim().replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[\u2010-\u2015\u2212]/g,'-');
    if(!/^\+?[\d\s().-]+$/.test(value))return '';
    let digits=value.replace(/\D/g,'');
    const international=value.startsWith('+')||digits.startsWith('00');
    if(!value.startsWith('+')&&digits.startsWith('00'))digits=digits.slice(2);
    if(!international&&/^8\d{10}$/.test(digits))digits='7'+digits.slice(1);
    if(!international&&/^9\d{9}$/.test(digits))digits='7'+digits;
    if(!/^[1-9]\d{6,14}$/.test(digits))return '';
    if(digits.startsWith('7')&&digits.length!==11)return '';
    return '+'+digits;
  }
  function buildMessage() {
    var lines = ['Здравствуйте! Хочу получить подборку недвижимости в Камбодже для инвестиций.', ''];
    Q.forEach(function (q, i) { lines.push(q.label + ': ' + (state.answers[i] || 'не указано')); });
    if (state.location) lines.push('Интересует: ' + state.location);
    lines.push('Способ связи: ' + state.channel);
    lines.push('Имя: ' + state.name);
    if (state.contact) lines.push('Телефон: ' + state.contact);
    return lines.join('\n');
  }

  function renderHero() {
    heroBox.replaceChildren();
    Q[0].o.forEach(function (o) {
      heroBox.append(optButton(o, state.answers[0] === o, function () {
        state.answers[0] = o;
        state.done = false;
        state.step = 1;
        renderQuiz(false);
        renderHero();
        goQuiz();
      }));
    });
  }

  function renderQuiz(focus) {
    root.replaceChildren();
    var total = Q.length;
    var h = null;

    var prog = el('div', 'progress');
    prog.setAttribute('aria-hidden', 'true');
    for (var i = 0; i <= total; i++) {
      var s = el('span');
      if (state.done || i <= state.step) s.className = 'on';
      prog.append(s);
    }
    root.append(prog);

    if (state.done) {
      var msg = buildMessage();
      h = el('h3', 'qtitle', state.sent ? 'Заявка отправлена' : 'Ответы готовы');
      root.append(h);
      root.append(el('p', 'lede', state.sent
        ? 'Мы свяжемся с вами по указанному контакту. Также можно написать нам в мессенджере.'
        : 'Выберите мессенджер, чтобы передать запрос. В WhatsApp и Telegram откроется готовый текст — останется нажать «Отправить». Для MAX скопируйте текст ниже и вставьте в чат.'));

      var dl = el('dl', 'summary');
      Q.forEach(function (q, idx) {
        var row = el('div');
        row.append(el('dt', null, q.label), el('dd', null, state.answers[idx] || 'не указано'));
        dl.append(row);
      });
      if (state.location) {
        var place = el('div');
        place.append(el('dt', null, 'Интересует'), el('dd', null, state.location));
        dl.append(place);
      }
      var channelRow = el('div');
      channelRow.append(el('dt', null, 'Способ связи'), el('dd', null, state.channel));
      dl.append(channelRow);
      var r1 = el('div');
      r1.append(el('dt', null, 'Имя'), el('dd', null, state.name));
      dl.append(r1);
      if (state.contact) {
        var r2 = el('div');
        r2.append(el('dt', null, 'Телефон'), el('dd', null, state.contact));
        dl.append(r2);
      }
      root.append(dl);

      var actions = el('div', 'actions');
      var tg = el('a', 'btn ico-tg', 'Отправить в Telegram');
      tg.href = 'https://t.me/' + TG + '?text=' + encodeURIComponent(msg);
      tg.target = '_blank';
      tg.rel = 'noopener noreferrer';
      var wa = el('a', 'btn ghost ico-wa', 'Отправить в WhatsApp');
      wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
      wa.target = '_blank';
      wa.rel = 'noopener noreferrer';
      var copy = el('button', 'btn ghost', 'Скопировать текст');
      copy.type = 'button';
      var max = el('a', 'btn ghost ico-max', 'Написать в MAX');
      max.href = MAX; max.target = '_blank'; max.rel = 'noopener noreferrer';
      actions.append(wa, tg, max, copy);
      root.append(actions);

      var status = el('p', 'status');
      status.setAttribute('role', 'status');
      root.append(status);

      var ta = document.createElement('textarea');
      ta.id = 'q-message';
      ta.readOnly = true;
      ta.rows = 8;
      ta.value = msg;
      ta.setAttribute('aria-label', 'Текст сообщения');
      root.append(ta);

      copy.addEventListener('click', function () {
        function fallback() {
          ta.focus();
          ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          status.textContent = ok ? 'Текст скопирован.' : 'Выделите текст в поле ниже и скопируйте вручную.';
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).then(function () {
            status.textContent = 'Текст скопирован.';
          }, fallback);
        } else {
          fallback();
        }
      });

      var edit = el('button', 'linkbtn', 'Изменить ответы');
      edit.type = 'button';
      edit.addEventListener('click', function () {
        state.done = false;
        state.sent = false;
        state.step = 0;
        renderQuiz(true);
      });
      root.append(edit);

    } else if (state.step < total) {
      var q = Q[state.step];
      root.append(el('p', 'eyebrow', 'Вопрос ' + (state.step + 1) + ' из ' + total));
      h = el('h3', 'qtitle', q.q);
      root.append(h);
      if (q.help) root.append(el('p', 'hint', q.help));
      var grid = el('div', 'opts');
      q.o.forEach(function (o) {
        var btn = optButton(o, state.answers[state.step] === o, function () {
          if (busy) return;
          busy = true;
          state.answers[state.step] = o;
          Array.prototype.forEach.call(grid.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
          btn.setAttribute('aria-pressed', 'true');
          setTimeout(function () {
            busy = false;
            state.step += 1;
            renderQuiz(true);
            if (state.step === 1) renderHero();
          }, 180);
        });
        grid.append(btn);
      });
      root.append(grid);
      if (state.step > 0) {
        var back = el('button', 'linkbtn', '← Назад');
        back.type = 'button';
        back.addEventListener('click', function () {
          state.step -= 1;
          renderQuiz(true);
        });
        root.append(back);
      }

    } else {
      state.formAt = state.formAt || Date.now();
      root.append(el('p', 'eyebrow', 'Последний шаг'));
      h = el('h3', 'qtitle', 'Куда прислать подборку?');
      root.append(h);
      var form = document.createElement('form');
      form.innerHTML =
        '<fieldset class="contact-channels"><legend>Как вам удобнее связаться?</legend><div class="contact-channel-options">' +
        ['Telegram', 'WhatsApp', 'MAX', 'Звонок'].map(function (channel) {
          return '<label><input type="radio" name="channel" value="' + channel + '"><span>' + channel + '</span></label>';
        }).join('') + '</div></fieldset>' +
        '<label for="q-name">Имя *<input id="q-name" name="name" type="text" autocomplete="given-name" maxlength="80" required></label>' +
        '<label for="q-contact"><span id="q-contact-label">Номер телефона *</span><small id="q-contact-help">С кодом страны</small><input id="q-contact" name="contact" type="tel" inputmode="tel" autocomplete="tel" maxlength="25" aria-describedby="q-contact-help" required></label>' +
        '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />' +
        '<p class="err" id="q-err" role="alert" hidden>Введите имя, чтобы специалист знал, как к вам обращаться.</p>' +
        '<label class="consent" for="q-consent"><input type="checkbox" id="q-consent" name="consent" required><span>Я согласен на <a href="consent.html" target="_blank" rel="noopener">обработку персональных данных</a> и ознакомлен с <a href="privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a></span></label>' +
        '<button class="btn pulse" type="submit">Получить подборку</button>';
      root.append(form);
      form.setAttribute('aria-label', 'Контакт для подборки');
      var nameInput = form.querySelector('#q-name');
      var contactInput = form.querySelector('#q-contact');
      var err = form.querySelector('#q-err');
      nameInput.placeholder = 'Ваше имя';
      contactInput.placeholder = '+7 999 123-45-67';
      nameInput.value = state.name;
      contactInput.value = state.contact;
      form.querySelectorAll('[name=channel]').forEach(function (radio) {
        radio.checked = radio.value === state.channel;
        radio.addEventListener('change', function () { state.channel = radio.value; });
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var n = nameInput.value.trim();
        var c = contactInput.value.trim();
        if (!n) {
          err.textContent = 'Введите имя, чтобы специалист знал, как к вам обращаться.';
          err.hidden = false;
          nameInput.focus();
          return;
        }
        var consentBox = form.querySelector('#q-consent');
        if (!consentBox || !consentBox.checked) {
          err.textContent = 'Чтобы отправить заявку, нужно согласие на обработку персональных данных.';
          err.hidden = false;
          if (consentBox) consentBox.focus();
          return;
        }
        var phone = normalizePhone(c);
        if (!phone) {
          err.textContent = 'Укажите номер телефона с кодом страны.';
          err.hidden = false;
          contactInput.focus();
          return;
        }
        state.name = n.slice(0, 80);
        state.contact = phone;
        var submitBtn = form.querySelector('button[type=submit]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';
        err.hidden = true;
        var utm = {};
        try {
          new URLSearchParams(location.search).forEach(function (v, k) {
            if (/^(utm_|yclid|ysclid|gclid|fbclid|_openstat)/i.test(k)) utm[k] = v;
          });
        } catch (e2) { /* ignore */ }
        var payload = {
          name: state.name,
          contact: state.contact,
          channel: state.channel,
          location: state.location,
          website: (form.querySelector('[name=website]') || {}).value || '',
          consent: true,
          elapsed: Date.now() - (state.formAt || Date.now()),
          answers: Q.map(function (qq, idx) { return { q: qq.label, a: state.answers[idx] || '' }; }),
          utm: utm,
          referrer: document.referrer || '',
          tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })()
        };
        var finish = function (ok) {
          if (ok) {
            try {
              sessionStorage.setItem('platoLead', '1');
              sessionStorage.setItem('platoMsg', buildMessage());
            } catch (e3) { /* ignore */ }
            window.location.assign('thanks.html');
            return;
          }
          state.sent = ok;
          state.done = true;
          renderQuiz(true);
        };
        if (!config.leadEndpoint) { finish(false); return; }
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        fetch(config.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal })
          .then(function (r) { return r.ok ? r.json().catch(function () { return { ok: false }; }) : { ok: false, status: r.status }; })
          .then(function (j) {
            if (j && j.ok) { finish(true); return; }
            if (j && j.status === 422) { err.textContent = 'Проверьте имя и контакт и попробуйте ещё раз.'; err.hidden = false; submitBtn.disabled = false; submitBtn.textContent = 'Получить подборку'; return; }
            finish(false);
          })
          .catch(function () { finish(false); })
          .finally(function () { clearTimeout(timer); });
      });
      var back2 = el('button', 'linkbtn', '← Назад');
      back2.type = 'button';
      back2.addEventListener('click', function () {
        state.name = nameInput.value;
        state.contact = contactInput.value;
        state.step -= 1;
        renderQuiz(true);
      });
      root.append(back2);
    }

    if (focus && h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }

  document.querySelectorAll('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); goQuiz(); });
  });

  document.querySelectorAll('[data-loc]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.location = b.getAttribute('data-loc');
      state.done = false;
      var next = 0;
      while (next < Q.length && state.answers[next]) next++;
      state.step = next;
      renderQuiz(false);
      renderHero();
      goQuiz();
    });
  });

  renderHero();
  renderQuiz(false);
})();
