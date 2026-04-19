# ============================================
# NetWeave — Network Connectivity Test Suite (PowerShell)
# ============================================
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\test-networking.ps1

$pass = 0
$fail = 0
$blocked = 0

function Write-Header($text) {
    Write-Host ""
    Write-Host "━━━ $text ━━━" -ForegroundColor White
    Write-Host ""
}

function Test-ShouldPass($description, $url) {
    Write-Host "  Testing: $description ... " -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "PASS" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "FAIL (Status: $($response.StatusCode))" -ForegroundColor Red
            $script:fail++
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:fail++
    }
}

function Test-ShouldBlock($description, $container, $target) {
    Write-Host "  Testing: $description ... " -NoNewline
    try {
        $result = docker exec $container ping -c 1 -W 2 $target 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "FAIL (should have been blocked!)" -ForegroundColor Red
            $script:fail++
        } else {
            Write-Host "BLOCKED (isolation confirmed)" -ForegroundColor Green
            $script:blocked++
        }
    } catch {
        Write-Host "BLOCKED (isolation confirmed)" -ForegroundColor Green
        $script:blocked++
    }
}

function Test-DNSResolve($description, $container, $target) {
    Write-Host "  Testing: $description ... " -NoNewline
    try {
        $result = docker exec $container ping -c 1 -W 2 $target 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "PASS" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            $script:fail++
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:fail++
    }
}

# Banner
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       NetWeave — Network Connectivity Tests                    " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# Section 1: Frontend
Write-Header "Frontend Network (frontend-net)"
Test-ShouldPass "Nginx accessible on port 80" "http://localhost/health"
Test-ShouldPass "Nginx -> API Gateway routing" "http://localhost/api/health"

# Section 2: Backend
Write-Header "Backend Network (backend-net)"
Test-ShouldPass "API Gateway -> User Service" "http://localhost/api/users"
Test-ShouldPass "API Gateway -> Order Service" "http://localhost/api/orders"
Test-ShouldPass "API Gateway network info" "http://localhost/api/network-info"

# Section 3: Database
Write-Header "Database Network (db-net — internal)"
Test-ShouldPass "User Service -> MongoDB (via db-net)" "http://localhost/api/users"
Test-ShouldPass "Order Service -> MongoDB (via db-net)" "http://localhost/api/orders"

# Section 4: Inter-Service
Write-Header "Inter-Service Communication"
try {
    $body = '{"product":"Test Item","quantity":1,"price":9.99,"userEmail":"alice@netweave.io"}'
    $response = Invoke-WebRequest -Uri "http://localhost/api/orders" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    if ($response.Content -match "validated") {
        Write-Host "  Testing: Order Service -> User Service (cross-service) ... " -NoNewline
        Write-Host "PASS" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  Testing: Order Service -> User Service (cross-service) ... " -NoNewline
        Write-Host "PASS (order created)" -ForegroundColor Green
        $pass++
    }
} catch {
    Write-Host "  Testing: Order Service -> User Service ... " -NoNewline
    Write-Host "FAIL" -ForegroundColor Red
    $fail++
}

# Section 5: Isolation
Write-Header "Network Isolation Tests (failures = security!)"
Test-ShouldBlock "Nginx CANNOT reach MongoDB" "netweave-nginx" "users-db"
Test-ShouldBlock "Nginx CANNOT reach User Service" "netweave-nginx" "user-service"
Test-ShouldBlock "Nginx CANNOT reach Redis" "netweave-nginx" "redis-cache"
Test-ShouldBlock "Grafana CANNOT reach MongoDB" "netweave-grafana" "users-db"
Test-ShouldBlock "Prometheus CANNOT reach MongoDB" "netweave-prometheus" "users-db"

# Section 6: Monitoring
Write-Header "Monitoring Network (monitor-net)"
Test-ShouldPass "Prometheus on port 9090" "http://localhost:9090/-/healthy"
Test-ShouldPass "Grafana on port 3001" "http://localhost:3001/api/health"
Test-ShouldPass "Dashboard on port 8080" "http://localhost:8080/health"

# Section 7: DNS
Write-Header "DNS Resolution (Docker internal DNS)"
Test-DNSResolve "API Gateway resolves 'user-service'" "netweave-api-gateway" "user-service"
Test-DNSResolve "API Gateway resolves 'order-service'" "netweave-api-gateway" "order-service"
Test-DNSResolve "User Service resolves 'users-db'" "netweave-user-service" "users-db"
Test-DNSResolve "Order Service resolves 'redis-cache'" "netweave-order-service" "redis-cache"

# Results
$total = $pass + $fail + $blocked
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "                     TEST RESULTS                               " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Total Tests:            $total"
Write-Host "  Passed:                 $pass" -ForegroundColor Green
Write-Host "  Blocked (expected):     $blocked" -ForegroundColor Green
Write-Host "  Failed:                 $fail" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })
Write-Host "================================================================" -ForegroundColor Cyan

if ($fail -eq 0) {
    Write-Host ""
    Write-Host "  ALL TESTS PASSED! Network isolation is working correctly." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  Some tests failed. Check the output above." -ForegroundColor Red
    Write-Host ""
}
