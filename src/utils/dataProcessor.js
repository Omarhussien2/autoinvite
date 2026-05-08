/**
 * Azzam - Data Intelligence Engine
 * Handles phone normalization (Saudi Focus), name transliteration, and deduplication.
 */

const SAUDI_PREFIX = '966';

const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const readXlsxFile = require('read-excel-file/node');
const { translate } = require('google-translate-api-x');
const { createLogger } = require('./logger');
const log = createLogger('dataProcessor');

// In-memory translation cache — prevents hammering Google Translate API with duplicate names
const _translateCache = new Map();

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

    // 2. Fallback: Google Translate (Async) — with cache to prevent per-contact API spam
    if (_translateCache.has(lowerName)) {
        return _translateCache.get(lowerName);
    }

    try {
        const res = await translate(trimmedName, { to: 'ar' });
        const translated = res.text;
        _translateCache.set(lowerName, translated);
        return translated;
    } catch (error) {
        log.error(`Translation failed for ${trimmedName}:`, error.message);
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

function normalizeContactColumns(rows) {
    if (!rows || rows.length === 0) return [];

    const keys = Object.keys(rows[0]);

    const nameSynonyms = new Set([
        'name', 'الاسم', 'الإسم', 'اسم', 'fullname', 'full_name',
        'customer_name', 'client_name', 'الأسماء', 'الأسم', 'العميل',
        'الاسم الكامل', 'اسم العميل', 'الشخص'
    ]);
    const phoneSynonyms = new Set([
        'phone', 'mobile', 'رقم الجوال', 'رقم', 'جوال', 'موبايل',
        'هاتف', 'telephone', 'tel', 'number', 'الهاتف', 'الجوال',
        'رقم الهاتف', 'رقم الموبايل', 'رقم التليفون', 'تليفون',
        'phone number', 'mobile number', 'contact'
    ]);

    const nameKey = keys.find(k => nameSynonyms.has(k.toLowerCase().trim())) || keys[0];
    const phoneKey = keys.find(k => phoneSynonyms.has(k.toLowerCase().trim())) || (keys.length > 1 ? keys[1] : keys[0]);

    return rows.map(row => ({
        Name: (row[nameKey] !== undefined && row[nameKey] !== null) ? row[nameKey].toString().trim() : '',
        Phone: (row[phoneKey] !== undefined && row[phoneKey] !== null) ? row[phoneKey].toString().trim() : '',
    })).filter(r => r.Phone !== '');
}

function splitDelimitedLine(line) {
    const out = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = line[i + 1];

        if (ch === '"' && inQuotes && next === '"') {
            value += '"';
            i++;
            continue;
        }

        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
            out.push(value.trim());
            value = '';
            continue;
        }

        value += ch;
    }

    out.push(value.trim());
    return out.map(v => v.replace(/^\uFEFF/, '').trim()).filter(v => v !== '');
}

function parseFlatContactTokens(tokens) {
    const cleaned = tokens.map(t => String(t || '').trim()).filter(Boolean);
    if (cleaned.length < 2) return [];

    const isNameHeader = value => ['name', 'fullname', 'full_name', 'الاسم', 'الإسم', 'اسم'].includes(value.toLowerCase());
    const isPhoneHeader = value => ['phone', 'mobile', 'number', 'رقم', 'جوال', 'هاتف', 'رقم الجوال', 'رقم الهاتف'].includes(value.toLowerCase());

    let data = cleaned;
    for (let i = 0; i < cleaned.length - 1; i++) {
        if (isNameHeader(cleaned[i]) && isPhoneHeader(cleaned[i + 1])) {
            data = cleaned.slice(i + 2);
            break;
        }
    }

    if (data.length % 2 === 1 && !/\d/.test(data[0])) {
        data = data.slice(1);
    }

    const contacts = [];
    for (let i = 0; i < data.length - 1; i += 2) {
        contacts.push({ Name: data[i], Phone: data[i + 1] });
    }

    return contacts.filter(c => c.Phone && /\d/.test(c.Phone));
}

function parseLooseContactsText(text) {
    const lines = String(text || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return [];

    const rows = lines.map(splitDelimitedLine).filter(row => row.length > 0);
    if (rows.length > 1 && rows[0].length >= 2) {
        const headers = rows[0].map(header => header.trim());
        const tableRows = rows.slice(1).map(row => {
            const entry = {};
            headers.forEach((header, index) => {
                entry[header || `column_${index + 1}`] = row[index] == null ? '' : row[index];
            });
            return entry;
        });
        const normalized = normalizeContactColumns(tableRows);
        if (normalized.length > 0) return normalized;
    }

    const tokens = rows.flat();
    return parseFlatContactTokens(tokens);
}

function shouldUseLooseContactFallback(normalizedRows) {
    if (!normalizedRows || normalizedRows.length === 0) return true;

    // Check if the first row's Name or Phone looks like a corrupted merged column
    const only = normalizedRows[0];
    const phone = String(only.Phone || '');
    const name = String(only.Name || '');
    
    const isCorrupted = 
        phone.includes(',') || phone.includes(';') || /name|phone|mobile/i.test(phone) || phone.length > 30 ||
        name.includes(',') || name.includes(';') || /name|phone|mobile/i.test(name) || name.length > 30;

    if (isCorrupted) return true;

    if (normalizedRows.length > 1) return false;

    return false;
}

async function loadContacts(customFilePath = null) {
    const filePath = customFilePath || path.resolve(__dirname, '../../data/data - Sheet1.csv');

    return new Promise((resolve, reject) => {
        try {
            const ext = filePath.toLowerCase().split('.').pop();

            if (ext === 'csv' || ext === 'txt') {
                const rows = [];
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => rows.push(data))
                    .on('end', async () => {
                        try {
                            const normalized = normalizeContactColumns(rows);
                            if (!shouldUseLooseContactFallback(normalized)) {
                                resolve(normalized);
                                return;
                            }

                            const text = await fs.readFile(filePath, 'utf8');
                            const looseContacts = parseLooseContactsText(text);
                            resolve(looseContacts.length > 0 ? looseContacts : normalized);
                        } catch (err) {
                            reject(err);
                        }
                    })
                    .on('error', (err) => reject(err));
            } else if (ext === 'xlsx' || ext === 'xls') {
                readXlsxFile(filePath)
                    .then((rows) => {
                        if (!rows || rows.length === 0) {
                            resolve([]);
                            return;
                        }

                        if (!Array.isArray(rows[0])) {
                            const normalized = normalizeContactColumns(rows);
                            if (shouldUseLooseContactFallback(normalized)) {
                                const tokens = rows.flatMap(row => Object.values(row || {}).flatMap(value => splitDelimitedLine(String(value || ''))));
                                const looseContacts = parseFlatContactTokens(tokens);
                                resolve(looseContacts.length > 0 ? looseContacts : normalized);
                                return;
                            }
                            resolve(normalized);
                            return;
                        }

                        const headers = rows[0].map((header) => String(header || '').trim());
                        const dataRows = rows.slice(1).map((row) => {
                            const entry = {};
                            headers.forEach((header, index) => {
                                entry[header || `column_${index + 1}`] = row[index] == null ? '' : row[index];
                            });
                            return entry;
                        });

                        const normalized = normalizeContactColumns(dataRows);
                        if (shouldUseLooseContactFallback(normalized)) {
                            const tokens = rows.flatMap(row => row.flatMap(value => splitDelimitedLine(String(value || ''))));
                            const looseContacts = parseFlatContactTokens(tokens);
                            resolve(looseContacts.length > 0 ? looseContacts : normalized);
                            return;
                        }

                        resolve(normalized);
                    })
                    .catch((err) => reject(err));
            } else {
                reject(new Error(`نوع الملف غير مدعوم: ${ext}. المدعوم: CSV, XLSX, XLS`));
            }
        } catch (e) {
            reject(e);
        }
    });
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
        const name = contact['Name'] || contact['name'] || contact['الإسم'] || contact['اسم'] || 'ضيف';
        const rawPhone = contact['Phone'] || contact['phone'] || contact['mobile'] || contact['رقم الجوال'] || contact['جوال'] || contact['هاتف'];

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

module.exports = { normalizePhone, processContacts, processName, loadContacts };
