// Public pages: phone menu button
(function () {
  var btn = document.querySelector('[data-pubmenu]'), menu = document.getElementById('pubmenu');
  if (!btn || !menu) return;
  function set(open) { menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.textContent = open ? '✕ Close' : '☰ Menu'; }
  btn.addEventListener('click', function (e) { e.stopPropagation(); set(menu.hidden); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) set(false); });
})();
