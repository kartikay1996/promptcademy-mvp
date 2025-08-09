(function(){
  function ready(fn){document.readyState!='loading'?fn():document.addEventListener('DOMContentLoaded',fn)}
  ready(function(){
    var mount=document.getElementById('site-header'); if(!mount) return;
    fetch('/header.html',{credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error('header load');return r.text()})
    .then(function(html){ mount.innerHTML=html; wire(); markActive(); shadow(); }).catch(console.error);
  });
  function wire(){
    var btn=document.querySelector('.pc-menu-toggle');
    var nav=document.getElementById('pc-nav');
    if(!btn||!nav) return;
    btn.addEventListener('click',function(){var o=nav.classList.toggle('is-open');btn.setAttribute('aria-expanded',o?'true':'false');document.documentElement.classList.toggle('pc-menu-open',o)});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&nav.classList.contains('is-open')){nav.classList.remove('is-open');document.documentElement.classList.remove('pc-menu-open');btn.setAttribute('aria-expanded','false')}});
  }
  function markActive(){
    var path=location.pathname.replace(/\/$/,''); document.querySelectorAll('.pc-nav-list a').forEach(function(a){
      var href=a.getAttribute('href').replace(/\/$/,''); if(href&&(path===href||(href!='/index'&&path.startsWith(href)))) a.setAttribute('aria-current','page');
    });
  }
  function shadow(){
    var h=document.querySelector('.pc-header'); if(!h) return;
    var on=function(){ if(window.scrollY>2) h.classList.add('pc-header--scrolled'); else h.classList.remove('pc-header--scrolled'); };
    on(); window.addEventListener('scroll',on,{passive:true});
  }
})();