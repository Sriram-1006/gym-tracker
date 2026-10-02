// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { renderThemed } from '../helpers/render';
import { DatePickerField } from '../../components/DatePickerField';
import { todayISO } from '../../data/dateUtils';

describe('DatePickerField (web)', () => {
  it('rejects a future date but keeps accepting valid ones', () => {
    const onChange = vi.fn();
    renderThemed(<DatePickerField value={todayISO()} onChange={onChange} />);
    const input = screen.getByLabelText('Workout date');

    const tomorrow = todayISO(new Date(Date.now() + 24 * 60 * 60 * 1000));
    fireEvent.change(input, { target: { value: tomorrow } });
    expect(onChange).not.toHaveBeenCalled();

    // Older than the 2020-01-01 floor (the native picker enforces this too).
    fireEvent.change(input, { target: { value: '2019-12-31' } });
    expect(onChange).not.toHaveBeenCalled();

    const yesterday = todayISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
    fireEvent.change(input, { target: { value: yesterday } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(yesterday);
  });
});
