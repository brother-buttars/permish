<script lang="ts">
	import { onMount } from "svelte";
	import * as pdfjsLib from "pdfjs-dist";

	let { src, class: className = "" }: { src: string; class?: string } = $props();

	let container: HTMLDivElement | undefined = $state();
	let pageCount = $state(0);
	let currentPage = $state(1);
	let scale = $state(1);
	let pdfDoc: any = $state(null);
	let rendering = $state(false);
	let canvases: HTMLCanvasElement[] = $state([]);

	onMount(() => {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			"pdfjs-dist/build/pdf.worker.mjs",
			import.meta.url
		).toString();

		loadPdf();
	});

	async function loadPdf() {
		if (!src) return;
		try {
			const doc = await pdfjsLib.getDocument(src).promise;
			pdfDoc = doc;
			pageCount = doc.numPages;
			// Render all pages
			await renderAllPages();
		} catch (err) {
			console.error("Failed to load PDF:", err);
		}
	}

	async function renderAllPages() {
		if (!pdfDoc || !container) return;
		rendering = true;

		// Clear existing canvases
		canvases = [];

		for (let i = 1; i <= pdfDoc.numPages; i++) {
			const page = await pdfDoc.getPage(i);
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
			canvases.push(canvas);
		}

		canvases = [...canvases]; // trigger reactivity
		rendering = false;
	}

	$effect(() => {
		if (container && canvases.length > 0) {
			// Clear container and append canvases
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			for (const canvas of canvases) {
				const wrapper = document.createElement("div");
				wrapper.style.marginBottom = "8px";
				wrapper.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)";
				wrapper.style.borderRadius = "4px";
				wrapper.style.overflow = "hidden";
				wrapper.style.backgroundColor = "white";
				wrapper.appendChild(canvas);
				container.appendChild(wrapper);
			}
		}
	});
</script>

<div class="overflow-auto bg-muted/30 rounded-md {className}">
	{#if rendering || canvases.length === 0}
		<div class="flex items-center justify-center py-12">
			<p class="text-muted-foreground">Loading PDF...</p>
		</div>
	{/if}
	<div bind:this={container} class="p-4 space-y-2"></div>
</div>
