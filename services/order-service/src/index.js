/**
 * NetWeave — Order Service (Node.js/Express)
 * Networks: backend-net, db-net
 * Connects to: MongoDB (orders-db), Redis (redis-cache), User Service
 * 
 * Demonstrates:
 * - Cross-network database access (backend-net → db-net)
 * - Inter-service communication (Order Service → User Service on backend-net)
 * - Redis caching on db-net
 * - Prometheus metrics
 */

const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const axios = require('axios');
const os = require('os');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 4000;

// ============================================================
// Prometheus Metrics
// ============================================================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requestCounter = new client.Counter({
  name: 'order_service_requests_total',
  help: 'Total requests to order service',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register],
});

const requestLatency = new client.Histogram({
  name: 'order_service_request_duration_seconds',
  help: 'Request latency in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// ============================================================
// Configuration
// ============================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:netweave_secret_2024@orders-db:27017/orders_db?authSource=admin';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis_secret_2024@redis-cache:6379/1';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:5000';

// ============================================================
// Database Connections
// ============================================================

// MongoDB connection via Docker DNS on db-net
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB (orders-db) via db-net'))
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// Redis connection via Docker DNS on db-net
const redis = new Redis(REDIS_URL, {
  retryDelayOnFailover: 1000,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('connect', () => console.log('✅ Connected to Redis (redis-cache) via db-net'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

// ============================================================
// Mongoose Schema
// ============================================================
const orderSchema = new mongoose.Schema({
  product: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  userEmail: { type: String, required: true },
  userName: { type: String, default: 'Unknown' },
  status: { type: String, default: 'pending', enum: ['pending', 'confirmed', 'shipped', 'delivered'] },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model('Order', orderSchema);

// ============================================================
// Middleware
// ============================================================
app.use(express.json());

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    requestLatency.observe({ method: req.method, endpoint: route }, duration);
    requestCounter.inc({ method: req.method, endpoint: route, status: res.statusCode });
  });
  next();
});

// ============================================================
// Seed Data
// ============================================================
async function seedData() {
  const count = await Order.countDocuments();
  if (count === 0) {
    const sampleOrders = [
      { product: 'Docker Handbook', quantity: 2, price: 29.99, userEmail: 'alice@netweave.io', userName: 'Alice Johnson', status: 'confirmed' },
      { product: 'Kubernetes Guide', quantity: 1, price: 39.99, userEmail: 'bob@netweave.io', userName: 'Bob Smith', status: 'pending' },
      { product: 'DevOps Toolkit', quantity: 3, price: 19.99, userEmail: 'charlie@netweave.io', userName: 'Charlie Brown', status: 'shipped' },
    ];
    await Order.insertMany(sampleOrders);
    console.log(`✅ Seeded ${sampleOrders.length} sample orders`);
  }
}

// ============================================================
// Routes
// ============================================================

// Health Check
app.get('/health', async (req, res) => {
  let mongoStatus = 'disconnected';
  let redisStatus = 'disconnected';

  try {
    await mongoose.connection.db.admin().ping();
    mongoStatus = 'connected';
  } catch (e) {
    mongoStatus = `error: ${e.message}`;
  }

  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (e) {
    redisStatus = `error: ${e.message}`;
  }

  res.json({
    status: 'healthy',
    service: 'order-service',
    language: 'Node.js/Express',
    hostname: os.hostname(),
    networks: ['backend-net', 'db-net'],
    connections: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

// Prometheus Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Get all orders
app.get('/orders', async (req, res) => {
  try {
    // Try cache
    const cached = await redis.get('all_orders');
    if (cached) {
      return res.json({
        orders: JSON.parse(cached),
        source: 'cache (Redis on db-net)',
        network_path: 'API Gateway (backend-net) → Order Service → Redis (db-net)',
      });
    }

    const orders = await Order.find({}).lean();

    // Cache for 30 seconds
    await redis.setex('all_orders', 30, JSON.stringify(orders));

    res.json({
      orders,
      source: 'database (MongoDB on db-net)',
      network_path: 'API Gateway (backend-net) → Order Service → MongoDB (db-net)',
      cached_for: '30 seconds',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new order (with inter-service call to validate user!)
app.post('/orders', async (req, res) => {
  try {
    const { product, quantity, price, userEmail } = req.body;

    if (!product || !quantity || !price || !userEmail) {
      return res.status(400).json({ error: 'product, quantity, price, and userEmail are required' });
    }

    // 🔗 INTER-SERVICE CALL: Validate user exists via User Service (on backend-net!)
    let userName = 'Unknown';
    let userValidation = 'skipped';

    try {
      const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userEmail}`, { timeout: 3000 });
      userName = userRes.data.user?.name || 'Unknown';
      userValidation = 'validated via backend-net';
    } catch (err) {
      userValidation = `user not found (${err.message})`;
    }

    const order = new Order({
      product,
      quantity,
      price,
      userEmail,
      userName,
      status: 'pending',
    });

    await order.save();

    // Invalidate cache
    await redis.del('all_orders');

    res.status(201).json({
      order: order.toObject(),
      userValidation,
      message: 'Order created successfully',
      network_path: {
        orderCreation: 'API Gateway → Order Service (backend-net) → MongoDB (db-net)',
        userValidation: 'Order Service → User Service (backend-net) → MongoDB (db-net)',
        cacheInvalidation: 'Order Service → Redis (db-net)',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Network Info
app.get('/network-info', (req, res) => {
  const networkInterfaces = os.networkInterfaces();
  const networks = {};

  Object.keys(networkInterfaces).forEach((iface) => {
    networks[iface] = networkInterfaces[iface]
      .filter((addr) => addr.family === 'IPv4')
      .map((addr) => ({ address: addr.address, netmask: addr.netmask }));
  });

  res.json({
    service: 'order-service',
    language: 'Node.js',
    hostname: os.hostname(),
    networks,
    connectedNetworks: ['backend-net', 'db-net'],
    canReach: {
      'mongodb (orders-db)': 'Yes — via db-net',
      'redis (redis-cache)': 'Yes — via db-net',
      'user-service': 'Yes — via backend-net (inter-service calls)',
      'api-gateway': 'Yes — via backend-net',
      'nginx': 'No — not on frontend-net',
    },
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   📦 NetWeave Order Service                 ║
║   Port: ${PORT}                                ║
║   Language: Node.js / Express               ║
║   Networks: backend-net, db-net             ║
║   Database: MongoDB (orders-db via DNS)     ║
║   Cache: Redis (redis-cache via DNS)        ║
║   Inter-service: User Service (backend-net) ║
║   Metrics: /metrics (Prometheus)            ║
╚══════════════════════════════════════════════╝
  `);
  seedData();
});
