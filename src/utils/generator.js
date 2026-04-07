const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/settings');

// Register the custom font
if (config.image.fontPath && fs.existsSync(config.image.fontPath)) {
    registerFont(config.image.fontPath, { family: config.image.fontFamily });
}

/**
 * Generates an invitation image for a given name.
 * @param {string} name - The name to write on the invitation.
 * @param {string} phone - The phone number (used for unique filename).
 * @param {string} customTemplatePath - Optional uploaded template path.
 * @param {object} customCanvasConfig - Optional canvas coordinates and style.
 * @returns {Promise<string>} - The absolute path of the generated image.
 */
async function generateImage(name, phone, customTemplatePath = null, customCanvasConfig = null) {
    try {
        const tPath = customTemplatePath ? path.resolve(__dirname, '../../', customTemplatePath) : config.image.templatePath;
        const cConfig = (customCanvasConfig && customCanvasConfig.x != null) ? customCanvasConfig : config.image.textPosition;
        const rawFontSize = customCanvasConfig && customCanvasConfig.fontSize ? customCanvasConfig.fontSize : config.image.fontSize;
        const fontSizeStr = typeof rawFontSize === 'number' ? `${rawFontSize}px` : rawFontSize;
        const textColor = customCanvasConfig && customCanvasConfig.color ? customCanvasConfig.color : config.image.textColor;

        const image = await loadImage(tPath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw Template
        ctx.drawImage(image, 0, 0, image.width, image.height);

        // Configure Text
        ctx.font = `${fontSizeStr} "${config.image.fontFamily}"`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Write Name — use config defaults if coordinates are missing
        const textX = cConfig.x != null ? cConfig.x : config.image.textPosition.x;
        const textY = cConfig.y != null ? cConfig.y : config.image.textPosition.y;
        ctx.fillText(name, textX, textY);

        // Ensure temp dir exists
        await fs.ensureDir(config.paths.outputDir);

        // Save Image
        const outputFilename = `invite_${phone}.png`;
        const outputPath = path.join(config.paths.outputDir, outputFilename);

        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(outputPath, buffer);

        return outputPath;
    } catch (error) {
        throw new Error(`Failed to generate image for ${name}: ${error.message}`);
    }
}

module.exports = { generateImage };
