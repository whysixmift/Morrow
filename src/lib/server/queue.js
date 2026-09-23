import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import {
	createJob,
	getJob,
	getAllJobs,
	getNextQueuedJob,
	updateJobStatus,
	updateJobMetadata,
	updateJobProgress,
	completeJob,
	failJob,
	deleteJob,
	getActiveQueueCount
} from './db.js';
import { broadcastJobUpdate } from './events.js';
import { executeDownload, fetchMetadata, isValidYouTubeUrl, cleanYouTubeUrl } from './ytdlp.js';
import { startCleanupSchedule } from './cleaner.js';

// Active running job controllers map: jobId -> { cancel, job }
const activeJobs = new Map();
let isProcessing = false;

// Ensure cleaner is scheduled
startCleanupSchedule();

/**
 * Add single or multiple URLs to the queue
 */
export async function enqueueUrls(urls, { format_type = 'video', quality = 'best' }) {
	if (!Array.isArray(urls)) {
		urls = [urls];
	}

	// Filter and validate URLs
	const validUrls = [];
	for (const raw of urls) {
		if (typeof raw !== 'string') continue;
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (isValidYouTubeUrl(trimmed)) {
			const clean = cleanYouTubeUrl(trimmed);
			if (clean) validUrls.push(clean);
		}
	}

	if (validUrls.length === 0) {
		throw new Error('No valid YouTube URLs provided');
	}

	if (validUrls.length > config.MAX_URLS_PER_REQUEST) {
		throw new Error(`Maximum ${config.MAX_URLS_PER_REQUEST} URLs allowed per request`);
	}

	const currentQueueCount = getActiveQueueCount();
	if (currentQueueCount + validUrls.length > config.MAX_QUEUE_SIZE) {
		throw new Error(`Queue is full (maximum ${config.MAX_QUEUE_SIZE} active items)`);
	}

	const createdJobs = [];

	for (const url of validUrls) {
		const id = randomUUID().slice(0, 12);
		const jobData = {
			id,
			url,
			title: 'Fetching details...',
			duration: '',
			thumbnail: '',
			format_type: format_type === 'audio' ? 'audio' : 'video',
			quality: quality || 'best',
			status: 'queued',
			progress: 0,
			speed: '',
			eta: '',
			created_at: Date.now()
		};

		const job = createJob(jobData);
		createdJobs.push(job);
		broadcastJobUpdate(job);
	}

	// Trigger queue processor
	processQueue();

	return createdJobs;
}

/**
 * Main queue runner
 */
export async function processQueue() {
	if (isProcessing) return;
	isProcessing = true;

	try {
		while (activeJobs.size < config.MAX_CONCURRENT_JOBS) {
			const nextJob = getNextQueuedJob();
			if (!nextJob) break;

			await runJob(nextJob);
		}
	} finally {
		isProcessing = false;
	}
}

/**
 * Run a single job
 */
async function runJob(job) {
	const jobId = job.id;

	// Mark status fetching / starting
	let currentJob = updateJobStatus(jobId, 'fetching');
	broadcastJobUpdate(currentJob);

	// Try quick metadata fetch if title is not populated
	try {
		const meta = await fetchMetadata(job.url);
		currentJob = updateJobMetadata(jobId, meta.title, meta.duration, meta.thumbnail);
		broadcastJobUpdate(currentJob);
	} catch (err) {
		console.warn(`[Morrow] Metadata fetch warning for ${jobId}:`, err.message);
	}

	let lastProgressUpdate = 0;

	const dlHandle = executeDownload(currentJob, {
		onProgress: (percent, speed, eta) => {
			const now = Date.now();
			if (now - lastProgressUpdate > 200 || percent === 100) {
				lastProgressUpdate = now;
				const updated = updateJobProgress(jobId, percent, speed, eta, 'downloading');
				broadcastJobUpdate(updated);
			}
		},
		onStatusChange: (newStatus) => {
			const updated = updateJobStatus(jobId, newStatus);
			broadcastJobUpdate(updated);
		}
	});

	activeJobs.set(jobId, dlHandle);

	dlHandle.promise
		.then(({ filePath, fileName, fileSize }) => {
			activeJobs.delete(jobId);
			const expiresAt = Date.now() + config.JOB_EXPIRATION_MS;
			const completed = completeJob(jobId, filePath, fileName, fileSize, expiresAt);
			broadcastJobUpdate(completed);
			// Process next job in queue
			processQueue();
		})
		.catch((err) => {
			activeJobs.delete(jobId);
			const failed = failJob(jobId, err.message || 'Download failed');
			broadcastJobUpdate(failed);
			// Process next job in queue
			processQueue();
		});
}

/**
 * Cancel a job
 */
export function cancelJob(id) {
	if (activeJobs.has(id)) {
		const handle = activeJobs.get(id);
		handle.cancel();
		activeJobs.delete(id);
	}

	const updated = updateJobStatus(id, 'cancelled', 'Cancelled by user');
	broadcastJobUpdate(updated);
	processQueue();
	return updated;
}

/**
 * Delete a job record
 */
export function removeJob(id) {
	cancelJob(id);
	deleteJob(id);
	broadcastJobUpdate({ id, _deleted: true });
}

export { getAllJobs, getJob };
