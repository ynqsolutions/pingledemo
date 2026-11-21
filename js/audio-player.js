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
  var es = (document.documentElement.lang || '').toLowerCase().indexOf('es') === 0;
  var rates = [1, 1.25, 1.5], ri = 0;
  var L = es ? { play:'Reproducir audio', pause:'Pausar audio', back:'Retroceder 15 segundos', fwd:'Adelantar 15 segundos', seek:'Posición del audio', speed:'Velocidad de reproducción' }
             : { play:'Play audio', pause:'Pause audio', back:'Back 15 seconds', fwd:'Forward 15 seconds', seek:'Audio position', speed:'Playback speed' };
  function fmt(s){ s = Math.max(0, Math.floor(s || 0)); return Math.floor(s/60) + ':' + ('0' + (s % 60)).slice(-2); }
  function paint(){
    var d = audio.duration || 0;
    seek.max = d || 100; seek.value = audio.currentTime;
    seek.setAttribute('aria-valuetext', fmt(audio.currentTime) + ' / ' + fmt(d));
    time.textContent = fmt(audio.currentTime) + ' / ' + fmt(d);
  }
  play.setAttribute('aria-label', L.play);
  back.setAttribute('aria-label', L.back); fwd.setAttribute('aria-label', L.fwd);
  seek.setAttribute('aria-label', L.seek); speed.setAttribute('aria-label', L.speed);
  play.addEventListener('click', function(){
    if(audio.paused){ root.classList.add('is-started'); audio.play(); } else { audio.pause(); }
  });
  audio.addEventListener('play', function(){ root.classList.add('is-playing'); play.setAttribute('aria-label', L.pause); });
  audio.addEventListener('pause', function(){ root.classList.remove('is-playing'); play.setAttribute('aria-label', L.play); });
  audio.addEventListener('ended', function(){ root.classList.remove('is-playing'); play.setAttribute('aria-label', L.play); });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
  seek.addEventListener('input', function(){ audio.currentTime = +seek.value; paint(); });
  back.addEventListener('click', function(){ audio.currentTime = Math.max(0, audio.currentTime - 15); });
  fwd.addEventListener('click', function(){ audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + 15); });
  speed.addEventListener('click', function(){
    ri = (ri + 1) % rates.length; audio.playbackRate = rates[ri];
    speed.textContent = rates[ri] + '×';
  });
})();
