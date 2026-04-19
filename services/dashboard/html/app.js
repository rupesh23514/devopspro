/**
 * NetWeave — Network Connection Tester
 * Interactive UI for testing Docker network connectivity
 */

// API base URL (through Nginx reverse proxy on port 80)
const API_BASE = 'http://localhost';

// Track node selection state
let selectedFrom = null;
let selectedTo = null;
let allTestResults = [];

// Network tag helper
function netTag(network) {
  const cls = {
    'frontend-net': 'net-frontend',
    'backend-net': 'net-backend',
    'db-net': 'net-db',
    'monitor-net': 'net-monitor',
  }[network] || '';
  return `<span class="network-tag ${cls}">${network}</span>`;
}

// ============================================================
// Node Selection (click topology nodes)
// ============================================================
function selectNode(element, serviceName) {
  const fromSelect = document.getElementById('from-container');
  const toSelect = document.getElementById('to-container');

  if (!selectedFrom || (selectedFrom && selectedTo)) {
    // Select as FROM (or start fresh)
    document.querySelectorAll('.clickable-node').forEach(n => n.classList.remove('selected'));
    selectedFrom = serviceName;
    selectedTo = null;
    element.classList.add('selected');
    fromSelect.value = serviceName;
    toSelect.value = '';
  } else {
    // Select as TO
    selectedTo = serviceName;
    element.classList.add('selected');
    toSelect.value = serviceName;
  }
}

// ============================================================
// Single Connection Test
// ============================================================
async function testConnection() {
  const from = document.getElementById('from-container').value;
  const to = document.getElementById('to-container').value;

  if (!from || !to) {
    showQuickMessage('Please select both FROM and TO containers');
    return;
  }

  if (from === to) {
    showQuickMessage('Select two DIFFERENT containers');
    return;
  }

  const btn = document.getElementById('btn-test');
  btn.classList.add('loading');

  try {
    const res = await fetch(`${API_BASE}/api/test-connectivity?from=${from}&to=${to}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    displayResult(data);
  } catch (err) {
    showQuickMessage('Test failed: ' + err.message);
  } finally {
    btn.classList.remove('loading');
  }
}

function displayResult(data) {
  const panel = document.getElementById('result-panel');
  const allPanel = document.getElementById('all-tests-panel');
  allPanel.style.display = 'none';

  // Update arrow
  const arrow = document.getElementById('connection-arrow');
  arrow.className = 'arrow-icon ' + (data.connected ? 'connected' : 'blocked');

  // Show panel
  panel.style.display = 'block';
  panel.className = 'result-panel ' + (data.connected ? 'connected' : 'blocked');

  // Header
  document.getElementById('result-icon').textContent = data.connected ? '✅' : '❌';
  document.getElementById('result-title').textContent = data.connected
    ? `CONNECTED — ${data.from.name} can reach ${data.to.name}`
    : `BLOCKED — ${data.from.name} cannot reach ${data.to.name}`;

  // Visual
  const visual = document.getElementById('result-visual');
  visual.innerHTML = `
    <div class="visual-container">
      <div class="visual-container-icon">${data.from.icon}</div>
      <div class="visual-container-name">${data.from.name}</div>
      <div class="visual-container-nets">${data.fromNetworks.map(n => netTag(n)).join(' ')}</div>
    </div>
    <div class="visual-arrow ${data.connected ? 'connected' : 'blocked'}">
      ${data.connected ? '━━━ ✅ ━━━▶' : '━━━ ❌ ━━━✕'}
    </div>
    <div class="visual-container">
      <div class="visual-container-icon">${data.to.icon}</div>
      <div class="visual-container-name">${data.to.name}</div>
      <div class="visual-container-nets">${data.toNetworks.map(n => netTag(n)).join(' ')}</div>
    </div>
  `;

  // Details
  const details = document.getElementById('result-details');
  if (data.connected) {
    details.innerHTML = `
      <div class="result-detail-row"><span class="result-detail-label">Status:</span> <span style="color:var(--accent-green);font-weight:700">CONNECTED</span></div>
      <div class="result-detail-row"><span class="result-detail-label">Shared Network:</span> ${data.sharedNetworks.map(n => netTag(n)).join(' ')}</div>
      <div class="result-detail-row"><span class="result-detail-label">Network Path:</span> ${data.networkPath || '—'}</div>
      <div class="result-detail-row"><span class="result-detail-label">How:</span> Docker DNS resolves "${data.to.name}" to its IP automatically</div>
      <div class="result-detail-row"><span class="result-detail-label">Explanation:</span> ${data.reason}</div>
    `;
  } else {
    details.innerHTML = `
      <div class="result-detail-row"><span class="result-detail-label">Status:</span> <span style="color:var(--accent-red);font-weight:700">BLOCKED</span></div>
      <div class="result-detail-row"><span class="result-detail-label">${data.from.name} networks:</span> ${data.fromNetworks.map(n => netTag(n)).join(' ')}</div>
      <div class="result-detail-row"><span class="result-detail-label">${data.to.name} networks:</span> ${data.toNetworks.map(n => netTag(n)).join(' ')}</div>
      <div class="result-detail-row"><span class="result-detail-label">Shared Networks:</span> <span style="color:var(--accent-red)">NONE</span></div>
      <div class="result-detail-row"><span class="result-detail-label">Reason:</span> ${data.reason}</div>
    `;
  }

  // Security note
  const secEl = document.getElementById('result-security');
  if (data.securityNote) {
    secEl.style.display = 'block';
    secEl.innerHTML = `🔒 <strong>Security:</strong> ${data.securityNote}`;
  } else {
    secEl.style.display = 'none';
  }

  // Live test
  const liveEl = document.getElementById('result-live');
  if (data.liveTest) {
    liveEl.style.display = 'block';
    if (data.liveTest.success) {
      liveEl.innerHTML = `
        ⚡ <strong>Live Test Verified!</strong> Response Time: <strong>${data.liveTest.responseTime}</strong>
        | Service Status: <strong>${data.liveTest.serviceStatus}</strong>
        ${data.liveTest.connections.mongodb ? `| MongoDB: <strong>${data.liveTest.connections.mongodb}</strong>` : ''}
        ${data.liveTest.connections.redis ? `| Redis: <strong>${data.liveTest.connections.redis}</strong>` : ''}
      `;
    } else {
      liveEl.innerHTML = `⚠️ <strong>Live Test Failed:</strong> ${data.liveTest.error}`;
    }
  } else {
    liveEl.style.display = 'none';
  }

  // Scroll to result
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================
// Run ALL Tests
// ============================================================
async function runAllTests() {
  const btn = document.getElementById('btn-test-all');
  btn.classList.add('loading');

  const resultPanel = document.getElementById('result-panel');
  resultPanel.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/test-all`, {
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    allTestResults = data.results;
    displayAllTests(data);
  } catch (err) {
    showQuickMessage('Test suite failed: ' + err.message);
  } finally {
    btn.classList.remove('loading');
  }
}

function displayAllTests(data) {
  const panel = document.getElementById('all-tests-panel');
  panel.style.display = 'block';

  // Update stats bar
  const testsEl = document.getElementById('tests-passed');
  if (testsEl) {
    testsEl.textContent = `${data.summary.passed}/${data.summary.total}`;
    testsEl.style.color = data.summary.allPassed ? 'var(--accent-green)' : 'var(--accent-orange)';
  }

  // Summary
  const summaryEl = document.getElementById('all-tests-summary');
  summaryEl.innerHTML = `
    <div class="summary-stat">
      <div class="summary-stat-value blue">${data.summary.total}</div>
      <div class="summary-stat-label">Total Tests</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value green">${data.summary.passed}</div>
      <div class="summary-stat-label">Passed</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value red">${data.summary.failed}</div>
      <div class="summary-stat-label">Failed</div>
    </div>
    <div class="summary-badge ${data.summary.allPassed ? 'pass' : 'fail'}">
      ${data.summary.allPassed ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}
    </div>
  `;

  // Render test list
  renderTestList(data.results);

  // Reset tabs
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab-btn').classList.add('active');

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTestList(results) {
  const listEl = document.getElementById('all-tests-list');
  listEl.innerHTML = '';

  results.forEach((test, i) => {
    const row = document.createElement('div');
    row.className = `test-row ${test.testType}`;
    row.style.animationDelay = `${i * 0.05}s`;

    const statusEmoji = test.passed
      ? (test.testType === 'connectivity' ? '✅' : '🔒')
      : '❌';

    const liveHtml = test.liveVerified
      ? `<span class="test-live-badge">⚡ LIVE ${test.liveVerified.responseTime || ''}</span>`
      : '';

    row.innerHTML = `
      <div class="test-status">${statusEmoji}</div>
      <div class="test-info">
        <div class="test-pair">
          ${test.from} <span class="test-pair-arrow">→</span> ${test.to}
          ${liveHtml}
        </div>
        <div class="test-reason">${test.reason}</div>
      </div>
      <div class="test-badge ${test.connected ? 'connected' : 'blocked'}">
        ${test.status}
      </div>
    `;

    // Click to show detail
    row.addEventListener('click', () => {
      document.getElementById('from-container').value = test.from;
      document.getElementById('to-container').value = test.to;
      testConnection();
    });
    row.style.cursor = 'pointer';

    listEl.appendChild(row);
  });
}

function filterTests(type) {
  // Update active tab
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  const filtered = type === 'all'
    ? allTestResults
    : allTestResults.filter(t => t.testType === type);

  renderTestList(filtered);
}

// ============================================================
// Quick Message Toast
// ============================================================
function showQuickMessage(msg) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = `
      position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
      padding: 0.8rem 1.5rem; background: rgba(239, 68, 68, 0.95);
      color: white; border-radius: 12px; font-weight: 600; font-size: 0.9rem;
      z-index: 999; box-shadow: 0 8px 30px rgba(0,0,0,0.4);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// Network path HTML helper
function networkPath(steps) {
  const classes = { 'Nginx': 'path-nginx', 'API Gateway': 'path-gateway', 'User Service': 'path-service', 'Order Service': 'path-service', 'MongoDB': 'path-db', 'Redis': 'path-db' };
  return `<div class="result-path">${steps.map((s, i) =>
    `<span class="path-step ${classes[s] || 'path-service'}">${s}</span>${i < steps.length - 1 ? '<span class="path-arrow">→</span>' : ''}`
  ).join('')}</div>`;
}

// ============================================================
// Create User
// ============================================================
async function createUser() {
  const name = document.getElementById('user-name').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const role = document.getElementById('user-role').value;

  if (!name || !email) {
    showQuickMessage('Please enter name and email');
    return;
  }

  const btn = document.getElementById('btn-create-user');
  btn.classList.add('loading');
  const resultEl = document.getElementById('create-user-result');

  try {
    const res = await fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();

    resultEl.style.display = 'block';
    if (res.ok) {
      resultEl.className = 'data-card-result success';
      resultEl.innerHTML = `
        <div style="margin-bottom:0.5rem;color:var(--accent-green);font-weight:700">✅ User Created Successfully!</div>
        ${networkPath(['Nginx', 'API Gateway', 'User Service', 'MongoDB'])}
        <div class="result-data">${JSON.stringify(data, null, 2)}</div>
      `;
      // Clear form
      document.getElementById('user-name').value = '';
      document.getElementById('user-email').value = '';
    } else {
      resultEl.className = 'data-card-result error';
      resultEl.innerHTML = `
        <div style="color:var(--accent-red);font-weight:700">❌ Error: ${data.error || 'Failed to create user'}</div>
        <div class="result-data">${JSON.stringify(data, null, 2)}</div>
      `;
    }
  } catch (err) {
    resultEl.style.display = 'block';
    resultEl.className = 'data-card-result error';
    resultEl.innerHTML = `<div style="color:var(--accent-red);font-weight:700">❌ Request Failed: ${err.message}</div>`;
  } finally {
    btn.classList.remove('loading');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ============================================================
// Create Order
// ============================================================
async function createOrder() {
  const product = document.getElementById('order-product').value.trim();
  const quantity = parseInt(document.getElementById('order-qty').value) || 1;
  const price = parseFloat(document.getElementById('order-price').value) || 0;
  const userEmail = document.getElementById('order-email').value.trim();

  if (!product || !userEmail) {
    showQuickMessage('Please enter product name and user email');
    return;
  }

  const btn = document.getElementById('btn-create-order');
  btn.classList.add('loading');
  const resultEl = document.getElementById('create-order-result');

  try {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, quantity, price, userEmail }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    resultEl.style.display = 'block';
    if (res.ok) {
      resultEl.className = 'data-card-result success';
      const validation = data.userValidation || 'validated';
      resultEl.innerHTML = `
        <div style="margin-bottom:0.5rem;color:var(--accent-green);font-weight:700">✅ Order Created Successfully!</div>
        <div style="margin-bottom:0.5rem;font-size:0.78rem;color:var(--accent-cyan)">🔗 User "${data.order?.userName || userEmail}" ${validation}</div>
        ${networkPath(['Nginx', 'API Gateway', 'Order Service', 'User Service', 'MongoDB'])}
        <div class="result-data">${JSON.stringify(data, null, 2)}</div>
      `;
      document.getElementById('order-product').value = '';
      document.getElementById('order-email').value = '';
    } else {
      resultEl.className = 'data-card-result error';
      resultEl.innerHTML = `
        <div style="color:var(--accent-red);font-weight:700">❌ Error: ${data.error || 'Failed to create order'}</div>
        <div class="result-data">${JSON.stringify(data, null, 2)}</div>
      `;
    }
  } catch (err) {
    resultEl.style.display = 'block';
    resultEl.className = 'data-card-result error';
    resultEl.innerHTML = `<div style="color:var(--accent-red);font-weight:700">❌ Request Failed: ${err.message}</div>`;
  } finally {
    btn.classList.remove('loading');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ============================================================
// View Users
// ============================================================
async function viewUsers() {
  const resultEl = document.getElementById('view-data-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;">Loading users...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/users`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const users = data.users || [];
    const source = data.source || 'unknown';
    const isCached = source.includes('cache') || source.includes('Redis');

    let html = `
      <div style="margin-bottom:0.8rem;display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;">
        <strong>👤 ${users.length} Users Found</strong>
        <span class="source-badge ${isCached ? 'source-cache' : 'source-db'}">${isCached ? '⚡ From Redis Cache' : '🗄️ From MongoDB'}</span>
        ${data.network_path ? `<span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${data.network_path}</span>` : ''}
      </div>
      ${networkPath(['Nginx', 'API Gateway', 'User Service', isCached ? 'Redis' : 'MongoDB'])}
    `;

    if (users.length > 0) {
      html += `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>`;
      users.forEach(u => {
        html += `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role || '—'}</td></tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="text-align:center;color:var(--text-muted);padding:1rem;">No users yet. Create one above!</div>';
    }

    resultEl.innerHTML = html;
  } catch (err) {
    resultEl.innerHTML = `<div style="color:var(--accent-red)">❌ Failed to load users: ${err.message}</div>`;
  }
}

// ============================================================
// View Orders
// ============================================================
async function viewOrders() {
  const resultEl = document.getElementById('view-data-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;">Loading orders...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/orders`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const orders = data.orders || [];
    const source = data.source || 'unknown';

    let html = `
      <div style="margin-bottom:0.8rem;display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;">
        <strong>📦 ${orders.length} Orders Found</strong>
        <span class="source-badge source-db">🗄️ ${source}</span>
        ${data.network_path ? `<span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${data.network_path}</span>` : ''}
      </div>
      ${networkPath(['Nginx', 'API Gateway', 'Order Service', 'MongoDB'])}
    `;

    if (orders.length > 0) {
      html += `<table class="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>User</th><th>Status</th></tr></thead><tbody>`;
      orders.forEach(o => {
        html += `<tr><td>${o.product}</td><td>${o.quantity}</td><td>$${o.price}</td><td>${o.userName || o.userEmail}</td><td>${o.status || '—'}</td></tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="text-align:center;color:var(--text-muted);padding:1rem;">No orders yet. Create one above!</div>';
    }

    resultEl.innerHTML = html;
  } catch (err) {
    resultEl.innerHTML = `<div style="color:var(--accent-red)">❌ Failed to load orders: ${err.message}</div>`;
  }
}

// ============================================================
// Health Checks (existing functionality)
// ============================================================
async function checkServicesHealth() {
  let healthyCount = 0;

  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    setNodeStatus('nginx', true); healthyCount++;
    setNodeStatus('api-gateway', true); healthyCount++;

    if (data.downstream) {
      if (data.downstream.userService?.status === 'healthy') {
        setNodeStatus('user-service', true); healthyCount++;
      } else { setNodeStatus('user-service', false); }

      if (data.downstream.orderService?.status === 'healthy') {
        setNodeStatus('order-service', true); healthyCount++;
      } else { setNodeStatus('order-service', false); }
    }

    setNodeStatus('users-db', true); healthyCount++;
    setNodeStatus('orders-db', true); healthyCount++;
    setNodeStatus('redis', true); healthyCount++;
  } catch (err) {
    console.warn('Health check failed:', err.message);
    ['nginx', 'api-gateway', 'user-service', 'order-service'].forEach(id => setNodeStatus(id, false));
  }

  // Monitoring services
  try {
    const res = await fetch('http://localhost:9090/-/healthy', { signal: AbortSignal.timeout(3000) });
    if (res.ok) { setNodeStatus('prometheus', true); healthyCount++; } else { setNodeStatus('prometheus', false); }
  } catch { setNodeStatus('prometheus', false); }

  try {
    const res = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) { setNodeStatus('grafana', true); healthyCount++; } else { setNodeStatus('grafana', false); }
  } catch { setNodeStatus('grafana', false); }

  try {
    const res = await fetch('http://localhost:8081/containers/', { signal: AbortSignal.timeout(3000) });
    if (res.ok) { setNodeStatus('cadvisor', true); healthyCount++; } else { setNodeStatus('cadvisor', false); }
  } catch { setNodeStatus('cadvisor', false); }

  const healthyEl = document.getElementById('healthy-count');
  if (healthyEl) healthyEl.textContent = healthyCount;
}

function setNodeStatus(serviceId, isHealthy) {
  const statusEl = document.getElementById(`status-${serviceId}`);
  if (!statusEl) return;
  statusEl.classList.remove('healthy', 'unhealthy');
  if (isHealthy === true) statusEl.classList.add('healthy');
  else if (isHealthy === false) statusEl.classList.add('unhealthy');
}

// ============================================================
// Timestamp
// ============================================================
function updateTimestamp() {
  const el = document.getElementById('timestamp');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
}

// ============================================================
// Keyboard Shortcut
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    testConnection();
  }
  if (e.key === 'a' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    runAllTests();
  }
});

// ============================================================
// Initialize
// ============================================================
function init() {
  updateTimestamp();
  setInterval(updateTimestamp, 1000);
  setTimeout(checkServicesHealth, 1000);
  setInterval(checkServicesHealth, 15000);

  console.log(`
╔══════════════════════════════════════════════╗
║   🧪 NetWeave Network Connection Tester     ║
║   Status: Active                             ║
║   Ctrl+Enter: Test Connection                ║
║   Ctrl+Shift+A: Run All Tests                ║
╚══════════════════════════════════════════════╝
  `);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
