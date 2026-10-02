// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captured } = vi.hoisted(() => ({
  captured: { area: null as Record<string, unknown> | null, line: null as Record<string, unknown> | null },
}));

// Drive the render prop ourselves: the real Victory chart needs Skia, which
// only exists on a device. The mock feeds fixed coordinates in and records
// the props the chart passes to <Area>/<Line>.
vi.mock('victory-native', () => ({
  CartesianChart: ({ children }: { children: (args: Record<string, unknown>) => unknown }) =>
    children({
      points: { score: [{ x: 0, y: 10 }, { x: 1, y: 25 }] },
      chartBounds: { top: 4, bottom: 100, left: 8, right: 200 },
    }),
  Area: (props: Record<string, unknown>) => {
    captured.area = props;
    return null;
  },
  Line: (props: Record<string, unknown>) => {
    captured.line = props;
    return null;
  },
}));
vi.mock('@shopify/react-native-skia', () => ({ matchFont: () => undefined }));

import { renderThemed } from '../helpers/render';
import { StrengthChart } from '../../components/StrengthChart';

const POINTS = [
  { date: '2026-09-10', score: 100 },
  { date: '2026-09-11', score: 150 },
];

beforeEach(() => {
  captured.area = null;
  captured.line = null;
});

describe('StrengthChart', () => {
  it('fills the area down to the plot baseline, not y=0', () => {
    renderThemed(<StrengthChart data={POINTS} />);

    // y0 is a pixel coordinate in canvas space (0 = top of the chart), so the
    // fill has to stop at the bottom of the plot area — pre-fix it was 0 and
    // the area covered the whole canvas.
    expect(captured.area).not.toBeNull();
    expect(captured.area!.y0).toBe(100);
    expect(captured.area!.y0).not.toBe(0);
    expect(captured.line).not.toBeNull();
  });

  it('plots the provided series points', () => {
    renderThemed(<StrengthChart data={POINTS} />);

    expect(captured.area!.points).toEqual([{ x: 0, y: 10 }, { x: 1, y: 25 }]);
  });

  it('shows a compact placeholder without a chart when there is no data', () => {
    const { queryByText } = renderThemed(<StrengthChart data={[]} />);

    expect(queryByText('No workouts yet — your strength curve will appear here.')).toBeTruthy();
    expect(captured.area).toBeNull();
  });

  it('explains that one point is not a curve yet', () => {
    const { getByText } = renderThemed(<StrengthChart data={[POINTS[1]]} />);

    expect(getByText(/First workout logged on/)).toBeTruthy();
    expect(captured.area).toBeNull();
  });
});
