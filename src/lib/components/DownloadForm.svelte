<script>
	let { onEnqueue } = $props();

	let inputText = $state('');
	let formatType = $state('video');
	let quality = $state('best');
	let isSubmitting = $state(false);
	let errorMessage = $state('');

	// Parse valid URLs from input
	const lines = $derived(
		inputText
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.length > 0)
	);

	const urlCount = $derived(lines.length);

	// Update default quality when format type switches
	function handleFormatChange(e) {
		formatType = e.target.value;
		if (formatType === 'audio') {
			quality = 'mp3';
		} else {
			quality = 'best';
		}
	}

	async function handleSubmit(e) {
		e?.preventDefault();
		if (urlCount === 0 || isSubmitting) return;

		errorMessage = '';
		isSubmitting = true;

		try {
			const res = await fetch('/api/queue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					urls: lines,
					format_type: formatType,
					quality: quality
				})
			});

			const data = await res.json();
			if (!res.ok || data.error) {
				errorMessage = data.error || 'Failed to queue download';
				return;
			}

			// Clear input on success
			inputText = '';
			if (onEnqueue) {
				onEnqueue(data.jobs);
			}
		} catch (err) {
			errorMessage = err.message || 'Network error occurred';
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeyDown(e) {
		// Submit on Ctrl+Enter or Cmd+Enter
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			handleSubmit();
		}
	}
</script>

<form class="form-card" onsubmit={handleSubmit}>
	<textarea
		class="url-input"
		bind:value={inputText}
		onkeydown={handleKeyDown}
		placeholder="Paste YouTube URL (or multiple URLs, one per line)..."
		rows={urlCount > 1 ? Math.min(urlCount + 1, 6) : 2}
		disabled={isSubmitting}
	></textarea>

	{#if errorMessage}
		<p style="color: var(--danger); font-size: 12px; margin-top: 8px;">{errorMessage}</p>
	{/if}

	<div class="controls-row">
		<div class="controls-group">
			<select class="select-control" value={formatType} onchange={handleFormatChange} disabled={isSubmitting}>
				<option value="video">Video</option>
				<option value="audio">Audio</option>
			</select>

			<select class="select-control" bind:value={quality} disabled={isSubmitting}>
				{#if formatType === 'video'}
					<option value="best">Best (Auto)</option>
					<option value="1080p">1080p HD</option>
					<option value="720p">720p HD</option>
					<option value="480p">480p</option>
					<option value="360p">360p</option>
				{:else}
					<option value="mp3">MP3 (High Quality)</option>
					<option value="m4a">M4A (Direct Stream)</option>
				{/if}
			</select>

			{#if urlCount > 1}
				<span class="url-count-tag">{urlCount} URLs detected</span>
			{/if}
		</div>

		<button type="submit" class="btn-primary" disabled={urlCount === 0 || isSubmitting}>
			{#if isSubmitting}
				Queueing...
			{:else if urlCount > 1}
				Queue ({urlCount})
			{:else}
				Download
			{/if}
		</button>
	</div>
</form>
