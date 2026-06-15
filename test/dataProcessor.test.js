const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { loadContacts, normalizePhone, processContacts, repairContactsFile } = require('../src/utils/dataProcessor');
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

test('loadContacts: detects phone column from values when headers are non-standard', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-test-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(
        file,
        'Status,Full Name,WhatsApp,Notes\nnew,Laila Hassan,+966532094995,vip\nnew,وسام الشامي,0506305383,\n',
        'utf8'
    );

    const contacts = await loadContacts(file);
    assert.deepEqual(contacts, [
        { Name: 'Laila Hassan', Phone: '+966532094995' },
        { Name: 'وسام الشامي', Phone: '0506305383' },
    ]);
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

test('repairContactsFile: rewrites messy exports to normalized campaign-ready CSV', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-repair-'));
    const file = path.join(dir, 'contacts.csv');
    await fs.writeFile(
        file,
        'الورقة1\nاسم العميل,رقم الجوال,وسام الشامي,+966532094995,أيوب أبو سلمان,+966506305383,مكرر,+966506305383,خطأ,123\n',
        'utf8'
    );

    const result = await repairContactsFile(file);
    const rewritten = await fs.readFile(file, 'utf8');

    assert.equal(result.report.validCount, 2);
    assert.equal(result.report.duplicateCount, 1);
    assert.equal(result.report.invalidCount, 1);
    assert.equal(result.report.repairedFormat, true);
    assert.equal(rewritten, 'Name,Phone\nوسام الشامي,966532094995\nأيوب أبو سلمان,966506305383\n');
});

test('repairContactsFile: writes Excel uploads to a readable clean CSV path', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-xlsx-repair-'));
    const file = path.join(dir, 'contacts.xlsx');
    const minimalXlsxBase64 = 'UEsDBBQAAAAIAK6Ez1ywXVXT/gAAADMCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK1RvU7DMBDeeQrLaxU7ZUAINe1QYASG8gCHfUms+E8+t6Rvj5NCB1QQA9Pp7vuVvdqMzrIDJjLBN3wpas7Qq6CN7xr+unusbjmjDF6DDR4bfkTim/XVaneMSKyIPTW8zzneSUmqRwckQkRfkDYkB7msqZMR1AAdyuu6vpEq+Iw+V3ny4MXsHlvY28wexnI/NUloibPtiTmFNRxitEZBLrg8eP0tpvqMEEU5c6g3kRaFwOXliAn6OeFL+FweJxmN7AVSfgJXaHK08j2k4S2EQfzucqFnaFujUAe1d0UiKCYETT1idlbMUzgwfvGHAjOb5DyW/9zk7H8uIuc/X38AUEsDBBQAAAAIAK6Ez1x+b8CFsQAAACoBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCdU0TeaVoGhFBDF4TUFZUDhNR9qEkcJQHa25MRKgZGy/4/22U1G82e6MNIVkCR5cDQKmpH2wu4NZftAViI0rZSk0UBCwaoTpvyilrGlAnD6AJLiA0ChhjdkfOgBjQyZOTQpk5H3siYSt9zJ9Uke+S7PN9z/2nACmV1K8DXbQGsWRz+g1PXjQrPpB4GbfyxYzWRZOl7jAJmzV/kpzvRlCUUeDqGf714egNQSwMEFAAAAAgAroTPXG8lzyC0AAAAKwEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc43PzQrCMAwA4LtPUXJ32TyIyLpdRNhV5gOULvthW1ua+rO3t3gQFQ+eQhLyJcnL+zyJK3kerJGQJSkIMto2g+kknOvjegeCgzKNmqwhCQsxlMUqP9GkQpzhfnAsImJYQh+C2yOy7mlWnFhHJnZa62cVYuo7dEqPqiPcpOkW/bsBX6ioGgm+ajIQ9eLoH9y27aDpYPVlJhN+7MCb9SP3RCGiyncUJLxKjM+QJVEFjNfgx4/FA1BLAwQUAAAACACuhM9cdPlqlr8AAAAeAQAADwAAAHhsL3dvcmtib29rLnhtbI1PMW7DMAzc8wqBeyO7Q1EYtrMUBTKneYBq0bEQizRIpU1+H6Zu9053xOGOd+3ummf3haKJqYN6W4FDGjgmOnVw/Hh/egWnJVAMMxN2cEOFXb9pv1nOn8xnZ37SDqZSlsZ7HSbMQbe8IJkysuRQ7JST10UwRJ0QS579c1W9+BwSwZrQyH8yeBzTgG88XDJSWUME51CsvU5pUbBqPy+0X9FRyFb78OC1TXngPtpScNIkI7KPNfi+9b+2Tev/tvV3UEsDBBQAAAAIAK6Ez1z/tOcI9AAAACsCAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1slZFBS8QwEIXv/oowV3GTbWzZSpqgiHjwpv6AoY3bYJuUTHD135stUj1sF8xp8ob3vgejzOc4sA8byQXfwHYjgFnfhs75fQOvLw9XO2CU0Hc4BG8b+LIERl+oQ4jv1FubWA7w1ECf0nTDObW9HZE2YbI+b95CHDHlb9xzmqLFbjaNAy+EqPiIzkNOm8V7TJjnGA4s5iqgVXscbrfAUgPOD87b5xSz7kirpI0xzMxP8aQVP6q8/XHd/dfFM/eXXiz0Yj3nHH7NdllXVSkLUV/XdXmugVwayJWoJ3QDskckQn+qwppPlKKSopQ7eZLP/x6DL3fW31BLAQIUABQAAAAIAK6Ez1ywXVXT/gAAADMCAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAAAAgAroTPXH5vwIWxAAAAKgEAAAsAAAAAAAAAAAAAAIABLwEAAF9yZWxzLy5yZWxzUEsBAhQAFAAAAAgAroTPXG8lzyC0AAAAKwEAABoAAAAAAAAAAAAAAIABCQIAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQAFAAAAAgAroTPXHT5apa/AAAAHgEAAA8AAAAAAAAAAAAAAIAB9QIAAHhsL3dvcmtib29rLnhtbFBLAQIUABQAAAAIAK6Ez1z/tOcI9AAAACsCAAAYAAAAAAAAAAAAAACAAeEDAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwUGAAAAAAUABQBFAQAACwUAAAAA';
    await fs.writeFile(file, Buffer.from(minimalXlsxBase64, 'base64'));

    const result = await repairContactsFile(file);
    const repairedContacts = await loadContacts(result.filePath);

    assert.equal(path.extname(result.filePath), '.csv');
    assert.equal(result.filePath.endsWith('contacts.clean.csv'), true);
    assert.deepEqual(repairedContacts.map(contact => contact.Phone), ['966532094995', '966506305383']);
});

test('loadContacts: reads legacy repaired CSV content saved with xlsx extension', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoinvite-legacy-xlsx-'));
    const file = path.join(dir, 'contacts.xlsx');
    await fs.writeFile(file, 'Name,Phone\nWesam,+966532094995\nAyoub,+966506305383\n', 'utf8');

    const contacts = await loadContacts(file);

    assert.deepEqual(contacts, [
        { Name: 'Wesam', Phone: '+966532094995' },
        { Name: 'Ayoub', Phone: '+966506305383' },
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
