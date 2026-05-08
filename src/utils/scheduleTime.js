const { zonedTimeToUtc } = require('./smartScheduler');

const FALLBACK_TIMEZONE = 'Asia/Riyadh';

function isValidTimezone(timezone) {
    if (!timezone || typeof timezone !== 'string') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return true;
    } catch (_) {
        return false;
    }
}

function getDefaultTimezone() {
    const configured = process.env.DEFAULT_TIMEZONE || process.env.TZ;
    return isValidTimezone(configured) ? configured : FALLBACK_TIMEZONE;
}

function normalizeTimezone(timezone, fallback = getDefaultTimezone()) {
    return isValidTimezone(timezone) ? timezone : fallback;
}

function parseLocalDateTime(value) {
    if (!value || typeof value !== 'string') return null;

    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
    const parts = {
        year: parseInt(yearRaw, 10),
        month: parseInt(monthRaw, 10),
        day: parseInt(dayRaw, 10),
    };
    const hour = parseInt(hourRaw, 10);
    const minute = parseInt(minuteRaw, 10);

    const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute));
    const isValidDate = probe.getUTCFullYear() === parts.year
        && probe.getUTCMonth() + 1 === parts.month
        && probe.getUTCDate() === parts.day
        && probe.getUTCHours() === hour
        && probe.getUTCMinutes() === minute;

    if (!isValidDate) return null;

    return {
        parts,
        clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
}

function hasExplicitOffset(value) {
    return typeof value === 'string' && /(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function parseScheduledAtFromBody(body = {}) {
    const timezone = normalizeTimezone(body.timezone);
    const localRaw = body.scheduled_at_local
        || (!hasExplicitOffset(body.scheduled_at) ? body.scheduled_at : null);
    const scheduledRaw = body.scheduled_at;

    if (localRaw && String(localRaw).trim() !== '') {
        const local = parseLocalDateTime(String(localRaw));
        if (!local) {
            const err = new Error('Invalid scheduled time');
            err.statusCode = 400;
            throw err;
        }

        return {
            isScheduled: true,
            scheduledAt: zonedTimeToUtc(local.parts, local.clock, timezone),
            timezone,
        };
    }

    if (!scheduledRaw || String(scheduledRaw).trim() === '') {
        return { isScheduled: false, scheduledAt: null, timezone: null };
    }

    const scheduledAt = new Date(scheduledRaw);
    if (Number.isNaN(scheduledAt.getTime())) {
        const err = new Error('Invalid scheduled time');
        err.statusCode = 400;
        throw err;
    }

    return {
        isScheduled: true,
        scheduledAt,
        timezone,
    };
}

module.exports = {
    FALLBACK_TIMEZONE,
    getDefaultTimezone,
    normalizeTimezone,
    parseLocalDateTime,
    parseScheduledAtFromBody,
};
