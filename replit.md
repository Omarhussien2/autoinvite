# AutoInvite - WhatsApp Campaign Manager

## Overview
A Node.js-based WhatsApp automation tool for sending personalized invitations. It features a web dashboard for managing campaigns, contact lists, and generating custom invitation images.

## Architecture

- **Backend**: Express.js (v5) with Socket.io for real-time updates
- **Frontend**: Plain HTML/CSS/Vanilla JS in `/public`
- **Database**: SQLite via better-sqlite3 (`database.db`)
- **WhatsApp**: whatsapp-web.js with Puppeteer/Chromium
- **Image Generation**: node-canvas for custom invitation cards
- **Entry Point**: `src/server.js`

## Project Structure

```
/src
  server.js        - Express + Socket.io server (port 5000)
  core.js          - WhatsApp client + contact batch processing
  config/
    settings.js    - Message templates and delay config
  database/
    db.js          - SQLite connection
    init.js        - DB schema and default admin user creation
    migrate_v2.js  - Migrations
  routes/
    auth.js        - Login/logout routes
    campaigns.js   - Campaign CRUD API
  middleware/
    auth.js        - Session-based auth middleware
  utils/
    dataProcessor.js  - CSV parsing, name transliteration
    generator.js      - Canvas image generation
    logger.js         - Result logging
    normalizer.js     - Phone number normalization
    state.js          - App state management
/public              - Static frontend assets (HTML, CSS, JS)
/data                - CSV contact files
/uploads             - Temporary image/CSV uploads
/assets              - Template images and fonts
database.db          - SQLite database file
```

## Key Configuration

- **Server Port**: 5000 (configured via `PORT` env var or defaults to 5000)
- **Default Admin**: username: `admin`, password: `admin123`
- **Chromium**: Uses system Chromium (`which chromium`) for WhatsApp Web automation

## System Dependencies (Nix)

Required for canvas and Chromium:
- libuuid, cairo, pango, libjpeg, giflib, librsvg, pixman
- glib, nss, nspr, atk, cups, dbus, expat, libdrm
- xorg.libX11, xorg.libXcomposite, xorg.libXdamage, xorg.libXext
- xorg.libXfixes, xorg.libXrandr, xorg.libxcb, mesa, alsa-lib, pango, chromium

## Deployment

- **Target**: VM (always-running, maintains WhatsApp WebSocket connection)
- **Run command**: `node src/server.js`

## Workflow

- **Start application**: `npm start` → runs on port 5000 (webview)
