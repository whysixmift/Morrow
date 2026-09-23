import fs from 'node:fs';
import path from 'node:path';
import { getJob } from '$lib/server/db.js';
import { config } from '$lib/server/config.js';

export function GET({ params }) {
	const { id } = params;

	if (!id || typeof id !== 'string') {
		return new Response('Invalid job ID', { status: 400 });
	}

	const job = getJob(id);
	if (!job) {
		return new Response('Job not found', { status: 404 });
	}

	if (job.status !== 'completed') {
		return new Response(`Job is not completed yet (current status: ${job.status})`, { status: 400 });
	}

	if (!job.file_path || !fs.existsSync(job.file_path)) {
		return new Response('File no longer exists or has expired', { status: 404 });
	}

	// Security check: ensure path is within STORAGE_DIR
	const resolved = path.resolve(job.file_path);
	if (!resolved.startsWith(path.resolve(config.STORAGE_DIR))) {
		return new Response('Access denied', { status: 403 });
	}

	const stat = fs.statSync(resolved);
	const nodeStream = fs.createReadStream(resolved);

	// Convert Node.js ReadableStream to web ReadableStream
	const webStream = new ReadableStream({
		start(controller) {
			nodeStream.on('data', (chunk) => controller.enqueue(chunk));
			nodeStream.on('end', () => controller.close());
			nodeStream.on('error', (err) => controller.error(err));
		},
		cancel() {
			nodeStream.destroy();
		}
	});

	// Determine MIME type
	let contentType = 'application/octet-stream';
	const ext = path.extname(job.file_name || resolved).toLowerCase();
	if (ext === '.mp4') contentType = 'video/mp4';
	else if (ext === '.mkv') contentType = 'video/x-matroska';
	else if (ext === '.webm') contentType = 'video/webm';
	else if (ext === '.mp3') contentType = 'audio/mpeg';
	else if (ext === '.m4a') contentType = 'audio/mp4';
	else if (ext === '.opus') contentType = 'audio/opus';

	const safeFilename = encodeURIComponent(job.file_name || `download${ext}`).replace(/['()]/g, escape);

	return new Response(webStream, {
		headers: {
			'Content-Type': contentType,
			'Content-Length': stat.size.toString(),
			'Content-Disposition': `attachment; filename="${job.file_name || 'download' + ext}"; filename*=UTF-8''${safeFilename}`,
			'Cache-Control': 'no-store'
		}
	});
}
