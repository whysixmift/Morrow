import { json } from '@sveltejs/kit';
import { enqueueUrls, getAllJobs, removeJob, cancelJob } from '$lib/server/queue.js';

export function GET() {
	const jobs = getAllJobs(50);
	return json({ jobs });
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { urls, format_type, quality } = body;

		if (!urls || (Array.isArray(urls) && urls.length === 0)) {
			return json({ error: 'No URLs provided' }, { status: 400 });
		}

		const jobs = await enqueueUrls(urls, { format_type, quality });
		return json({ success: true, jobs });
	} catch (err) {
		return json({ error: err.message || 'Failed to enqueue job' }, { status: 400 });
	}
}

export async function DELETE({ request }) {
	try {
		const body = await request.json();
		const { id, action } = body;

		if (!id) {
			return json({ error: 'Job ID is required' }, { status: 400 });
		}

		if (action === 'cancel') {
			const job = cancelJob(id);
			return json({ success: true, job });
		} else {
			removeJob(id);
			return json({ success: true, id });
		}
	} catch (err) {
		return json({ error: err.message || 'Operation failed' }, { status: 400 });
	}
}
