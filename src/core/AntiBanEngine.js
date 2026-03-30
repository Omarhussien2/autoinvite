class AntiBanEngine {
    constructor() {}

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Applies a random delay (Spintax/Delay simulation) to prevent ban.
     */
    async applyDelay(minDelay = 3000, maxDelay = 10000, onLog) {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
        if (onLog) {
            onLog(`Wait ${Math.floor(delay / 1000)}s...`, 'INFO');
        }
        await this.sleep(delay);
    }
}

module.exports = new AntiBanEngine();
