const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs-extra');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Convert any audio file to OGG Opus format (required for WhatsApp PTT).
 * Returns the path to the converted file.
 * If already .ogg, still re-encodes to ensure Opus codec.
 */
async function convertToOggOpus(inputPath) {
    const absInput = path.resolve(inputPath);
    const outputPath = absInput.replace(/\.[^.]+$/, '_ptt.ogg');

    if (!await fs.pathExists(absInput)) {
        throw new Error(`Audio file not found: ${absInput}`);
    }

    return new Promise((resolve, reject) => {
        ffmpeg(absInput)
            .audioCodec('libopus')
            .audioChannels(1)
            .audioBitrate('64k')
            .audioFrequency(48000)
            .format('ogg')
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(new Error(`FFmpeg conversion failed: ${err.message}`)))
            .save(outputPath);
    });
}

module.exports = { convertToOggOpus };
