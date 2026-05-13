import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Card from './Card.svelte';

describe('Card', () => {
  it('renders the value', () => {
    const { getByRole } = render(Card, { value: '5' });
    expect(getByRole('button')).toHaveTextContent('5');
  });

  it('applies selected class when selected is true', () => {
    const { getByRole } = render(Card, { value: '8', selected: true });
    expect(getByRole('button')).toHaveClass('selected');
  });

  it('does not apply selected class when selected is false', () => {
    const { getByRole } = render(Card, { value: '8', selected: false });
    expect(getByRole('button')).not.toHaveClass('selected');
  });

  it('is disabled when disabled prop is true', () => {
    const { getByRole } = render(Card, { value: '3', disabled: true });
    expect(getByRole('button')).toBeDisabled();
  });

  it('is enabled by default', () => {
    const { getByRole } = render(Card, { value: '3' });
    expect(getByRole('button')).toBeEnabled();
  });

  it('dispatches select event with value on click', async () => {
    const { getByRole, component } = render(Card, { value: '13' });
    const handler = vi.fn();
    component.$on('select', handler);
    await fireEvent.click(getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toBe('13');
  });

  it('does not dispatch select when disabled', async () => {
    const { getByRole, component } = render(Card, { value: '5', disabled: true });
    const handler = vi.fn();
    component.$on('select', handler);
    await fireEvent.click(getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });
});
