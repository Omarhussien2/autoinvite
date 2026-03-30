/**
 * AutoInvite SaaS — PM2 Ecosystem Configuration
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
    apps: [
        {
            name: 'autoinvite',
            script: 'src/server.js',

            // ── Process Mode ───────────────────────────────────────────────
            // IMPORTANT: Use 'fork' (not cluster) because:
            //   1. Socket.IO state is in-memory (WhatsAppManager Map)
            //   2. Puppeteer/Chromium cannot be shared across cluster workers
            //   3. Sessions are now stored in PostgreSQL so restarts are safe
            instances: 1,
            exec_mode: 'fork',

            // ── Environment ────────────────────────────────────────────────
            env: {
                NODE_ENV: 'development',
                PORT: 5000,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 5000,
            },

            // ── Restart Policy ─────────────────────────────────────────────
            max_restarts: 10,
            min_uptime: '10s',           // Must stay up at least 10s to count as successful
            restart_delay: 3000,         // Wait 3s between restarts to avoid crash loop
            watch: false,                // Never use watch in production (Puppeteer triggers it)

            // ── Memory Guard ───────────────────────────────────────────────
            // Puppeteer + Chromium is the biggest memory consumer.
            // Each WhatsApp session ≈ 200-400MB RAM.
            // MAX_TOTAL_CLIENTS=3 on a 2GB VPS is recommended.
            max_memory_restart: '900M',  // Restart if Node process exceeds 900MB

            // ── Logging ────────────────────────────────────────────────────
            out_file: './logs/pm2-out.log',
            error_file: './logs/pm2-error.log',
            log_file: './logs/pm2-combined.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,

            // ── Source Maps ────────────────────────────────────────────────
            source_map_support: false,

            // ── Graceful Shutdown ──────────────────────────────────────────
            // Gives active WhatsApp sessions 30s to finish before force-kill
            kill_timeout: 30000,
            wait_ready: false,
            listen_timeout: 15000,
        }
    ],

    // ── Deployment Config (optional: for pm2 deploy) ──────────────────────
    deploy: {
        production: {
            user: 'ubuntu',
            host: 'YOUR_VPS_IP',
            ref: 'origin/main',
            repo: 'git@github.com:YOUR_GITHUB/autoinvite.git',
            path: '/var/www/autoinvite',
            'pre-deploy-local': '',
            'post-deploy': 'npm install --omit=dev && pm2 reload ecosystem.config.js --env production',
            'pre-setup': ''
        }
    }
};
