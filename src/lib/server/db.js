import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

let db;

function initDb() {
	if (db) return db;

	db = new DatabaseSync(config.DB_PATH);

	// Optimize SQLite performance & durability with WAL mode
	db.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA synchronous = NORMAL;
		PRAGMA foreign_keys = ON;

		CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY,
			url TEXT NOT NULL,
			title TEXT DEFAULT '',
			duration TEXT DEFAULT '',
			thumbnail TEXT DEFAULT '',
			format_type TEXT NOT NULL,
			quality TEXT NOT NULL,
			status TEXT NOT NULL,
			progress REAL DEFAULT 0,
			speed TEXT DEFAULT '',
			eta TEXT DEFAULT '',
			file_path TEXT DEFAULT '',
			file_name TEXT DEFAULT '',
			file_size INTEGER DEFAULT 0,
			error_message TEXT DEFAULT '',
			created_at INTEGER NOT NULL,
			started_at INTEGER DEFAULT 0,
			completed_at INTEGER DEFAULT 0,
			expires_at INTEGER DEFAULT 0
		);

		CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
		CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
		CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
	`);

	// Reset any dangling 'downloading' or 'fetching' or 'processing' jobs from previous server run to 'failed' or 'queued'
	db.exec(`
		UPDATE jobs 
		SET status = 'failed', error_message = 'Interrupted by server restart'
		WHERE status IN ('downloading', 'fetching', 'processing');
	`);

	return db;
}

export function getDb() {
	if (!db) initDb();
	return db;
}

export function createJob(job) {
	const d = getDb();
	const stmt = d.prepare(`
		INSERT INTO jobs (
			id, url, title, duration, thumbnail, format_type, quality,
			status, progress, speed, eta, error_message, created_at, started_at,
			completed_at, expires_at
		) VALUES (
			?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?, ?,
			?, ?
		)
	`);

	stmt.run(
		job.id,
		job.url,
		job.title || '',
		job.duration || '',
		job.thumbnail || '',
		job.format_type,
		job.quality,
		job.status || 'queued',
		job.progress || 0,
		job.speed || '',
		job.eta || '',
		job.error_message || '',
		job.created_at || Date.now(),
		job.started_at || 0,
		job.completed_at || 0,
		job.expires_at || 0
	);

	return getJob(job.id);
}

export function getJob(id) {
	const d = getDb();
	const stmt = d.prepare('SELECT * FROM jobs WHERE id = ?');
	return stmt.get(id);
}

export function getAllJobs(limit = 50) {
	const d = getDb();
	const stmt = d.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?');
	return stmt.all(limit);
}

export function getActiveQueueCount() {
	const d = getDb();
	const stmt = d.prepare("SELECT COUNT(*) as count FROM jobs WHERE status IN ('queued', 'fetching', 'downloading', 'processing')");
	const row = stmt.get();
	return row ? row.count : 0;
}

export function getNextQueuedJob() {
	const d = getDb();
	const stmt = d.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1");
	return stmt.get();
}

export function updateJobStatus(id, status, error_message = '') {
	const d = getDb();
	const stmt = d.prepare(`
		UPDATE jobs 
		SET status = ?, error_message = ?
		WHERE id = ?
	`);
	stmt.run(status, error_message, id);
	return getJob(id);
}

export function updateJobMetadata(id, title, duration, thumbnail) {
	const d = getDb();
	const stmt = d.prepare(`
		UPDATE jobs 
		SET title = ?, duration = ?, thumbnail = ?
		WHERE id = ?
	`);
	stmt.run(title || '', duration || '', thumbnail || '', id);
	return getJob(id);
}

export function updateJobProgress(id, progress, speed, eta, status = 'downloading') {
	const d = getDb();
	const stmt = d.prepare(`
		UPDATE jobs 
		SET progress = ?, speed = ?, eta = ?, status = ?
		WHERE id = ?
	`);
	stmt.run(progress, speed || '', eta || '', status, id);
	return getJob(id);
}

export function completeJob(id, filePath, fileName, fileSize, expiresAt) {
	const d = getDb();
	const stmt = d.prepare(`
		UPDATE jobs 
		SET status = 'completed', progress = 100, speed = '', eta = '',
		    file_path = ?, file_name = ?, file_size = ?,
		    completed_at = ?, expires_at = ?
		WHERE id = ?
	`);
	const now = Date.now();
	stmt.run(filePath, fileName, fileSize, now, expiresAt, id);
	return getJob(id);
}

export function failJob(id, errorMessage) {
	const d = getDb();
	const stmt = d.prepare(`
		UPDATE jobs 
		SET status = 'failed', error_message = ?, progress = 0, speed = '', eta = ''
		WHERE id = ?
	`);
	stmt.run(errorMessage, id);
	return getJob(id);
}

export function getExpiredJobs(now = Date.now()) {
	const d = getDb();
	const stmt = d.prepare("SELECT * FROM jobs WHERE status = 'completed' AND expires_at > 0 AND expires_at <= ?");
	return stmt.all(now);
}

export function deleteJob(id) {
	const d = getDb();
	const stmt = d.prepare('DELETE FROM jobs WHERE id = ?');
	stmt.run(id);
}

export function purgeOldRecords(maxAgeMs = 24 * 60 * 60 * 1000) {
	const d = getDb();
	const cutoff = Date.now() - maxAgeMs;
	const stmt = d.prepare("DELETE FROM jobs WHERE status IN ('completed', 'failed', 'expired', 'cancelled') AND created_at < ?");
	stmt.run(cutoff);
}
