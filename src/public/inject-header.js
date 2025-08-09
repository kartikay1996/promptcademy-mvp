/* Injects /header.html into #site-header and wires up mobile menu */
(function () {
  function ready(fn){ if(document.readyState!='loading'){fn()} else {document.addEventListener('DOMContentLoaded', fn)} }
  ready(function () {
    var target = document.getElementById('site-header');
    if (!target) { return; }
    fetch('/header.html', { credentials: 'same-origin' })
      .then(function(r){ if(!r.ok) throw new Error('Failed to load header.html'); return r.text(); })
      .then(function(html){
        target.innerHTML = html;
        wireMenu();
        addScrollShadow();
      })
      .catch(function(err){ console.error('[inject-header]', err); });
  });

  function wireMenu() {
    var toggle = document.querySelector('.pc-menu-toggle');
    var nav = document.getElementById('pc-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function(){
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.documentElement.classList.toggle('pc-menu-open', open);
    });
    // Close on escape
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && nav.classList.contains('is-open')){
        nav.classList.remove('is-open');
        document.documentElement.classList.remove('pc-menu-open');
        document.querySelector('.pc-menu-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function addScrollShadow() {
    var header = document.querySelector('.pc-header');
    if (!header) return;
    var onScroll = function(){
      if (window.scrollY > 2) header.classList.add('pc-header--scrolled');
      else header.classList.remove('pc-header--scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
