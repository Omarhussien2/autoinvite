# Campaign Continuity 1.1 — Rollback Runbook

Use this runbook if Campaign Continuity 1.1 causes incorrect claims, unexpected sends, session instability, or UI/API failures.

## Immediate containment

Disable all messaging before changing code:

```bash
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE tenants SET messaging_enabled = FALSE;
UPDATE campaigns
SET stop_requested_at = COALESCE(stop_requested_at, NOW()),
    status = CASE WHEN status IN ('running', 'scheduled') THEN 'paused' ELSE status END,
    paused_reason = CASE WHEN status IN ('running', 'scheduled') THEN 'release_rollback' ELSE paused_reason END;
UPDATE campaign_batches
SET status = CASE WHEN status IN ('running', 'scheduled') THEN 'paused' ELSE status END,
    schedule_job_id = NULL
WHERE status IN ('running', 'scheduled');
COMMIT;
SQL
pm2 stop autoinvite
```

## Restore application code

```bash
cd /root/autoinvite
git fetch origin
git checkout <ROLLBACK_COMMIT>
npm ci
npm test
npm run build:landing
pm2 restart autoinvite --update-env
pm2 logs autoinvite --lines 150 --nostream
```

## Database policy

Campaign Continuity migrations are additive. Do not drop `campaign_recipients`, columns, constraints, or recipient history during normal rollback. The prior application version can ignore the additional schema.

Restore the database dump only for confirmed data corruption and only with a separately approved maintenance window:

```bash
pm2 stop autoinvite
sudo -u postgres pg_restore --clean --if-exists --dbname=autoinvite <BACKUP_FILE>
pm2 restart autoinvite --update-env
```

## Post-rollback checks

```bash
pm2 status autoinvite
curl -fsS https://www.inviteauto.com/login >/dev/null
sudo -u postgres psql -d autoinvite -Atc \
  "SELECT COUNT(*) FROM tenants WHERE messaging_enabled = TRUE;"
```

Expected enabled count after containment: `0`. Re-enable tenants individually only after root cause review.
