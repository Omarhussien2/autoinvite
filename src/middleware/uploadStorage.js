const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_CONTACT_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/webm', 'video/ogg'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!req.tenantId) {
            return cb(new Error('Tenant scope required for upload'), null);
        }

        const tenantDir = path.join(process.env.DATA_DIR || path.join(__dirname, '../../'), 'storage', `tenant_${req.tenantId}`, 'uploads');

        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }

        cb(null, tenantDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, uniqueSuffix + ext);
    }
});

function fileFilter(req, file, cb) {
    if (file.fieldname === 'template') {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
            return cb(new Error('نوع الصورة غير مدعوم. المسموح: JPG, PNG, WEBP, GIF فقط'), false);
        }
    } else if (file.fieldname === 'contacts') {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.csv', '.xlsx', '.xls', '.txt'];
        if (!allowedExts.includes(ext)) {
            return cb(new Error('نوع ملف الأرقام غير مدعوم. المسموح: CSV, XLSX, XLS فقط'), false);
        }
    } else if (file.fieldname === 'voicenote') {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.mp3', '.ogg', '.m4a', '.wav', '.webm'];
        if (!allowedExts.includes(ext)) {
            return cb(new Error('نوع الملف الصوتي غير مدعوم. المسموح: MP3, OGG, M4A, WAV فقط'), false);
        }
    }
    cb(null, true);
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 16 * 1024 * 1024,
        files: 3
    }
});

module.exports = { upload };
