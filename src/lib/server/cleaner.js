import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getExpiredJobs, updateJobStatus, purgeOldRecords, getDb } from './db.js';
import { broadcastJobUpdate } from './events.js';

let intervalId = null;

export function cleanupExpiredFiles() {
	try {
		const now = Date.now();
		const expiredJobs = getExpiredJobs(now);

		for (const job of expiredJobs) {
			const jobDir = path.join(config.STORAGE_DIR, job.id);
			if (fs.existsSync(jobDir)) {
				try {
					fs.rmSync(jobDir, { recursive: true, force: true });
				} catch (err) {
					console.error(`Failed removing expired folder ${jobDir}:`, err);
				}
			}

			const updated = updateJobStatus(job.id, 'expired');
			broadcastJobUpdate(updated);
		}

		// Also clean orphaned folders in STORAGE_DIR not belonging to any active job
		if (fs.existsSync(config.STORAGE_DIR)) {
			const dirs = fs.readdirSync(config.STORAGE_DIR, { withFileTypes: true });
			const d = getDb();

			for (const dir of dirs) {
				if (!dir.isDirectory()) continue;
				const jobId = dir.name;
				const stmt = d.prepare('SELECT status, expires_at FROM jobs WHERE id = ?');
				const row = stmt.get(jobId);

				if (!row || row.status === 'expired' || (row.expires_at > 0 && row.expires_at <= now)) {
					const target = path.join(config.STORAGE_DIR, jobId);
					try {
						fs.rmSync(target, { recursive: true, force: true });
					} catch {}
				}
			}
		}

		// Clean old DB entries (older than 24h)
		purgeOldRecords(24 * 60 * 60 * 1000);
	} catch (err) {
		console.error('Error during cleanup run:', err);
	}
}

export function startCleanupSchedule() {
	if (intervalId) return;
	// Initial cleanup on boot
	cleanupExpiredFiles();
	intervalId = setInterval(cleanupExpiredFiles, config.CLEANUP_INTERVAL_MS);
}

export function stopCleanupSchedule() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}
