#!/bin/bash
# ============================================
# NetWeave — Full Cleanup Script
# ============================================

echo "🧹 Stopping all NetWeave containers..."
docker-compose down -v --remove-orphans

echo "🗑️  Removing NetWeave images..."
docker images --filter "reference=*netweave*" -q | xargs -r docker rmi -f
docker images --filter "reference=*dev_ops*" -q | xargs -r docker rmi -f

echo "🌐 Removing NetWeave networks..."
docker network ls --filter "name=netweave" -q | xargs -r docker network rm

echo "💾 Removing NetWeave volumes..."
docker volume ls --filter "name=netweave" -q | xargs -r docker volume rm

echo ""
echo "✅ Full cleanup complete!"
echo ""
