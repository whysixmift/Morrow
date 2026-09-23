<script>
	import QueueItem from './QueueItem.svelte';

	let { jobs = [], onRemove, onCancel } = $props();

	const hasActiveJobs = $derived(
		jobs.some((j) => ['queued', 'fetching', 'downloading', 'processing'].includes(j.status))
	);
</script>

<div class="queue-section">
	<div class="queue-header">
		<span class="queue-title">
			Downloads {#if jobs.length > 0}({jobs.length}){/if}
		</span>
		{#if hasActiveJobs}
			<span style="font-size: 11px; color: #60a5fa; font-family: var(--font-mono); display: flex; align-items: center; gap: 4px;">
				<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #60a5fa; animation: pulse 1.5s infinite;"></span>
				Processing
			</span>
		{/if}
	</div>

	{#if jobs.length === 0}
		<div class="empty-state">
			No recent downloads. Paste a link above to begin.
		</div>
	{:else}
		<div class="queue-items">
			{#each jobs as job (job.id)}
				<QueueItem {job} {onRemove} {onCancel} />
			{/each}
		</div>
	{/if}
</div>

<style>
	@keyframes pulse {
		0% { opacity: 0.4; }
		50% { opacity: 1; }
		100% { opacity: 0.4; }
	}
</style>
