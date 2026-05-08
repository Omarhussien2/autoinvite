const HARD_DAILY_LIMIT = 200;

const SAFETY_PRESETS = {
    conservative: {
        firstDayFactor: 0.55,
        minDelaySeconds: 180,
        maxDelaySeconds: 360,
        breakAfterMessages: 20,
        breakMinMinutes: 15,
        breakMaxMinutes: 30,
    },
    balanced: {
        firstDayFactor: 0.7,
        minDelaySeconds: 120,
        maxDelaySeconds: 240,
        breakAfterMessages: 25,
        breakMinMinutes: 10,
        breakMaxMinutes: 20,
    },
    faster: {
        firstDayFactor: 0.85,
        minDelaySeconds: 90,
        maxDelaySeconds: 180,
        breakAfterMessages: 30,
        breakMinMinutes: 8,
        breakMaxMinutes: 15,
    },
};

const DAILY_VARIATION = [1, 0.92, 0.97, 0.9, 0.95, 0.88, 0.93];

function clamp(value, min, max) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

function parseBoolean(value) {
    return value === true || value === 'true' || value === '1' || value === 'on';
}

function parseClock(value, fallback) {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return fallback;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function minutesFromClock(value) {
    const [hours, minutes] = value.split(':').map(Number);
    return (hours * 60) + minutes;
}

function getSafetyPreset(mode) {
    return SAFETY_PRESETS[mode] || SAFETY_PRESETS.balanced;
}

function normalizeSmartScheduleOptions(input = {}, policy = {}) {
    const safetyMode = ['conservative', 'balanced', 'faster'].includes(input.safety_mode)
        ? input.safety_mode
        : 'balanced';
    const preset = getSafetyPreset(safetyMode);
    const tenantMaxDailyLimit = clamp(policy.maxDailyLimit || HARD_DAILY_LIMIT, 1, HARD_DAILY_LIMIT);
    const requestedDailyLimit = clamp(input.daily_limit || input.dailyLimit || 100, 1, HARD_DAILY_LIMIT);
    const dailyLimit = Math.min(requestedDailyLimit, tenantMaxDailyLimit, HARD_DAILY_LIMIT);
    const sendWindowStart = parseClock(input.send_window_start || input.sendWindowStart, '10:00');
    const sendWindowEnd = parseClock(input.send_window_end || input.sendWindowEnd, '20:00');
    const minDelaySeconds = clamp(input.min_delay_seconds || input.minDelaySeconds || preset.minDelaySeconds, 30, 1800);
    const maxDelaySeconds = Math.max(
        minDelaySeconds,
        clamp(input.max_delay_seconds || input.maxDelaySeconds || preset.maxDelaySeconds, 30, 2400)
    );
    const breakAfterMessages = clamp(input.break_after_messages || input.breakAfterMessages || preset.breakAfterMessages, 5, 100);
    const breakMinMinutes = clamp(input.break_min_minutes || input.breakMinMinutes || preset.breakMinMinutes, 1, 120);
    const breakMaxMinutes = Math.max(
        breakMinMinutes,
        clamp(input.break_max_minutes || input.breakMaxMinutes || preset.breakMaxMinutes, 1, 180)
    );

    return {
        enabled: parseBoolean(input.smart_schedule_enabled) || input.schedule_mode === 'smart',
        scheduleMode: input.schedule_mode === 'smart' ? 'smart' : (input.schedule_mode || 'immediate'),
        safetyMode,
        dailyLimit,
        sendWindowStart,
        sendWindowEnd,
        timezone: input.timezone || policy.timezone || 'Asia/Riyadh',
        minDelaySeconds,
        maxDelaySeconds,
        breakAfterMessages,
        breakMinMinutes,
        breakMaxMinutes,
        firstDayFactor: preset.firstDayFactor,
    };
}

function getWindowMinutes(startClock, endClock) {
    const start = minutesFromClock(startClock);
    const end = minutesFromClock(endClock);
    if (end > start) return end - start;
    return (24 * 60) - start + end;
}

function estimateWindowCapacity(options) {
    const windowSeconds = getWindowMinutes(options.sendWindowStart, options.sendWindowEnd) * 60;
    const averageDelay = (options.minDelaySeconds + options.maxDelaySeconds) / 2;
    const averageBreak = ((options.breakMinMinutes + options.breakMaxMinutes) / 2) * 60;
    const perMessageBreakCost = averageBreak / Math.max(1, options.breakAfterMessages);
    const estimatedSecondsPerMessage = Math.max(1, averageDelay + perMessageBreakCost);

    return Math.max(1, Math.floor(windowSeconds / estimatedSecondsPerMessage));
}

function getDateParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    return {
        year: parseInt(parts.find((part) => part.type === 'year').value, 10),
        month: parseInt(parts.find((part) => part.type === 'month').value, 10),
        day: parseInt(parts.find((part) => part.type === 'day').value, 10),
    };
}

function addDaysToParts(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

function zonedTimeToUtc(parts, clock, timeZone) {
    const [hours, minutes] = clock.split(':').map(Number);
    let utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0));

    for (let attempt = 0; attempt < 3; attempt++) {
        const formattedParts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(utc);

        const actual = {
            year: parseInt(formattedParts.find((part) => part.type === 'year').value, 10),
            month: parseInt(formattedParts.find((part) => part.type === 'month').value, 10),
            day: parseInt(formattedParts.find((part) => part.type === 'day').value, 10),
            hour: parseInt(formattedParts.find((part) => part.type === 'hour').value, 10) % 24,
            minute: parseInt(formattedParts.find((part) => part.type === 'minute').value, 10),
        };

        const desired = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes));
        const seen = new Date(Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute));
        const diffMs = desired.getTime() - seen.getTime();
        if (diffMs === 0) break;
        utc = new Date(utc.getTime() + diffMs);
    }

    return utc;
}

function buildSmartBatches(totalContacts, rawOptions = {}, now = new Date()) {
    const options = normalizeSmartScheduleOptions(rawOptions);
    const contactsCount = clamp(totalContacts, 0, Number.MAX_SAFE_INTEGER);
    if (contactsCount <= 0) return [];

    const windowCapacity = estimateWindowCapacity(options);
    const maxPerDay = Math.max(1, Math.min(options.dailyLimit, windowCapacity, HARD_DAILY_LIMIT));
    const startParts = getDateParts(rawOptions.startAt ? new Date(rawOptions.startAt) : now, options.timezone);
    const batches = [];
    let remaining = contactsCount;
    let startRow = 1;
    let dayIndex = 0;

    while (remaining > 0) {
        const isFirstDay = dayIndex === 0;
        const variation = DAILY_VARIATION[dayIndex % DAILY_VARIATION.length];
        const dayLimit = isFirstDay
            ? Math.max(1, Math.floor(maxPerDay * options.firstDayFactor))
            : Math.max(1, Math.floor(maxPerDay * variation));
        const messageCount = Math.min(remaining, dayLimit, HARD_DAILY_LIMIT);
        const dateParts = addDaysToParts(startParts, dayIndex);
        let scheduledAt = zonedTimeToUtc(dateParts, options.sendWindowStart, options.timezone);
        if (dayIndex === 0 && scheduledAt.getTime() <= now.getTime()) {
            scheduledAt = new Date(now.getTime() + 60 * 1000);
        }

        batches.push({
            batchNumber: dayIndex + 1,
            startRow,
            endRow: startRow + messageCount - 1,
            messageCount,
            scheduledAt,
            sendWindowStart: options.sendWindowStart,
            sendWindowEnd: options.sendWindowEnd,
            timezone: options.timezone,
            dailyLimit: options.dailyLimit,
            minDelaySeconds: options.minDelaySeconds,
            maxDelaySeconds: options.maxDelaySeconds,
            breakAfterMessages: options.breakAfterMessages,
            breakMinMinutes: options.breakMinMinutes,
            breakMaxMinutes: options.breakMaxMinutes,
            safetyMode: options.safetyMode,
        });

        remaining -= messageCount;
        startRow += messageCount;
        dayIndex++;
    }

    return batches;
}

module.exports = {
    HARD_DAILY_LIMIT,
    SAFETY_PRESETS,
    normalizeSmartScheduleOptions,
    estimateWindowCapacity,
    buildSmartBatches,
    zonedTimeToUtc,
};
