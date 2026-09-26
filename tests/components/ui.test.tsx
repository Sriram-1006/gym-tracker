// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';

import { renderThemed } from '../helpers/render';
import { Button, Card, Field, ProgressBar, ConfirmDialog, EmptyState } from '../../components/ui';

describe('Button', () => {
  it('renders its label and calls onPress when tapped', () => {
    const onPress = vi.fn();
    renderThemed(<Button label="Save" onPress={onPress} />);

    fireEvent.click(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress while disabled', () => {
    const onPress = vi.fn();
    renderThemed(<Button label="Save" onPress={onPress} disabled />);

    fireEvent.click(screen.getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Card + EmptyState', () => {
  it('renders their children', () => {
    renderThemed(
      <Card>
        <EmptyState message="Nothing here yet" />
      </Card>,
    );
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
});

describe('Field', () => {
  it('renders the label and reports typed text', () => {
    const onChangeText = vi.fn();
    renderThemed(<Field label="Weight" value="" onChangeText={onChangeText} />);

    expect(screen.getByText('Weight')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '20' } });
    expect(onChangeText).toHaveBeenCalledWith('20');
  });

  it('shows an error message when provided', () => {
    renderThemed(<Field label="Weight" value="" onChangeText={() => {}} error="Required" />);
    expect(screen.getByText('Required')).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  it('clamps the fill to 0..1 of the track width', () => {
    const { container: over } = renderThemed(<ProgressBar ratio={2} />);
    const overFill = over.firstChild?.firstChild as HTMLElement;
    expect(overFill.style.width).toBe('100%');

    const { container: half } = renderThemed(<ProgressBar ratio={0.5} />);
    const halfFill = half.firstChild?.firstChild as HTMLElement;
    expect(halfFill.style.width).toBe('50%');

    const { container: negative } = renderThemed(<ProgressBar ratio={-1} />);
    const negativeFill = negative.firstChild?.firstChild as HTMLElement;
    expect(negativeFill.style.width).toBe('0%');
  });
});

describe('ConfirmDialog', () => {
  it('is hidden when not visible', () => {
    renderThemed(
      <ConfirmDialog
        visible={false}
        title="Delete?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText('Delete?')).toBeNull();
  });

  it('shows title/message and calls onConfirm', () => {
    const onConfirm = vi.fn();
    renderThemed(
      <ConfirmDialog
        visible
        title="Delete this workout?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText('Delete this workout?')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel from the cancel button (destructive variant included)', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderThemed(
      <ConfirmDialog
        visible
        title="Delete?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
