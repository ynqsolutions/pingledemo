// Severance pay calculator: live-updates the estimate as the visitor types,
// using the same simple weekly-pay x weeks-per-year x years-of-service model
// explained in the article below it on severance-pay-calculator.html.
(function(){
  const salaryInput = document.getElementById('calcSalary');
  const yearsInput = document.getElementById('calcYears');
  const formulaSelect = document.getElementById('calcFormula');
  const customWeeksRow = document.getElementById('calcCustomWeeksRow');
  const customWeeksInput = document.getElementById('calcCustomWeeks');
  const ptoInput = document.getElementById('calcPto');

  const amountEl = document.getElementById('calcResultAmount');
  const weeklyPayEl = document.getElementById('calcWeeklyPay');
  const severanceWeeksEl = document.getElementById('calcSeveranceWeeks');
  const baseSeveranceEl = document.getElementById('calcBaseSeverance');
  const ptoLineEl = document.getElementById('calcPtoLine');

  if(!salaryInput || !yearsInput || !formulaSelect) return;

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

  function weeksPerYear(){
    if(formulaSelect.value === 'custom'){
      return Math.max(0, parseFloat(customWeeksInput.value) || 0);
    }
    return parseFloat(formulaSelect.value) || 0;
  }

  function recalc(){
    const salary = Math.max(0, parseFloat(salaryInput.value) || 0);
    const years = Math.max(0, parseFloat(yearsInput.value) || 0);
    const pto = Math.max(0, parseFloat(ptoInput.value) || 0);
    const multiplier = weeksPerYear();

    const weeklyPay = salary / 52;
    const severanceWeeks = multiplier * years;
    const baseSeverance = weeklyPay * severanceWeeks;
    const total = baseSeverance + pto;

    amountEl.textContent = currency.format(total);
    weeklyPayEl.textContent = currency.format(weeklyPay);
    severanceWeeksEl.textContent = number.format(severanceWeeks);
    baseSeveranceEl.textContent = currency.format(baseSeverance);
    ptoLineEl.textContent = currency.format(pto);
  }

  formulaSelect.addEventListener('change', () => {
    customWeeksRow.hidden = formulaSelect.value !== 'custom';
    recalc();
  });

  [salaryInput, yearsInput, customWeeksInput, ptoInput].forEach(el => {
    el.addEventListener('input', recalc);
  });

  recalc();
})();
