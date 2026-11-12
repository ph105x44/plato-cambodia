// Lead receiver: Vercel function api/lead.js (amoCRM).
window.PLATO_CONFIG = { leadEndpoint: "/api/lead" };

// Готовое сообщение при переходе в мессенджеры: клиент видит текст в поле ввода и нажимает «Отправить».
// Работает для Telegram и WhatsApp (у Max нет параметра для текста). Ссылки заменяются при загрузке,
// поэтому текст подставляется и при долгом нажатии / открытии в новой вкладке.
(function () {
  var MSG = 'Здравствуйте! Пишу с сайта Plato Estate. Хочу подобрать недвижимость в Камбодже для инвестиций.';
  function addText(a) {
    var h = a.getAttribute('href') || '';
    if (!/^https:\/\/(t\.me|wa\.me)\//.test(h) || /[?&]text=/.test(h)) return;
    a.setAttribute('href', h + (h.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(MSG));
  }
  function run() { Array.prototype.forEach.call(document.querySelectorAll('a[href]'), addText); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
