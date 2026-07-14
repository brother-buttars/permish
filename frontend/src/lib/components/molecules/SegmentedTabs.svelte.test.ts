// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SegmentedTabs from './SegmentedTabs.svelte';

const tabs = [
	{ value: 'one', label: 'One' },
	{ value: 'two', label: 'Two' },
];

describe('SegmentedTabs', () => {
	it('marks the active tab with aria-pressed', () => {
		render(SegmentedTabs, { props: { value: 'one', tabs, label: 'Sections' } });

		expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: 'Two' }).getAttribute('aria-pressed')).toBe('false');
	});

	it('exposes the group label for assistive tech', () => {
		render(SegmentedTabs, { props: { value: 'one', tabs, label: 'Sections' } });

		expect(screen.getByRole('group', { name: 'Sections' })).toBeTruthy();
	});

	it('calls onSelect with the chosen value (nav mode)', async () => {
		const onSelect = vi.fn();
		render(SegmentedTabs, { props: { value: 'one', tabs, onSelect } });

		await fireEvent.click(screen.getByRole('button', { name: 'Two' }));
		expect(onSelect).toHaveBeenCalledWith('two');
	});

	it('renders type="button" so it never submits an enclosing form', () => {
		render(SegmentedTabs, { props: { value: 'one', tabs } });

		expect(screen.getByRole('button', { name: 'One' }).getAttribute('type')).toBe('button');
	});
});
