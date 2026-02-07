const { normalizePhone } = require('./src/utils/normalizer');
const { generateImage } = require('./src/utils/generator');
const fs = require('fs-extra');
const path = require('path');

async function test() {
    console.log('--- Testing Normalizer ---');
    const cases = [
        { input: '0561234567', expected: '966561234567' },
        { input: '561234567', expected: '966561234567' },
        { input: '966561234567', expected: '966561234567' },
        { input: '+966561234567', expected: '966561234567' },
        { input: '12345', expected: null },
        { input: '96612345678', expected: null },
    ];

    let passed = 0;
    for (const c of cases) {
        const res = normalizePhone(c.input);
        if (res === c.expected) {
            console.log(`PASS: ${c.input} -> ${res}`);
            passed++;
        } else {
            console.error(`FAIL: ${c.input} -> ${res} (Expected: ${c.expected})`);
        }
    }
    console.log(`Normalizer Result: ${passed}/${cases.length} passed.`);

    console.log('\n--- Testing Image Generator ---');
    try {
        const dummyName = 'Test User';
        const dummyPhone = '999999999';
        const outPath = await generateImage(dummyName, dummyPhone);

        if (fs.existsSync(outPath)) {
            console.log(`PASS: Image generated at ${outPath}`);
            // Check file size > 0
            const stats = fs.statSync(outPath);
            console.log(`Image Size: ${stats.size} bytes`);

            // Cleanup
            // await fs.remove(outPath); 
        } else {
            console.error('FAIL: Image file not found.');
        }
    } catch (error) {
        console.error('FAIL: Image generation validation error:', error);
    }
}

test();
