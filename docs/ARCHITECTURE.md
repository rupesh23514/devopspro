# 🏗️ NetWeave Architecture

## Overview

NetWeave follows a **multi-tier microservices architecture** with strict network segmentation. Each tier is isolated on its own Docker network, and only services that need to communicate share a network.

## Design Principles

### 1. Defense in Depth
The database network (`db-net`) is marked as `internal: true`, meaning containers on this network cannot access the internet. Even if a database container is compromised, it cannot phone home to an attacker's server.

### 2. Least Privilege Networking
Each service is connected only to the networks it needs:
- **Nginx** only needs to talk to the API Gateway → `frontend-net` only
- **API Gateway** needs to receive from Nginx and route to services → `frontend-net` + `backend-net`
- **Microservices** need to talk to each other and databases → `backend-net` + `db-net`
- **Databases** only need to accept connections → `db-net` only

### 3. DNS-Based Discovery
No IP addresses are hardcoded. Services reference each other by name:
- `http://user-service:5000` (resolved by Docker's built-in DNS)
- `mongodb://users-db:27017` (resolved by Docker's built-in DNS)

This makes the architecture portable and resilient to container restarts (IPs change, names don't).

### 4. API Gateway Pattern
The API Gateway acts as a single entry point for all client requests:

```
Client → Nginx → API Gateway → User Service
                             → Order Service
```

Benefits:
- Single external port (80)
- Centralized routing logic
- Cross-cutting concerns (logging, metrics) in one place
- Backend services are not directly exposed

## Data Flow Examples

### Creating an Order
```
1. Client sends POST /api/orders to localhost:80
2. Nginx receives on frontend-net, proxies to api-gateway:3000
3. API Gateway receives on frontend-net, forwards to order-service:4000 on backend-net
4. Order Service validates user by calling user-service:5000 on backend-net
5. User Service queries users-db:27017 on db-net
6. Order Service stores order in orders-db:27017 on db-net
7. Order Service invalidates cache in redis-cache:6379 on db-net
8. Response flows back: Order Service → API Gateway → Nginx → Client
```

### Why Nginx Can't Reach MongoDB
```
Nginx (frontend-net) → API Gateway (frontend-net + backend-net)
                       ↓
                       API Gateway CAN reach User Service (backend-net)
                       ↓
                       User Service CAN reach MongoDB (db-net)

But:
Nginx (frontend-net) → MongoDB (db-net) ← BLOCKED! (no shared network)
```

## Service Dependencies

```
nginx
  └── api-gateway (healthy)
        ├── user-service (healthy)
        │     ├── users-db (healthy)
        │     └── redis-cache (healthy)
        └── order-service (healthy)
              ├── orders-db (healthy)
              ├── redis-cache (healthy)
              └── user-service (for validation)

prometheus
  └── cadvisor (running)

grafana
  └── prometheus (healthy)
```

## Resource Allocation

| Service | CPU Limit | Memory Limit |
|---|---|---|
| Nginx | 0.25 | 128 MB |
| API Gateway | 0.50 | 256 MB |
| User Service | 0.50 | 256 MB |
| Order Service | 0.50 | 256 MB |
| MongoDB × 2 | 0.50 each | 512 MB each |
| Redis | 0.25 | 128 MB |
| Prometheus | 0.50 | 512 MB |
| Grafana | 0.50 | 256 MB |
| cAdvisor | 0.25 | 256 MB |
| Dashboard | 0.10 | 64 MB |
| **Total** | **~4.35** | **~3.1 GB** |
