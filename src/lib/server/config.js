import fs from 'node:fs';
import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

// Determine storage and database directories
let baseDir = process.env.MORROW_DATA_DIR;
if (!baseDir) {
	if (fs.existsSync('/var/lib/morrow') || (isProduction && process.getuid && process.getuid() === 0)) {
		baseDir = '/var/lib/morrow';
	} else {
		baseDir = path.resolve(process.cwd(), 'data');
	}
}

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(baseDir, 'downloads');
const DB_PATH = process.env.DB_PATH || path.join(baseDir, 'morrow.db');
const YTDLP_PATH = process.env.YTDLP_PATH || (fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp');

// Ensure directories exist
try {
	fs.mkdirSync(STORAGE_DIR, { recursive: true });
	fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
} catch (e) {
	console.error('Failed to create storage/db directory:', e);
}

export const config = {
	PORT: parseInt(process.env.PORT || '5050', 10),
	HOST: process.env.HOST || '0.0.0.0',
	STORAGE_DIR,
	DB_PATH,
	YTDLP_PATH,
	COOKIES_PATH: process.env.COOKIES_PATH || path.join(baseDir, 'cookies.txt'),
	MAX_CONCURRENT_JOBS: 1,
	MAX_QUEUE_SIZE: 50,
	MAX_URLS_PER_REQUEST: 10,
	JOB_EXPIRATION_MS: 30 * 60 * 1000, // 30 minutes
	CLEANUP_INTERVAL_MS: 60 * 1000,     // 1 minute
	MAX_JOB_TIMEOUT_MS: 15 * 60 * 1000  // 15 minutes
};
