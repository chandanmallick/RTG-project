"""Timestamp-weighted nested threshold calculations shared by both analysis modes."""
from datetime import datetime
import numpy as np
import pandas as pd

LEVELS = (49.90, 49.70, 49.50)
GROUPS = ('State', 'ISGS', 'IPP')
NOTE = ('Intervals are [start, end) in IST. Each reading represents at most one inferred source sampling interval; '
        'missing timestamps and invalid frequency readings contribute no frequency duration. Thresholds are nested and strict. '
        'Adverse minutes count observed adverse intervals; unknown deviation coverage is tracked separately and makes the percentage unavailable. '
        '15-minute averages are duration-weighted signed Actual-minus-Schedule within each threshold; opposite deviations offset. '
        'State OD is positive, generator UI negative. Overall averages weight the covered portions of 15-minute blocks.')


def seconds(stamp):
    value = pd.Timestamp(stamp)
    if value.tzinfo:
        value = value.tz_convert('Asia/Kolkata').tz_localize(None)
    if pd.isna(value):
        raise ValueError('Invalid analysis timestamp.')
    return value.value / 1e9


def iso(value):
    return pd.Timestamp(int(round(value * 1e9))).isoformat(timespec='seconds')


def finite(value):
    return round(float(value), 6) if np.isfinite(value) else None


def timestamp_array(timestamps):
    values=pd.DatetimeIndex(pd.to_datetime(timestamps,format='mixed',errors='coerce'))
    if values.isna().any():raise ValueError('The file contains invalid timestamps.')
    if values.tz is not None:values=values.tz_convert('Asia/Kolkata').tz_localize(None)
    return values.to_numpy(dtype='datetime64[ns]').astype(np.int64).astype(float)/1e9


def timeline(timestamps, frequency):
    times=timestamp_array(timestamps)
    if len(times) < 2:
        raise ValueError('At least two distinct timestamps are required to establish sampling interval.')
    if np.any(np.diff(times) <= 0):
        raise ValueError('Timestamps must be sorted and unique; duplicate timestamps cannot be counted twice.')
    frequency = pd.to_numeric(pd.Series(frequency), errors='coerce').to_numpy(dtype=float)
    if len(frequency) != len(times):
        raise ValueError('Frequency and timestamp lengths differ.')
    gaps = np.diff(times)
    values, counts = np.unique(np.round(gaps, 6), return_counts=True)
    cadence = float(values[np.argmax(counts)])
    # Never infer a day-long interval from a sparse multi-day file.
    if cadence <= 0 or cadence > 900:
        raise ValueError('Cannot establish a source sampling interval of 15 minutes or less.')
    return times, frequency, cadence


def merge_ranges(ranges):
    ordered = sorted((seconds(a), seconds(b)) for a, b in ranges)
    merged = []
    for start, end in ordered:
        if end <= start:
            raise ValueError('Every selected period must end after its start.')
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    if not merged:
        raise ValueError('Select at least one analysis period.')
    return merged


def segments(dataset, ranges):
    """Clip sample support to selections and quarter-hour boundaries, without filling gaps."""
    times, cadence = dataset['times'], dataset['cadence']
    support = dataset.get('support_seconds', np.full(len(times),cadence))
    support_end = np.minimum(np.r_[times[1:], times[-1] + support[-1]], times + support)
    indexes, starts, ends = [], [], []
    for start, end in ranges:
        lo = max(0, np.searchsorted(times, start, side='right') - 1)
        hi = np.searchsorted(times, end, side='left')
        candidates = np.arange(lo, hi)
        left, right = np.maximum(times[candidates], start), np.minimum(support_end[candidates], end)
        valid = right > left
        indexes.append(candidates[valid]); starts.append(left[valid]); ends.append(right[valid])
    index = np.concatenate(indexes).astype(int)
    left, right = np.concatenate(starts), np.concatenate(ends)
    # A source interval can straddle a 15-minute boundary. Split its weights.
    split_index, split_left, split_right = [], [], []
    while len(index):
        edge = np.minimum(right, (np.floor(left / 900) + 1) * 900)
        split_index.append(index); split_left.append(left); split_right.append(edge)
        more = right > edge
        index, left, right = index[more], edge[more], right[more]
    if not split_index:
        raise ValueError('No uploaded readings intersect the selected periods.')
    order = np.argsort(np.concatenate(split_left), kind='stable')
    return tuple(np.concatenate(items)[order] for items in (split_index, split_left, split_right))


def occurrence_stats(frequency, starts, ends, level):
    active = np.isfinite(frequency) & (frequency < level)
    indexes = np.flatnonzero(active)
    if not len(indexes):
        return {'frequency_minutes': 0.0, 'occurrences': 0, 'longest_minutes': 0.0, 'lowest_frequency': None}
    breaks = np.r_[True, (np.diff(indexes) != 1) | (np.abs(starts[indexes[1:]] - ends[indexes[:-1]]) > 1e-6)]
    durations = ends[indexes] - starts[indexes]
    runs = np.add.reduceat(durations, np.flatnonzero(breaks))
    return {'frequency_minutes': finite(durations.sum() / 60), 'occurrences': int(breaks.sum()),
            'longest_minutes': finite(runs.max() / 60), 'lowest_frequency': finite(frequency[indexes].min())}


def metrics(freq, deviation, weights, codes, size, is_state):
    result = {}
    for level in LEVELS:
        condition = np.isfinite(freq) & (freq < level)
        valid = condition & np.isfinite(deviation)
        adverse = valid & ((deviation > 0) if is_state else (deviation < 0))
        denominator = np.bincount(codes, weights=weights * condition, minlength=size)
        covered = np.bincount(codes, weights=weights * valid, minlength=size)
        adverse_time = np.bincount(codes, weights=weights * adverse, minlength=size)
        totals = np.bincount(codes, weights=np.where(valid, deviation, 0) * weights, minlength=size)
        avg = np.divide(totals, covered, out=np.full(size, np.nan), where=covered > 0)
        pct = np.divide(adverse_time * 100, denominator, out=np.full(size, np.nan), where=(denominator > 0) & (np.abs(denominator-covered) < 1e-6))
        maximum = np.full(size, -np.inf if is_state else np.inf)
        if is_state:
            np.maximum.at(maximum, codes[valid], np.maximum(deviation[valid], 0))
        else:
            np.minimum.at(maximum, codes[valid], np.minimum(deviation[valid], 0))
        result[f'{level:.2f}'] = {'frequency_minutes': denominator / 60, 'adverse_minutes': adverse_time / 60,
            'adverse_pct': pct, 'average_od_ui_mw': avg, 'maximum_od_ui_mw': maximum,
            'unknown_deviation_minutes': np.maximum(0, denominator-covered) / 60}
    return result


def calculate(dataset, selections, chronology, messages_complete=True):
    ranges = merge_ranges(selections)
    index, starts, ends = segments(dataset, ranges)
    index = index.astype(int)
    freq = dataset['frequency'][index]
    weights = ends-starts
    valid = np.isfinite(freq)
    if not valid.any():
        raise ValueError('No valid frequency readings intersect the selection.')
    minimum_index = np.flatnonzero(valid)[np.argmin(freq[valid])]
    summary = {'analysis_start': iso(ranges[0][0]), 'analysis_end': iso(ranges[-1][1]),
        'selected_minutes': finite(sum(b-a for a,b in ranges)/60), 'covered_frequency_minutes': finite(weights[valid].sum()/60),
        'minimum_frequency': finite(freq[minimum_index]), 'minimum_timestamp': iso(dataset['times'][index[minimum_index]]),
        'average_frequency': finite(np.average(freq[valid], weights=weights[valid])),
        'sampling_seconds': dataset['cadence'], 'sampling_intervals_seconds': sorted(float(value) for value in np.unique(dataset.get('support_seconds',np.array([dataset['cadence']])))), 'thresholds': {f'{level:.2f}':occurrence_stats(freq,starts,ends,level) for level in LEVELS}}
    summary['low_frequency_events'] = summary['thresholds']['49.90']['occurrences']
    summary['uncovered_minutes'] = finite(max(0,summary['selected_minutes']-summary['covered_frequency_minutes']))
    blocks, codes = np.unique(np.floor(starts/900).astype(np.int64), return_inverse=True)
    block_starts=np.full(len(blocks),np.inf);block_ends=np.full(len(blocks),-np.inf)
    np.minimum.at(block_starts,codes,starts);np.maximum.at(block_ends,codes,ends)
    performance, overall = {group:[] for group in GROUPS}, {group:[] for group in GROUPS}
    message_map = {}
    for row in chronology:
        stamp=seconds(row['timestamp'])
        if not any(a<=stamp<b for a,b in ranges):continue
        message_map.setdefault(row.get('entity_id'),{})[(row.get('timestamp'),row.get('message_no'))]=row.get('frequency_raw_hz',row.get('frequency_hz'))
    for entity in dataset['entities']:
        group = entity['group']
        if group not in GROUPS:
            continue
        deviation = entity['deviation'][index]
        block_metrics = metrics(freq,deviation,weights,codes,len(blocks),group=='State')
        total_metrics = metrics(freq,deviation,weights,np.zeros(len(index),dtype=int),1,group=='State')
        lowest=np.full(len(blocks),np.inf);np.minimum.at(lowest,codes[valid],freq[valid])
        message_counts={};threshold_counts={level:{} for level in block_metrics};unknown_message_blocks=set();entity_messages=message_map.get(entity['entity_id'],{})
        for (stamp,_),message_frequency in entity_messages.items():
            block=int(seconds(stamp)//900)
            message_counts[block]=message_counts.get(block,0)+1
            if message_frequency is None or not np.isfinite(message_frequency):
                unknown_message_blocks.add(block)
            else:
                for level in threshold_counts:
                    if message_frequency<float(level):threshold_counts[level][block]=threshold_counts[level].get(block,0)+1
        def row(period_start,period_end, values, at, low, count):
            return {'entity_id':entity['entity_id'],'entity':entity['display_name'], 'period_start':iso(period_start),'period_end':iso(period_end),
                'thresholds':{level:{**{key:finite(array[at]) for key,array in entry.items()},'message_count': (None if not messages_complete or (bool(unknown_message_blocks) if values is total_metrics else int(blocks[at]) in unknown_message_blocks) else sum(threshold_counts[level].values()) if values is total_metrics else threshold_counts[level].get(int(blocks[at]),0))} for level,entry in values.items()},
                'lowest_frequency':finite(low),'message_count':count if messages_complete else None}
        for at,block in enumerate(blocks):
            performance[group].append(row(block_starts[at],block_ends[at],block_metrics,at,lowest[at],message_counts.get(int(block),0)))
        overall[group].append(row(ranges[0][0],ranges[-1][1],total_metrics,0,freq[valid].min(),len(entity_messages)))
    return {'summary':summary,'performance':performance,'overall_performance':overall,'calculation_note':NOTE}


def chart_points(dataset, selections, entity_id, limit=2400):
    """Envelope buckets retain frequency minima/maxima and adverse maxima; stats use full resolution."""
    ranges=merge_ranges(selections)
    index, starts, ends=segments(dataset,ranges);index=index.astype(int)
    entity=next((item for item in dataset['entities'] if item['entity_id']==entity_id and item['group']=='State'),None)
    if entity is None:
        raise ValueError('Select a State included in this analysis.')
    freq=dataset['frequency'][index];dev=entity['deviation'][index]
    # Partition each selected interval independently so gaps/slots stay visible.
    output=[]
    per_range=max(10,(limit-len(ranges))//len(ranges))
    for from_time,to_time in ranges:
        candidates=np.flatnonzero((starts>=from_time)&(starts<to_time))
        if not len(candidates):continue
        buckets=np.array_split(candidates,max(1,min(len(candidates),per_range//10)))
        gap_at=np.flatnonzero((starts[1:]-ends[:-1]>1e-6)|(~np.isfinite(freq[:-1]))|(~np.isfinite(freq[1:])))
        previous=None
        for bucket in buckets:
            valid=bucket[np.isfinite(freq[bucket])]
            dev_valid=bucket[np.isfinite(dev[bucket])]
            keep={int(bucket[0]),int(bucket[-1])}
            if len(valid):keep.update([int(valid[np.argmin(freq[valid])]),int(valid[np.argmax(freq[valid])])])
            if len(dev_valid):keep.add(int(dev_valid[np.argmax(np.maximum(dev[dev_valid],0))]))
            for at in sorted(keep):
                if previous is not None:
                    gaps=gap_at[(gap_at>=previous)&(gap_at<at)]
                    if len(gaps):output.append({'timestamp':iso(ends[gaps[0]]),'frequency':None,'od_mw':None,'deviation_mw':None,'range_start':iso(from_time)})
                previous=at
                output.append({'timestamp':iso(starts[at]),'frequency':finite(freq[at]),'od_mw':finite(max(dev[at],0)) if np.isfinite(dev[at]) else None,'deviation_mw':finite(dev[at]),'range_start':iso(from_time)})
        output.append({'timestamp':iso(to_time),'frequency':None,'od_mw':None,'deviation_mw':None,'range_start':iso(from_time)})
    return {'entity_id':entity_id,'entity':entity['display_name'],'points':output,'aggregated':True,'point_budget':limit,'point_count':len(output),
            'note':'Envelope display preserves sampled frequency extrema and OD maxima; durations and occurrences use every original reading.'}

def dataset_from_event(db, event):
    from services.frequency_event_reporting import event_entities
    entities = event_entities(db,event)
    points = event.get('data_points') or []
    frequency_point = next((point for point in points if point.get('is_frequency') or str(point.get('plant_id'))=='SYSTEM_FREQUENCY'),None)
    if frequency_point is None:
        frequency_point=max(points,key=lambda point:len((point.get('series') or {}).get('timestamps') or []),default=None)
    if frequency_point is None:
        raise ValueError('This instance has no stored frequency dataset.')
    series=frequency_point.get('series') or {}
    stamps=series.get('timestamps') or []
    order=np.argsort(pd.to_datetime(stamps,format='mixed').astype('int64'),kind='stable')
    times,freq,cadence=timeline(np.asarray(stamps)[order],np.asarray(series.get('frequency') or [None]*len(stamps),dtype=object)[order])
    index=pd.Index(times)
    for entity in entities:
        source=entity['point'].get('series') or {}
        source_times=timestamp_array(source.get('timestamps') or [])
        locations=index.get_indexer(source_times)
        n=len(source_times)
        def values(key):
            raw=(source.get(key) or [])[:n]
            return pd.to_numeric(pd.Series(raw+[None]*(n-len(raw)),dtype=object),errors='coerce').to_numpy(dtype=float)
        dev=values('deviation'); derived=values('actual')-values('schedule')
        dev=np.where(np.isfinite(dev),dev,derived)
        aligned=np.full(len(times),np.nan)
        valid=locations>=0
        aligned[locations[valid]]=dev[valid]
        entity['deviation']=aligned
        entity['point']={key:value for key,value in entity['point'].items() if key not in {'series','summary','crms_messages','transmission_line_events'}}
    return {'times':times,'frequency':freq,'cadence':cadence,'entities':entities,'warnings':[]}
