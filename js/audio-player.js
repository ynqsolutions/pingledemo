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

  // -15 / +15: a copy of the number lifts off the button and fades out, while
  // the number itself dims for a moment. Quick repeat taps each send one up.
  function skip(btn, dir){
    audio.currentTime = Math.max(0, Math.min(audio.duration || 1e9, audio.currentTime + dir * 15));
    paint();
    var label = btn.querySelector('span');
    if(reduce || !label.animate) return;
    var ghost = label.cloneNode(true);
    ghost.className = 'ap-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    btn.appendChild(ghost);
    var done = function(){ if(ghost.parentNode) ghost.parentNode.removeChild(ghost); };
    // The rise is quick at first and slows; the fade starts a beat later and runs
    // evenly, so the number is still readable while it travels.
    var rise = ghost.animate([
      { transform:'translateY(0)' },
      { transform:'translateY(-22px)' }
    ], { duration:650, easing:'cubic-bezier(.2,.7,.3,1)', fill:'forwards' });
    ghost.animate([{ opacity:1 }, { opacity:1, offset:.25 }, { opacity:0 }], { duration:650, fill:'forwards' });
    rise.onfinish = done; rise.oncancel = done;
    label.animate([{ opacity:.25 }, { opacity:1 }], { duration:650, easing:'ease-in' });
  }
  back.addEventListener('click', function(){ skip(back, -1); });
  fwd.addEventListener('click', function(){ skip(fwd, 1); });

  // Related audio strip: fades at the edge that has more chips, scrolls sideways
  // by finger, trackpad or mouse drag, and a drag or swipe never counts as a tap
  // on a chip (so swiping through them cannot open one by accident).
  var strip = root.querySelector('.ap-more-list');
  if(strip){
    var FADE = 28;
    var fade = function(){
      var max = strip.scrollWidth - strip.clientWidth;
      strip.style.setProperty('--fl', strip.scrollLeft > 2 ? FADE + 'px' : '0px');
      strip.style.setProperty('--fr', max > 2 && strip.scrollLeft < max - 2 ? FADE + 'px' : '0px');
    };
    strip.addEventListener('scroll', fade, { passive: true });
    window.addEventListener('resize', fade);
    if(window.ResizeObserver) new ResizeObserver(fade).observe(strip);
    fade();
    Array.prototype.forEach.call(strip.querySelectorAll('a'), function(a){ a.draggable = false; });

    var sx = 0, sl = 0, moved = false, down = false, blockUntil = 0;
    function begin(x){ sx = x; sl = strip.scrollLeft; moved = false; }
    function track(x){ if(Math.abs(x - sx) > 6) moved = true; }
    function end(){ if(moved) blockUntil = Date.now() + 400; }
    // mouse: drag the strip by hand
    strip.addEventListener('mousedown', function(e){
      if(e.button) return;
      down = true; begin(e.clientX);
    });
    window.addEventListener('mousemove', function(e){
      if(!down) return;
      track(e.clientX);
      if(moved){
        strip.classList.add('is-dragging');
        strip.scrollLeft = sl - (e.clientX - sx);
      }
    });
    window.addEventListener('mouseup', function(){
      if(!down) return;
      down = false; end();
      strip.classList.remove('is-dragging');
    });
    // touch: the browser scrolls it; we only remember that it was a swipe
    strip.addEventListener('touchstart', function(e){ begin(e.touches[0].clientX); }, { passive: true });
    strip.addEventListener('touchmove', function(e){ track(e.touches[0].clientX); }, { passive: true });
    strip.addEventListener('touchend', end, { passive: true });
    strip.addEventListener('touchcancel', end, { passive: true });
    // capture phase: runs before the chip's own click, and cancels it after a drag
    strip.addEventListener('click', function(e){
      if(Date.now() < blockUntil){ e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

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
