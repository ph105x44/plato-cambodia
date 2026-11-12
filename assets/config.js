// Lead receiver: Vercel function api/lead.js (amoCRM).
window.PLATO_CONFIG = { leadEndpoint: "/api/lead" };

// Готовое сообщение при переходе в мессенджеры: клиент видит текст в поле ввода и нажимает «Отправить».
// Работает для Telegram и WhatsApp (у Max нет параметра для текста). Ссылки заменяются при загрузке,
// поэтому текст подставляется и при долгом нажатии / открытии в новой вкладке.
// Источник берём из UTM-меток и запоминаем на время сессии, чтобы он не терялся при переходах.
(function () {
  function readSrc() {
    var src = '';
    try {
      var q = new URLSearchParams(location.search);
      src = (q.get('utm_source') || '').toLowerCase();
      if (!src && (q.get('yclid') || q.get('ysclid'))) src = 'yandex';
      if (src) sessionStorage.setItem('plato_src', src);
      else src = sessionStorage.getItem('plato_src') || '';
    } catch (e) { /* ignore */ }
    return src;
  }
  function where(src) {
    if (/yandex|yadirect|ya_direct|^ya$/.test(src)) return 'через рекламу в Яндексе';
    if (/(^|[^a-z])vk|vkontakte|mytarget/.test(src)) return 'через рекламу в ВК';
    return 'в интернете';
  }
  var MSG = 'Здравствуйте! Нашёл вас ' + where(readSrc()) + '. Хочу получить бесплатную консультацию и подборку объектов в Камбодже.';
  function addText(a) {
    var h = a.getAttribute('href') || '';
    if (!/^https:\/\/(t\.me|wa\.me)\//.test(h) || /[?&]text=/.test(h)) return;
    a.setAttribute('href', h + (h.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(MSG));
  }
  function run() { Array.prototype.forEach.call(document.querySelectorAll('a[href]'), addText); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
