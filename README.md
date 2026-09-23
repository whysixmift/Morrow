# Morrow

A lightweight self-hosted YouTube media downloader with a minimal web interface, persistent queue, and automatic cleanup.

## Features

- **Single & Bulk Downloads**: Paste a single link or a list of URLs (one per line).
- **Format Selection**: Video (Best, 1080p, 720p, 480p, 360p) and Audio (MP3, M4A).
- **Live Progress**: Real-time download speed, percentage, and ETA streamed over Server-Sent Events (SSE).
- **Persistent Queue**: Powered by Node 24's built-in `node:sqlite` (zero external database daemon).
- **Resource Protection**: Strictly limited concurrency (1 worker) and timeouts to prevent VPS memory exhaustion.
- **Auto-Cleanup**: Completed files expire and get deleted automatically after 30 minutes.
- **Cookie Support**: Automatic detection of `cookies.txt` to bypass YouTube bot detection on datacenter IPs.

---

## Architecture

```text
Browser (Svelte 5 UI)
   │ (HTTP / SSE)
   ▼
Morrow Server (Node 24 / SvelteKit)
   ├── SQLite (node:sqlite)  ── Queue & state persistence
   ├── Worker (concurrency=1)
   └── Storage (/var/lib/morrow/downloads) ── Auto-cleaner
        │
        ├── yt-dlp  (Media extraction & JS challenge solver)
        └── FFmpeg  (Stream merging & audio extraction)
```

- **Memory Footprint**: ~19–40 MB idle.
- **Process Model**: Single unified Node.js process serving SSR pages, API routes, queue worker, and SSE streams.

---

## Prerequisites

- **Node.js**: v22.0.0+ (Node 24+ recommended for built-in `node:sqlite`)
- **pnpm**: v9+ (or npm)
- **yt-dlp**: installed in PATH or at `/usr/local/bin/yt-dlp`
- **ffmpeg**: installed in system PATH

---

## Local Development

```bash
# Clone the repository
git clone https://github.com/whysixmift/Morrow.git
cd Morrow

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:5050](http://localhost:5050) in your browser.

---

## Production Build & Run

```bash
# Build SvelteKit application
pnpm build

# Start production server
PORT=5050 node build/index.js
```

---

## Production Deployment (Linux / systemd)

### 1. Install System Dependencies

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install -y ffmpeg curl

# Install latest yt-dlp binary
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 2. Setup Directories & Deploy App

```bash
# Create application and data directories
sudo mkdir -p /opt/morrow /var/lib/morrow/downloads

# Copy project files to /opt/morrow
# (Run from project directory)
pnpm build
cp -r build package.json pnpm-lock.yaml /opt/morrow/
cd /opt/morrow && pnpm install --prod
```

### 3. Create systemd Service

Create `/etc/systemd/system/morrow.service`:

```ini
[Unit]
Description=Morrow YouTube Media Downloader
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/morrow
ExecStart=/usr/bin/node /opt/morrow/build/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=5050
Environment=HOST=0.0.0.0
Environment=MORROW_DATA_DIR=/var/lib/morrow
Environment=YTDLP_PATH=/usr/local/bin/yt-dlp
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Resource guards
MemoryMax=512M
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable morrow.service
sudo systemctl start morrow.service
```

---

## Configuration / Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5050` | Port the HTTP server binds to. |
| `HOST` | `0.0.0.0` | Host interface to listen on. |
| `MORROW_DATA_DIR` | `/var/lib/morrow` (or `./data`) | Directory for SQLite database and downloads. |
| `STORAGE_DIR` | `$MORROW_DATA_DIR/downloads` | Directory where downloaded media files are stored. |
| `DB_PATH` | `$MORROW_DATA_DIR/morrow.db` | SQLite database file location. |
| `COOKIES_PATH` | `$MORROW_DATA_DIR/cookies.txt` | Path to YouTube cookies file. |
| `YTDLP_PATH` | `/usr/local/bin/yt-dlp` or `yt-dlp` | Executable path for `yt-dlp`. |

---

## Bypassing YouTube Bot Checks on Datacenter IPs

YouTube often blocks requests coming from VPS / datacenter IP ranges with `Sign in to confirm you're not a bot`.

To fix this:

1. Export your YouTube session cookies in Netscape format (using browser extensions such as *Get cookies.txt LOCALLY*).
2. Save the file on the server as `/var/lib/morrow/cookies.txt` (or path set by `COOKIES_PATH`):
   ```bash
   scp cookies.txt user@your-server:/var/lib/morrow/cookies.txt
   ```
3. Morrow automatically includes `--cookies` in all `yt-dlp` operations whenever the file is present.

---

## API Reference

### `GET /health`
Returns service health and queue count.

**Response:**
```json
{
  "status": "ok",
  "app": "Morrow",
  "timestamp": 1790157205039,
  "queue_active": 0
}
```

### `POST /api/metadata`
Fetches video information without downloading.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Response:**
```json
{
  "id": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "duration": "3:33",
  "thumbnail": "https://i.ytimg.com/...",
  "uploader": "Rick Astley"
}
```

### `GET /api/queue`
Returns list of current and recent jobs.

### `POST /api/queue`
Enqueues one or more URLs for download.

**Request:**
```json
{
  "urls": [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  ],
  "format_type": "video",
  "quality": "1080p"
}
```

### `DELETE /api/queue`
Cancels or removes a job.

**Request:**
```json
{
  "id": "b4bdaa70-ab8",
  "action": "cancel"
}
```

### `GET /api/events`
Server-Sent Events (SSE) endpoint for live job status and download progress updates.

### `GET /api/download/:id`
Streams the completed media file as an attachment download with proper MIME headers.

---

## License

MIT
