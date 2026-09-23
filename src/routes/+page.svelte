<script>
	import { onMount, onDestroy } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import DownloadForm from '$lib/components/DownloadForm.svelte';
	import QueueList from '$lib/components/QueueList.svelte';

	let jobs = $state([]);
	let eventSource = null;

	function connectEventSource() {
		if (typeof window === 'undefined') return;

		eventSource = new EventSource('/api/events');

		eventSource.addEventListener('init', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (Array.isArray(data.jobs)) {
					jobs = data.jobs;
				}
			} catch (err) {
				console.error('Failed to parse init jobs:', err);
			}
		});

		eventSource.addEventListener('job_update', (e) => {
			try {
				const updatedJob = JSON.parse(e.data);
				if (updatedJob._deleted) {
					jobs = jobs.filter((j) => j.id !== updatedJob.id);
					return;
				}

				const idx = jobs.findIndex((j) => j.id === updatedJob.id);
				if (idx >= 0) {
					// Update existing job in place
					jobs[idx] = updatedJob;
				} else {
					// Prepend newly created job
					jobs = [updatedJob, ...jobs];
				}
			} catch (err) {
				console.error('Failed to parse job update:', err);
			}
		});

		eventSource.onerror = () => {
			// Auto reconnect after 3 seconds if connection drops
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
			setTimeout(connectEventSource, 3000);
		};
	}

	onMount(() => {
		connectEventSource();
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	async function handleRemove(id) {
		// Optimistic UI update
		jobs = jobs.filter((j) => j.id !== id);
		try {
			await fetch('/api/queue', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
		} catch (err) {
			console.error('Failed to remove job:', err);
		}
	}

	async function handleCancel(id) {
		try {
			await fetch('/api/queue', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action: 'cancel' })
			});
		} catch (err) {
			console.error('Failed to cancel job:', err);
		}
	}

	function handleEnqueue(newJobs) {
		if (Array.isArray(newJobs)) {
			// Optimistically merge new jobs
			const existingIds = new Set(jobs.map((j) => j.id));
			const toAdd = newJobs.filter((j) => !existingIds.has(j.id));
			jobs = [...toAdd, ...jobs];
		}
	}
</script>

<Header />
<DownloadForm onEnqueue={handleEnqueue} />
<QueueList {jobs} onRemove={handleRemove} onCancel={handleCancel} />
