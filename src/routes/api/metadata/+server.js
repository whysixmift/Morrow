import { json } from '@sveltejs/kit';
import { fetchMetadata, isValidYouTubeUrl } from '$lib/server/ytdlp.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { url } = body;

		if (!url || !isValidYouTubeUrl(url)) {
			return json({ error: 'Please enter a valid YouTube URL' }, { status: 400 });
		}

		const meta = await fetchMetadata(url);
		return json(meta);
	} catch (err) {
		return json({ error: err.message || 'Failed to fetch video details' }, { status: 500 });
	}
}
