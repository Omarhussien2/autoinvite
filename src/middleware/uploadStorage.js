const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure tenantId is present
        if (!req.tenantId) {
            return cb(new Error('Tenant scope required for upload'), null);
        }

        // Isolate storage per tenant
        const tenantDir = path.join(process.env.DATA_DIR || path.join(__dirname, '../../'), 'storage', `tenant_${req.tenantId}`, 'uploads');
        
        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }
        
        cb(null, tenantDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

module.exports = { upload };
