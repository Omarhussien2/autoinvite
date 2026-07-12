# Campaign Continuity 1.1 — Deployment Runbook

Do not execute this runbook without explicit release-owner approval.

## Preconditions

1. Confirm the acceptance report permits locked deployment.
2. Confirm the release commit excludes `src/middleware/quotaGuard.js`.
3. Record `RELEASE_COMMIT` and `ROLLBACK_COMMIT`.
4. Confirm a PostgreSQL backup path with sufficient free disk space.
5. Keep all tenants at `messaging_enabled=false` through migration and smoke tests.

## Read-only server verification

```bash
cd /root/autoinvite
node --version
npm --version
psql --version
sudo -u postgres psql -d autoinvite -Atc "SHOW server_version;"
pm2 describe autoinvite
git status --short --branch
git rev-parse HEAD
```

Stop if the worktree is dirty, the current commit is unknown, or Node cannot install Canvas.

## Stop and backup

```bash
pm2 stop autoinvite
export BACKUP_FILE="/root/backups/autoinvite_before_campaign_continuity_1_1_$(date +%Y%m%d_%H%M%S).dump"
mkdir -p /root/backups
sudo -u postgres pg_dump -Fc autoinvite > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
```

## Install and validate without starting sends

```bash
cd /root/autoinvite
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm test
npm audit --audit-level=high
npm run db:migrate
npm run db:migrate
npm run build:landing
```

Disable messaging before application restart:

```bash
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE tenants SET messaging_enabled = FALSE;
UPDATE campaigns
SET status = CASE WHEN status IN ('running', 'scheduled') THEN 'paused' ELSE status END,
    paused_reason = CASE WHEN status IN ('running', 'scheduled') THEN 'release_deploy' ELSE paused_reason END,
    stop_requested_at = CASE WHEN status IN ('running', 'scheduled') THEN NOW() ELSE stop_requested_at END,
    schedule_job_id = CASE WHEN status IN ('running', 'scheduled') THEN NULL ELSE schedule_job_id END;
UPDATE campaign_batches
SET status = CASE WHEN status IN ('running', 'scheduled') THEN 'paused' ELSE status END,
    schedule_job_id = NULL
WHERE status IN ('running', 'scheduled');
COMMIT;
SQL
```

## Restart and smoke test

```bash
pm2 restart autoinvite --update-env
pm2 status autoinvite
pm2 logs autoinvite --lines 150 --nostream
curl -fsS https://www.inviteauto.com/login >/dev/null
```

Verify migrations and the global send gate:

```bash
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 <<'SQL'
SELECT to_regclass('public.campaign_recipients');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'campaigns' AND column_name IN ('stop_requested_at', 'plan_hash', 'plan_approved_at')
ORDER BY column_name;
SELECT COUNT(*) AS enabled_tenants FROM tenants WHERE messaging_enabled = TRUE;
SQL
```

Expected `enabled_tenants`: `0`.

## Staging tenant validation

Use a dedicated tenant, campaign, WhatsApp account, and one-number CSV. Do not reuse a customer campaign.

1. Keep the tenant at `messaging_enabled=false`.
2. Run preflight and confirm 684-row dry-run behavior where applicable.
3. Confirm Start produces no recipient claim and no outbound message.
4. Test Stop, Restart, CSV exports, execution snapshots, fixed batches, and Smart Schedule.
5. Enable a single staging tenant only after separate written authorization for the single-number send.

## Production enablement

Enable tenants individually only after WhatsApp is restored and connected. Existing campaigns must then be saved, checked in Preflight, and approved again before starting:

```bash
sudo -u postgres psql -d autoinvite -v ON_ERROR_STOP=1 \
  -v tenant_id='<APPROVED_TENANT_UUID>' <<'SQL'
UPDATE tenants
SET messaging_enabled = TRUE
WHERE id = :'tenant_id';
SQL
```

Monitor PM2 logs, campaign recipient states, duplicate counts, and `needs_review`. Stop enablement immediately on any unexplained send or session loss.
