const test = require('node:test');
const assert = require('node:assert/strict');

const {
    HARD_DAILY_LIMIT,
    normalizeSmartScheduleOptions,
    buildSmartBatches,
    assignPlanToRecipientRows,
    estimateWindowCapacity,
} = require('../src/utils/smartScheduler');

test('normalizes smart schedule options with a hard 200 daily cap', () => {
    const options = normalizeSmartScheduleOptions({
        smart_schedule_enabled: 'true',
        daily_limit: 500,
        safety_mode: 'faster',
        send_window_start: '9:5',
        send_window_end: '21:00',
        min_delay_seconds: 10,
        max_delay_seconds: 20,
    });

    assert.equal(options.enabled, true);
    assert.equal(options.dailyLimit, HARD_DAILY_LIMIT);
    assert.equal(options.sendWindowStart, '10:00');
    assert.equal(options.sendWindowEnd, '21:00');
    assert.equal(options.minDelaySeconds, 30);
    assert.equal(options.maxDelaySeconds, 30);
});

test('respects admin tenant daily limit below the platform cap', () => {
    const options = normalizeSmartScheduleOptions({
        smart_schedule_enabled: true,
        daily_limit: 200,
    }, {
        maxDailyLimit: 75,
    });

    assert.equal(options.dailyLimit, 75);
});

test('splits contacts into contiguous batches without exceeding the daily limit', () => {
    const batches = buildSmartBatches(950, {
        smart_schedule_enabled: true,
        daily_limit: 200,
        safety_mode: 'balanced',
        send_window_start: '10:00',
        send_window_end: '22:00',
        min_delay_seconds: 30,
        max_delay_seconds: 45,
        timezone: 'Africa/Cairo',
    }, new Date('2026-05-07T08:00:00.000Z'));

    assert.ok(batches.length > 1);
    assert.equal(batches[0].startRow, 1);
    assert.equal(batches[batches.length - 1].endRow, 950);

    for (let index = 0; index < batches.length; index++) {
        assert.ok(batches[index].messageCount <= HARD_DAILY_LIMIT);
        if (index > 0) {
            assert.equal(batches[index].startRow, batches[index - 1].endRow + 1);
        }
    }
});

test('reduces daily batch size when the send window cannot fit the requested limit', () => {
    const options = normalizeSmartScheduleOptions({
        smart_schedule_enabled: true,
        daily_limit: 200,
        send_window_start: '10:00',
        send_window_end: '11:00',
        min_delay_seconds: 300,
        max_delay_seconds: 300,
        break_after_messages: 10,
        break_min_minutes: 10,
        break_max_minutes: 10,
    });
    const capacity = estimateWindowCapacity(options);
    const batches = buildSmartBatches(100, options, new Date('2026-05-07T08:00:00.000Z'));

    assert.ok(capacity < 200);
    assert.ok(batches.every((batch) => batch.messageCount <= capacity));
});

test('starts smart scheduling on the next day when the send window already ended', () => {
    const batches = buildSmartBatches(25, {
        smart_schedule_enabled: true,
        daily_limit: 100,
        send_window_start: '10:00',
        send_window_end: '20:00',
        min_delay_seconds: 30,
        max_delay_seconds: 30,
        timezone: 'Asia/Riyadh',
    }, new Date('2026-05-08T19:30:00.000Z'));

    assert.equal(batches[0].scheduledAt.toISOString(), '2026-05-09T07:00:00.000Z');
});

test('approved batches span the actual remaining recipient rows without dropping gaps', () => {
    const batches = assignPlanToRecipientRows([
        { batchNumber: 1, messageCount: 2 },
        { batchNumber: 2, messageCount: 2 },
    ], [
        { phone: '111', sourceRow: 2 },
        { phone: '222', sourceRow: 4 },
        { phone: '333', sourceRow: 5 },
        { phone: '444', sourceRow: 8 },
    ]);

    assert.deepEqual(batches.map(batch => [batch.startRow, batch.endRow]), [[2, 4], [5, 8]]);
    assert.equal(batches.reduce((sum, batch) => sum + batch.messageCount, 0), 4);
});
