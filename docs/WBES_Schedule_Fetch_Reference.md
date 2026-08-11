# WBES schedule fetch reference

The WBES schedule API is configured in **PSP Settings** (`pipeline_config`, `config_type: PSP`).
Fetchers must read these values at runtime and must not embed credentials:

- `wbes_url`
- `wbes_api_key`
- `wbes_username`
- `wbes_password`

Endpoint:

```text
{wbes_url}?apikey={wbes_api_key}
```

Request body:

```json
{
  "Date": "DD-MM-YYYY",
  "SchdRevNo": -1,
  "UserName": "<configured wbes_username>",
  "UtilAcronymList": ["BIHAR_STATE"],
  "UtilRegionIdList": [1]
}
```

The response is read from `ResponseBody.GroupWiseDataList`. For each utility,
the net schedule is taken from:

```python
summary = fsData_stateAcronym["NetScheduleSummary"]
total_net_schedule = summary["TotalNetSchdAmount"]
net_schedule_components = summary["NetSchdDataList"]
```

`TotalNetSchdAmount` is the 96-point 15-minute net schedule. `NetSchdDataList`
contains the schedule components and may be used for category bifurcation via
the schedule-type fields. The MIS Schedule Data page expands the 15-minute
values to 5-minute or 1-minute display intervals by holding each published
value until the next WBES interval.
