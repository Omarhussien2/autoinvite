const db = require('./pg-client');
const bcrypt = require('bcrypt');

async function seedAdmin() {
    try {
        const username = 'admin';
        const name = 'مدير النظام';
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if admin exists
        const exists = await db.query('SELECT id FROM tenants WHERE username = $1', [username]);
        if (exists.rows.length === 0) {
            console.log('Inserting default admin tenant...');
            await db.query(
                'INSERT INTO tenants (name, username, password_hash, role, message_quota, settings) VALUES ($1, $2, $3, $4, $5, $6)',
                [name, username, hashedPassword, 'admin', 999999, JSON.stringify({ min_delay: 20, max_delay: 60, safe_mode: true })]
            );
            console.log('✅ Admin user created successfully (admin / admin123)');
        } else {
            // Ensure existing admin has correct role
            await db.query("UPDATE tenants SET role = 'admin', message_quota = 999999 WHERE username = $1", [username]);
            console.log('Admin user already exists. Role and quota ensured.');
        }
    } catch (err) {
        console.error('❌ Error seeding admin:', err.message);
    } finally {
        process.exit(0);
    }
}

seedAdmin();
