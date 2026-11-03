(function () {
  var msg = '', sent = false;
  try { msg = sessionStorage.getItem('platoMsg') || ''; sent = sessionStorage.getItem('platoLead') === '1'; } catch (e) {}
  var title = document.getElementById('thanks-title'), lead = document.getElementById('thanks-lead');
  if (msg) {
    title.textContent = 'Заявка отправлена';
    lead.textContent = 'Спасибо! Мы свяжемся с вами и обсудим подходящие варианты.';
    document.getElementById('tg').href = 'https://t.me/platoestate?text=' + encodeURIComponent(msg);
    document.getElementById('wa').href = 'https://wa.me/85511730787?text=' + encodeURIComponent(msg);
  } else {
    title.textContent = 'Свяжитесь с Plato estate';
    lead.textContent = 'Расскажите о ваших планах — поможем выбрать недвижимость в Камбодже.';
  }
  if (sent) {
    try { sessionStorage.removeItem('platoLead'); } catch (e) {}
    if (typeof window.ym === 'function' && window.PLATO_METRIKA_ID) window.ym(window.PLATO_METRIKA_ID, 'reachGoal', 'lead_sent');
  }
})();
