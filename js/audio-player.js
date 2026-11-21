/* "Prefer to listen?" audio player on blog posts (markup from generate_audio.py) */
(function(){
  var root = document.querySelector('.ap');
  if(!root) return;
  var audio = root.querySelector('audio');
  var play = root.querySelector('.ap-play');
  var seek = root.querySelector('.ap-seek');
  var time = root.querySelector('.ap-time');
  var speed = root.querySelector('.ap-speed');
  var back = root.querySelector('.ap-back');
  var fwd = root.querySelector('.ap-fwd');
  var kicker = root.querySelector('.ap-k');
  var es = (document.documentElement.lang || '').toLowerCase().indexOf('es') === 0;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rates = [1, 1.25, 1.5], ri = 0;
  var L = es ? { play:'Reproducir audio', pause:'Pausar audio', back:'Retroceder 15 segundos', fwd:'Adelantar 15 segundos', seek:'Posición del audio', speed:'Velocidad de reproducción', tap:'Toque reproducir para escuchar' }
             : { play:'Play audio', pause:'Pause audio', back:'Back 15 seconds', fwd:'Forward 15 seconds', seek:'Audio position', speed:'Playback speed', tap:'Tap play to listen' };

  function fmt(s){ s = Math.max(0, Math.floor(s || 0)); return Math.floor(s/60) + ':' + ('0' + (s % 60)).slice(-2); }
  function paint(){
    var d = audio.duration || 0;
    seek.max = d || 100; seek.value = audio.currentTime;
    seek.setAttribute('aria-valuetext', fmt(audio.currentTime) + ' / ' + fmt(d));
    time.textContent = fmt(audio.currentTime) + ' / ' + fmt(d);
  }
  function start(){
    root.classList.remove('is-nudge');
    root.classList.add('is-started');
    return audio.play();
  }

  play.setAttribute('aria-label', L.play);
  back.setAttribute('aria-label', L.back); fwd.setAttribute('aria-label', L.fwd);
  seek.setAttribute('aria-label', L.seek); speed.setAttribute('aria-label', L.speed);

  play.addEventListener('click', function(){ if(audio.paused) start(); else audio.pause(); });
  audio.addEventListener('play', function(){ root.classList.add('is-playing'); play.setAttribute('aria-label', L.pause); });
  audio.addEventListener('pause', function(){ root.classList.remove('is-playing'); play.setAttribute('aria-label', L.play); });
  audio.addEventListener('ended', function(){ root.classList.remove('is-playing'); play.setAttribute('aria-label', L.play); });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
  seek.addEventListener('input', function(){ audio.currentTime = +seek.value; paint(); });
  speed.addEventListener('click', function(){
    ri = (ri + 1) % rates.length; audio.playbackRate = rates[ri];
    speed.textContent = rates[ri] + '×';
  });
  // leaving the page (or it being kept for the back button) must not leave audio running
  window.addEventListener('pagehide', function(){ audio.pause(); });

  // -15 / +15: a ring sweeps round the number in the direction of the jump
  // (counter-clockwise back, clockwise forward) and the number nudges that way.
  function skip(btn, dir){
    audio.currentTime = Math.max(0, Math.min(audio.duration || 1e9, audio.currentTime + dir * 15));
    paint();
    var ring = btn.querySelector('.ap-ring'), label = btn.querySelector('span');
    if(reduce || !ring.animate) return;
    if(btn._fx) btn._fx.forEach(function(a){ a.cancel(); });
    // Timing is per step (the whole run is linear) so the sweep stays visible:
    // about 0.4s to draw the ring, then 0.25s to fade it.
    btn._fx = [
      ring.animate([
        { strokeDashoffset:100, opacity:1, easing:'cubic-bezier(.4,0,.2,1)' },
        { strokeDashoffset:0, opacity:1, offset:.6, easing:'ease-out' },
        { strokeDashoffset:0, opacity:0 }
      ], { duration:660 }),
      label.animate([
        { transform:'translateX(0) scale(1)', easing:'ease-out' },
        { transform:'translateX(' + (dir * 2) + 'px) scale(1.12)', offset:.35, easing:'ease-in-out' },
        { transform:'translateX(0) scale(1)' }
      ], { duration:460 })
    ];
  }
  back.addEventListener('click', function(){ skip(back, -1); });
  fwd.addEventListener('click', function(){ skip(fwd, 1); });

  // Related audio: opening one from the player starts it on the next page.
  // Only these links set the note, so arriving any other way never auto-plays.
  var KEY = 'pl-audio-next';
  function norm(p){ return (p || '').replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, ''); }
  Array.prototype.forEach.call(root.querySelectorAll('.ap-more-link'), function(a){
    a.addEventListener('click', function(e){
      if(e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // new tab or window
      try{ sessionStorage.setItem(KEY, JSON.stringify({ p:norm(a.pathname), t:Date.now() })); }catch(err){}
    });
  });
  var next = null;
  try{ next = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); }catch(err){}
  if(next && next.p === norm(location.pathname) && Date.now() - next.t < 20000){
    root.scrollIntoView({ block:'center' });
    var tried;
    try{ tried = start(); }catch(err){ tried = Promise.reject(err); }
    if(tried && tried.catch) tried.catch(function(){
      // Some browsers (Safari, iPhone) only start sound from a tap on this page.
      root.classList.remove('is-started');
      root.classList.add('is-nudge');
      if(kicker) kicker.textContent = L.tap;
    });
  }
})();
