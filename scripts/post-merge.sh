#!/bin/bash
set -e

echo "=== AutoInvite Post-Merge Setup ==="

# 1. Install Node dependencies
echo "→ Installing Node.js dependencies..."
npm install --yes

# 2. Run DB migration (safe, uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
echo "→ Running database migration..."
node src/database/migrate_saas.js

# 3. Build taqreerk landing page
echo "→ Building landing page..."
cd taqreerk && npm install --yes && npm run build
cd ..

echo "=== Post-merge setup complete ==="
