import requests

payload = {
    "rows": [
        {
            "plant_name": "Bihar",
            "is_state": True,
            "statistics": {
                "max_od": 100.0,
                "freq_at_max_od": 49.95,
                "max_od_time": "12:00",
                "od_duration_pct": 10.5,
                "helping_duration_pct": 89.5
            }
        }
    ]
}

try:
    r = requests.post("http://172.17.192.1:8001/api/frequency/download-pdf", json=payload)
    print("Status:", r.status_code)
    print("Response headers:", dict(r.headers))
    if r.status_code != 200:
        print("Response text:", r.text[:500])
except Exception as e:
    import traceback
    traceback.print_exc()
