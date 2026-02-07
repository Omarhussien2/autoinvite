# Auto-Inviter

A Node.js automation tool to send personalized WhatsApp invitations.

## Features
- Parses contacts from `data/data - Sheet1.csv`.
- Normalizes Saudi phone numbers (05x, 5x, +966) to strict format.
- Generates a custom image for each contact using `assets/template.png`.
- Sends the image via WhatsApp with anti-ban delays.
- Logs success/failures to `logs/report.txt`.

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Prepare Data**:
   - Ensure `data/data - Sheet1.csv` exists with columns: `الإسم` (or `Name`) and `رقم الجوال` (or `Phone`).
   - ensure `assets/template.png` exists.

3. **Run**:
   ```bash
   node src/index.js
   ```

4. **Login**:
   - Scan the QR code that appears in the terminal with your WhatsApp.

## Configuration
Edit `src/config/settings.js` to change:
- Image text position (X, Y).
- Font settings.
- Delay duration (min/max).

## Warnings
- **Anti-Ban**: This tool uses random delays to mimic human behavior, but using it on a personal main account carries risk. Use a dedicated number if possible.
- **Batching**: Start with small batches (5-10 users) to verify everything works.
