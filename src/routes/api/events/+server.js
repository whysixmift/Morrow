import { addClient } from '$lib/server/events.js';
import { getAllJobs } from '$lib/server/db.js';

export function GET() {
	let cleanup;

	const stream = new ReadableStream({
		start(controller) {
			cleanup = addClient(controller);

			// Send initial state
			const initialJobs = getAllJobs(50);
			const initMessage = `event: init\ndata: ${JSON.stringify({ jobs: initialJobs })}\n\n`;
			controller.enqueue(new TextEncoder().encode(initMessage));

			// Keep-alive heartbeat every 15s
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
				} catch {
					clearInterval(heartbeat);
				}
			}, 15000);

			return () => {
				clearInterval(heartbeat);
				if (cleanup) cleanup();
			};
		},
		cancel() {
			if (cleanup) cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}
