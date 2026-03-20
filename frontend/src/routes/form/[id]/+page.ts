export async function load({ params }: { params: { id: string } }) {
	return { eventId: params.id };
}
