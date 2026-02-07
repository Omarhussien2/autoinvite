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
 * @returns {Promise<string>} - The absolute path of the generated image.
 */
async function generateImage(name, phone) {
    try {
        const image = await loadImage(config.image.templatePath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw Template
        ctx.drawImage(image, 0, 0, image.width, image.height);

        // Configure Text
        ctx.font = `${config.image.fontSize} "${config.image.fontFamily}"`;
        ctx.fillStyle = config.image.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Write Name
        // Using config coordinates. If x is center, we align center.
        ctx.fillText(name, config.image.textPosition.x, config.image.textPosition.y);

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
