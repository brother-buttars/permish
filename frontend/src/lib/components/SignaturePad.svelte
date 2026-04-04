<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";

	let {
		label,
		value = $bindable(""),
		type = $bindable<"drawn" | "typed" | "hand">("drawn"),
		date = $bindable(""),
		initialValue = "",
		initialType = undefined,
		showDate = true,
		allowHand = false,
	}: {
		label: string;
		value: string;
		type: "drawn" | "typed" | "hand";
		date: string;
		initialValue?: string;
		initialType?: "drawn" | "typed" | "hand";
		showDate?: boolean;
		allowHand?: boolean;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = $state(null);
	let isDrawing = $state(false);
	let typedName = $state("");
	let hasDrawn = $state(false);
	let usingSaved = $state(false);

	// Whether a saved signature is available (not "hand" type)
	let hasSavedSig = $derived(!!initialValue && initialType !== "hand");

	function getToday(): string {
		const d = new Date();
		return d.toISOString().split("T")[0];
	}

	let initialized = false;
	let lastInitialValue = "";

	onMount(() => {
		if (!date) date = getToday();
		// Pre-store typed name from saved sig for when user switches to Type mode
		if (initialValue && (initialType ?? "typed") === "typed") {
			typedName = initialValue;
		}
		// Only apply saved signature if not starting in "hand" mode
		if (type !== "hand") {
			applyInitialValues();
		}
		initialized = true;
	});

	function applyInitialValues() {
		if (!initialValue) return;
		if (initialType) type = initialType;

		if ((initialType ?? type) === "typed") {
			typedName = initialValue;
			value = initialValue;
		} else if ((initialType ?? type) === "drawn") {
			value = initialValue;
			hasDrawn = true;
			if (canvas) loadImageToCanvas(initialValue);
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
			// Update stored typed name
			if (initialValue && (initialType ?? "typed") === "typed") {
				typedName = initialValue;
			}
			lastInitialValue = initialValue;
			// If currently using saved, re-apply
			if (usingSaved) {
				applySaved();
			}
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

		// Redraw if there was an initial drawn value and we're in drawn mode
		if (initialValue && (initialType ?? "drawn") === "drawn" && type === "drawn") {
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

	function switchMode(newMode: "drawn" | "typed" | "hand") {
		usingSaved = false;
		type = newMode;
		if (newMode === "hand") {
			value = "hand";
		} else if (newMode === "typed") {
			value = typedName;
		} else {
			if (hasDrawn && canvas) {
				value = canvas.toDataURL("image/png");
			} else {
				value = "";
			}
		}
	}

	function applySaved() {
		usingSaved = true;
		const savedType = initialType ?? "typed";
		type = savedType;
		if (savedType === "typed") {
			typedName = initialValue;
			value = initialValue;
		} else if (savedType === "drawn") {
			value = initialValue;
			hasDrawn = true;
			if (canvas) loadImageToCanvas(initialValue);
		}
	}

	function onTypedInput(e: Event) {
		const target = e.target as HTMLInputElement;
		typedName = target.value;
		value = typedName;
		usingSaved = false;
	}
</script>

<div class="space-y-3">
	<Label>{label}</Label>

	<!-- Mode toggle -->
	<div class="flex gap-1 rounded-lg border border-input bg-muted p-1">
		{#if allowHand}
			<Button
				type="button"
				variant={type === 'hand' && !usingSaved ? "default" : "outline"}
				size="sm"
				class="flex-1 {type !== 'hand' || usingSaved ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
				onclick={() => switchMode("hand")}
			>
				By Hand
			</Button>
		{/if}
		<Button
			type="button"
			variant={type === 'drawn' && !usingSaved ? "default" : "outline"}
			size="sm"
			class="flex-1 {type !== 'drawn' || usingSaved ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
			onclick={() => switchMode("drawn")}
		>
			Draw
		</Button>
		<Button
			type="button"
			variant={type === 'typed' && !usingSaved ? "default" : "outline"}
			size="sm"
			class="flex-1 {type !== 'typed' || usingSaved ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
			onclick={() => switchMode("typed")}
		>
			Type
		</Button>
		{#if hasSavedSig}
			<Button
				type="button"
				variant={usingSaved ? "default" : "outline"}
				size="sm"
				class="flex-1 {!usingSaved ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
				onclick={applySaved}
			>
				Saved
			</Button>
		{/if}
	</div>

	<!-- Saved mode preview -->
	{#if usingSaved}
		<div class="rounded-md border border-input bg-muted/30 p-4 text-center">
			{#if initialType === "drawn" && initialValue}
				<img src={initialValue} alt="Saved signature" class="mx-auto max-h-[80px]" />
			{:else}
				<span style="font-family: 'Georgia', 'Times New Roman', serif; font-style: italic; font-size: 1.5rem;">
					{initialValue}
				</span>
			{/if}
			<p class="mt-2 text-xs text-muted-foreground">Using saved signature from your account</p>
		</div>
	<!-- Hand mode -->
	{:else if type === "hand"}
		<div class="rounded-md border border-dashed border-input bg-muted/30 p-4 text-center text-sm text-muted-foreground">
			<p class="font-medium text-foreground">Will sign by hand on the printed form</p>
			<p class="mt-1">The signature area will be left blank on the PDF for you to sign after printing.</p>
		</div>
	<!-- Draw mode -->
	{:else if type === "drawn"}
		<div class="space-y-2">
			<canvas
				bind:this={canvas}
				class="w-full rounded-md border border-input bg-white h-[200px] sm:h-[150px]"
				style="touch-action: none; cursor: crosshair;"
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
