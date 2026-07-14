export function load({ params }: { params: { id: string } }) {
	return { groupId: params.id };
}
