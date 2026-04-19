# 🌐 Docker Networking Guide

## Introduction

Docker networking allows containers to communicate with each other and with the outside world. This guide explains the networking concepts used in NetWeave.

---

## Network Drivers

Docker provides several network drivers:

| Driver | Use Case | NetWeave Usage |
|---|---|---|
| **bridge** | Default. Containers on same host communicate via a virtual bridge | ✅ Used for all 5 networks |
| **host** | Container shares host's network stack | ❌ Not used (less isolation) |
| **overlay** | Multi-host networking (Docker Swarm) | ❌ Not used (single host) |
| **none** | No networking | ❌ Not used |
| **macvlan** | Container gets its own MAC address | ❌ Not used |

### Why Bridge Networks?

Bridge networks are ideal for single-host deployments because they provide:
- **Isolation**: Each network is isolated from others
- **DNS**: Containers can discover each other by name
- **Custom subnets**: You control the IP range
- **Security**: You can mark networks as `internal`

---

## Key Concepts Used in NetWeave

### 1. Custom Bridge Networks vs Default Bridge

Docker creates a default `bridge` network, but **custom bridge networks** are better:

| Feature | Default Bridge | Custom Bridge |
|---|---|---|
| DNS resolution | ❌ No | ✅ Yes |
| Isolation between networks | ❌ All containers on same network | ✅ Only specified containers |
| Connect/disconnect live | ❌ No | ✅ Yes |
| Custom subnet | ❌ No | ✅ Yes |

```yaml
# Custom bridge with specific subnet
networks:
  frontend-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### 2. DNS-Based Service Discovery

On custom bridge networks, Docker runs an embedded DNS server at `127.0.0.11`. Containers can reach each other by **service name**:

```javascript
// Instead of hardcoding IPs like this:
const MONGO_URL = 'mongodb://172.22.0.5:27017/mydb';  // ❌ BAD

// Use DNS names:
const MONGO_URL = 'mongodb://users-db:27017/mydb';     // ✅ GOOD
```

Docker resolves `users-db` to the container's current IP automatically. If the container restarts and gets a new IP, DNS updates automatically.

### 3. Network Isolation

Containers on different networks **cannot communicate** by default:

```
frontend-net:  [Nginx] [API Gateway]
backend-net:   [API Gateway] [User Service] [Order Service]
db-net:        [User Service] [Order Service] [MongoDB] [Redis]
```

- Nginx can reach API Gateway (shared `frontend-net`)
- Nginx **cannot** reach User Service (different networks)
- Nginx **cannot** reach MongoDB (different networks)

### 4. Multi-Network Attachments

A container can be on **multiple networks** simultaneously:

```yaml
services:
  api-gateway:
    networks:
      - frontend-net   # Receives from Nginx
      - backend-net    # Routes to microservices
```

The API Gateway gets **two IP addresses** — one on each network. This makes it a **bridge** between the public-facing tier and the internal services.

### 5. Internal Networks

The `internal: true` flag prevents containers from accessing the internet:

```yaml
networks:
  db-net:
    driver: bridge
    internal: true  # 🔒 No outbound internet access!
```

This is a critical security feature. Even if someone gains access to the database container, they cannot:
- Download malicious software from the internet
- Send data to external servers
- Establish reverse shells to attacker-controlled servers

---

## Useful Docker Networking Commands

```bash
# List all networks
docker network ls

# Inspect a network (see connected containers, subnet, gateway)
docker network inspect netweave_frontend-net

# See which networks a container is on
docker inspect netweave-api-gateway --format '{{json .NetworkSettings.Networks}}' | python -m json.tool

# Create a network manually
docker network create --driver bridge --subnet 10.0.0.0/16 my-network

# Connect a running container to a network
docker network connect my-network my-container

# Disconnect a container from a network
docker network disconnect my-network my-container

# Test connectivity from inside a container
docker exec netweave-nginx ping -c 1 api-gateway         # Should work
docker exec netweave-nginx ping -c 1 users-db             # Should fail

# Check DNS resolution from inside a container
docker exec netweave-api-gateway nslookup user-service
```

---

## Troubleshooting

### Container can't reach another container
1. Check they're on the same network: `docker inspect <container> | grep Networks`
2. Check the target container is running: `docker-compose ps`
3. Check DNS resolution: `docker exec <container> nslookup <target>`

### "Network not found" error
The network name includes the project prefix. Use:
```bash
docker network ls --filter "name=netweave"
# Shows: netweave_frontend-net, netweave_backend-net, etc.
```

### Container gets wrong IP
Docker assigns IPs dynamically. **Don't rely on IPs** — use DNS names instead.

---

## Further Reading

- [Docker Networking Overview](https://docs.docker.com/network/)
- [Bridge Network Driver](https://docs.docker.com/network/bridge/)
- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
