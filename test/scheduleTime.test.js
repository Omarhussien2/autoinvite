const test = require('node:test');
const assert = require('node:assert/strict');

const { parseScheduledAtFromBody } = require('../src/utils/scheduleTime');

test('parses local scheduled time in the submitted timezone', () => {
    const parsed = parseScheduledAtFromBody({
        scheduled_at_local: '2026-05-08T15:30',
        timezone: 'Asia/Riyadh',
    });

    assert.equal(parsed.isScheduled, true);
    assert.equal(parsed.timezone, 'Asia/Riyadh');
    assert.equal(parsed.scheduledAt.toISOString(), '2026-05-08T12:30:00.000Z');
});

test('keeps explicit UTC scheduled_at values backwards compatible', () => {
    const parsed = parseScheduledAtFromBody({
        scheduled_at: '2026-05-08T12:30:00.000Z',
        timezone: 'Asia/Riyadh',
    });

    assert.equal(parsed.isScheduled, true);
    assert.equal(parsed.scheduledAt.toISOString(), '2026-05-08T12:30:00.000Z');
});
