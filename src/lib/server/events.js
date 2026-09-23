// Simple Server-Sent Events (SSE) broadcaster

const clients = new Set();

export function addClient(controller) {
	clients.add(controller);
	return () => {
		clients.delete(controller);
	};
}

export function broadcast(event, data) {
	if (clients.size === 0) return;

	const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	const encoder = new TextEncoder();
	const encoded = encoder.encode(message);

	for (const client of clients) {
		try {
			client.enqueue(encoded);
		} catch {
			clients.delete(client);
		}
	}
}

export function broadcastJobUpdate(job) {
	broadcast('job_update', job);
}
