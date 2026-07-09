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

test('renders common Arabic and English name placeholder variants', () => {
    const name = '\u0623\u062d\u0645\u062f';
    const examples = [
        ['\u064a\u0627 {\u0627\u0644\u0627\u0633\u0645}', `\u064a\u0627 ${name}`],
        ['\u062d\u064a\u0627\u0643 {{\u0627\u0644\u0625\u0633\u0645}}', `\u062d\u064a\u0627\u0643 ${name}`],
        ['\u0645\u0631\u062d\u0628\u0627 [\u0627\u0633\u0645]', `\u0645\u0631\u062d\u0628\u0627 ${name}`],
        ['\u0623\u0647\u0644\u0627 {{\u0627\u0644\u0636\u064a\u0641}}', `\u0623\u0647\u0644\u0627 ${name}`],
        ['Hello [name]', `Hello ${name}`],
        ['Guest {guest}', `Guest ${name}`],
    ];

    for (const [template, expected] of examples) {
        assert.equal(pickWeightedMessage([{ text: template }], name, 0), expected);
    }
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
