(function(){
  const totalTipsInput = document.getElementById('calcTotalTips');
  const splitMethodOptions = document.getElementById('calcSplitMethod');
  const rosterBody = document.getElementById('calcRosterBody');
  const addRowBtn = document.getElementById('calcAddRow');
  const submitBtn = document.getElementById('calcSubmitBtn');
  const valueColumnHead = document.getElementById('calcValueColumnHead');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const resultBody = document.getElementById('calcResultBody');
  const reconcileEl = document.getElementById('calcReconcile');

  if(!totalTipsInput || !rosterBody || !submitBtn) return;

  const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  let splitMethod = splitMethodOptions.querySelector('.calc-formula-opt.is-active')?.dataset.value || 'hours';
  let rowCount = 0;

  function formatDollarInput(el){
    el.addEventListener('input', () => {
      let raw = el.value.replace(/[^0-9.]/g, '');
      const firstDot = raw.indexOf('.');
      if(firstDot !== -1){
        raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
      }
      const [intPart, decPart] = raw.split('.');
      const formattedInt = intPart ? Number(intPart).toLocaleString('en-US') : '';
      el.value = decPart !== undefined ? `${formattedInt}.${decPart.slice(0, 2)}` : formattedInt;
    });
  }

  function numericValue(el){
    return Math.max(0, parseFloat((el.value || '').replace(/,/g, '')) || 0);
  }

  function addRow(name, value){
    rowCount++;
    const row = document.createElement('div');
    row.className = 'tip-roster-row';
    row.innerHTML = `
      <input type="text" class="tip-roster-name" placeholder="Name or role (e.g. Server)" value="${name || ''}">
      <input type="number" class="tip-roster-value" min="0" step="0.1" placeholder="${splitMethod === 'hours' ? 'Hours' : 'Points'}" value="${value || ''}">
      <button type="button" class="tip-roster-remove" aria-label="Remove row">&times;</button>
    `;
    rosterBody.appendChild(row);
    row.querySelector('.tip-roster-remove').addEventListener('click', () => {
      row.remove();
    });
  }

  addRowBtn.addEventListener('click', () => addRow());

  // Start with three blank rows so the roster doesn't look empty.
  addRow('', '');
  addRow('', '');
  addRow('', '');

  function updateValuePlaceholders(){
    const label = splitMethod === 'hours' ? 'Hours' : 'Points';
    valueColumnHead.textContent = label;
    rosterBody.querySelectorAll('.tip-roster-value').forEach(input => {
      input.placeholder = label;
    });
  }

  splitMethodOptions.querySelectorAll('.calc-formula-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      splitMethodOptions.querySelectorAll('.calc-formula-opt').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      splitMethod = btn.dataset.value;
      updateValuePlaceholders();
    });
  });
  updateValuePlaceholders();

  function getRoster(){
    return [...rosterBody.querySelectorAll('.tip-roster-row')].map(row => ({
      name: row.querySelector('.tip-roster-name').value.trim() || 'Unnamed',
      value: Math.max(0, parseFloat(row.querySelector('.tip-roster-value').value) || 0),
    })).filter(r => r.value > 0);
  }

  function calculate(){
    const totalTips = numericValue(totalTipsInput);
    const roster = getRoster();
    const totalUnits = roster.reduce((sum, r) => sum + r.value, 0);

    resultBody.innerHTML = '';

    // Work in whole cents, not raw dollars: splitting an amount that isn't
    // evenly divisible (e.g. $100 three ways) can't produce three display
    // values that both round cleanly AND sum to the total in raw float
    // math, only rounding each share to the nearest cent first, then
    // handing the last row whatever cents are left over, guarantees the
    // displayed shares always add up exactly.
    const totalCents = Math.round(totalTips * 100);
    let allocatedCents = 0;
    const shares = roster.map((r, i) => {
      const isLast = i === roster.length - 1;
      const rawCents = totalUnits > 0 ? totalCents * (r.value / totalUnits) : 0;
      const cents = isLast ? (totalCents - allocatedCents) : Math.round(rawCents);
      allocatedCents += isLast ? 0 : cents;
      return cents / 100;
    });

    roster.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'calc-result-line';
      row.innerHTML = `<span>${r.name} (${r.value} ${splitMethod === 'hours' ? 'hrs' : 'pts'})</span><span>${currency2.format(shares[i])}</span>`;
      resultBody.appendChild(row);
    });

    amountEl.textContent = currency2.format(totalTips);
    reconcileEl.textContent = roster.length
      ? `Split across ${roster.length} ${roster.length === 1 ? 'person' : 'people'} by ${splitMethod === 'hours' ? 'hours worked' : 'points'}, totals reconcile exactly.`
      : 'Add at least one person with hours or points to split the tips.';
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  formatDollarInput(totalTipsInput);

  function validateRequired(){
    const requiredFields = [{ field: totalTipsInput, isValid: () => numericValue(totalTipsInput) > 0 }];
    let firstInvalid = null;
    requiredFields.forEach(({ field, isValid }) => {
      if(!isValid()){
        field.classList.add('calc-input-error');
        const clear = () => field.classList.remove('calc-input-error');
        field.addEventListener('input', clear, { once: true });
        if(!firstInvalid) firstInvalid = field;
      }
    });
    if(getRoster().length === 0){
      firstInvalid = firstInvalid || rosterBody.querySelector('.tip-roster-value');
    }
    if(firstInvalid) firstInvalid.focus();
    return numericValue(totalTipsInput) > 0 && getRoster().length > 0;
  }

  const resultCard = document.getElementById('calcResultCard');

  submitBtn.addEventListener('click', () => {
    if(!validateRequired()) return;
    resultInner.classList.add('is-blurred');
    loading.hidden = false;
    submitBtn.disabled = true;
    if(window.innerWidth < 861){
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      calculate();
      loading.hidden = true;
      resultInner.classList.remove('is-blurred');
      submitBtn.disabled = false;
      if(window.innerWidth >= 861){
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 1000);
  });
})();
