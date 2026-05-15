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

    it('calls onjoin with name and roomId', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { onjoin: handler });
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      await fireEvent.click(getByRole('button', { name: 'Join' }));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ name: 'Alice', roomId: 'abc-123' });
    });

    it('omits pin from onjoin when PIN field is empty', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { onjoin: handler });
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      await fireEvent.click(getByRole('button', { name: 'Join' }));
      expect(handler.mock.calls[0][0].pin).toBeUndefined();
    });

    it('includes pin in onjoin when PIN field is filled', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { onjoin: handler });
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
      await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'abc-123' } });
      await fireEvent.input(getByPlaceholderText('Enter PIN if you have one'), { target: { value: '1234' } });
      await fireEvent.click(getByRole('button', { name: 'Join' }));
      expect(handler.mock.calls[0][0].pin).toBe('1234');
    });
  });

  describe('create mode', () => {
    it('switches to create fields when Create Room tab is clicked', async () => {
      const { getByRole, getByPlaceholderText, queryByPlaceholderText } = render(JoinForm);
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      expect(queryByPlaceholderText('Paste room ID')).not.toBeInTheDocument();
      expect(getByPlaceholderText('Set a PIN to protect facilitator role')).toBeInTheDocument();
    });

    it('Create button is disabled with no name', async () => {
      const { getByRole } = render(JoinForm);
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      expect(getByRole('button', { name: 'Create Room' })).toBeDisabled();
    });

    it('calls oncreate with name and roomType', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { oncreate: handler });
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      await fireEvent.click(getByRole('button', { name: 'Create Room' }));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ name: 'Bob', roomType: 'planning-poker' });
    });

    it('omits pin from oncreate when PIN field is empty', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { oncreate: handler });
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      await fireEvent.click(getByRole('button', { name: 'Create Room' }));
      expect(handler.mock.calls[0][0].pin).toBeUndefined();
    });

    it('includes pin in oncreate when PIN field is filled', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { oncreate: handler });
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      await fireEvent.input(getByPlaceholderText('Set a PIN to protect facilitator role'), { target: { value: 'secret' } });
      await fireEvent.click(getByRole('button', { name: 'Create Room' }));
      expect(handler.mock.calls[0][0].pin).toBe('secret');
    });

    it('includes roomName in oncreate when room name field is filled', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { oncreate: handler });
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      await fireEvent.input(getByPlaceholderText('e.g. Sprint 42 Planning'), { target: { value: 'Sprint 42' } });
      await fireEvent.click(getByRole('button', { name: 'Create Room' }));
      expect(handler.mock.calls[0][0].roomName).toBe('Sprint 42');
    });

    it('omits roomName from oncreate when room name field is empty', async () => {
      const handler = vi.fn();
      const { getByRole, getByPlaceholderText } = render(JoinForm, { oncreate: handler });
      await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
      await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
      await fireEvent.click(getByRole('button', { name: 'Create Room' }));
      expect(handler.mock.calls[0][0].roomName).toBeUndefined();
    });
  });
});
