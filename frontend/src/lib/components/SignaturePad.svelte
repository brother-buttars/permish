<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";

	let {
		label,
		value = $bindable(""),
		type = $bindable<"drawn" | "typed">("drawn"),
		date = $bindable(""),
		initialValue = "",
		initialType = undefined,
		showDate = true,
	}: {
		label: string;
		value: string;
		type: "drawn" | "typed";
		date: string;
		initialValue?: string;
		initialType?: "drawn" | "typed";
		showDate?: boolean;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = $state(null);
	let isDrawing = $state(false);
	let typedName = $state("");
	let hasDrawn = $state(false);

	function getToday(): string {
		const d = new Date();
		return d.toISOString().split("T")[0];
	}

	let initialized = false;
	let lastInitialValue = "";

	onMount(() => {
		if (!date) date = getToday();
		applyInitialValues();
		initialized = true;
	});

	function applyInitialValues() {
		if (initialType) {
			type = initialType;
		}
		if (initialValue) {
			if ((initialType ?? type) === "typed") {
				typedName = initialValue;
				value = initialValue;
			} else {
				value = initialValue;
				hasDrawn = true;
				if (canvas) loadImageToCanvas(initialValue);
			}
		}
		lastInitialValue = initialValue;
	}

	// Re-init canvas whenever the canvas element appears
	$effect(() => {
		if (canvas && initialized) {
			initCanvas();
		}
	});

	// React to initialValue changes (e.g., profile selection after mount)
	$effect(() => {
		if (initialized && initialValue !== lastInitialValue) {
			applyInitialValues();
		}
	});

	function initCanvas() {
		if (!canvas) return;
		ctx = canvas.getContext("2d");
		if (!ctx) return;

		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;

		ctx.strokeStyle = "#000";
		ctx.lineWidth = 2;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		// Redraw if there was an initial drawn value
		if (initialValue && (initialType ?? "drawn") === "drawn") {
			loadImageToCanvas(initialValue);
		}
	}

	function loadImageToCanvas(dataUrl: string) {
		if (!ctx || !canvas) return;
		const img = new Image();
		img.onload = () => {
			ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
			ctx!.drawImage(img, 0, 0, canvas!.width, canvas!.height);
		};
		img.src = dataUrl;
	}

	function getPointerPos(e: PointerEvent): { x: number; y: number } {
		const rect = canvas!.getBoundingClientRect();
		return {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (!ctx || !canvas) return;
		isDrawing = true;
		hasDrawn = true;
		canvas.setPointerCapture(e.pointerId);
		const pos = getPointerPos(e);
		ctx.beginPath();
		ctx.moveTo(pos.x, pos.y);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDrawing || !ctx) return;
		const pos = getPointerPos(e);
		ctx.lineTo(pos.x, pos.y);
		ctx.stroke();
	}

	function onPointerUp() {
		if (!isDrawing) return;
		isDrawing = false;
		exportCanvas();
	}

	function exportCanvas() {
		if (!canvas) return;
		value = canvas.toDataURL("image/png");
	}

	function clearCanvas() {
		if (!ctx || !canvas) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		value = "";
		hasDrawn = false;
	}

	function switchMode(newMode: "drawn" | "typed") {
		type = newMode;
		if (newMode === "typed") {
			value = typedName;
		} else {
			if (hasDrawn && canvas) {
				value = canvas.toDataURL("image/png");
			} else {
				value = "";
			}
		}
	}

	function onTypedInput(e: Event) {
		const target = e.target as HTMLInputElement;
		typedName = target.value;
		value = typedName;
	}
</script>

<div class="space-y-3">
	<Label>{label}</Label>

	<!-- Mode toggle -->
	<div class="flex gap-1 rounded-lg border border-input bg-muted p-1">
		<Button
			variant={type === 'drawn' ? "default" : "outline"}
			size="sm"
			class="flex-1 {type !== 'drawn' ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
			onclick={() => switchMode("drawn")}
		>
			Draw
		</Button>
		<Button
			variant={type === 'typed' ? "default" : "outline"}
			size="sm"
			class="flex-1 {type !== 'typed' ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
			onclick={() => switchMode("typed")}
		>
			Type
		</Button>
	</div>

	<!-- Draw mode -->
	{#if type === "drawn"}
		<div class="space-y-2">
			<canvas
				bind:this={canvas}
				class="w-full rounded-md border border-input bg-white"
				style="height: 150px; touch-action: none; cursor: crosshair;"
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointerleave={onPointerUp}
			></canvas>
			<div class="flex justify-end">
				<Button variant="outline" size="sm" type="button" onclick={clearCanvas}>Clear</Button>
			</div>
		</div>
	{:else}
		<!-- Type mode -->
		<div class="space-y-2">
			<Input
				type="text"
				placeholder="Type your full name"
				value={typedName}
				oninput={onTypedInput}
			/>
			{#if typedName}
				<div
					class="flex h-[60px] items-center justify-center rounded-md border border-dashed border-input bg-muted/30 px-4"
				>
					<span
						style="font-family: 'Georgia', 'Times New Roman', serif; font-style: italic; font-size: 1.5rem;"
					>
						{typedName}
					</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Date -->
	{#if showDate}
		<div class="flex items-center gap-3">
			<Label class="shrink-0">Date:</Label>
			<Input type="date" bind:value={date} class="max-w-[200px]" />
		</div>
	{/if}
</div>
