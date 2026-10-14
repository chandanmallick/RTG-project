// Curve timestamps and report event periods are expressed in IST.
export const LOW_HZ = 49.90;
export const HIGH_HZ = 50.05;
export const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
export const validCurveFrequency = value => Number.isFinite(value) && value >= 45;
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
  const valid = samples.filter(point => validCurveFrequency(point.frequency));
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

export function formatIstDateTime(timestamp) {
  if (!timestamp) return "—";
  try {
    const clean = String(timestamp).replace("T", " ");
    const millis = istMillis(timestamp);
    if (!Number.isFinite(millis)) return clean;
    return new Date(millis).toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " IST";
  } catch {
    return String(timestamp).replace("T", " ");
  }
}

export function calculateFrequencyStats(points = [], sampleSeconds = 30) {
  const stepMinutes = sampleSeconds / 60;
  const valid = points.filter(p => validCurveFrequency(p.frequency));
  if (!valid.length) {
    return null;
  }

  let minPoint = valid[0];
  let maxPoint = valid[0];
  let sumFreq = 0;

  let bandNormalCount = 0;
  let below49_9Count = 0;
  let below49_7Count = 0;
  let below49_5Count = 0;
  let above50_05Count = 0;
  let above50_10Count = 0;
  let above50_20Count = 0;
  let above50_30Count = 0;
  let above50_50Count = 0;

  for (let i = 0; i < valid.length; i++) {
    const p = valid[i];
    const f = p.frequency;
    sumFreq += f;

    if (f < minPoint.frequency) minPoint = p;
    if (f > maxPoint.frequency) maxPoint = p;

    if (f >= 49.90 && f <= 50.05) bandNormalCount++;
    if (f < 49.90) below49_9Count++;
    if (f < 49.70) below49_7Count++;
    if (f < 49.50) below49_5Count++;
    if (f > 50.05) above50_05Count++;
    if (f > 50.10) above50_10Count++;
    if (f > 50.20) above50_20Count++;
    if (f > 50.30) above50_30Count++;
    if (f > 50.50) above50_50Count++;
  }

  const validCount = valid.length;
  const totalMinutes = validCount * stepMinutes;

  const makeRow = (id, label, condition, category, count, color, bg) => ({
    id,
    label,
    condition,
    category,
    count,
    minutes: count * stepMinutes,
    percent: validCount > 0 ? (count / validCount) * 100 : 0,
    color,
    bg,
  });

  const rows = [
    makeRow("normal", "49.90 – 50.05 Hz", "49.90 ≤ F ≤ 50.05", "Normal IEGC Band", bandNormalCount, "#047857", "#D1FAE5"),
    makeRow("lt49_9", "Frequency < 49.90 Hz", "F < 49.90", "Low Frequency", below49_9Count, "#DC2626", "#FEE2E2"),
    makeRow("lt49_7", "Frequency < 49.70 Hz", "F < 49.70", "Low Frequency (Emergency)", below49_7Count, "#EA580C", "#FFEDD5"),
    makeRow("lt49_5", "Frequency < 49.50 Hz", "F < 49.50", "Low Frequency (Extreme)", below49_5Count, "#991B1B", "#FFE4E6"),
    makeRow("gt50_05", "Frequency > 50.05 Hz", "F > 50.05", "High Frequency", above50_05Count, "#D97706", "#FEF3C7"),
    makeRow("gt50_10", "Frequency > 50.10 Hz", "F > 50.10", "High Frequency", above50_10Count, "#C2410C", "#FFEDD5"),
    makeRow("gt50_20", "Frequency > 50.20 Hz", "F > 50.20", "High Frequency (Alert)", above50_20Count, "#B91C1C", "#FEE2E2"),
    makeRow("gt50_30", "Frequency > 50.30 Hz", "F > 50.30", "High Frequency (Warning)", above50_30Count, "#991B1B", "#FFE4E6"),
    makeRow("gt50_50", "Frequency > 50.50 Hz", "F > 50.50", "High Frequency (Extreme)", above50_50Count, "#7F1D1D", "#FEE2E2"),
  ];

  return {
    totalSamples: points.length,
    validSamples: validCount,
    missingSamples: points.length - validCount,
    totalMinutes,
    averageFrequency: sumFreq / validCount,
    maxFrequency: maxPoint.frequency,
    maxTimestamp: maxPoint.timestamp,
    minFrequency: minPoint.frequency,
    minTimestamp: minPoint.timestamp,
    rows,
  };
}
