function parseMessageTemplates(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    return [];
}

function normalizeMessageTemplates(value) {
    return parseMessageTemplates(value)
        .map((message) => {
            if (typeof message === 'string') {
                return { text: message.trim(), weight: 1 };
            }

            if (!message || typeof message !== 'object') return null;

            const text = String(message.text || message.content || message.message || message.body || '').trim();
            const weight = Math.max(1, Math.min(100, parseInt(message.weight, 10) || 1));

            return text ? { text, weight } : null;
        })
        .filter(Boolean);
}

function buildWeightedSequence(messages) {
    const weightedSlots = [];

    messages.forEach((message, index) => {
        for (let slot = 0; slot < message.weight; slot++) {
            weightedSlots.push({
                index,
                position: (slot + 0.5) / message.weight,
            });
        }
    });

    return weightedSlots
        .sort((a, b) => (a.position - b.position) || (a.index - b.index))
        .map((slot) => slot.index);
}

function renderMessage(text, name) {
    return String(text || '')
        .replace(/\[\u0627\u0644\u0627\u0633\u0645\]/g, name)
        .replace(/\[\u0627\u0644\u0625\u0633\u0645\]/g, name)
        .replace(/\{\{\s*name\s*\}\}/gi, name)
        .replace(/\{\s*name\s*\}/gi, name);
}

function pickWeightedMessage(messages, name, position = 0) {
    const normalized = normalizeMessageTemplates(messages);
    if (normalized.length === 0) return '';
    if (normalized.length === 1) return renderMessage(normalized[0].text, name);

    const sequence = buildWeightedSequence(normalized);
    const selectedIndex = sequence[Math.abs(position) % sequence.length];
    return renderMessage(normalized[selectedIndex].text, name);
}

module.exports = {
    parseMessageTemplates,
    normalizeMessageTemplates,
    buildWeightedSequence,
    pickWeightedMessage,
};
