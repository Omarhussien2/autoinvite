/**
 * AutoInvite V2 - Data Intelligence Engine
 * Handles phone normalization (Saudi Focus), name transliteration, and deduplication.
 */

const SAUDI_PREFIX = '966';

/**
 * Basic English-to-Arabic name transliteration with common name mappings.
 * @param {string} name - The input name (could be English or Arabic).
 * @returns {string} - The transliterated name (Arabic preferred).
 */
function transliterateName(name) {
    if (!name || typeof name !== 'string') return 'ضيف';

    // If already Arabic, return as-is
    if (/[\u0600-\u06FF]/.test(name)) {
        return name.trim();
    }

    // Common English -> Arabic name mappings
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
        // Women
        'fatima': 'فاطمة', 'fatimah': 'فاطمة',
        'aisha': 'عائشة', 'aysha': 'عائشة',
        'noura': 'نورة', 'nora': 'نورة',
        'sara': 'سارة', 'sarah': 'سارة',
        'maha': 'مها',
        'reem': 'ريم',
        'haya': 'هيا',
        'lama': 'لمى',
        'dana': 'دانة',
        'asma': 'أسماء',
    };

    // Try to find a match (case-insensitive, first name only)
    const firstName = name.trim().split(/\s+/)[0].toLowerCase();

    if (nameMap[firstName]) {
        return nameMap[firstName];
    }

    // Return original name if no match (will display in English)
    return name.trim();
}

/**
 * Normalizes phone numbers to the Saudi international format (9665...).
 * @param {string} rawPhone - The input phone string.
 * @returns {string|null} - The normalized phone (e.g., '966501234567') or null if invalid.
 */
function normalizePhone(rawPhone) {
    if (!rawPhone) return null;

    // 1. Remove non-digit characters (spaces, dashes, pluses)
    let phone = rawPhone.toString().replace(/\D/g, '');

    // 2. Handle Saudi Format
    // Case A: Starts with '05' (e.g., 0501234567) -> Replace '0' with '966'
    if (phone.startsWith('05') && phone.length === 10) {
        return SAUDI_PREFIX + phone.substring(1);
    }

    // Case B: Starts with '5' (e.g., 501234567 - missing zero) -> Add '966'
    if (phone.startsWith('5') && phone.length === 9) {
        return SAUDI_PREFIX + phone;
    }

    // Case C: Starts with '966' (e.g., 966501234567) -> Keep as is if length is correct (12 digits)
    if (phone.startsWith('966') && phone.length === 12) {
        return phone;
    }

    // Case D: International number (fallback) -> Return as is if it looks valid (10-15 digits)
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

module.exports = { normalizePhone, processContacts, transliterateName };
