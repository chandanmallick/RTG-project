import test from "node:test";
import assert from "node:assert/strict";
import { HIGH_HZ, LOW_HZ, storedEventForPeriod, istMillis, nearestPoint, summarizeInterval } from "../src/pages/FrequencyReport/components/frequencyIntervals.js";

const points = [
  { timestamp: "2026-10-05T18:32:00", frequency: 49.90 },
  { timestamp: "2026-10-05T18:32:30", frequency: 49.87 },
  { timestamp: "2026-10-05T18:33:00", frequency: 50.05 },
  { timestamp: "2026-10-05T18:33:30", frequency: 50.08 },
];

test("interval extrema and duration preserve half-minute samples", () => {
  const event = summarizeInterval(points, points[0].timestamp, points[3].timestamp);
  assert.equal(event.min_frequency, 49.87);
  assert.equal(event.max_frequency, 50.08);
  assert.equal(event.duration_seconds, 90);
  assert.equal(event.start_time, points[0].timestamp);
  assert.equal(event.end_time, points[3].timestamp);
});

test("boundary readings remain included in normal thresholds", () => {
  assert.equal(LOW_HZ, 49.90);
  assert.equal(HIGH_HZ, 50.05);
  const event = summarizeInterval([points[0], { ...points[1], frequency: HIGH_HZ }], points[0].timestamp, points[1].timestamp);
  assert.equal(event.min_frequency, LOW_HZ);
  assert.equal(event.max_frequency, HIGH_HZ);
});

test("chart selection snaps to nearest source sample in IST", () => {
  assert.equal(istMillis(points[0].timestamp), Date.parse("2026-10-05T13:02:00Z"));
  assert.equal(nearestPoint(points, istMillis(points[0].timestamp) + 21000), points[1]);
  assert.equal(nearestPoint(points, istMillis(points[0].timestamp) - 60000), points[0]);
  assert.equal(nearestPoint(points, istMillis(points[3].timestamp) + 60000), points[3]);
});

test("missing readings are gaps, not zero minima", () => {
  const withGap = points.map((point, index) => index === 1 ? { ...point, frequency: null } : point);
  const event = summarizeInterval(withGap, points[0].timestamp, points[3].timestamp);
  assert.equal(event.min_frequency, LOW_HZ);
  assert.equal(event.missing_readings, 1);
});

test("invalid intervals, unsampled endpoints and unavailable days are rejected", () => {
  assert.throws(() => summarizeInterval(points, points[1].timestamp, points[0].timestamp));
  assert.throws(() => summarizeInterval(points, "2026-10-05T18:32:10", points[3].timestamp));
  assert.throws(() => summarizeInterval(points.map(point => ({ ...point, frequency: null })), points[0].timestamp, points[3].timestamp));
  assert.throws(() => summarizeInterval([points[0], { timestamp: "2026-10-07T18:32:00", frequency: 50 }], points[0].timestamp, "2026-10-07T18:32:00"));
});

test("stored selection uses structured metadata, smallest covering period and no name guessing", () => {
  const saved = [
    { event_id: "wide", name: "Wrong display date", start_time: "2026-10-05T18:00:00", end_time: "2026-10-05T19:00:00" },
    { event_id: "exact", start_time: "2026-10-05T13:02:00Z", end_time: "2026-10-05T13:03:30Z" },
    { event_id: "name-only", name: "Low Freq 5-Oct-26 (18:32-18:34)" },
  ];
  assert.equal(storedEventForPeriod(saved, points[0].timestamp, points[3].timestamp).event_id, "exact");
  assert.equal(storedEventForPeriod(saved, "2026-10-05T20:00:00", "2026-10-05T20:05:00"), null);
});
