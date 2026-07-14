// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PermissionFormFields from './PermissionFormFields.svelte';
import { emptyFields } from '$lib/utils/submissionForm';

describe('PermissionFormFields — progressive disclosure', () => {
	it('collapses Emergency + Medical behind toggles when progressive', () => {
		render(PermissionFormFields, { props: { fields: emptyFields(), progressive: true } });

		// Required contact fields are always visible.
		expect(screen.getByLabelText(/Participant Name/i)).toBeTruthy();
		expect(screen.getByLabelText(/Date of Birth/i)).toBeTruthy();

		// Optional sections show a toggle, not their inputs.
		expect(screen.getByText(/Add an emergency contact/i)).toBeTruthy();
		expect(screen.getByText(/Add allergies, medications/i)).toBeTruthy();
		expect(screen.queryByLabelText(/Emergency Contact Name/i)).toBeNull();
	});

	it('reveals the emergency inputs when the toggle is clicked', async () => {
		render(PermissionFormFields, { props: { fields: emptyFields(), progressive: true } });

		expect(screen.queryByLabelText(/Emergency Contact Name/i)).toBeNull();
		await fireEvent.click(screen.getByText(/Add an emergency contact/i));
		expect(screen.getByLabelText(/Emergency Contact Name/i)).toBeTruthy();
	});

	it('shows all sections expanded when not progressive (edit form)', () => {
		render(PermissionFormFields, { props: { fields: emptyFields(), progressive: false } });

		expect(screen.queryByText(/Add an emergency contact/i)).toBeNull();
		expect(screen.getByLabelText(/Emergency Contact Name/i)).toBeTruthy();
	});
});
