# 🐳 NetWeave — Docker Networking Multi-Container Platform

[![Docker](https://img.shields.io/badge/Docker-27+-blue?logo=docker)](https://www.docker.com/)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2+-blue?logo=docker)](https://docs.docker.com/compose/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-yellow?logo=python)](https://python.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-green?logo=mongodb)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)](https://redis.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Latest-orange?logo=prometheus)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-orange?logo=grafana)](https://grafana.com/)

> A production-grade Docker networking project demonstrating **network segmentation**, **DNS-based service discovery**, **inter-service communication**, and **real-time monitoring** across **11 containers** and **5 isolated networks**.

---

## 🎯 What This Project Demonstrates

| Concept | Implementation |
|---|---|
| **Custom Bridge Networks** | 5 networks with specific subnets |
| **Network Isolation** | `db-net` marked as `internal: true` (no internet) |
| **DNS Service Discovery** | Services communicate using container names, not IPs |
| **Multi-Network Attachments** | API Gateway bridges `frontend-net` and `backend-net` |
| **Inter-Service Communication** | Order Service calls User Service via Docker DNS |
| **Multi-Language Services** | Python (Flask) + Node.js (Express) |
| **Health Checks** | Every service has Docker health checks |
| **Monitoring** | Prometheus + Grafana + cAdvisor |
| **Automated Testing** | Scripts that verify connectivity AND isolation |

---

## 🏗️ Architecture

```
                    ┌─────────────────────────┐
                    │     frontend-net         │
                    │  ┌───────┐  ┌─────────┐ │
    Port 80 ───────▶│  │ Nginx │──│ API GW  │ │
                    │  └───────┘  └────┬────┘ │
                    └──────────────────┼──────┘
                                       │
                    ┌──────────────────┼──────┐
                    │     backend-net   │      │
                    │  ┌──────────┐ ┌──┴────┐ │
                    │  │User Svc  │ │Ord Svc│ │
                    │  │(Python)  │ │(Node) │ │
                    │  └────┬─────┘ └──┬────┘ │
                    └───────┼──────────┼──────┘
                            │          │
                    ┌───────┼──────────┼──────┐
                    │  🔒 db-net (internal)    │
                    │  ┌────┴───┐ ┌────┴───┐  │
                    │  │MongoDB │ │MongoDB │  │
                    │  │(users) │ │(orders)│  │
                    │  └────────┘ └────────┘  │
                    │       ┌────────┐         │
                    │       │ Redis  │         │
                    │       └────────┘         │
                    └─────────────────────────┘

                    ┌─────────────────────────┐
                    │     monitor-net          │
                    │  ┌──────────┐ ┌───────┐ │
    Port 9090 ─────▶│  │Prometheus│ │Grafana│ │◀── Port 3001
                    │  └──────────┘ └───────┘ │
                    │       ┌─────────┐       │
    Port 8081 ─────▶│       │cAdvisor │       │
                    │       └─────────┘       │
                    │  ┌────────────────────┐  │
    Port 8080 ─────▶│  │  Dashboard (HTML)  │  │
                    │  └────────────────────┘  │
                    └─────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose v2)
- 4GB+ available RAM

### Start Everything

```bash
# Clone the repository
git clone <your-repo-url>
cd Dev_ops

# Build and start all 11 containers
docker-compose up -d --build

# Check all services are running
docker-compose ps
```

### Access the Application

| Service | URL | Credentials |
|---|---|---|
| 🌐 Landing Page | http://localhost | — |
| 🔗 API Health | http://localhost/api/health | — |
| 👤 Users API | http://localhost/api/users | — |
| 📦 Orders API | http://localhost/api/orders | — |
| 📡 Network Info | http://localhost/api/network-info | — |
| 🗺️ Network Dashboard | http://localhost:8080 | — |
| 📊 Grafana | http://localhost:3001 | admin / admin |
| 📈 Prometheus | http://localhost:9090 | — |
| 📉 cAdvisor | http://localhost:8081 | — |
| 🗄️ Users DB (Compass) | mongodb://admin:netweave_secret_2024@localhost:27017 | — |
| 🗄️ Orders DB (Compass) | mongodb://admin:netweave_secret_2024@localhost:27018 | — |

### MongoDB Compass

Connect to your databases directly via MongoDB Compass to view data created from the Dashboard UI:

1. **Users DB**: `mongodb://admin:netweave_secret_2024@localhost:27017` → database `users_db` → collection `users`
2. **Orders DB**: `mongodb://admin:netweave_secret_2024@localhost:27018` → database `orders_db` → collection `orders`

> Create users and orders via the **Network Dashboard** (http://localhost:8080) and see them appear in real-time in Compass.

---

## 🧪 Run Network Tests

The test suite verifies both **connectivity** and **isolation**:

```bash
# Linux/Mac
chmod +x scripts/test-networking.sh
./scripts/test-networking.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\scripts\test-networking.ps1
```

Expected output includes:
- ✅ **PASS** — Services that SHOULD communicate CAN communicate
- ✅ **BLOCKED** — Services that should NOT communicate are properly isolated
- ❌ **FAIL** — Something unexpected happened

---

## 📊 Monitoring

### Grafana Dashboards
Open http://localhost:3001 (login: `admin`/`admin`) to see:
- **Container CPU Usage** — Real-time CPU per container
- **Memory Usage** — RAM consumption graphs
- **Network I/O** — Bytes sent/received per network interface
- **API Request Rates** — Requests per second
- **Request Latency** — P95 response times

### Prometheus
Open http://localhost:9090 to query raw metrics:
```promql
# CPU usage per container
rate(container_cpu_usage_seconds_total{name=~"netweave.*"}[1m])

# HTTP request rate
sum(rate(http_requests_total[1m]))

# Memory usage
container_memory_usage_bytes{name=~"netweave.*"}
```

---

## 🔐 Network Isolation Matrix

| | Nginx | API GW | User Svc | Order Svc | MongoDB | Redis | Prometheus | Grafana |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Nginx** | — | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **API Gateway** | ✅ | — | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Service** | ❌ | ✅ | — | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Order Service** | ❌ | ✅ | ✅ | — | ✅ | ✅ | ❌ | ❌ |

✅ = Connected &nbsp; ❌ = Isolated by design

---

## 📁 Project Structure

```
Dev_ops/
├── docker-compose.yml          # 11 services, 5 networks
├── .env                        # Environment config
├── Makefile                    # Shortcut commands
├── services/
│   ├── nginx/                  # Reverse proxy
│   ├── api-gateway/            # Node.js API router
│   ├── user-service/           # Python/Flask microservice
│   ├── order-service/          # Node.js microservice
│   └── dashboard/              # Network visualization
├── monitoring/
│   ├── prometheus/             # Metrics collection config
│   └── grafana/                # Dashboards & datasources
├── scripts/
│   ├── test-networking.sh      # Connectivity tests (bash)
│   ├── test-networking.ps1     # Connectivity tests (PowerShell)
│   ├── inspect-networks.sh     # Network inspection
│   └── cleanup.sh              # Full cleanup
└── docs/
    ├── ARCHITECTURE.md         # Architecture deep-dive
    └── NETWORKING.md           # Docker networking guide
```

---

## 🛑 Shutdown & Cleanup

```bash
# Stop all containers
docker-compose down

# Stop and remove all data (volumes)
docker-compose down -v

# Full cleanup (containers, images, networks, volumes)
./scripts/cleanup.sh
```

---

## 📚 Learn More

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Detailed architecture explanation
- [docs/NETWORKING.md](docs/NETWORKING.md) — Docker networking concepts

---

## 🛠️ Technologies Used

- **Docker & Docker Compose** — Container orchestration
- **Nginx** — Reverse proxy & static file server
- **Node.js / Express** — API Gateway & Order Service
- **Python / Flask** — User Service
- **MongoDB** — Document database
- **Redis** — In-memory caching
- **Prometheus** — Metrics collection
- **Grafana** — Monitoring dashboards
- **cAdvisor** — Container metrics exporter

---

*Built as a DevOps portfolio project demonstrating Docker networking best practices.*
#   d e v o p s p r o  
 