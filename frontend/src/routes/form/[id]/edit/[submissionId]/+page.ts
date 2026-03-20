export async function load({ params }: { params: { id: string; submissionId: string } }) {
	return { eventId: params.id, submissionId: params.submissionId };
}
