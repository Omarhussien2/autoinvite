/**
 * Azzam — Server-Side Invitation Image Generator
 * Generates personalized invitation images by compositing guest name onto template.
 *
 * Font pipeline:
 *   1. Readex Pro Bold (assets/ReadexPro-Bold.ttf) — primary, matches frontend
 *   2. TSNAS Bold (assets/TSNAS-BOLD.OTF) — fallback
 *   3. System sans-serif — last resort
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/settings');

// ── Register fonts (order matters — first registered = default) ──
const PRIMARY_FONT = 'Readex Pro';
const FALLBACK_FONT = 'TSNAS Bold';

const primaryFontPath = path.resolve(__dirname, '../../assets/ReadexPro-Bold.ttf');
if (fs.existsSync(primaryFontPath)) {
    registerFont(primaryFontPath, { family: PRIMARY_FONT, weight: '700' });
}

if (config.image.fontPath && fs.existsSync(config.image.fontPath)) {
    registerFont(config.image.fontPath, { family: FALLBACK_FONT });
}

// Pick whichever font is available
const ACTIVE_FONT = fs.existsSync(primaryFontPath) ? PRIMARY_FONT : FALLBACK_FONT;

/**
 * Generates an invitation image for a given name.
 * @param {string} name - The name to write on the invitation.
 * @param {string} phone - The phone number (used for unique filename).
 * @param {string} customTemplatePath - Optional uploaded template path.
 * @param {object} customCanvasConfig - Optional canvas coordinates and style.
 * @returns {Promise<string>} - The absolute path of the generated image.
 */
async function generateImage(name, phone, customTemplatePath = null, customCanvasConfig = null) {
    let imagePath = null;
    try {
        // ── Resolve template path ──
        // Multer may save absolute paths; relative paths need resolving from project root
        const tPath = customTemplatePath
            ? (require('path').isAbsolute(customTemplatePath)
                ? customTemplatePath
                : path.resolve(__dirname, '../../', customTemplatePath))
            : config.image.templatePath;

        // ── Resolve canvas config with safe fallbacks ──
        const cConfig = (customCanvasConfig && customCanvasConfig.x != null)
            ? customCanvasConfig
            : config.image.textPosition;

        const rawFontSize = (customCanvasConfig && customCanvasConfig.fontSize)
            ? customCanvasConfig.fontSize
            : parseInt(config.image.fontSize) || 75;

        const fontSizeNum = typeof rawFontSize === 'number' ? rawFontSize : parseInt(rawFontSize);
        const textColor = (customCanvasConfig && customCanvasConfig.color)
            ? customCanvasConfig.color
            : config.image.textColor;

        // ── Load template image ──
        const image = await loadImage(tPath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw template background
        ctx.drawImage(image, 0, 0, image.width, image.height);

        // ── Configure text ──
        ctx.font = `bold ${fontSizeNum}px "${ACTIVE_FONT}", sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';  // proper Arabic text shaping

        // Shadow for readability on any background
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;

        // ── Calculate position ──
        const textX = cConfig.x != null ? cConfig.x : Math.round(image.width / 2);
        const textY = cConfig.y != null ? cConfig.y : Math.round(image.height * 0.70);

        // Write name
        ctx.fillText(name, textX, textY);

        // ── Ensure output dir exists ──
        await fs.ensureDir(config.paths.outputDir);

        // ── Save image ──
        const outputFilename = `invite_${phone}.png`;
        imagePath = path.join(config.paths.outputDir, outputFilename);

        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(imagePath, buffer);

        return imagePath;
    } catch (error) {
        // Cleanup temp file on failure
        if (imagePath) {
            await fs.remove(imagePath).catch(() => {});
        }
        throw new Error(`Failed to generate image for ${name}: ${error.message}`);
    }
}

async function validateImageGeneration(name, customTemplatePath = null, customCanvasConfig = null) {
    const validationPhone = `preflight_${require('crypto').randomUUID()}`;
    const imagePath = await generateImage(name, validationPhone, customTemplatePath, customCanvasConfig);
    try {
        const imageStats = await fs.stat(imagePath);
        return { possible: true, bytes: imageStats.size };
    } finally {
        await fs.remove(imagePath);
    }
}

module.exports = { generateImage, validateImageGeneration, ACTIVE_FONT };
