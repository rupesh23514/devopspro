#!/bin/bash
# ============================================
# NetWeave — Network Inspection Utility
# ============================================
# Displays detailed network info for all NetWeave Docker networks

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🔍 NetWeave — Network Inspection              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# List all NetWeave networks
echo -e "${BOLD}📋 Docker Networks:${NC}"
docker network ls --filter "name=netweave" --format "  {{.Name}} ({{.Driver}}) — {{.ID}}"
echo ""

# Inspect each network
for net in frontend-net backend-net db-net monitor-net; do
    FULL_NAME="netweave_${net}"
    echo -e "${YELLOW}━━━ 🌐 ${net} ━━━${NC}"
    
    # Get subnet
    SUBNET=$(docker network inspect "$FULL_NAME" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null)
    GATEWAY=$(docker network inspect "$FULL_NAME" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null)
    INTERNAL=$(docker network inspect "$FULL_NAME" --format '{{.Internal}}' 2>/dev/null)
    
    echo -e "  Subnet:   ${GREEN}${SUBNET:-N/A}${NC}"
    echo -e "  Gateway:  ${GREEN}${GATEWAY:-N/A}${NC}"
    echo -e "  Internal: ${GREEN}${INTERNAL:-N/A}${NC}"
    echo -e "  Containers:"
    
    docker network inspect "$FULL_NAME" --format '{{range .Containers}}    - {{.Name}} ({{.IPv4Address}}){{"\n"}}{{end}}' 2>/dev/null || echo "    (not running)"
    echo ""
done

# Container summary
echo -e "${BOLD}📦 All NetWeave Containers:${NC}"
docker ps --filter "name=netweave" --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo ""
