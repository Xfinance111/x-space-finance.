// XSpaceFinance Calculator JavaScript

let currentPlan = null;
let currentAmount = 0;

document.addEventListener('DOMContentLoaded', function() {
  initializeCalculator();
});

function initializeCalculator() {
  // Get DOM elements
  const amountInput = document.getElementById('investment-amount');
  const planSelect = document.getElementById('plan-select');
  const calculateBtn = document.getElementById('calculate-btn');
  
  // Add event listeners
  if (amountInput) {
    amountInput.addEventListener('input', debounce(updateCalculation, 300));
  }
  
  if (planSelect) {
    planSelect.addEventListener('change', updateCalculation);
  }
  
  if (calculateBtn) {
    calculateBtn.addEventListener('click', updateCalculation);
  }
  
  // Initial calculation
  updateCalculation();
}

async function updateCalculation() {
  const amountInput = document.getElementById('investment-amount');
  const planSelect = document.getElementById('plan-select');
  const loadingSpinner = document.getElementById('loading-spinner');
  const resultContainer = document.getElementById('result-container');
  
  if (!amountInput || !planSelect) return;
  
  const amount = parseFloat(amountInput.value);
  const planId = planSelect.value;
  
  if (isNaN(amount) || amount <= 0 || !planId) {
    if (resultContainer) {
      resultContainer.classList.add('hidden');
    }
    return;
  }
  
  // Show loading state
  if (loadingSpinner) loadingSpinner.classList.remove('hidden');
  
  try {
    const response = await fetch('/api/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
      },
      body: JSON.stringify({ plan_id: planId, amount: amount })
    });
    
    const data = await response.json();
    
    if (data.success) {
      displayResults(data.data);
      updateChart(data.data);
    }
  } catch (error) {
    console.error('Calculation error:', error);
    showError('Failed to calculate returns. Please try again.');
  } finally {
    if (loadingSpinner) loadingSpinner.classList.add('hidden');
  }
}

function displayResults(data) {
  const resultContainer = document.getElementById('result-container');
  const principalEl = document.getElementById('principal-amount');
  const totalReturnEl = document.getElementById('total-return');
  const profitEl = document.getElementById('profit-amount');
  const effectiveRoiEl = document.getElementById('effective-roi');
  const dailyProfitEl = document.getElementById('daily-profit');
  
  if (resultContainer) resultContainer.classList.remove('hidden');
  
  if (principalEl) principalEl.innerText = formatCurrency(data.principal);
  if (totalReturnEl) totalReturnEl.innerText = formatCurrency(data.total_return);
  if (profitEl) {
    profitEl.innerText = formatCurrency(data.profit);
    profitEl.className = data.profit >= 0 ? 'text-green-500' : 'text-red-500';
  }
  if (effectiveRoiEl) effectiveRoiEl.innerText = data.effective_roi.toFixed(2) + '%';
  if (dailyProfitEl) dailyProfitEl.innerText = formatCurrency(data.daily_profit);
  
  // Animate results
  animateResultElements();
}

function animateResultElements() {
  const resultValues = document.querySelectorAll('.result-value');
  resultValues.forEach(el => {
    el.classList.add('animate-pulse');
    setTimeout(() => {
      el.classList.remove('animate-pulse');
    }, 500);
  });
}

function updateChart(data) {
  const canvas = document.getElementById('growth-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  
  // Generate monthly growth data
  const months = Math.ceil(data.months);
  const growthData = [];
  const labels = [];
  
  for (let i = 0; i <= months; i++) {
    const monthlyRate = Math.pow(data.total_return / data.principal, 1 / months);
    const value = data.principal * Math.pow(monthlyRate, i);
    growthData.push(value);
    labels.push(`Month ${i}`);
  }
  
  // Destroy existing chart if exists
  if (window.growthChart) {
    window.growthChart.destroy();
  }
  
  window.growthChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Investment Growth',
        data: growthData,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Value: ${formatCurrency(context.raw)}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: function(value) {
              return formatCurrency(value);
            }
          }
        }
      }
    }
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function showError(message) {
  const errorEl = document.getElementById('calculator-error');
  if (errorEl) {
    errorEl.innerText = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => {
      errorEl.classList.add('hidden');
    }, 5000);
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}