const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { loadContacts, normalizePhone, processContacts } = require('../src/utils/dataProcessor');
const { normalizeMessageTemplates, pickWeightedMessage } = require('../src/utils/messageTemplates');

// ────────────────────────── Phone Normalization ──────────────────────────

test('normalizePhone: Saudi 05x format → 9665x', () => {
    assert.equal(normalizePhone('0501234567'), '966501234567');
});

test('normalizePhone: Saudi 5x format → 9665x', () => {
    assert.equal(normalizePhone('501234567'), '966501234567');
});

test('normalizePhone: Saudi 966 already present → keep', () => {
    assert.equal(normalizePhone('966501234567'), '966501234567');
});

test('normalizePhone: Egyptian 01x format → 201x', () => {
    assert.equal(normalizePhone('01012345678'), '201012345678');
});

test('normalizePhone: Egyptian without leading zero → 201x', () => {
    assert.equal(normalizePhone('1152806034'), '201152806034');
});

test('normalizePhone: Egyptian 20 prefix already present → keep', () => {
    assert.equal(normalizePhone('201012345678'), '201012345678');
});

test('normalizePhone: strips +, spaces, dashes', () => {
    assert.equal(normalizePhone('+966 50 123 4567'), '966501234567');
    assert.equal(normalizePhone('966-50-123-4567'), '966501234567');
});

test('normalizePhone: returns null for invalid phones', () => {
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('abc'), null);
});

test('normalizePhone: handles number passed as numeric type', () => {
    assert.equal(normalizePhone(501234567), '966501234567');
});

// ────────────────────────── Contact File Loading ──────────────────────────

test('loadContacts: loads standard CSV with Name,Phone headers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-test-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(file, 'Name,Phone\nأحمد,0501234567\nفهد,0512345678\n', 'utf8');

    const contacts = await loadContacts(file);
    assert.equal(contacts.length, 2);
    assert.equal(contacts[0].Name, 'أحمد');
    assert.equal(contacts[0].Phone, '0501234567');
});

test('loadContacts: loads Arabic-header CSV (الاسم, رقم الجوال)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-test-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(file, 'الاسم,رقم الجوال\nأحمد,0501234567\nفهد,0512345678\n', 'utf8');

    const contacts = await loadContacts(file);
    assert.equal(contacts.length, 2);
    assert.equal(contacts[0].Name, 'أحمد');
    assert.equal(contacts[0].Phone, '0501234567');
});

test('loadContacts: loads flat exported contacts with all data in one field', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-contacts-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(file, 'اتصالات\nName,Phone,أحمد محمد,1152806034,فهد العلي,1128804114,Laila Hassan,1152806034\n', 'utf8');

    const contacts = await loadContacts(file);

    assert.deepEqual(contacts, [
        { Name: 'أحمد محمد', Phone: '1152806034' },
        { Name: 'فهد العلي', Phone: '1128804114' },
        { Name: 'Laila Hassan', Phone: '1152806034' },
    ]);
});

test('loadContacts: handles sheet-name prefix before Arabic customer headers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-contacts-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(
        file,
        'الورقة1\nاسم العميل,رقم الجوال,وسام الشامي,+966532094995,أيوب أبو سلمان,+966506305383\n',
        'utf8'
    );

    const contacts = await loadContacts(file);

    assert.deepEqual(contacts, [
        { Name: 'وسام الشامي', Phone: '+966532094995' },
        { Name: 'أيوب أبو سلمان', Phone: '+966506305383' },
    ]);
});

test('loadContacts: handles BOM and mixed delimiters', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-test-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(file, '\uFEFFName;Phone\nأحمد;0501234567\nفهد;0512345678\n', 'utf8');

    const contacts = await loadContacts(file);
    assert.equal(contacts.length, 2);
});

// ────────────────────────── Contact Processing ──────────────────────────

test('processContacts: deduplicates by normalized phone', () => {
    const contacts = [
        { Name: 'أحمد', Phone: '0501234567' },
        { Name: 'محمد', Phone: '+966501234567' },  // same number
        { Name: 'فهد', Phone: '0512345678' },
    ];

    const result = processContacts(contacts);
    assert.equal(result.valid.length, 2);
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.duplicates[0].name, 'محمد');
});

test('processContacts: filters invalid phones', () => {
    const contacts = [
        { Name: 'أحمد', Phone: '0501234567' },
        { Name: 'خطأ', Phone: '123' },
    ];

    const result = processContacts(contacts);
    assert.equal(result.valid.length, 1);
    assert.equal(result.invalid.length, 1);
});

// ────────────────────────── Message Templates ──────────────────────────

test('normalizeMessageTemplates: parses JSON string', () => {
    const input = '[{"text":"hello [الاسم]","weight":2}]';
    const result = normalizeMessageTemplates(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'hello [الاسم]');
    assert.equal(result[0].weight, 2);
});

test('normalizeMessageTemplates: handles plain string array', () => {
    const input = ['hello', 'world'];
    const result = normalizeMessageTemplates(input);
    assert.equal(result.length, 2);
    assert.equal(result[0].weight, 1);
});

test('normalizeMessageTemplates: filters empty messages', () => {
    const input = [{ text: 'hello' }, { text: '' }, { text: '   ' }];
    const result = normalizeMessageTemplates(input);
    assert.equal(result.length, 1);
});

test('pickWeightedMessage: replaces [الاسم] with contact name', () => {
    const messages = [{ text: 'حياك الله يا [الاسم]', weight: 1 }];
    const result = pickWeightedMessage(messages, 'أحمد', 0);
    assert.equal(result, 'حياك الله يا أحمد');
});

test('pickWeightedMessage: replaces {{name}} placeholder', () => {
    const messages = [{ text: 'Hello {{name}}, welcome!', weight: 1 }];
    const result = pickWeightedMessage(messages, 'Ahmed', 0);
    assert.equal(result, 'Hello Ahmed, welcome!');
});

test('pickWeightedMessage: returns empty string for empty messages', () => {
    const result = pickWeightedMessage([], 'test', 0);
    assert.equal(result, '');
});
