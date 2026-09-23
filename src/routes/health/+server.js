import { json } from '@sveltejs/kit';
import { getActiveQueueCount } from '$lib/server/db.js';

export function GET() {
	return json({
		status: 'ok',
		app: 'Morrow',
		timestamp: Date.now(),
		queue_active: getActiveQueueCount()
	});
}
