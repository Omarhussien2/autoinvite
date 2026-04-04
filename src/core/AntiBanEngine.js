/**
 * AntiBanEngine — Advanced Human-Like Behavior Simulation
 *
 * Strategies implemented:
 *  1. Gaussian-distributed delays (natural variance vs. flat uniform random)
 *  2. Typing-speed simulation (WPM-based duration proportional to message length)
 *  3. Time-of-day awareness (prefer business hours; slow down at night)
 *  4. Session warm-up (first N messages use longer delays for new sessions)
 *  5. Micro-break injection (rare "distraction" pauses simulate real user behavior)
 *  6. Daily message budget guard (slow down and warn as daily limit approaches)
 */
class AntiBanEngine {
    constructor() {
        // Per-tenant session counters: { [tenantId]: { sentToday: number, sessionCount: number, dayKey: string } }
        this._sessions = {};

        // Human typing: average 45 WPM = 225 chars/min = ~3.75 chars/sec
        this.AVG_CHARS_PER_MS = 3.75 / 1000;

        // Daily soft limit: warn and slow down after this many messages
        this.DAILY_SOFT_LIMIT = 150;

        // Messages to consider "warm-up" phase for a new session
        this.WARMUP_COUNT = 8;

        // Probability (0-1) of injecting a micro-break per message
        this.MICRO_BREAK_CHANCE = 0.07; // ~7% of messages
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Gaussian random using Box-Muller transform.
     * Returns a value normally distributed around `mean` with given `stdDev`.
     * Clamped to [min, max].
     */
    _gaussianRandom(mean, stdDev, min, max) {
        let u, v, s;
        do {
            u = Math.random() * 2 - 1;
            v = Math.random() * 2 - 1;
            s = u * u + v * v;
        } while (s >= 1 || s === 0);
        const mul = Math.sqrt(-2 * Math.log(s) / s);
        const value = mean + stdDev * u * mul;
        return Math.max(min, Math.min(max, Math.round(value)));
    }

    /**
     * Returns current hour in the server's local timezone (0-23).
     */
    _currentHour() {
        return new Date().getHours();
    }

    /**
     * Returns today's date string YYYY-MM-DD for daily budget tracking.
     */
    _todayKey() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Get or initialize per-tenant session state.
     */
    _getSession(tenantId) {
        const today = this._todayKey();
        if (!this._sessions[tenantId] || this._sessions[tenantId].dayKey !== today) {
            // New day: reset daily counters, preserve session count
            const prev = this._sessions[tenantId];
            this._sessions[tenantId] = {
                sentToday: 0,
                sessionCount: prev ? prev.sessionCount : 0,
                dayKey: today,
            };
        }
        return this._sessions[tenantId];
    }

    /**
     * Record that one message was sent for this tenant.
     */
    recordSent(tenantId) {
        const session = this._getSession(tenantId);
        session.sentToday += 1;
        session.sessionCount += 1;
    }

    // ── Core Anti-Ban Behaviors ───────────────────────────────────────────────

    /**
     * Calculate how long the typing indicator should be visible based on
     * message character count, simulating realistic human typing speed.
     * Adds ±20% natural variance.
     *
     * @param {string} message — The message that will be "typed"
     * @returns {number} Duration in milliseconds
     */
    typingDuration(message) {
        const charCount = (message || '').length;
        const baseDuration = charCount / this.AVG_CHARS_PER_MS;

        // Add ±20% variance
        const variance = baseDuration * 0.2;
        const duration = baseDuration + (Math.random() * variance * 2 - variance);

        // Clamp: minimum 1.5s, maximum 12s (humans don't type for 5 minutes)
        return Math.max(1500, Math.min(12000, Math.round(duration)));
    }

    /**
     * Main inter-message delay engine.
     * Applies Gaussian distribution, time-of-day scaling, warm-up bonus,
     * daily budget guard, and occasional micro-breaks.
     *
     * @param {number} minDelay — Base minimum delay in ms
     * @param {number} maxDelay — Base maximum delay in ms
     * @param {function} onLog — Logging callback
     * @param {string|number} tenantId — For per-tenant session tracking
     */
    async applyDelay(minDelay = 30000, maxDelay = 60000, onLog, tenantId = 'default') {
        const session = this._getSession(tenantId);
        const hour = this._currentHour();

        let effectiveMin = minDelay;
        let effectiveMax = maxDelay;

        // ── 1. Time-of-day scaling ──────────────────────────────────────────
        // Business hours (9-22): normal speed
        // Late night (22-1): +50% delay — unusual for a person to be bulk-sending
        // Early morning (1-7): +100% delay (very suspicious activity window)
        if (hour >= 22 || hour < 1) {
            effectiveMin = Math.round(effectiveMin * 1.5);
            effectiveMax = Math.round(effectiveMax * 1.5);
            if (onLog) onLog(`[HumanBehavior] ساعات متأخرة — تأخير إضافي للحماية`, 'INFO');
        } else if (hour >= 1 && hour < 7) {
            effectiveMin = Math.round(effectiveMin * 2.0);
            effectiveMax = Math.round(effectiveMax * 2.0);
            if (onLog) onLog(`[HumanBehavior] ساعات الفجر — تأخير مضاعف للحماية`, 'INFO');
        }

        // ── 2. Session warm-up ──────────────────────────────────────────────
        // First WARMUP_COUNT messages of a session use 1.4x delays
        if (session.sessionCount < this.WARMUP_COUNT) {
            effectiveMin = Math.round(effectiveMin * 1.4);
            effectiveMax = Math.round(effectiveMax * 1.4);
            if (onLog) onLog(`[HumanBehavior] مرحلة الإحماء (${session.sessionCount + 1}/${this.WARMUP_COUNT}) — تأخير تدريجي`, 'INFO');
        }

        // ── 3. Daily budget guard ───────────────────────────────────────────
        if (session.sentToday >= this.DAILY_SOFT_LIMIT) {
            const overBy = session.sentToday - this.DAILY_SOFT_LIMIT;
            const scaleFactor = 1 + Math.min(2.0, overBy / 50); // Up to 3x delay after 100 over limit
            effectiveMin = Math.round(effectiveMin * scaleFactor);
            effectiveMax = Math.round(effectiveMax * scaleFactor);
            if (onLog) onLog(`[HumanBehavior] ⚠️ تجاوز الحد اليومي الآمن (${session.sentToday} رسالة) — تباطؤ تلقائي`, 'WARN');
        }

        // ── 4. Gaussian delay calculation ───────────────────────────────────
        const mean = (effectiveMin + effectiveMax) / 2;
        const stdDev = (effectiveMax - effectiveMin) / 4; // ~95% of values fall within [min, max]
        const delay = this._gaussianRandom(mean, stdDev, effectiveMin, effectiveMax);

        if (onLog) onLog(`Wait ${Math.floor(delay / 1000)}s...`, 'INFO');
        await this.sleep(delay);

        // ── 5. Micro-break injection ────────────────────────────────────────
        // After the main delay, occasionally add a longer "distraction" break
        if (Math.random() < this.MICRO_BREAK_CHANCE) {
            // 3-8 minutes break
            const breakMs = this._gaussianRandom(5.5 * 60000, 1.5 * 60000, 3 * 60000, 8 * 60000);
            if (onLog) onLog(`[HumanBehavior] 🧘 استراحة قصيرة (${Math.round(breakMs / 60000)} دقيقة)...`, 'INFO');
            await this.sleep(breakMs);
        }
    }
}

module.exports = new AntiBanEngine();
