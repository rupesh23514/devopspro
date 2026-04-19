const express = require('express');
const axios = require('axios');
const cors = require('cors');
const os = require('os');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Middleware
app.use(cors());
app.use(express.json());

// Metrics middleware — track every request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
  });
  next();
});

// Service URLs (resolved via Docker DNS!)
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:5000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:4000';

// ============================================================
// Health Check
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================================
// Prometheus Metrics Endpoint
// ============================================================
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ============================================================
// Network Info — Shows Docker networking in action
// ============================================================
app.get('/api/network-info', (req, res) => {
  const networkInterfaces = os.networkInterfaces();
  const networks = {};

  Object.keys(networkInterfaces).forEach((iface) => {
    networks[iface] = networkInterfaces[iface]
      .filter((addr) => addr.family === 'IPv4')
      .map((addr) => ({
        address: addr.address,
        netmask: addr.netmask,
      }));
  });

  res.json({
    service: 'api-gateway',
    hostname: os.hostname(),
    networks,
    connectedTo: ['frontend-net', 'backend-net'],
    upstreamServices: {
      userService: USER_SERVICE_URL,
      orderService: ORDER_SERVICE_URL,
    },
    note: 'This service bridges frontend-net and backend-net. It can reach both Nginx and microservices.',
  });
});

// ============================================================
// API Health — Aggregated health from all services
// ============================================================
app.get('/api/health', async (req, res) => {
  const services = {};

  // Check User Service
  try {
    const userRes = await axios.get(`${USER_SERVICE_URL}/health`, { timeout: 3000 });
    services.userService = { status: 'healthy', data: userRes.data };
  } catch (err) {
    services.userService = { status: 'unhealthy', error: err.message };
  }

  // Check Order Service
  try {
    const orderRes = await axios.get(`${ORDER_SERVICE_URL}/health`, { timeout: 3000 });
    services.orderService = { status: 'healthy', data: orderRes.data };
  } catch (err) {
    services.orderService = { status: 'unhealthy', error: err.message };
  }

  const allHealthy = Object.values(services).every((s) => s.status === 'healthy');

  res.status(allHealthy ? 200 : 207).json({
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    downstream: services,
  });
});

// ============================================================
// User Routes — Proxy to User Service
// ============================================================
app.get('/api/users', async (req, res) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users`, { timeout: 5000 });
    res.json(response.data);
  } catch (err) {
    res.status(502).json({
      error: 'User Service unavailable',
      message: err.message,
      network: 'Request travels: Nginx (frontend-net) → API Gateway → User Service (backend-net)',
    });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const response = await axios.post(`${USER_SERVICE_URL}/users`, req.body, { timeout: 5000 });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(502).json({ error: 'User Service unavailable', message: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users/${req.params.id}`, { timeout: 5000 });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 502).json({
      error: err.response?.data?.error || 'User Service unavailable',
    });
  }
});

// ============================================================
// Order Routes — Proxy to Order Service
// ============================================================
app.get('/api/orders', async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders`, { timeout: 5000 });
    res.json(response.data);
  } catch (err) {
    res.status(502).json({
      error: 'Order Service unavailable',
      message: err.message,
      network: 'Request travels: Nginx (frontend-net) → API Gateway → Order Service (backend-net)',
    });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const response = await axios.post(`${ORDER_SERVICE_URL}/orders`, req.body, { timeout: 5000 });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(502).json({ error: 'Order Service unavailable', message: err.message });
  }
});

// ============================================================
// Network Topology Map — for connectivity testing
// ============================================================
const NETWORK_TOPOLOGY = {
  'nginx':         { networks: ['frontend-net'], icon: '🌐', tech: 'Nginx' },
  'api-gateway':   { networks: ['frontend-net', 'backend-net', 'monitor-net'], icon: '🔀', tech: 'Node.js' },
  'user-service':  { networks: ['backend-net', 'db-net', 'monitor-net'], icon: '👤', tech: 'Python/Flask' },
  'order-service': { networks: ['backend-net', 'db-net', 'monitor-net'], icon: '📦', tech: 'Node.js' },
  'users-db':      { networks: ['db-net'], icon: '🗄️', tech: 'MongoDB 7' },
  'orders-db':     { networks: ['db-net'], icon: '🗄️', tech: 'MongoDB 7' },
  'redis-cache':   { networks: ['db-net'], icon: '⚡', tech: 'Redis 7' },
  'prometheus':    { networks: ['monitor-net', 'backend-net'], icon: '📈', tech: 'Prometheus' },
  'grafana':       { networks: ['monitor-net'], icon: '📊', tech: 'Grafana' },
  'cadvisor':      { networks: ['monitor-net'], icon: '📉', tech: 'cAdvisor' },
  'dashboard':     { networks: ['monitor-net'], icon: '🗺️', tech: 'Nginx' },
};

const NETWORK_INFO = {
  'frontend-net': { subnet: '172.20.0.0/16', internal: false, color: '#3b82f6', description: 'Public-facing traffic' },
  'backend-net':  { subnet: '172.21.0.0/16', internal: false, color: '#22c55e', description: 'Microservice communication' },
  'db-net':       { subnet: '172.22.0.0/16', internal: true,  color: '#f97316', description: 'Database isolation (NO internet)' },
  'monitor-net':  { subnet: '172.23.0.0/16', internal: false, color: '#a855f7', description: 'Monitoring tools' },
};

// Real endpoints the API Gateway can test
const TESTABLE_ENDPOINTS = {
  'user-service':  `${USER_SERVICE_URL}/health`,
  'order-service': `${ORDER_SERVICE_URL}/health`,
};

// Test connectivity between two containers
app.get('/api/test-connectivity', async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.json({
      topology: NETWORK_TOPOLOGY,
      networkInfo: NETWORK_INFO,
      message: 'Pass ?from=<container>&to=<container> to test, or use /api/test-all for all tests',
    });
  }

  const fromInfo = NETWORK_TOPOLOGY[from];
  const toInfo = NETWORK_TOPOLOGY[to];

  if (!fromInfo || !toInfo) {
    return res.status(400).json({ error: `Unknown container. Valid: ${Object.keys(NETWORK_TOPOLOGY).join(', ')}` });
  }

  // Find shared networks
  const sharedNetworks = fromInfo.networks.filter(n => toInfo.networks.includes(n));
  const connected = sharedNetworks.length > 0;

  // Build result
  const result = {
    from: { name: from, ...fromInfo },
    to: { name: to, ...toInfo },
    connected,
    sharedNetworks,
    fromNetworks: fromInfo.networks,
    toNetworks: toInfo.networks,
  };

  if (connected) {
    result.status = 'CONNECTED';
    result.reason = `Both "${from}" and "${to}" are on ${sharedNetworks.map(n => `"${n}"`).join(' and ')}. Docker DNS resolves the name automatically.`;
    result.networkPath = `${from} → ${to} (via ${sharedNetworks[0]})`;

    // Try real HTTP test if possible (from API Gateway's perspective)
    if (from === 'api-gateway' && TESTABLE_ENDPOINTS[to]) {
      try {
        const start = Date.now();
        const testRes = await axios.get(TESTABLE_ENDPOINTS[to], { timeout: 3000 });
        result.liveTest = {
          success: true,
          responseTime: `${Date.now() - start}ms`,
          serviceStatus: testRes.data.status || 'ok',
          connections: testRes.data.connections || {},
        };
      } catch (err) {
        result.liveTest = { success: false, error: err.message };
      }
    }
  } else {
    result.status = 'BLOCKED';
    result.reason = `"${from}" is on [${fromInfo.networks.join(', ')}] and "${to}" is on [${toInfo.networks.join(', ')}]. They share NO common network, so "${from}" cannot even see "${to}" exists.`;

    // Check if db-net internal flag is relevant
    if (toInfo.networks.includes('db-net') && !fromInfo.networks.includes('db-net')) {
      result.securityNote = `Additionally, db-net is marked as "internal: true" — containers on it have NO internet access. This is defense-in-depth security.`;
    }
  }

  res.json(result);
});

// Run ALL connectivity tests at once
app.get('/api/test-all', async (req, res) => {
  const testPairs = [
    // Connectivity tests (should PASS)
    { from: 'nginx', to: 'api-gateway', expectConnected: true },
    { from: 'api-gateway', to: 'user-service', expectConnected: true },
    { from: 'api-gateway', to: 'order-service', expectConnected: true },
    { from: 'user-service', to: 'order-service', expectConnected: true },
    { from: 'user-service', to: 'users-db', expectConnected: true },
    { from: 'order-service', to: 'orders-db', expectConnected: true },
    { from: 'user-service', to: 'redis-cache', expectConnected: true },
    { from: 'order-service', to: 'redis-cache', expectConnected: true },
    { from: 'prometheus', to: 'grafana', expectConnected: true },
    // Isolation tests (should FAIL = security works)
    { from: 'nginx', to: 'users-db', expectConnected: false },
    { from: 'nginx', to: 'redis-cache', expectConnected: false },
    { from: 'nginx', to: 'user-service', expectConnected: false },
    { from: 'nginx', to: 'order-service', expectConnected: false },
    { from: 'grafana', to: 'users-db', expectConnected: false },
    { from: 'grafana', to: 'user-service', expectConnected: true },
    { from: 'api-gateway', to: 'users-db', expectConnected: false },
    { from: 'api-gateway', to: 'redis-cache', expectConnected: false },
  ];

  const results = [];
  for (const pair of testPairs) {
    const fromInfo = NETWORK_TOPOLOGY[pair.from];
    const toInfo = NETWORK_TOPOLOGY[pair.to];
    const sharedNetworks = fromInfo.networks.filter(n => toInfo.networks.includes(n));
    const connected = sharedNetworks.length > 0;
    const passed = connected === pair.expectConnected;

    results.push({
      from: pair.from,
      to: pair.to,
      connected,
      sharedNetworks,
      expectConnected: pair.expectConnected,
      testType: pair.expectConnected ? 'connectivity' : 'isolation',
      passed,
      status: connected ? 'CONNECTED' : 'BLOCKED',
      reason: connected
        ? `Shared network: ${sharedNetworks.join(', ')}`
        : `No shared network (${fromInfo.networks.join(',')} vs ${toInfo.networks.join(',')})`,
    });
  }

  // Also run live tests on services this gateway can reach
  for (const [service, url] of Object.entries(TESTABLE_ENDPOINTS)) {
    try {
      const start = Date.now();
      await axios.get(url, { timeout: 3000 });
      results.find(r => r.to === service && r.from === 'api-gateway').liveVerified = {
        success: true,
        responseTime: `${Date.now() - start}ms`,
      };
    } catch (err) {
      const match = results.find(r => r.to === service && r.from === 'api-gateway');
      if (match) match.liveVerified = { success: false, error: err.message };
    }
  }

  const totalPassed = results.filter(r => r.passed).length;

  res.json({
    summary: {
      total: results.length,
      passed: totalPassed,
      failed: results.length - totalPassed,
      allPassed: totalPassed === results.length,
    },
    results,
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🔀 NetWeave API Gateway                   ║
║   Port: ${PORT}                                ║
║   Networks: frontend-net, backend-net        ║
║   Upstream: user-service, order-service      ║
║   Metrics: /metrics (Prometheus)             ║
╚══════════════════════════════════════════════╝
  `);
});
