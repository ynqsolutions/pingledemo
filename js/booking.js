// Phone consultation booking flow (schedule-consultation.html): a real
// inline calendar + time-of-day picker (step 1), contact fields with a
// live xxx-xxx-xxxx phone formatter (step 2), then a confirmation screen
// that submits to Netlify Forms and offers an .ics calendar file and the
// firm's .vcf contact card as real downloads (js/case-review.js's pattern
// for Netlify submission, adapted - this form isn't part of that quiz).
(function(){
  var card = document.getElementById('bkCard');
  if(!card) return;

  var state = { date: null, time: null };
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var maxDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var calMonth = document.getElementById('bkCalMonth');
  var calGrid = document.getElementById('bkCalGrid');
  var calPrev = document.getElementById('bkCalPrev');
  var calNext = document.getElementById('bkCalNext');

  function renderCalendar(){
    calMonth.textContent = MONTHS[viewMonth] + ' ' + viewYear;
    calPrev.disabled = (viewYear === today.getFullYear() && viewMonth === today.getMonth());
    calNext.disabled = (viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth());
    calGrid.innerHTML = '';
    var firstDay = new Date(viewYear, viewMonth, 1).getDay();
    var days = new Date(viewYear, viewMonth + 1, 0).getDate();
    for(var i = 0; i < firstDay; i++){
      var empty = document.createElement('span');
      empty.className = 'bk-day is-empty';
      calGrid.appendChild(empty);
    }
    for(var d = 1; d <= days; d++){
      var dt = new Date(viewYear, viewMonth, d);
      var dow = dt.getDay();
      var disabled = dt < today || dt > maxDate || dow === 0 || dow === 6;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(d);
      btn.className = 'bk-day ' + (disabled ? 'is-disabled' : 'is-selectable');
      if(dt.getTime() === today.getTime()) btn.classList.add('is-today');
      if(state.date && dt.getTime() === state.date.getTime()) btn.classList.add('is-selected');
      if(disabled){
        btn.disabled = true;
      } else {
        btn.addEventListener('click', (function(pickedDate){
          return function(){
            state.date = pickedDate;
            renderCalendar();
            updateStep1();
          };
        })(dt));
      }
      calGrid.appendChild(btn);
    }
  }
  calPrev.addEventListener('click', function(){
    viewMonth--;
    if(viewMonth < 0){ viewMonth = 11; viewYear--; }
    renderCalendar();
  });
  calNext.addEventListener('click', function(){
    viewMonth++;
    if(viewMonth > 11){ viewMonth = 0; viewYear++; }
    renderCalendar();
  });
  renderCalendar();

  var timeOpts = document.querySelectorAll('.bk-time');
  timeOpts.forEach(function(opt){
    opt.addEventListener('click', function(){
      timeOpts.forEach(function(o){ o.classList.remove('is-selected'); });
      opt.classList.add('is-selected');
      state.time = opt.getAttribute('data-time');
      updateStep1();
    });
  });

  var toStep2 = document.getElementById('bkToStep2');
  function updateStep1(){
    toStep2.disabled = !(state.date && state.time);
  }

  var steps = document.querySelectorAll('.bk-step');
  var stepLabel = document.getElementById('bkStepLabel');
  var progressFill = document.getElementById('bkProgressFill');
  function showStep(n){
    steps.forEach(function(s){ s.classList.toggle('active', s.getAttribute('data-step') === String(n)); });
    if(n === 3){
      stepLabel.textContent = 'Confirmed';
      progressFill.style.width = '100%';
    } else {
      stepLabel.textContent = 'Step ' + n + ' of 2';
      progressFill.style.width = (n / 2 * 100) + '%';
    }
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  toStep2.addEventListener('click', function(){ showStep(2); });
  document.getElementById('bkBackTo1').addEventListener('click', function(){ showStep(1); });

  var fPhone = document.getElementById('bkPhone');
  fPhone.addEventListener('input', function(){
    var digits = fPhone.value.replace(/\D/g, '').slice(0, 10);
    var out = digits;
    if(digits.length > 6) out = digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    else if(digits.length > 3) out = digits.slice(0, 3) + '-' + digits.slice(3);
    fPhone.value = out;
    updateStep2();
  });

  var fFirst = document.getElementById('bkFirst');
  var fLast = document.getElementById('bkLast');
  var fEmail = document.getElementById('bkEmail');
  var fSituation = document.getElementById('bkSituation');
  var fCount = document.getElementById('bkCount');
  var toStep3 = document.getElementById('bkToStep3');
  var step2Error = document.getElementById('bkStep2Error');

  fSituation.addEventListener('input', function(){
    fCount.textContent = String(fSituation.value.length);
    updateStep2();
  });
  [fFirst, fLast, fEmail].forEach(function(el){ el.addEventListener('input', updateStep2); });

  function step2Valid(){
    return !!(fFirst.value.trim() && fLast.value.trim() &&
      fPhone.value.replace(/\D/g, '').length === 10 &&
      /^\S+@\S+\.\S+$/.test(fEmail.value.trim()) &&
      fSituation.value.trim().length > 0);
  }
  function updateStep2(){
    toStep3.disabled = !step2Valid();
    if(step2Valid()) step2Error.classList.remove('show');
  }

  var RANGES = { Morning: '8 AM – 12 PM', Afternoon: '12 PM – 5 PM', Evening: 'After 5 PM' };

  function buildSummary(){
    var rows = [
      ['Date', state.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })],
      ['Time', state.time + ' (' + RANGES[state.time] + ')'],
      ['Name', fFirst.value.trim() + ' ' + fLast.value.trim()],
      ['Phone', fPhone.value.trim()],
      ['Email', fEmail.value.trim()],
      ['Situation', fSituation.value.trim()]
    ];
    document.getElementById('bkSummary').innerHTML = rows.map(function(r){
      return '<div class="bk-summary-row"><span class="k">' + r[0] + '</span><span class="v">' + esc(r[1]) + '</span></div>';
    }).join('');
  }
  function esc(str){
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function encodeForm(data){
    return Object.keys(data).map(function(key){
      return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
    }).join('&');
  }

  toStep3.addEventListener('click', function(e){
    var btn = e.currentTarget;
    if(!step2Valid()){
      step2Error.classList.add('show');
      return;
    }
    btn.setAttribute('disabled', 'true');
    btn.textContent = 'Sending…';

    var payload = {
      'form-name': 'schedule-consultation',
      preferredDate: state.date.toISOString().slice(0, 10),
      bestTimeToCall: state.time,
      fullName: fFirst.value.trim() + ' ' + fLast.value.trim(),
      phone: fPhone.value.trim(),
      email: fEmail.value.trim(),
      situation: fSituation.value.trim()
    };

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm(payload)
    })
      .then(function(){
        buildSummary();
        showStep(3);
      })
      .catch(function(){
        btn.removeAttribute('disabled');
        btn.textContent = 'Confirm Consultation →';
        step2Error.textContent = 'Something went wrong sending your request. Please call us instead at (714) 593-2306.';
        step2Error.classList.add('show');
      });
  });

  // ---- Add to Calendar (.ics) ----
  function pad(n){ return n < 10 ? '0' + n : String(n); }
  function icsStamp(date){
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + 'T' +
      pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
  }
  var TIME_START_HOUR = { Morning: 9, Afternoon: 13, Evening: 17 };

  document.getElementById('bkAddCalendar').addEventListener('click', function(){
    var start = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate(), TIME_START_HOUR[state.time], 0, 0);
    var end = new Date(start.getTime() + 30 * 60000);
    var ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pingle Law//Phone Consultation//EN',
      'BEGIN:VEVENT',
      'UID:' + Date.now() + '@pinglelaw.com',
      'DTSTAMP:' + icsStamp(new Date()),
      'DTSTART:' + icsStamp(start),
      'DTEND:' + icsStamp(end),
      'SUMMARY:Phone Consultation – Law Offices of Corey A. Pingle',
      'DESCRIPTION:Someone from our office will call ' + fPhone.value.trim() + ' during this window (' + state.time + ', ' + RANGES[state.time] + ').',
      'LOCATION:Phone call',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    downloadFile(ics, 'pingle-law-consultation.ics', 'text/calendar');
  });

  // ---- Save Our Contact (.vcf) ----
  document.getElementById('bkSaveContact').addEventListener('click', function(){
    fetch('assets/pingle-law-contact.vcf')
      .then(function(res){ return res.text(); })
      .then(function(text){ downloadFile(text, 'pingle-law-contact.vcf', 'text/vcard'); })
      .catch(function(){ window.location.href = 'assets/pingle-law-contact.vcf'; });
  });

  function downloadFile(content, filename, mime){
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  // ---- Reviews mini-carousel ----
  // These 10 are the real reviews from results-and-testimonials.html's
  // #reviewGrid, copied here rather than fetched live (that page has no
  // JSON data source for reviews the way content/settlements.json backs
  // the settlement tiles - they're hand-written into that page's HTML).
  // Update both places if a review changes; centralizing this into a
  // shared content/reviews.json read by generate_cms_sections.py would
  // be the real fix if this needs to be truly kept in sync going forward.
  var REVIEWS = [
    { platform: 'Google', name: 'Jordan A.', loc: 'Fountain Valley, CA', text: "The Law Office of Corey A. Pingle are amazing; they were able to settle my employment case within months and answered all my questions every step of the way. Big shoutout to Matt who's a great attorney, I'd recommend them to anyone who needs a great team to handle their workplace concerns." },
    { platform: 'Google', name: 'Jay Lim', loc: 'Fountain Valley, CA', text: 'This law firm has been trustworthy and supportive throughout all the painstaking processes. Corey and Emilija are professional, smart, and dedicated attorneys whom anyone who has been treated unfairly can rely on. Mary was also always empathetic and kind. Absolutely recommendable.' },
    { platform: 'Yelp', name: 'Rather N.', loc: 'Fountain Valley, CA', text: "Best attorney around! Great lawyers, they were efficient and fast and got me a settlement I wanted. Would use them again! I didn't have to put much work into this, they did most of the work." },
    { platform: 'Google', name: 'Jennifer Yost', loc: 'Fountain Valley, CA', text: "I can't say enough kind words about this law office. I had an employer that owed me a month and a half of back wages and they got me almost twice the money I was owed in a settlement within a matter of weeks." },
    { platform: 'Google', name: 'Cindy Le', loc: 'Fountain Valley, CA', text: 'Corey is an amazing attorney who fought hard for my case for a little over a year. With the information he was given, he still managed to win my case and make sure justice was served. Thank you again, Corey, for everything!' },
    { platform: 'Google', name: 'Nichole Kyea', loc: 'Fountain Valley, CA', text: "I can't say enough great things about the Law Offices of Corey A. Pingle. From start to finish, the entire team was professional, responsive, and truly invested in achieving the best possible outcome." },
    { platform: 'Google', name: 'Angelina Sanchez', loc: 'Sacramento, CA', text: 'I had a wonderful experience working with this law firm and couldn’t be more satisfied with the service I received. From start to finish, the team was professional, responsive, and made me feel supported throughout the entire process. A special thank you to Matt Briggs for all of his assistance.' },
    { platform: 'Google', name: 'Jesus Castro', loc: 'Sacramento, CA', text: 'Este abogado es muy bueno. Me ayudo con mi caso. Muchas gracias.' },
    { platform: 'Google', name: 'Ayse Sozer', loc: 'Sacramento, CA', text: 'I had an excellent experience working with Corey Pingle. From the start, he was knowledgeable, responsive, and clearly experienced in employment law. He took the time to explain everything in a way that made sense and kept me informed throughout the entire process.' },
    { platform: 'Google', name: 'Monica Levin', loc: 'Sacramento, CA', text: 'The attorneys at Pingle Law did a great job. Friendly and responsive. They gave me a free consultation, they do a great job!' }
  ];

  var reviewEl = document.getElementById('bkReview');
  if(reviewEl){
    var quoteEl = document.getElementById('bkReviewQuote');
    var srcEl = document.getElementById('bkReviewSrc');
    var reviewIndex = 0;
    var reviewTimer = null;
    var AUTO_ADVANCE_MS = 6000;

    function paintReview(i){
      var r = REVIEWS[i];
      quoteEl.textContent = '“' + r.text + '”';
      srcEl.innerHTML = '<b>' + (r.platform === 'Yelp' ? 'Y' : 'G') + '</b> ' + esc(r.name) + ' · Verified ' + r.platform + ' Review';
    }
    function showReview(i, animate){
      reviewIndex = (i + REVIEWS.length) % REVIEWS.length;
      if(!animate){ paintReview(reviewIndex); return; }
      reviewEl.classList.add('is-fading');
      setTimeout(function(){
        paintReview(reviewIndex);
        reviewEl.classList.remove('is-fading');
      }, 250);
    }
    function scheduleNext(){
      clearTimeout(reviewTimer);
      reviewTimer = setTimeout(function(){
        showReview(reviewIndex + 1, true);
        scheduleNext();
      }, AUTO_ADVANCE_MS);
    }
    document.getElementById('bkRevPrev').addEventListener('click', function(){
      showReview(reviewIndex - 1, true);
      scheduleNext();
    });
    document.getElementById('bkRevNext').addEventListener('click', function(){
      showReview(reviewIndex + 1, true);
      scheduleNext();
    });
    showReview(0, false);
    scheduleNext();
  }
})();
