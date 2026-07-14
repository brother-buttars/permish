<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import * as pdfjsLib from "pdfjs-dist";

	let { src, class: className = "" }: { src: string; class?: string } = $props();

	let container: HTMLDivElement | undefined = $state();
	let pdfDoc: any = null;
	let rendering = $state(false);
	let error = $state(false);
	let canvases: HTMLCanvasElement[] = $state([]);
	// Cancels a stale load when src changes mid-flight or the viewer unmounts.
	let loadSeq = 0;

	onMount(() => {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			"pdfjs-dist/build/pdf.worker.mjs",
			import.meta.url
		).toString();
	});

	// React to src changes — the old version loaded once in onMount, so a live
	// instance kept rendering the previous document forever.
	$effect(() => {
		void src;
		loadPdf();
	});

	onDestroy(() => {
		loadSeq++;
		destroyDoc();
	});

	function destroyDoc() {
		// pdf.js documents hold worker-side state; without destroy() every
		// preview open/close cycle leaks a full document.
		pdfDoc?.destroy().catch(() => {});
		pdfDoc = null;
	}

	async function loadPdf() {
		const seq = ++loadSeq;
		destroyDoc();
		canvases = [];
		error = false;
		if (!src) return;
		try {
			const doc = await pdfjsLib.getDocument(src).promise;
			if (seq !== loadSeq) {
				doc.destroy().catch(() => {});
				return;
			}
			pdfDoc = doc;
			await renderAllPages(seq);
		} catch (err) {
			console.error("Failed to load PDF:", err);
			if (seq === loadSeq) error = true;
		}
	}

	async function renderAllPages(seq: number) {
		if (!pdfDoc) return;
		rendering = true;

		const rendered: HTMLCanvasElement[] = [];
		try {
			for (let i = 1; i <= pdfDoc.numPages; i++) {
				const page = await pdfDoc.getPage(i);
				if (seq !== loadSeq) return;
				const viewport = page.getViewport({ scale: 1.5 });

				const canvas = document.createElement("canvas");
				canvas.width = viewport.width;
				canvas.height = viewport.height;
				canvas.style.width = "100%";
				canvas.style.height = "auto";
				canvas.style.display = "block";

				const ctx = canvas.getContext("2d");
				if (!ctx) continue;

				await page.render({ canvasContext: ctx, viewport }).promise;
				if (seq !== loadSeq) return;
				rendered.push(canvas);
			}
			canvases = rendered;
		} finally {
			if (seq === loadSeq) rendering = false;
		}
	}

	$effect(() => {
		if (container && canvases.length > 0) {
			// Clear container and append canvases
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			for (const canvas of canvases) {
				const wrapper = document.createElement("div");
				wrapper.className = "mb-2 rounded overflow-hidden shadow-sm";
				// PDF pages are ink-on-paper; white stays white in dark mode.
				wrapper.style.backgroundColor = "white";
				wrapper.appendChild(canvas);
				container.appendChild(wrapper);
			}
		}
	});
</script>

<div class="overflow-auto bg-muted/30 rounded-md {className}">
	{#if error}
		<div class="flex flex-col items-center justify-center gap-2 py-12">
			<p class="text-destructive">Failed to load the PDF.</p>
			<button class="text-sm text-primary underline hover:no-underline" onclick={() => loadPdf()}>
				Try again
			</button>
		</div>
	{:else if rendering || canvases.length === 0}
		<div class="flex items-center justify-center py-12">
			<p class="text-muted-foreground">Loading PDF...</p>
		</div>
	{/if}
	<div bind:this={container} class="p-4 space-y-2"></div>
</div>
