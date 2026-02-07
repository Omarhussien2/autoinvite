const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const config = require('./src/config/settings');

async function createGrid() {
    try {
        const image = await loadImage(config.image.templatePath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw Base Image
        ctx.drawImage(image, 0, 0);

        // Draw Grid
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.font = '40px Arial';
        ctx.fillStyle = 'red';

        // Draw Horizontal Lines
        for (let y = 0; y < image.height; y += 100) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(image.width, y);
            ctx.stroke();
            ctx.fillText(y.toString(), 10, y + 40);
        }

        // Draw Vertical Lines
        for (let x = 0; x < image.width; x += 100) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, image.height);
            ctx.stroke();
            ctx.fillText(x.toString(), x + 10, 50);
        }

        // Save
        const outPath = 'grid_test.png';
        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(outPath, buffer);
        console.log(`Grid created at: ${outPath}`);
    } catch (e) {
        console.error(e);
    }
}

createGrid();
