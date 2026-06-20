// XSpaceFinance Dashboard JavaScript

// Global variables
let roiChart = null;
let refreshInterval = null;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  initializeDashboard();
  initializeNotifications();
  initializeForms();
  initializeCharts();
  startAutoRefresh();
});

// Initialize dashboard components
function initializeDashboard() {
  // Update balance display with animation
  animateBalance();
  
  // Initialize tooltips
  initializeTooltips();
  
  // Initialize copy buttons
  initializeCopyButtons();
  
  // Initialize countdown timers for investments
  initializeCountdowns();
}

// Animate balance changes
function animateBalance() {
  const balanceElements = document.querySelectorAll('.balance-value');
  balanceElements.forEach(el => {
    const target = parseFloat(el.dataset.target);
    const current = parseFloat(el.innerText.replace(/[^0-9.-]/g, ''));
    if (!isNaN(target) && !isNaN(current) && current !== target) {
      animateNumber(el, current, target, 1000);
    }
  });
}

// Number animation helper
function animateNumber(element, start, end, duration) {
  const range = end - start;
  const startTime = performance.now();
  const isCurrency = element.classList.contains('currency');
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const value = start + (range * progress);
    
    if (isCurrency) {
      element.innerText = formatCurrency(value);
    } else {
      element.innerText = Math.round(value).toLocaleString();
    }
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      if (isCurrency) {
        element.innerText = formatCurrency(end);
      } else {
        element.innerText = Math.round(end).toLocaleString();
      }
    }
  }
  
  requestAnimationFrame(update);
}

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Format date
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format time
function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Initialize tooltips
function initializeTooltips() {
  const tooltips = document.querySelectorAll('[data-tooltip]');
  tooltips.forEach(el => {
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);
  });
}

function showTooltip(e) {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerText = e.target.dataset.tooltip;
  tooltip.style.position = 'absolute';
  tooltip.style.background = '#1e293b';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '4px 8px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.fontSize = '12px';
  tooltip.style.zIndex = '1000';
  tooltip.style.pointerEvents = 'none';
  
  const rect = e.target.getBoundingClientRect();
  tooltip.style.top = `${rect.top - 30 + window.scrollY}px`;
  tooltip.style.left = `${rect.left + (rect.width / 2) - 20}px`;
  
  document.body.appendChild(tooltip);
  e.target._tooltip = tooltip;
}

function hideTooltip(e) {
  if (e.target._tooltip) {
    e.target._tooltip.remove();
    delete e.target._tooltip;
  }
}

// Initialize copy buttons
function initializeCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async function() {
      const textToCopy = this.dataset.copy || this.previousElementSibling?.innerText;
      if (textToCopy) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          showToast('Copied to clipboard!', 'success');
          
          // Change button text temporarily
          const originalText = this.innerHTML;
          this.innerHTML = '✓ Copied!';
          setTimeout(() => {
            this.innerHTML = originalText;
          }, 2000);
        } catch (err) {
          showToast('Failed to copy', 'error');
        }
      }
    });
  });
}

// Initialize countdown timers
function initializeCountdowns() {
  const countdowns = document.querySelectorAll('.countdown');
  countdowns.forEach(el => {
    const endDate = new Date(el.dataset.end).getTime();
    updateCountdown(el, endDate);
    setInterval(() => updateCountdown(el, endDate), 1000);
  });
}

function updateCountdown(element, endDate) {
  const now = new Date().getTime();
  const distance = endDate - now;
  
  if (distance < 0) {
    element.innerHTML = 'Matured';
    return;
  }
  
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);
  
  element.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Initialize notifications
function initializeNotifications() {
  const notificationBell = document.querySelector('.notification-bell');
  if (notificationBell) {
    notificationBell.addEventListener('click', toggleNotifications);
  }
  
  // Mark notification as read
  const markReadBtns = document.querySelectorAll('.mark-read');
  markReadBtns.forEach(btn => {
    btn.addEventListener('click', async function() {
      const notificationId = this.dataset.id;
      await markNotificationRead(notificationId);
    });
  });
}

async function toggleNotifications() {
  const panel = document.querySelector('.notifications-panel');
  if (panel) {
    panel.classList.toggle('hidden');
  }
}

async function markNotificationRead(notificationId) {
  try {
    const response = await fetch(`/dashboard/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
      }
    });
    
    if (response.ok) {
      const notification = document.querySelector(`.notification-${notificationId}`);
      if (notification) {
        notification.classList.add('opacity-50');
      }
      updateUnreadCount();
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

async function updateUnreadCount() {
  try {
    const response = await fetch('/api/user/notifications/unread');
    const data = await response.json();
    const badge = document.querySelector('.notification-badge');
    if (badge) {
      const count = data.count || 0;
      badge.innerText = count;
      badge.classList.toggle('hidden', count === 0);
    }
  } catch (error) {
    console.error('Error updating unread count:', error);
  }
}

// Initialize forms
function initializeForms() {
  // Add form validation
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', validateForm);
  });
  
  // Add confirm dialog for dangerous actions
  const confirmBtns = document.querySelectorAll('[data-confirm]');
  confirmBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const message = btn.dataset.confirm || 'Are you sure?';
      if (!confirm(message)) {
        e.preventDefault();
      }
    });
  });
}

function validateForm(e) {
  const form = e.target;
  const requiredFields = form.querySelectorAll('[required]');
  let isValid = true;
  
  requiredFields.forEach(field => {
    if (!field.value.trim()) {
      isValid = false;
      showFieldError(field, 'This field is required');
    } else {
      clearFieldError(field);
    }
  });
  
  // Validate amount fields
  const amountFields = form.querySelectorAll('input[type="number"][data-min], input[type="number"][data-max]');
  amountFields.forEach(field => {
    const value = parseFloat(field.value);
    const min = parseFloat(field.dataset.min);
    const max = parseFloat(field.dataset.max);
    
    if (!isNaN(min) && value < min) {
      isValid = false;
      showFieldError(field, `Minimum is ${formatCurrency(min)}`);
    } else if (!isNaN(max) && value > max) {
      isValid = false;
      showFieldError(field, `Maximum is ${formatCurrency(max)}`);
    } else {
      clearFieldError(field);
    }
  });
  
  if (!isValid) {
    e.preventDefault();
  }
}

function showFieldError(field, message) {
  field.classList.add('border-red-500');
  let errorDiv = field.parentElement.querySelector('.field-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'field-error text-red-500 text-xs mt-1';
    field.parentElement.appendChild(errorDiv);
  }
  errorDiv.innerText = message;
}

function clearFieldError(field) {
  field.classList.remove('border-red-500');
  const errorDiv = field.parentElement.querySelector('.field-error');
  if (errorDiv) {
    errorDiv.remove();
  }
}

// Initialize charts
function initializeCharts() {
  const roiCanvas = document.getElementById('roi-chart');
  if (roiCanvas && typeof Chart !== 'undefined') {
    loadRoiChart();
  }
}

async function loadRoiChart() {
  try {
    const response = await fetch('/api/user/performance');
    const data = await response.json();
    
    if (data.success && data.data.roi_history) {
      const ctx = document.getElementById('roi-chart').getContext('2d');
      const labels = data.data.roi_history.map(h => h.date);
      const values = data.data.roi_history.map(h => h.total);
      
      roiChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily ROI',
            data: values,
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
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `ROI: ${formatCurrency(context.raw)}`;
                }
              }
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('Error loading ROI chart:', error);
  }
}

// Start auto-refresh for live data
function startAutoRefresh() {
  refreshInterval = setInterval(async () => {
    await refreshLiveData();
  }, 30000); // Refresh every 30 seconds
}

async function refreshLiveData() {
  try {
    const response = await fetch('/api/user/dashboard');
    const data = await response.json();
    
    if (data.success) {
      // Update balance
      const balanceElement = document.querySelector('.current-balance');
      if (balanceElement && data.data.balance !== undefined) {
        const currentBalance = parseFloat(balanceElement.innerText.replace(/[^0-9.-]/g, ''));
        if (currentBalance !== data.data.balance) {
          animateNumber(balanceElement, currentBalance, data.data.balance, 500);
        }
      }
      
      // Update active investments count
      const activeCountElement = document.querySelector('.active-investments-count');
      if (activeCountElement && data.data.active_investments) {
        activeCountElement.innerText = data.data.active_investments.length;
      }
    }
  } catch (error) {
    console.error('Error refreshing live data:', error);
  }
}

// Show toast notification
function showToast(message, type = 'info') {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    const container = document.createElement('div');
    container.className = 'toast-container fixed bottom-4 right-4 z-50 space-y-2';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  
  const container = document.querySelector('.toast-container');
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('animate-slide-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Stop auto-refresh (call on page unload)
window.addEventListener('beforeunload', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

// Export for use in other scripts
window.XSpaceFinance = {
  formatCurrency,
  formatDate,
  showToast,
  animateNumber
};