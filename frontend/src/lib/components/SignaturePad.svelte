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

	onMount(() => {
		if (!date) date = getToday();

		if (initialType) {
			type = initialType;
		}
		if (initialValue) {
			if ((initialType ?? type) === "typed") {
				typedName = initialValue;
				value = initialValue;
			} else {
				// For drawn signatures, initialValue is a base64 data URL
				loadImageToCanvas(initialValue);
				value = initialValue;
				hasDrawn = true;
			}
		}

		initCanvas();
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
	<div class="flex gap-1 rounded-md border border-input p-1">
		<button
			type="button"
			class="flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors {type === 'drawn'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchMode("drawn")}
		>
			Draw
		</button>
		<button
			type="button"
			class="flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors {type === 'typed'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchMode("typed")}
		>
			Type
		</button>
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
