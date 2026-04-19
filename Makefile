# ============================================
# NetWeave — Makefile Commands
# ============================================

.PHONY: up down build logs test inspect clean ps restart

# Start all services
up:
	docker-compose up -d --build

# Stop all services
down:
	docker-compose down

# Build without starting
build:
	docker-compose build

# View logs (all services)
logs:
	docker-compose logs -f

# View logs for a specific service (usage: make log s=nginx)
log:
	docker-compose logs -f $(s)

# Show running services
ps:
	docker-compose ps

# Run network connectivity tests
test:
	@echo "============================================"
	@echo "  NetWeave — Network Connectivity Tests"
	@echo "============================================"
	powershell -ExecutionPolicy Bypass -File ./scripts/test-networking.ps1

# Inspect all networks
inspect:
	@echo "============================================"
	@echo "  NetWeave — Network Inspection"
	@echo "============================================"
	@docker network ls --filter "label=netweave.network"
	@echo ""
	@echo "--- frontend-net ---"
	@docker network inspect netweave_frontend-net --format '{{range .Containers}}{{.Name}} ({{.IPv4Address}}){{"\n"}}{{end}}' 2>/dev/null || echo "Not running"
	@echo ""
	@echo "--- backend-net ---"
	@docker network inspect netweave_backend-net --format '{{range .Containers}}{{.Name}} ({{.IPv4Address}}){{"\n"}}{{end}}' 2>/dev/null || echo "Not running"
	@echo ""
	@echo "--- db-net ---"
	@docker network inspect netweave_db-net --format '{{range .Containers}}{{.Name}} ({{.IPv4Address}}){{"\n"}}{{end}}' 2>/dev/null || echo "Not running"
	@echo ""
	@echo "--- monitor-net ---"
	@docker network inspect netweave_monitor-net --format '{{range .Containers}}{{.Name}} ({{.IPv4Address}}){{"\n"}}{{end}}' 2>/dev/null || echo "Not running"

# Restart a specific service (usage: make restart s=api-gateway)
restart:
	docker-compose restart $(s)

# Full cleanup — remove containers, networks, volumes, images
clean:
	docker-compose down -v --rmi all --remove-orphans
	@echo "✅ Full cleanup complete!"
