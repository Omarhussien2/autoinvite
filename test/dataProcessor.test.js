const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { loadContacts, normalizePhone } = require('../src/utils/dataProcessor');

test('loads flat exported contact files that contain Name,Phone pairs in one field', async () => {
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

test('normalizes Egyptian local numbers without the leading zero', () => {
    assert.equal(normalizePhone('1152806034'), '201152806034');
});
