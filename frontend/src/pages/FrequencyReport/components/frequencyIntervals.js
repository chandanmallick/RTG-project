// Curve timestamps and report event periods are expressed in IST.
export const LOW_HZ = 49.90;
export const HIGH_HZ = 50.05;
export const istMillis = (timestamp) => Date.parse(`${timestamp.slice(0, 19)}+05:30`);

export function nearestPoint(points, millis) {
  if (!points.length || !Number.isFinite(millis)) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (istMillis(points[mid].timestamp) < millis) low = mid + 1;
    else high = mid;
  }
  if (low > 0 && Math.abs(istMillis(points[low - 1].timestamp) - millis) < Math.abs(istMillis(points[low].timestamp) - millis)) low -= 1;
  return points[low];
}

export function summarizeInterval(points, startTime, endTime) {
  const start = istMillis(startTime || "");
  const end = istMillis(endTime || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Choose an end time after the start time.");
  const samples = points.filter(point => {
    const stamp = istMillis(point.timestamp);
    return stamp >= start && stamp <= end;
  });
  if (!samples.length || istMillis(samples[0].timestamp) !== start || istMillis(samples.at(-1).timestamp) !== end) throw new Error("Use timestamps on the loaded 30-second timeline.");
  if (samples.some((point, index) => index > 0 && istMillis(point.timestamp) - istMillis(samples[index - 1].timestamp) !== 30000)) throw new Error("This interval crosses a day with unavailable Curve data. Select separate intervals.");
  const valid = samples.filter(point => point.frequency !== null && Number.isFinite(point.frequency));
  if (!valid.length) throw new Error("This interval contains no valid frequency readings.");
  const minimum = valid.reduce((value, point) => Math.min(value, point.frequency), Infinity);
  const maximum = valid.reduce((value, point) => Math.max(value, point.frequency), -Infinity);
  return {
    start_time: startTime, end_time: endTime,
    min_frequency: minimum, max_frequency: maximum,
    duration_seconds: (end - start) / 1000,
    missing_readings: samples.length - valid.length,
  };
}

export function storedEventForPeriod(events, start, end) {
  const parse = stamp => /(?:Z|[+-]\d{2}:\d{2})$/.test(String(stamp)) ? Date.parse(stamp) : istMillis(String(stamp || ""));
  const from = parse(start), to = parse(end);
  return events.filter(event => parse(event.start_time) <= from && parse(event.end_time) >= to).sort((a, b) => (parse(a.end_time) - parse(a.start_time)) - (parse(b.end_time) - parse(b.start_time)))[0] || null;
}
