# AutoInvite SaaS — Hostinger VPS Deployment Guide

> **Target:** Ubuntu 22.04 LTS | Node.js 20 | PostgreSQL 15 | PM2 | Nginx | Let's Encrypt SSL
>
> **Minimum VPS:** 2GB RAM, 20GB SSD, domain pointed to VPS IP

---

## Step 0 — Prepare the VPS

```bash
# Connect via SSH
ssh root@YOUR_VPS_IP

# Update the system
apt update && apt upgrade -y

# Create a non-root user (security best practice)
adduser ubuntu
usermod -aG sudo ubuntu
rsync --archive --chown=ubuntu:ubuntu ~/.ssh /home/ubuntu

# Switch to the new user
exit
ssh ubuntu@YOUR_VPS_IP
```

---

## Step 1 — Install Node.js 20 via NVM

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Activate NVM
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

# Install Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x

# Install PM2 globally
npm install -g pm2
```

---

## Step 2 — Install PostgreSQL and Create the Database

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Enter psql as postgres superuser
sudo -u postgres psql
```

Inside psql, run:

```sql
-- Replace STRONG_PASSWORD with a secure password
CREATE USER autoinvite WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE autoinvite_saas OWNER autoinvite;
GRANT ALL PRIVILEGES ON DATABASE autoinvite_saas TO autoinvite;
\q
```

Test the connection:

```bash
psql postgresql://autoinvite:STRONG_PASSWORD@localhost:5432/autoinvite_saas -c "SELECT 1;"
# Expected: (1 row)
```

---

## Step 3 — Install Chromium for WhatsApp Web

```bash
# Install Google Chrome Stable (recommended for Puppeteer)
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/google.gpg
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install -y google-chrome-stable

# Verify
google-chrome --version
which google-chrome  # Note the path for CHROMIUM_PATH in .env

# Install Puppeteer system dependencies
sudo apt install -y \
    libnspr4 libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    fonts-liberation fonts-noto-color-emoji \
    --no-install-recommends
```

---

## Step 4 — Install node-canvas System Libraries

```bash
sudo apt install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3-dev
```

---

## Step 5 — Deploy the Code

### Method A: Via Git (recommended)

```bash
sudo mkdir -p /var/www/autoinvite
sudo chown ubuntu:ubuntu /var/www/autoinvite
cd /var/www/autoinvite
git clone https://github.com/YOUR_GITHUB_USERNAME/autoinvite.git .
```

### Method B: Via SCP (from your local machine)

```bash
# On your local machine — create archive excluding private files
tar --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./storage' \
    --exclude='./.env' \
    --exclude='./taqreerk/node_modules' \
    --exclude='./taqreerk/dist' \
    -czf autoinvite.tar.gz .

# Upload to VPS
scp autoinvite.tar.gz ubuntu@YOUR_VPS_IP:/var/www/autoinvite/

# On the VPS — extract
cd /var/www/autoinvite
tar -xzf autoinvite.tar.gz
rm autoinvite.tar.gz
```

---

## Step 6 — Configure Environment Variables

```bash
cd /var/www/autoinvite
cp .env.example .env
nano .env
```

Fill in these values:

```env
NODE_ENV=production
PORT=5000

# Generate with: openssl rand -hex 32
SESSION_SECRET=YOUR_64_CHAR_HEX_SECRET

DATABASE_URL=postgresql://autoinvite:STRONG_PASSWORD@localhost:5432/autoinvite_saas

# Path from Step 3
CHROMIUM_PATH=/usr/bin/google-chrome

DATA_DIR=/var/www/autoinvite

# Lower this if RAM is limited (each session uses ~200-400MB)
MAX_TOTAL_CLIENTS=3
```

```bash
# Secure the file (owner-read-only)
chmod 600 .env
```

---

## Step 7 — Install Packages and Initialize the Database

```bash
cd /var/www/autoinvite

# Install production dependencies (node-canvas will compile here, ~2-3 min)
npm install --omit=dev

# Build the landing page
cd taqreerk && npm install && npm run build && cd ..

# Initialize database schema
npm run db:init
# Expected: ✅ SaaS PostgreSQL Schema is ready.

# Run migration (adds quota/role columns if missing)
npm run db:migrate
# Expected: ✅ Migration complete

# Create the default Super Admin account (admin / admin123)
npm run db:seed-admin
# IMPORTANT: Change the password immediately after first login!

# Create required directories
mkdir -p logs storage
```

---

## Step 8 — Configure PM2

Create `ecosystem.config.js` in the project root if it doesn't exist:

```bash
cat > /var/www/autoinvite/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'autoinvite',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
EOF
```

```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save process list
pm2 save

# Enable startup on system reboot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the sudo command it outputs

# Useful PM2 commands
pm2 status                  # Process status
pm2 logs autoinvite         # Live logs
pm2 reload autoinvite       # Zero-downtime restart
pm2 monit                   # RAM/CPU monitor
```

---

## Step 9 — Configure Nginx as Reverse Proxy

```bash
sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/autoinvite > /dev/null << 'EOF'
upstream autoinvite_app {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Large uploads (contact files, images)
    client_max_body_size 10M;

    # Socket.IO support (WebSocket upgrade)
    location /socket.io/ {
        proxy_pass http://autoinvite_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
    }

    # All other routes
    location / {
        proxy_pass http://autoinvite_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/autoinvite /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Start Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## Step 10 — SSL Certificate with Let's Encrypt

> Make sure your domain's DNS A record points to the VPS IP before running this.

```bash
sudo apt install -y certbot python3-certbot-nginx

# Get free SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
# Expected: Congratulations, all simulated renewals succeeded!
```

---

## Step 11 — Final Verification

```bash
# 1. Is the app running?
pm2 status
# Expected: autoinvite | online

# 2. Does the API respond?
curl http://localhost:5000/login
# Expected: HTML login page

# 3. Is Nginx passing requests?
curl -I https://yourdomain.com
# Expected: HTTP/2 200

# 4. Is Socket.IO passing through?
curl -I https://yourdomain.com/socket.io/
# Expected: HTTP/1.1 400 (normal — WebSocket rejects plain HTTP)
# NOT: 502 Bad Gateway

# 5. Is the database ready?
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
# Expected: 1 row (the admin account)

# 6. Is SSL valid?
curl -vI https://yourdomain.com 2>&1 | grep "issuer"
# Expected: Let's Encrypt
```

---

## Updating the App

```bash
cd /var/www/autoinvite

# Pull latest code
git pull origin main

# Install any new dependencies
npm install --omit=dev

# Run any new migrations
npm run db:migrate

# Rebuild landing page if changed
cd taqreerk && npm run build && cd ..

# Zero-downtime reload
pm2 reload autoinvite
```

---

## Security Hardening

```bash
# Firewall — allow only SSH, HTTP, HTTPS
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw deny 5000    # Block direct app port from outside
sudo ufw enable

# Protect the .env file
chmod 600 /var/www/autoinvite/.env

# Generate a strong SESSION_SECRET
openssl rand -hex 32
```

---

## RAM Budget per VPS Size

| VPS Plan | RAM | MAX_TOTAL_CLIENTS | Concurrent WhatsApp Sessions |
|----------|-----|-------------------|------------------------------|
| Starter  | 2GB | 2                 | Up to 2 |
| Business | 4GB | 4                 | Up to 4 |
| Premium  | 8GB | 8                 | Up to 8 |

> Each WhatsApp session = one Chromium instance = ~200–400MB RAM

---

## Pre-Launch Checklist

- [ ] `pm2 status` shows `online`
- [ ] `https://yourdomain.com` loads without SSL warnings
- [ ] Socket.IO live logs work on campaign run page
- [ ] WhatsApp QR code appears in dashboard
- [ ] User registration and login work
- [ ] Admin login redirects to `/admin/dashboard`
- [ ] `.env` has `chmod 600`
- [ ] UFW firewall is enabled
- [ ] Certbot auto-renewal passes: `sudo certbot renew --dry-run`

---

*AutoInvite SaaS Edition — 2026*
