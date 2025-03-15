<script lang="ts">
	import type { TrueTypeFont } from "./TrueType"

	const sizes = [12, 18, 24, 36, 48, 60, 72]
	const message = "The quick brown fox jumps over the lazy dog. 1234567890"

	const { ttf }: { ttf: TrueTypeFont } = $props()
</script>

<header>
	<div>Font name: {ttf.fontFamily}</div>
</header>

<div class="chars" style:--font-family={ttf.fontFamily}>
	<div>abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
	<div>1234567890.:,;'"(!?) +-*/=</div>
</div>

<main style:--font-family={ttf.fontFamily}>
	{#each sizes as size}
		<div class="size">{size}</div>
		<div class="message" style:--font-size="{size}px">{message}</div>
	{/each}
</main>

<style>
	header {
		font-size: 14px;
		padding: 0.5rem;
		border-bottom: 1px solid var(--vscode-editor-foreground);
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
