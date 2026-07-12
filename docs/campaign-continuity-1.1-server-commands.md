# Campaign Continuity 1.1 — Server Command Checklist

These commands are prepared but were not executed during local acceptance.

## Capture versions and state

```bash
cd /root/autoinvite
node --version
npm --version
psql --version
sudo -u postgres psql -d autoinvite -Atc "SHOW server_version;"
pm2 describe autoinvite
nginx -t
git status --short --branch
git rev-parse HEAD
```

## Verify the server worktree before pulling

```bash
test -z "$(git status --porcelain)"
git fetch origin
git log --oneline HEAD..origin/main
```

Stop if the worktree is dirty.

## Validate schema and gates

```bash
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 <<'SQL'
SELECT to_regclass('public.campaign_recipients');
SELECT status, COUNT(*) FROM campaign_recipients GROUP BY status ORDER BY status;
SELECT COUNT(*) FROM tenants WHERE messaging_enabled = TRUE;
SELECT COUNT(*) FROM campaigns WHERE stop_requested_at IS NOT NULL;
SELECT COUNT(*) FROM campaign_recipients WHERE status = 'sending' AND claimed_at < NOW() - INTERVAL '15 minutes';
SQL
```

## Validate application after approved deployment

```bash
cd /root/autoinvite
pm2 stop autoinvite
mkdir -p /root/backups
BACKUP_FILE="/root/backups/autoinvite_before_campaign_continuity_1_1_$(date +%Y%m%d_%H%M%S).dump"
sudo -u postgres pg_dump -Fc autoinvite > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
git checkout main
git pull --ff-only origin main
npm ci
npm test
npm audit --audit-level=high
npm run db:migrate
npm run db:migrate
npm run build:landing
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE tenants SET messaging_enabled = FALSE;
UPDATE campaigns
SET status = CASE WHEN status IN ('running', 'scheduled') THEN 'paused' ELSE status END,
    paused_reason = CASE WHEN status IN ('running', 'scheduled') THEN 'release_deploy' ELSE paused_reason END,
    stop_requested_at = CASE WHEN status IN ('running', 'scheduled') THEN NOW() ELSE stop_requested_at END;
UPDATE campaign_batches
SET status = CASE WHEN status IN ('running', 'scheduled') THEN 'paused' ELSE status END
WHERE status IN ('running', 'scheduled');
COMMIT;
SQL
node <<'NODE'
const db = require('./src/database/pg-client');
const scheduler = require('./src/core/ScheduleManager');
(async () => {
  await scheduler.start();
  const { rows } = await db.query(`
    SELECT DISTINCT campaign.id, campaign.tenant_id
    FROM campaigns campaign
    LEFT JOIN campaign_batches batch ON batch.campaign_id = campaign.id
    WHERE campaign.schedule_job_id IS NOT NULL OR batch.schedule_job_id IS NOT NULL
  `);
  for (const campaign of rows) await scheduler.requestStop(campaign.id, campaign.tenant_id);
  await scheduler.stop();
  await db.pool.end();
  console.log(`Cancelled durable jobs for ${rows.length} campaigns.`);
})().catch(async error => {
  console.error(error);
  await scheduler.stop().catch(() => {});
  await db.pool.end().catch(() => {});
  process.exit(1);
});
NODE
pm2 restart autoinvite --update-env
pm2 status autoinvite
pm2 logs autoinvite --lines 150 --nostream
curl -fsS https://www.inviteauto.com/login >/dev/null
```

## Emergency stop

```bash
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 \
  -c "UPDATE tenants SET messaging_enabled = FALSE;"
pm2 restart autoinvite --update-env
```
