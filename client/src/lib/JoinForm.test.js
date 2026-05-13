import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import JoinForm from './JoinForm.svelte';

describe('JoinForm', () => {
  describe('join mode (default)', () => {
    it('shows join fields by default', () => {
      const { getByPlaceholderText } = render(JoinForm);
      expect(getByPlaceholderText('Enter your name')).toBeInTheDocument();
      expect(getByPlaceholderText('Paste room ID')).toBeInTheDocument();
    });

    it('Join button is disabled with no inputs', () => {
      const { getByRole } = render(JoinForm);
      expect(getByRole('button', { name: 'Join' })).toBeDisabled();
    });

    it('Join button is disabled with only a name', async () => {
      const { getByRole, getByPlaceholderText } = render(JoinForm);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      expect(getByRole('button', { name: 'Join' })).toBeDisabled();
    });

    it('Join button is disabled with only a room ID', async () => {
      const { getByRole, getByPlaceholderText } = render(JoinForm);
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      expect(getByRole('button', { name: 'Join' })).toBeDisabled();
    });

    it('Join button is enabled when name and room ID are filled', async () => {
      const { getByRole, getByPlaceholderText } = render(JoinForm);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      expect(getByRole('button', { name: 'Join' })).toBeEnabled();
    });

    it('dispatches join event with name and roomId', async () => {
      const { getByRole, getByPlaceholderText, component } = render(JoinForm);
      const handler = vi.fn();
      component.$on('join', handler);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      await fireEvent.click(getByRole('button', { name: 'Join' }));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail).toMatchObject({ name: 'Alice', roomId: 'abc-123' });
    });

    it('omits pin from join event when PIN field is empty', async () => {
      const { getByRole, getByPlaceholderText, component } = render(JoinForm);
      const handler = vi.fn();
      component.$on('join', handler);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      await fireEvent.click(getByRole('button', { name: 'Join' }));
      expect(handler.mock.calls[0][0].detail.pin).toBeUndefined();
    });

    it('includes pin in join event when PIN field is filled', async () => {
      const { getByRole, getByPlaceholderText, component } = render(JoinForm);
      const handler = vi.fn();
      component.$on('join', handler);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      await fireEvent.input(getByPlaceholderText('Enter PIN if you have one'), { target: { value: '1234' } });
      await fireEvent.click(getByRole('button', { name: 'Join' }));
      expect(handler.mock.calls[0][0].detail.pin).toBe('1234');
    });
  });

  describe('create mode', () => {
    it('switches to create fields when Create Room tab is clicked', async () => {
      const { getByRole, getByPlaceholderText, queryByPlaceholderText } = render(JoinForm);
      await fireEvent.click(getByRole('button', { name: 'Create Room' }));
      expect(queryByPlaceholderText('Paste room ID')).not.toBeInTheDocument();
      expect(getByPlaceholderText('Set a PIN to protect facilitator role')).toBeInTheDocument();
    });

    it('Create button is disabled with no name', async () => {
      const { getAllByRole } = render(JoinForm);
      const [, createTabBtn] = getAllByRole('button', { name: 'Create Room' });
      // switch to create mode first
      await fireEvent.click(getAllByRole('button', { name: 'Create Room' })[0]);
      const buttons = getAllByRole('button', { name: 'Create Room' });
      const submitBtn = buttons[buttons.length - 1];
      expect(submitBtn).toBeDisabled();
    });

    it('dispatches create event with name and roomType', async () => {
      const { getAllByRole, getByPlaceholderText, component } = render(JoinForm);
      const handler = vi.fn();
      component.$on('create', handler);
      await fireEvent.click(getAllByRole('button', { name: 'Create Room' })[0]);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      const buttons = getAllByRole('button', { name: 'Create Room' });
      await fireEvent.click(buttons[buttons.length - 1]);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail).toMatchObject({ name: 'Bob', roomType: 'planning-poker' });
    });

    it('omits pin from create event when PIN field is empty', async () => {
      const { getAllByRole, getByPlaceholderText, component } = render(JoinForm);
      const handler = vi.fn();
      component.$on('create', handler);
      await fireEvent.click(getAllByRole('button', { name: 'Create Room' })[0]);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      const buttons = getAllByRole('button', { name: 'Create Room' });
      await fireEvent.click(buttons[buttons.length - 1]);
      expect(handler.mock.calls[0][0].detail.pin).toBeUndefined();
    });

    it('includes pin in create event when PIN field is filled', async () => {
      const { getAllByRole, getByPlaceholderText, component } = render(JoinForm);
      const handler = vi.fn();
      component.$on('create', handler);
      await fireEvent.click(getAllByRole('button', { name: 'Create Room' })[0]);
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      await fireEvent.input(getByPlaceholderText('Set a PIN to protect facilitator role'), { target: { value: 'secret' } });
      const buttons = getAllByRole('button', { name: 'Create Room' });
      await fireEvent.click(buttons[buttons.length - 1]);
      expect(handler.mock.calls[0][0].detail.pin).toBe('secret');
    });
  });
});
