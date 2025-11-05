<script lang="ts">
	const sizes = [12, 18, 24, 36, 48, 60, 72]

	const vscode = acquireVsCodeApi<{ text: string }>()
	let fontFamily = document.head.querySelector<HTMLMetaElement>("meta[name=fontFamily]")!.content
	let text = $state(vscode.getState()?.text ?? "The quick brown fox jumps over the lazy dog. 1234567890")

	$effect(() => {
		vscode.setState({ text: text })
	})
</script>

<header>
	<div>Font name:</div>
	<div>{fontFamily}</div>
	<div>Text:</div>
	<div><input type="text" bind:value={text} /></div>
</header>

<div class="chars" style:--font-family={fontFamily}>
	<div>abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
	<div>1234567890.:,;'"(!?) +-*/=</div>
</div>

<main style:--font-family={fontFamily}>
	{#each sizes as size}
		<div class="size">{size}</div>
		<div class="message" style:--font-size="{size}px">{text}</div>
	{/each}
</main>

<style>
	header {
		font-size: 14px;
		white-space: nowrap;
		display: inline-grid;
		gap: 3px 0.5rem;
		width: min-content;
		grid-template-columns: 1fr 1fr;
		padding: 0.5rem;
		border-bottom: 1px solid var(--vscode-editor-foreground);

		input {
			font-family: system-ui;
			font-size: 14px;
			color: var(--vscode-editor-foreground);
			padding: 0;
			background: none;
			border: none;
			border-radius: 3px;
			min-width: 100%;
			field-sizing: content;
		}
	}

	div.chars {
		font-family: var(--font-family);
		font-size: 18px;
		padding: 0.5rem;
		border-bottom: 1px solid var(--vscode-editor-foreground);
		margin-bottom: 0.5rem;
	}

	main {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		gap: 1rem;
		margin-left: 0.25rem;

		& div.size {
			font-size: 14px;
		}

		& div.message {
			font-family: var(--font-family);
			font-size: var(--font-size);
			white-space: nowrap;
			overflow: hidden;
		}
	}
</style>
