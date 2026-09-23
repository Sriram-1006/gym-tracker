// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';

import { renderThemed } from '../helpers/render';
import { BodyPartPickerModal } from '../../components/BodyPartPickerModal';

function setup(overrides: Partial<React.ComponentProps<typeof BodyPartPickerModal>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  renderThemed(
    <BodyPartPickerModal
      visible
      onClose={onClose}
      onConfirm={onConfirm}
      alreadyInDraft={new Set()}
      currentBodyPart={null}
      {...overrides}
    />,
  );
  return { onConfirm, onClose };
}

describe('BodyPartPickerModal', () => {
  it('renders the preset body parts', () => {
    setup();
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
    expect(screen.getByText('Legs')).toBeTruthy();
  });

  it('confirms a tapped body part', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Add'));
    expect(onConfirm).toHaveBeenCalledWith('Back');
  });

  it('confirms a typed custom body part', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByPlaceholderText('…or type a custom body part'), {
      target: { value: 'Neck' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onConfirm).toHaveBeenCalledWith('Neck');
  });

  it('pre-selects the current body part so Add can re-confirm it', () => {
    const { onConfirm } = setup({ currentBodyPart: 'Legs' });
    fireEvent.click(screen.getByText('Add'));
    expect(onConfirm).toHaveBeenCalledWith('Legs');
  });

  it('does nothing when Add is pressed with no selection', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByText('Add'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders body parts already in the draft', () => {
    // Marked entries stay selectable; the important behaviour is that they are
    // still rendered and can be re-picked without crashing.
    setup({ alreadyInDraft: new Set(['Chest']) });
    fireEvent.click(screen.getByText('Chest'));
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText('Chest')).toBeTruthy();
  });

  it('closes via Exit', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('Exit'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', () => {
    setup({ visible: false });
    expect(screen.queryByText('Select body part')).toBeNull();
  });
});
