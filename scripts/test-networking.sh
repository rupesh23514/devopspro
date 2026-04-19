#!/bin/bash
# ============================================
# NetWeave — Network Connectivity Test Suite
# ============================================
# This script verifies Docker network isolation and connectivity
# by testing which services can/cannot communicate.

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PASS=0
FAIL=0
EXPECTED_FAIL=0

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        🐳 NetWeave — Network Connectivity Tests            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function: Test connectivity (expect SUCCESS)
test_pass() {
    local description="$1"
    local command="$2"
    
    echo -n -e "  ${YELLOW}Testing:${NC} $description ... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}❌ FAIL (expected PASS)${NC}"
        FAIL=$((FAIL + 1))
    fi
}

# Function: Test connectivity (expect FAILURE — proving isolation)
test_fail() {
    local description="$1"
    local command="$2"
    
    echo -n -e "  ${YELLOW}Testing:${NC} $description ... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${RED}❌ FAIL (should have been blocked!)${NC}"
        FAIL=$((FAIL + 1))
    else
        echo -e "${GREEN}✅ BLOCKED (network isolation confirmed)${NC}"
        EXPECTED_FAIL=$((EXPECTED_FAIL + 1))
    fi
}

# ============================================================
# SECTION 1: Frontend Network Tests
# ============================================================
echo -e "${BOLD}━━━ 🌐 Frontend Network (frontend-net) ━━━${NC}"
echo ""

test_pass "Nginx is accessible on port 80" \
    "curl -sf --max-time 5 http://localhost/health"

test_pass "Nginx → API Gateway routing works" \
    "curl -sf --max-time 5 http://localhost/api/health"

echo ""

# ============================================================
# SECTION 2: Backend Network Tests  
# ============================================================
echo -e "${BOLD}━━━ ⚙️  Backend Network (backend-net) ━━━${NC}"
echo ""

test_pass "API Gateway → User Service (via backend-net)" \
    "curl -sf --max-time 5 http://localhost/api/users"

test_pass "API Gateway → Order Service (via backend-net)" \
    "curl -sf --max-time 5 http://localhost/api/orders"

test_pass "API Gateway network info endpoint" \
    "curl -sf --max-time 5 http://localhost/api/network-info"

echo ""

# ============================================================
# SECTION 3: Database Network Tests
# ============================================================
echo -e "${BOLD}━━━ 🔒 Database Network (db-net — internal) ━━━${NC}"
echo ""

test_pass "User Service → MongoDB (users-db via db-net)" \
    "curl -sf --max-time 5 http://localhost/api/users | grep -q 'users'"

test_pass "Order Service → MongoDB (orders-db via db-net)" \
    "curl -sf --max-time 5 http://localhost/api/orders | grep -q 'orders'"

echo ""

# ============================================================
# SECTION 4: Inter-Service Communication
# ============================================================
echo -e "${BOLD}━━━ 🔗 Inter-Service Communication ━━━${NC}"
echo ""

test_pass "Order Service → User Service (cross-service on backend-net)" \
    "curl -sf --max-time 10 -X POST http://localhost/api/orders \
    -H 'Content-Type: application/json' \
    -d '{\"product\":\"Test Item\",\"quantity\":1,\"price\":9.99,\"userEmail\":\"alice@netweave.io\"}' \
    | grep -q 'validated'"

echo ""

# ============================================================
# SECTION 5: Network Isolation Tests (should FAIL = good!)
# ============================================================
echo -e "${BOLD}━━━ 🛡️  Network Isolation Tests (failures = security!) ━━━${NC}"
echo ""

test_fail "Nginx CANNOT reach MongoDB directly" \
    "docker exec netweave-nginx ping -c 1 -W 2 users-db 2>/dev/null"

test_fail "Nginx CANNOT reach User Service directly" \
    "docker exec netweave-nginx ping -c 1 -W 2 user-service 2>/dev/null"

test_fail "Nginx CANNOT reach Redis directly" \
    "docker exec netweave-nginx ping -c 1 -W 2 redis-cache 2>/dev/null"

test_fail "Grafana CANNOT reach MongoDB" \
    "docker exec netweave-grafana ping -c 1 -W 2 users-db 2>/dev/null"

test_fail "Prometheus CANNOT reach MongoDB" \
    "docker exec netweave-prometheus ping -c 1 -W 2 users-db 2>/dev/null"

echo ""

# ============================================================
# SECTION 6: Monitoring Network Tests
# ============================================================
echo -e "${BOLD}━━━ 📊 Monitoring Network (monitor-net) ━━━${NC}"
echo ""

test_pass "Prometheus is accessible on port 9090" \
    "curl -sf --max-time 5 http://localhost:9090/-/healthy"

test_pass "Grafana is accessible on port 3001" \
    "curl -sf --max-time 5 http://localhost:3001/api/health"

test_pass "cAdvisor is accessible on port 8081" \
    "curl -sf --max-time 5 http://localhost:8081/containers/"

test_pass "Dashboard is accessible on port 8080" \
    "curl -sf --max-time 5 http://localhost:8080/health"

echo ""

# ============================================================
# SECTION 7: DNS Resolution Tests
# ============================================================
echo -e "${BOLD}━━━ 🔍 DNS Resolution (Docker internal DNS) ━━━${NC}"
echo ""

test_pass "API Gateway can resolve 'user-service' via DNS" \
    "docker exec netweave-api-gateway ping -c 1 -W 2 user-service"

test_pass "API Gateway can resolve 'order-service' via DNS" \
    "docker exec netweave-api-gateway ping -c 1 -W 2 order-service"

test_pass "User Service can resolve 'users-db' via DNS" \
    "docker exec netweave-user-service ping -c 1 -W 2 users-db"

test_pass "Order Service can resolve 'redis-cache' via DNS" \
    "docker exec netweave-order-service ping -c 1 -W 2 redis-cache"

echo ""

# ============================================================
# RESULTS
# ============================================================
TOTAL=$((PASS + FAIL + EXPECTED_FAIL))

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    📊 TEST RESULTS                         ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  Total Tests:           ${BOLD}$TOTAL${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}✅ Passed:              $PASS${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}✅ Blocked (expected):  $EXPECTED_FAIL${NC}"
echo -e "${CYAN}║${NC}  ${RED}❌ Failed:              $FAIL${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"

if [ $FAIL -eq 0 ]; then
    echo ""
    echo -e "  ${GREEN}${BOLD}🎉 ALL TESTS PASSED! Network isolation is working correctly.${NC}"
    echo ""
    exit 0
else
    echo ""
    echo -e "  ${RED}${BOLD}⚠️  Some tests failed. Check the output above.${NC}"
    echo ""
    exit 1
fi
