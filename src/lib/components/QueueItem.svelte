<script>
	let { job, onRemove, onCancel } = $props();

	function formatBytes(bytes) {
		if (!bytes || bytes === 0) return '';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
	}

	const isFinished = $derived(
		job.status === 'completed' || job.status === 'failed' || job.status === 'expired' || job.status === 'cancelled'
	);

	const isWorking = $derived(
		job.status === 'queued' || job.status === 'fetching' || job.status === 'downloading' || job.status === 'processing'
	);
</script>

<div class="queue-item">
	{#if job.thumbnail}
		<img src={job.thumbnail} alt="" class="queue-thumb" loading="lazy" />
	{:else}
		<div class="queue-thumb" style="display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--fg-subtle);">
			▶
		</div>
	{/if}

	<div class="queue-info">
		<div class="queue-item-title" title={job.title || job.url}>
			{job.title || job.url}
		</div>

		<div class="queue-item-meta">
			<span class="badge {job.format_type === 'audio' ? 'badge-audio' : 'badge-video'}">
				{job.format_type === 'audio' ? 'AUD' : 'VID'} · {job.quality}
			</span>

			<span class="status-badge status-{job.status}">
				{#if job.status === 'downloading'}
					{job.progress ? job.progress.toFixed(0) : '0'}%
					{#if job.speed} · {job.speed}{/if}
					{#if job.eta} · ETA {job.eta}{/if}
				{:else if job.status === 'processing'}
					processing...
				{:else if job.status === 'fetching'}
					fetching info...
				{:else if job.status === 'queued'}
					queued
				{:else if job.status === 'completed'}
					ready {job.file_size ? `(${formatBytes(job.file_size)})` : ''}
				{:else if job.status === 'failed'}
					failed: {job.error_message || 'unknown error'}
				{:else if job.status === 'expired'}
					file expired
				{:else if job.status === 'cancelled'}
					cancelled
				{/if}
			</span>
		</div>
	</div>

	<div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
		{#if job.status === 'completed'}
			<a
				href="/api/download/{job.id}"
				download
				class="btn-primary"
				style="text-decoration: none; padding: 4px 10px; font-size: 11px;"
			>
				Download
			</a>
		{/if}

		{#if isWorking}
			<button
				type="button"
				class="btn-danger"
				onclick={() => onCancel && onCancel(job.id)}
				title="Cancel download"
			>
				Cancel
			</button>
		{:else if isFinished}
			<button
				type="button"
				class="btn-secondary"
				style="padding: 3px 8px; font-size: 11px; color: var(--fg-subtle);"
				onclick={() => onRemove && onRemove(job.id)}
				title="Remove from list"
			>
				✕
			</button>
		{/if}
	</div>

	{#if job.status === 'downloading'}
		<div class="progress-bar-bg">
			<div class="progress-bar-fill" style="width: {job.progress || 0}%"></div>
		</div>
	{/if}
</div>
