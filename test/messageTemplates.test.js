const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeMessageTemplates,
    buildWeightedSequence,
    pickWeightedMessage,
} = require('../src/utils/messageTemplates');

test('normalizes message templates from JSON strings and alternate text keys', () => {
    const messages = normalizeMessageTemplates(JSON.stringify([
        { text: 'A {name}', weight: '3' },
        { content: 'B {{name}}', weight: 2 },
        { message: 'C [الاسم]', weight: 1 },
    ]));

    assert.deepEqual(messages.map((message) => message.weight), [3, 2, 1]);
    assert.deepEqual(messages.map((message) => message.text), ['A {name}', 'B {{name}}', 'C [الاسم]']);
});

test('uses deterministic weighted rotation instead of repeatedly picking the first message', () => {
    const messages = normalizeMessageTemplates([
        { text: 'A {name}', weight: 3 },
        { text: 'B {name}', weight: 2 },
        { text: 'C {name}', weight: 1 },
    ]);

    assert.deepEqual(buildWeightedSequence(messages), [0, 1, 0, 2, 1, 0]);
    const picked = Array.from({ length: 6 }, (_, index) => pickWeightedMessage(messages, 'Omar', index));
    assert.deepEqual(picked, ['A Omar', 'B Omar', 'A Omar', 'C Omar', 'B Omar', 'A Omar']);
});
