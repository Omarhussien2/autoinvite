/**
 * Normalizes a phone number to WhatsApp format.
 * Supports: Saudi (966) and Egyptian (20) numbers.
 * @param {string} phone - The raw phone number string.
 * @returns {string|null} - The normalized number (without @c.us suffix) or null if invalid.
 */
function normalizePhone(phone) {
    if (!phone) return null;

    // Remove all non-numeric characters
    let clean = phone.toString().replace(/\D/g, '');

    // === EGYPTIAN Numbers ===
    // Case: 01xxxxxxxxx (11 digits, starts with 010, 011, 012, 015)
    if (clean.startsWith('01') && clean.length === 11) {
        return '20' + clean.substring(1); // Remove leading 0, add 20
    }

    // Case: 201xxxxxxxxx (12 digits, already has country code)
    if (clean.startsWith('20') && clean.length === 12) {
        return clean;
    }

    // === SAUDI Numbers ===
    // Case: 05xxxxxxxx (10 digits)
    if (clean.startsWith('05') && clean.length === 10) {
        return '966' + clean.substring(1);
    }

    // Case: 5xxxxxxxx (9 digits)
    if (clean.startsWith('5') && clean.length === 9) {
        return '966' + clean;
    }

    // Case: 9665xxxxxxxx (12 digits)
    if (clean.startsWith('966') && clean.length === 12) {
        return clean;
    }

    // Invalid format
    return null;
}

module.exports = { normalizePhone };
