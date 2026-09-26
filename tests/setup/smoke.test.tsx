// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ThemeContext } from '../../theme/ThemeContext';
import { lightTheme } from '../../theme/theme';
import { Button } from '../../components/ui';

describe('component test harness', () => {
  it('renders a themed Button and invokes onPress', () => {
    let pressed = 0;
    render(
      <ThemeContext.Provider value={lightTheme}>
        <Button
          label="Press me"
          onPress={() => {
            pressed += 1;
          }}
        />
      </ThemeContext.Provider>,
    );

    expect(screen.getByText('Press me')).toBeTruthy();
    fireEvent.click(screen.getByText('Press me'));
    expect(pressed).toBe(1);
  });
});
