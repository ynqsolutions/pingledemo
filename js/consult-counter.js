// Populates every ".consult-counter-num" on the page with the live
// consultation-request count from netlify/functions/consult-count.js, and
// exposes window.bumpConsultCounter() for booking.js / case-review.js to
// call right after a successful submission so the badge updates in place
// instead of waiting for a reload.
(function () {
  function paint(count) {
    document.querySelectorAll('.consult-counter-num').forEach(function (el) {
      el.textContent = count.toLocaleString();
    });
  }

  fetch('/.netlify/functions/consult-count')
    .then(function (r) { return r.json(); })
    .then(function (data) { paint(data.count); })
    .catch(function () {});

  window.bumpConsultCounter = function () {
    fetch('/.netlify/functions/consult-count', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) { paint(data.count); })
      .catch(function () {});
  };
})();
