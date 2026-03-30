/**
 * AutoInvite V2 - Data Intelligence Engine
 * Handles phone normalization (Saudi Focus), name transliteration, and deduplication.
 */

const SAUDI_PREFIX = '966';

const { translate } = require('google-translate-api-x');

/**
 * Enhanced English-to-Arabic name processing with Google Translate fallback.
 * @param {string} name - The input name (could be English or Arabic).
 * @returns {Promise<string>} - The processed Arabic name.
 */
async function processName(name) {
    if (!name || typeof name !== 'string') return 'ضيف';

    const trimmedName = name.trim();

    // If already Arabic (contains Arabic characters), return as-is
    if (/[\u0600-\u06FF]/.test(trimmedName)) {
        return trimmedName;
    }

    const lowerName = trimmedName.toLowerCase();

    // 1. Fast Lookup: Common Names Map (Instant)
    const nameMap = {
        // Men
        'mohammed': 'محمد', 'mohammad': 'محمد', 'mohamed': 'محمد', 'muhammed': 'محمد',
        'ahmed': 'أحمد', 'ahmad': 'أحمد',
        'abdullah': 'عبدالله', 'abdallah': 'عبدالله',
        'abdulrahman': 'عبدالرحمن', 'abdelrahman': 'عبدالرحمن',
        'ali': 'علي',
        'khalid': 'خالد', 'khaled': 'خالد',
        'omar': 'عمر',
        'faisal': 'فيصل',
        'fahad': 'فهد', 'fahd': 'فهد',
        'sultan': 'سلطان',
        'saleh': 'صالح', 'salih': 'صالح',
        'nasser': 'ناصر', 'nasir': 'ناصر',
        'saad': 'سعد',
        'turki': 'تركي',
        'yousef': 'يوسف', 'youssef': 'يوسف', 'yusuf': 'يوسف',
        'hassan': 'حسن',
        'hussein': 'حسين', 'hussain': 'حسين',
        'ibrahim': 'إبراهيم',
        'saud': 'سعود',
        'waleed': 'وليد', 'walid': 'وليد',
        'bandar': 'بندر',
        'majid': 'ماجد', 'majed': 'ماجد',
        'moath': 'معاذ', 'moaath': 'معاذ', // Added based on user feedback
        // Women
        'fatima': 'فاطمة', 'fatimah': 'فاطمة',
        'aisha': 'عائشة', 'aysha': 'عائشة',
        'noura': 'نورة', 'nora': 'نورة',
        'sara': 'سارة', 'sarah': 'سارة',
        'mona': 'منى',
        'maha': 'مها',
        'nouf': 'نوف',
        'hind': 'هند',
        'laila': 'ليلى',
        'amal': 'أمل',
        'reem': 'ريم',
    };

    if (nameMap[lowerName]) {
        return nameMap[lowerName];
    }

    // 2. Fallback: Google Translate (Async)
    try {
        const res = await translate(trimmedName, { to: 'ar' });
        return res.text; // Return the translated text
    } catch (error) {
        console.error(`Translation failed for ${trimmedName}:`, error.message);
        return trimmedName; // Fallback to original if translation fails
    }
}

/**
 * Normalizes phone numbers to international format.
 * Supports Saudi (966) and Egyptian (20) number formats.
 * @param {string} rawPhone - The input phone string.
 * @returns {string|null} - The normalized phone (e.g., '966501234567', '201012345678') or null if invalid.
 */
function normalizePhone(rawPhone) {
    if (!rawPhone) return null;

    // 1. Remove non-digit characters (spaces, dashes, pluses)
    let phone = rawPhone.toString().replace(/\D/g, '');

    // 2. Saudi Format (prefix 966)
    // Case SA-A: 0501234567 (10 digits, starts with 05) -> 966501234567
    if (phone.startsWith('05') && phone.length === 10) {
        return SAUDI_PREFIX + phone.substring(1);
    }
    // Case SA-B: 501234567 (9 digits, starts with 5) -> 966501234567
    if (phone.startsWith('5') && phone.length === 9) {
        return SAUDI_PREFIX + phone;
    }
    // Case SA-C: 966501234567 (12 digits) -> keep as is
    if (phone.startsWith('966') && phone.length === 12) {
        return phone;
    }

    // 3. Egyptian Format (prefix 20)
    // Case EG-A: 01012345678 (11 digits, starts with 01) -> 201012345678
    if (phone.startsWith('01') && phone.length === 11) {
        return '20' + phone.substring(1);
    }
    // Case EG-B: 1012345678 (10 digits, starts with 1) -> 201012345678
    if (phone.startsWith('1') && phone.length === 10 && ['10', '11', '12', '15'].some(p => phone.startsWith(p))) {
        return '20' + phone;
    }
    // Case EG-C: 201012345678 (12 digits, starts with 20) -> keep as is
    if (phone.startsWith('20') && phone.length === 12) {
        return phone;
    }

    // 4. International fallback: already has country code (10–15 digits)
    if (phone.length >= 10 && phone.length <= 15) {
        return phone;
    }

    // Invalid
    return null;
}

/**
 * Cleaning pipeline for a batch of contacts.
 * @param {Array} contacts - Array of objects { Name, Phone, ... }
 * @returns {Object} - { valid: [], duplicate: [], invalid: [] }
 */
function processContacts(contacts) {
    const uniquePhones = new Set();
    const result = {
        valid: [],
        duplicates: [], // In-batch duplicates
        invalid: []
    };

    for (const contact of contacts) {
        const name = contact['name'] || contact['Name'] || contact['الإسم'] || 'Guest';
        const rawPhone = contact['phone'] || contact['Phone'] || contact['mobile'] || contact['رقم الجوال'];

        const normalized = normalizePhone(rawPhone);

        if (!normalized) {
            result.invalid.push({ name, rawPhone, reason: 'Format Invalid' });
            continue;
        }

        if (uniquePhones.has(normalized)) {
            result.duplicates.push({ name, phone: normalized, reason: 'Duplicate in file' });
            continue;
        }

        uniquePhones.add(normalized);
        result.valid.push({
            name: name.trim(),
            phone: normalized,
            original: contact
        });
    }

    return result;
}

module.exports = { normalizePhone, processContacts, processName };
