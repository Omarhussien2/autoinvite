const qrcode = require('qrcode-terminal');
const readline = require('readline');
const { client, loadContacts, processBatch } = require('./core');

// Helper function to ask questions
function askQuestion(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE TO LOGIN:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n>>> Client is ready! Starting automation...\n');
    startCLI();
});

client.initialize();

async function startCLI() {
    try {
        // 1. Read CSV Data
        const contacts = await loadContacts();
        console.log(`Loaded ${contacts.length} contacts.`);

        // 2. Create readline interface for user input
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const startRowStr = await askQuestion(rl, 'Start at row number? (default: 1): ');
        const endRowStr = await askQuestion(rl, `End at row number? (Max: ${contacts.length}, default: ${contacts.length}): `);

        const startRow = parseInt(startRowStr) || 1;
        const endRow = parseInt(endRowStr) || contacts.length;

        rl.close();

        // 3. Process Batch
        await processBatch(contacts, startRow, endRow, (msg, type) => {
            // Simple console.log wrapper for CLI
            // We can colorize based on type if needed, but keeping it simple
            console.log(msg);
        });

        process.exit(0);

    } catch (error) {
        console.error('Error starting CLI:', error);
        process.exit(1);
    }
}
