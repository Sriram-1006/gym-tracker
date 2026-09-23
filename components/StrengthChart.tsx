import React from 'react';
import { Text, View } from 'react-native';
import { CartesianChart, Line, Area } from 'victory-native';
import { matchFont, type SkFont } from '@shopify/react-native-skia';
import { useTheme } from '../theme/ThemeContext';
import { formatDisplayDate } from '../data/dateUtils';

type ChartPoint = { date: string; score: number; index: number };

type Point = { date: string; score: number };

// Axis label font; `matchFont` with the system family is the recommended way
// in Victory Native 41. If Skia can't resolve it, the chart still renders
// (only labels are affected).
const axisFont: SkFont | undefined = (() => {
  try {
    return matchFont({ fontSize: 10, fontFamily: undefined });
  } catch {
    return undefined;
  }
})();

export function StrengthChart({ data, height = 180 }: { data: Point[]; height?: number }) {
  const { colors } = useTheme();

  if (data.length === 0) {
    // Compact: only as tall as the message needs — no reserved graph height,
    // no dead space. The full height is used once there is data to plot.
    return (
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
          No workouts yet — your strength curve will appear here.
        </Text>
      </View>
    );
  }

  if (data.length === 1) {
    // Single point: no meaningful curve, but keep the full graph height so
    // swapping to the plotted chart doesn't jump the layout.
    const p = data[0];
    return (
      <View style={{ height, justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          First workout logged on {formatDisplayDate(p.date)} — score {Math.round(p.score)}. Log
          another day to draw the curve.
        </Text>
      </View>
    );
  }

  // Victory's CartesianChart wants a numeric x; we plot by point index and
  // map indices back to dates for the axis labels.
  const points: ChartPoint[] = data.map((d, i) => ({ ...d, index: i }));
  const fmtDate = (iso: string) => iso.slice(5); // MM-DD

  return (
    <View style={{ height }}>
      <CartesianChart<ChartPoint, 'index', 'score'>
        data={points}
        xKey="index"
        yKeys={['score']}
        domainPadding={{ left: 12, right: 12, top: 20, bottom: 4 }}
        axisOptions={{
          font: axisFont,
          labelColor: colors.textMuted,
          lineColor: colors.border,
          formatXLabel: (i: number) => {
            const p = points[Math.round(i)];
            return p ? fmtDate(p.date) : '';
          },
          formatYLabel: (v: number) => String(Math.round(v)),
        }}
      >
        {({ points: chartPoints }) => (
          <>
            <Area
              points={chartPoints.score}
              y0={0}
              color={`${colors.accent}55`}
              animate={{ type: 'timing', duration: 300 }}
            />
            <Line
              points={chartPoints.score}
              color={colors.accent}
              strokeWidth={2.5}
              animate={{ type: 'timing', duration: 300 }}
            />
          </>
        )}
      </CartesianChart>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{fmtDate(data[0].date)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>
          {fmtDate(data[data.length - 1].date)}
        </Text>
      </View>
    </View>
  );
}
