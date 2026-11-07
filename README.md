# Dismod Chat

A responsive private chat website inspired by the supplied layout: blue-and-white by default, with one-click theme colors, username/password accounts, friend adding by username, text messages, image sharing, real-time updates, and database-backed message history.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Set a strong secret:
   - Windows PowerShell: `$env:JWT_SECRET="a-long-random-secret"`
   - macOS/Linux: `export JWT_SECRET="a-long-random-secret"`
4. Run `npm start`.
5. Open http://localhost:3000

## Deploy on Railway

1. Push this folder to a GitHub repository and deploy that repository on Railway.
2. Add a Railway Volume mounted at `/data`.
3. Set `DATA_DIR=/data`.
4. Set `JWT_SECRET` to a long random secret in Railway Variables.
5. Railway detects the `npm start` command from `package.json`.

The SQLite database and uploaded images are stored under `DATA_DIR`; the volume is important so they survive redeployments/restarts.

## Notes

- Register with a unique username (3–20 letters, numbers or underscores) and password (6–72 characters). No email is requested.
- Add a friend by entering their exact username. Both users will see the friendship.
- Messages and images are stored on the server and remain available when the user signs in again.
- Images are limited to 8 MB and common image formats.
- This starter is intended for a small private community. Before public launch, add rate limiting, account recovery, stronger upload scanning, HTTPS-only deployment, and moderation/reporting tools.
- Keep `JWT_SECRET` private and never commit production secrets to GitHub.
