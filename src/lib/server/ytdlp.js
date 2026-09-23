import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Regex to strictly match and sanitize YouTube URLs
const YOUTUBE_URL_REGEX = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})([?&][\w=&%-]*)?$/;

export function isValidYouTubeUrl(url) {
	if (!url || typeof url !== 'string') return false;
	const trimmed = url.trim();
	return YOUTUBE_URL_REGEX.test(trimmed);
}

export function extractVideoId(url) {
	if (!url) return null;
	const match = url.trim().match(/(?:v=|\/shorts\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
	return match ? match[1] : null;
}

export function cleanYouTubeUrl(url) {
	const videoId = extractVideoId(url);
	if (!videoId) return null;
	return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Fetch video metadata quickly using yt-dlp --dump-single-json
 */
function getBaseArgs() {
	const args = [
		'--no-playlist',
		'--no-warnings',
		'--js-runtimes', 'node'
	];
	if (config.COOKIES_PATH && fs.existsSync(config.COOKIES_PATH)) {
		args.push('--cookies', config.COOKIES_PATH);
	}
	return args;
}

function sanitizeErrorMessage(errMsg, exitCode) {
	if (!errMsg) return `Process exited with code ${exitCode}`;
	if (errMsg.includes('Sign in to confirm') || errMsg.includes('not a bot')) {
		return "YouTube blocked this request (bot detection). Add cookies.txt to server to bypass.";
	}
	if (errMsg.includes('Video unavailable') || errMsg.includes('Private video')) {
		return 'Video is unavailable, private, or deleted.';
	}
	if (errMsg.includes('members-only')) {
		return 'Video is members-only.';
	}
	// Return the primary error line
	const lines = errMsg.split('\n').filter(l => l.includes('ERROR:'));
	if (lines.length > 0) {
		return lines[0].replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '');
	}
	return errMsg.slice(0, 150);
}

/**
 * Fetch video metadata quickly using yt-dlp --dump-single-json
 */
export async function fetchMetadata(rawUrl) {
	const cleanUrl = cleanYouTubeUrl(rawUrl);
	if (!cleanUrl) {
		throw new Error('Invalid YouTube URL');
	}

	return new Promise((resolve, reject) => {
		const args = [
			'--dump-single-json',
			...getBaseArgs(),
			cleanUrl
		];

		const child = spawn(config.YTDLP_PATH, args, {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		const timeout = setTimeout(() => {
			child.kill('SIGTERM');
			reject(new Error('Metadata retrieval timed out (30s)'));
		}, 30000);

		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		child.on('close', (code) => {
			clearTimeout(timeout);
			if (code !== 0) {
				const errMsg = sanitizeErrorMessage(stderr.trim(), code);
				reject(new Error(errMsg));
				return;
			}

			try {
				const data = JSON.parse(stdout);
				resolve({
					id: data.id,
					url: cleanUrl,
					title: data.title || 'Untitled',
					duration: data.duration ? formatDuration(data.duration) : data.duration_string || '',
					thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails[0]?.url) || '',
					uploader: data.uploader || data.channel || ''
				});
			} catch (err) {
				reject(new Error(`Failed to parse metadata: ${err.message}`));
			}
		});

		child.on('error', (err) => {
			clearTimeout(timeout);
			reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
		});
	});
}

function formatDuration(seconds) {
	if (!seconds || isNaN(seconds)) return '';
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	if (hrs > 0) {
		return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Execute media download using yt-dlp and FFmpeg
 */
export function executeDownload(job, { onProgress, onStatusChange }) {
	let childProcess = null;
	let isCancelled = false;

	const promise = new Promise((resolve, reject) => {
		const cleanUrl = cleanYouTubeUrl(job.url);
		if (!cleanUrl) {
			return reject(new Error('Invalid YouTube URL'));
		}

		const jobDir = path.join(config.STORAGE_DIR, job.id);
		fs.mkdirSync(jobDir, { recursive: true });

		const args = [
			...getBaseArgs(),
			'--newline',
			'--progress-template', 'download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
			'-o', path.join(jobDir, '%(title).100s [%(id)s].%(ext)s')
		];

		// Format selection
		if (job.format_type === 'audio') {
			if (job.quality === 'mp3') {
				args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
			} else if (job.quality === 'm4a') {
				args.push('-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a');
			} else {
				// Default best audio
				args.push('-x', '--audio-format', 'mp3');
			}
		} else {
			// Video format
			const q = job.quality || 'best';
			if (q === '1080p') {
				args.push('-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4');
			} else if (q === '720p') {
				args.push('-f', 'bv*[height<=720]+ba/b[height<=720]/b', '--merge-output-format', 'mp4');
			} else if (q === '480p') {
				args.push('-f', 'bv*[height<=480]+ba/b[height<=480]/b', '--merge-output-format', 'mp4');
			} else if (q === '360p') {
				args.push('-f', 'bv*[height<=360]+ba/b[height<=360]/b', '--merge-output-format', 'mp4');
			} else {
				// Best available
				args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
			}
		}

		args.push(cleanUrl);

		const child = spawn(config.YTDLP_PATH, args, {
			stdio: ['ignore', 'pipe', 'pipe']
		});
		childProcess = child;

		let stderr = '';
		let currentStatus = 'downloading';

		const timeout = setTimeout(() => {
			if (childProcess) {
				childProcess.kill('SIGTERM');
			}
			reject(new Error(`Download exceeded maximum time limit (${config.MAX_JOB_TIMEOUT_MS / 60000} minutes)`));
		}, config.MAX_JOB_TIMEOUT_MS);

		child.stdout.on('data', (chunk) => {
			const lines = chunk.toString().split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				if (trimmed.startsWith('download:')) {
					// Format: download: XX.X%|XX.XXMiB/s|MM:SS
					const parts = trimmed.slice(9).split('|');
					const percentStr = parts[0] ? parts[0].replace('%', '').trim() : '0';
					const percent = parseFloat(percentStr) || 0;
					const speed = parts[1] ? parts[1].trim() : '';
					const eta = parts[2] ? parts[2].trim() : '';

					if (currentStatus !== 'downloading') {
						currentStatus = 'downloading';
						if (onStatusChange) onStatusChange(currentStatus);
					}

					if (onProgress) {
						onProgress(percent, speed, eta);
					}
				} else if (trimmed.includes('[Merger]') || trimmed.includes('[ExtractAudio]') || trimmed.includes('[Fixup')) {
					if (currentStatus !== 'processing') {
						currentStatus = 'processing';
						if (onStatusChange) onStatusChange('processing');
					}
				}
			}
		});

		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		child.on('close', (code) => {
			clearTimeout(timeout);
			if (isCancelled) {
				// Clean directory if cancelled
				try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
				reject(new Error('Cancelled by user'));
				return;
			}

			if (code !== 0) {
				try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
				const errMsg = stderr.trim() || `Process exited with code ${code}`;
				reject(new Error(errMsg));
				return;
			}

			// Locate generated file in jobDir
			try {
				const files = fs.readdirSync(jobDir);
				// Filter out any partial files (.part, .ytdl)
				const completedFiles = files.filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.temp'));
				if (completedFiles.length === 0) {
					try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
					reject(new Error('Download finished but no output file was created'));
					return;
				}

				const fileName = completedFiles[0];
				const filePath = path.join(jobDir, fileName);
				const stats = fs.statSync(filePath);

				resolve({
					filePath,
					fileName,
					fileSize: stats.size
				});
			} catch (err) {
				try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
				reject(new Error(`Failed reading output file: ${err.message}`));
			}
		});

		child.on('error', (err) => {
			clearTimeout(timeout);
			try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
			reject(new Error(`Failed to run yt-dlp: ${err.message}`));
		});
	});

	return {
		promise,
		cancel: () => {
			isCancelled = true;
			if (childProcess) {
				try {
					childProcess.kill('SIGKILL');
				} catch {}
			}
		}
	};
}
