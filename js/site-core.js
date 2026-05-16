/* =========================================================================
   site-core.js — собственный JS alisherotabaev.com
   Заменяет проприетарные tilda-*.js. Написан с нуля.
   1) Безопасные no-op шимы для инлайновых вызовов Tilda (t_onReady и пр.),
      чтобы старые страницы не падали с ReferenceError.
   2) Своя логика бургер-меню и выпадающих подменю.
   ========================================================================= */
(function (w, d) {
  'use strict';

  /* ---- 1. Шимы для инлайновых Tilda-вызовов ------------------------ */
  function onReady(fn) {
    if (typeof fn !== 'function') return;
    if (d.readyState !== 'loading') fn();
    else d.addEventListener('DOMContentLoaded', fn);
  }
  var noop = function () {};

  // Определяем только если их ещё нет (не ломаем, если что-то осталось)
  w.t_onReady       = w.t_onReady       || onReady;
  w.t_onFuncLoad    = w.t_onFuncLoad    || function (n, ok) { if (typeof ok === 'function') ok(); };
  w.t_throttle      = w.t_throttle      || function (fn) { return function () { return fn.apply(this, arguments); }; };
  w.t_randomString  = w.t_randomString  || function () { return 'x' + Math.random().toString(36).slice(2); };
  // Частые Tilda-инициализаторы блоков → пустышки
  ['t396_init','t450_initMenu','t456_init','t794_init','t602_init',
   't_menuburger_init','t_menu__highlightActiveLinks','t_menu__findAnchorLinks',
   't_menu__setBGcolor','t_menu__interactFromKeyboard','t396_initialScale',
   't_lazyload_update','t_onFuncLoad','t334_init','t-records_animated']
    .forEach(function (k) { if (typeof w[k] === 'undefined') w[k] = noop; });

  /* ---- 1b. Lazyload-шим (заменяет tilda-lazyload) ------------------
     Tilda хранит реальные картинки в data-original / div с фоном.
     Без её JS они не подгружаются — блоки выглядят пустыми. */
  onReady(function () {
    // <img data-original="..."> и <img data-lazy-src="...">
    d.querySelectorAll('img[data-original],img[data-lazy-src]').forEach(function (img) {
      var u = img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
      if (u && !img.getAttribute('src')) img.src = u;
      if (u) img.src = u;
      img.classList.add('t-img');
      img.style.opacity = '1';
    });
    // фоновые картинки: .t-bgimg / [data-original] на не-img
    d.querySelectorAll('[data-original]:not(img),.t-bgimg[data-original]').forEach(function (el) {
      var u = el.getAttribute('data-original');
      if (u) el.style.backgroundImage = "url('" + u + "')";
    });
    // bg, заданный через style="background-image:url(...)" уже работает сам
  });

  /* ---- 2. Бургер-меню (T450) -------------------------------------- */
  onReady(function () {
    var burgers = d.querySelectorAll('.t-menuburger');
    burgers.forEach(function (burger) {
      var rec = burger.closest('.t-rec') || d;
      var panel = rec.querySelector('.t450') ||
                  d.querySelector('.t450[data-tooltip-hook="#menuopen"]') ||
                  d.querySelector('.t450');
      var overlay = (rec.querySelector('.t450__overlay')) ||
                    d.querySelector('.t450__overlay');

      function open() {
        burger.classList.add('is-open');
        burger.setAttribute('aria-expanded', 'true');
        if (panel) panel.classList.add('is-open');
        if (overlay) overlay.classList.add('is-open');
        d.body.style.overflow = 'hidden';
      }
      function close() {
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        if (panel) panel.classList.remove('is-open');
        if (overlay) overlay.classList.remove('is-open');
        d.body.style.overflow = '';
      }
      function toggle() {
        (burger.classList.contains('is-open') ? close : open)();
      }
      burger.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
      if (overlay) overlay.addEventListener('click', close);
      if (panel) {
        var x = panel.querySelector('.t450__close-button, .t450__close');
        if (x) x.addEventListener('click', function (e) { e.preventDefault(); close(); });
        // закрытие при клике на обычную ссылку меню
        panel.querySelectorAll('a').forEach(function (a) {
          if (a.getAttribute('href') && a.getAttribute('href').indexOf('#submenu') === -1) {
            a.addEventListener('click', close);
          }
        });
      }
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });
    });

    /* ---- 3. Выпадающие подменю (T794) ---------------------------- */
    // Тильда связывает пункт меню href="#submenu:xxx" с блоком
    // .t794[data-tooltip-hook="#submenu:xxx"]. Воспроизводим поведение.
    var tooltips = d.querySelectorAll('.t794[data-tooltip-hook]');
    tooltips.forEach(function (tip) {
      var hook = tip.getAttribute('data-tooltip-hook'); // "#submenu:resurs"
      if (!hook) return;
      var triggers = d.querySelectorAll('a[href="' + hook + '"]');
      var menu = tip.querySelector('.t794__tooltip-menu');
      if (!menu) return;

      triggers.forEach(function (trg) {
        var li = trg.closest('li') || trg.parentNode;
        // позиционируем меню под пунктом
        function place() {
          var r = trg.getBoundingClientRect();
          menu.style.position = 'fixed';
          menu.style.top = (r.bottom + 6) + 'px';
          menu.style.left = (r.left + r.width / 2) + 'px';
          menu.style.transform = 'translateX(-50%)';
        }
        var hideTimer;
        function show() { clearTimeout(hideTimer); place(); menu.classList.add('is-open'); }
        function hide() { hideTimer = setTimeout(function () { menu.classList.remove('is-open'); }, 180); }

        trg.addEventListener('click', function (e) { e.preventDefault(); place(); menu.classList.toggle('is-open'); });
        li.addEventListener('mouseenter', show);
        li.addEventListener('mouseleave', hide);
        menu.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
        menu.addEventListener('mouseleave', hide);
        w.addEventListener('scroll', function () { if (menu.classList.contains('is-open')) place(); });
        w.addEventListener('resize', function () { if (menu.classList.contains('is-open')) place(); });
      });
    });
  });

})(window, document);
