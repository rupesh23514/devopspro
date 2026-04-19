"""
NetWeave — User Service (Python/Flask)
Networks: backend-net, db-net
Connects to: MongoDB (users-db) via Docker DNS on db-net
"""

import os
import socket
import datetime
from flask import Flask, jsonify, request
from pymongo import MongoClient
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import redis

app = Flask(__name__)

# ============================================================
# Configuration (env vars set by Docker Compose)
# ============================================================
PORT = int(os.environ.get('PORT', 5000))
MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://admin:netweave_secret_2024@users-db:27017/users_db?authSource=admin')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://:redis_secret_2024@redis-cache:6379/0')

# ============================================================
# Database Connections (via Docker DNS on db-net)
# ============================================================
mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = mongo_client.get_default_database()
users_collection = db['users']

redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# ============================================================
# Prometheus Metrics
# ============================================================
REQUEST_COUNT = Counter(
    'user_service_requests_total',
    'Total requests to user service',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'user_service_request_duration_seconds',
    'Request latency in seconds',
    ['method', 'endpoint']
)

# ============================================================
# Seed Data — Create sample users on startup
# ============================================================
def seed_data():
    """Insert sample users if collection is empty."""
    if users_collection.count_documents({}) == 0:
        sample_users = [
            {
                "name": "Alice Johnson",
                "email": "alice@netweave.io",
                "role": "admin",
                "created_at": datetime.datetime.utcnow().isoformat()
            },
            {
                "name": "Bob Smith",
                "email": "bob@netweave.io",
                "role": "user",
                "created_at": datetime.datetime.utcnow().isoformat()
            },
            {
                "name": "Charlie Brown",
                "email": "charlie@netweave.io",
                "role": "user",
                "created_at": datetime.datetime.utcnow().isoformat()
            }
        ]
        users_collection.insert_many(sample_users)
        print(f"✅ Seeded {len(sample_users)} sample users")


# ============================================================
# Routes
# ============================================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    try:
        mongo_client.admin.command('ping')
        mongo_status = 'connected'
    except Exception as e:
        mongo_status = f'error: {str(e)}'

    try:
        redis_client.ping()
        redis_status = 'connected'
    except Exception as e:
        redis_status = f'error: {str(e)}'

    return jsonify({
        'status': 'healthy',
        'service': 'user-service',
        'language': 'Python/Flask',
        'hostname': socket.gethostname(),
        'networks': ['backend-net', 'db-net'],
        'connections': {
            'mongodb': mongo_status,
            'redis': redis_status
        },
        'timestamp': datetime.datetime.utcnow().isoformat()
    })


@app.route('/metrics', methods=['GET'])
def metrics():
    """Prometheus metrics endpoint."""
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}


@app.route('/users', methods=['GET'])
def get_users():
    """Get all users."""
    REQUEST_COUNT.labels(method='GET', endpoint='/users', status='200').inc()

    # Try cache first
    cached = redis_client.get('all_users')
    if cached:
        import json
        return jsonify({
            'users': json.loads(cached),
            'source': 'cache (Redis on db-net)',
            'network_path': 'API Gateway (backend-net) → User Service → Redis (db-net)'
        })

    # Fetch from MongoDB
    users = list(users_collection.find({}, {'_id': 0}))

    # Cache for 30 seconds
    import json
    redis_client.setex('all_users', 30, json.dumps(users))

    return jsonify({
        'users': users,
        'source': 'database (MongoDB on db-net)',
        'network_path': 'API Gateway (backend-net) → User Service → MongoDB (db-net)',
        'cached_for': '30 seconds'
    })


@app.route('/users', methods=['POST'])
def create_user():
    """Create a new user."""
    data = request.get_json()

    if not data or not data.get('name') or not data.get('email'):
        REQUEST_COUNT.labels(method='POST', endpoint='/users', status='400').inc()
        return jsonify({'error': 'Name and email are required'}), 400

    user = {
        'name': data['name'],
        'email': data['email'],
        'role': data.get('role', 'user'),
        'created_at': datetime.datetime.utcnow().isoformat()
    }

    users_collection.insert_one(user)
    user.pop('_id', None)

    # Invalidate cache
    redis_client.delete('all_users')

    REQUEST_COUNT.labels(method='POST', endpoint='/users', status='201').inc()
    return jsonify({
        'user': user,
        'message': 'User created successfully',
        'network_path': 'API Gateway (backend-net) → User Service → MongoDB (db-net)'
    }), 201


@app.route('/users/<email>', methods=['GET'])
def get_user(email):
    """Get a user by email."""
    user = users_collection.find_one({'email': email}, {'_id': 0})

    if not user:
        REQUEST_COUNT.labels(method='GET', endpoint='/users/:id', status='404').inc()
        return jsonify({'error': f'User with email {email} not found'}), 404

    REQUEST_COUNT.labels(method='GET', endpoint='/users/:id', status='200').inc()
    return jsonify({'user': user})


@app.route('/network-info', methods=['GET'])
def network_info():
    """Show network information for this container."""
    return jsonify({
        'service': 'user-service',
        'language': 'Python',
        'hostname': socket.gethostname(),
        'ip_address': socket.gethostbyname(socket.gethostname()),
        'networks': ['backend-net', 'db-net'],
        'can_reach': {
            'mongodb (users-db)': 'Yes — via db-net',
            'redis (redis-cache)': 'Yes — via db-net',
            'api-gateway': 'Yes — via backend-net',
            'order-service': 'Yes — via backend-net',
            'nginx': 'No — not on frontend-net'
        }
    })


# ============================================================
# Start Server
# ============================================================
if __name__ == '__main__':
    print("""
╔══════════════════════════════════════════════╗
║   👤 NetWeave User Service                   ║
║   Port: {}                                ║
║   Language: Python / Flask                   ║
║   Networks: backend-net, db-net              ║
║   Database: MongoDB (users-db via DNS)       ║
║   Cache: Redis (redis-cache via DNS)         ║
║   Metrics: /metrics (Prometheus)             ║
╚══════════════════════════════════════════════╝
    """.format(PORT))

    seed_data()
    app.run(host='0.0.0.0', port=PORT, debug=False)
