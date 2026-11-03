import json
import logging
import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import urllib.request
import urllib.error
import urllib.parse
from services.db_handler import MongoService

logger = logging.getLogger("weather_service")

NASA_POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
DEFAULT_PARAMETERS = "T2M,T2MDEW,T2MWET,TS,T2M_RANGE,T2M_MAX,T2M_MIN"
COLLECTION_NAME = "weather_history_cache"

# Pre-configured Cities with verified Latitude & Longitude
CITIES_LIST = [
    # West Bengal
    {"name": "Kolkata", "state": "West Bengal", "latitude": 22.5726, "longitude": 88.3639, "district": "Kolkata", "is_capital": True},
    {"name": "Howrah", "state": "West Bengal", "latitude": 22.5958, "longitude": 88.2636, "district": "Howrah"},
    {"name": "Siliguri", "state": "West Bengal", "latitude": 26.7271, "longitude": 88.3953, "district": "Darjeeling / Jalpaiguri"},
    {"name": "Asansol", "state": "West Bengal", "latitude": 23.6739, "longitude": 86.9524, "district": "Paschim Bardhaman"},
    {"name": "Durgapur", "state": "West Bengal", "latitude": 23.5204, "longitude": 87.3119, "district": "Paschim Bardhaman"},
    {"name": "Haldia", "state": "West Bengal", "latitude": 22.0667, "longitude": 88.0698, "district": "Purba Medinipur"},
    {"name": "Kharagpur", "state": "West Bengal", "latitude": 22.3460, "longitude": 87.2320, "district": "Paschim Medinipur"},
    {"name": "Malda", "state": "West Bengal", "latitude": 25.0108, "longitude": 88.1411, "district": "Malda"},
    {"name": "Baharampur", "state": "West Bengal", "latitude": 24.0988, "longitude": 88.2680, "district": "Murshidabad"},
    {"name": "Darjeeling", "state": "West Bengal", "latitude": 27.0410, "longitude": 88.2663, "district": "Darjeeling"},

    # Bihar
    {"name": "Patna", "state": "Bihar", "latitude": 25.5941, "longitude": 85.1376, "district": "Patna", "is_capital": True},
    {"name": "Gaya", "state": "Bihar", "latitude": 24.7914, "longitude": 85.0002, "district": "Gaya"},
    {"name": "Muzaffarpur", "state": "Bihar", "latitude": 26.1209, "longitude": 85.3647, "district": "Muzaffarpur"},
    {"name": "Bhagalpur", "state": "Bihar", "latitude": 25.2425, "longitude": 86.9842, "district": "Bhagalpur"},
    {"name": "Purnia", "state": "Bihar", "latitude": 25.7771, "longitude": 87.4753, "district": "Purnia"},

    # Jharkhand
    {"name": "Ranchi", "state": "Jharkhand", "latitude": 23.3441, "longitude": 85.3096, "district": "Ranchi", "is_capital": True},
    {"name": "Jamshedpur", "state": "Jharkhand", "latitude": 22.8046, "longitude": 86.2029, "district": "East Singhbhum"},
    {"name": "Dhanbad", "state": "Jharkhand", "latitude": 23.7957, "longitude": 86.4304, "district": "Dhanbad"},
    {"name": "Bokaro", "state": "Jharkhand", "latitude": 23.6693, "longitude": 86.1511, "district": "Bokaro"},
    {"name": "Deoghar", "state": "Jharkhand", "latitude": 24.4826, "longitude": 86.7001, "district": "Deoghar"},

    # Odisha
    {"name": "Bhubaneswar", "state": "Odisha", "latitude": 20.2961, "longitude": 85.8245, "district": "Khurda", "is_capital": True},
    {"name": "Cuttack", "state": "Odisha", "latitude": 20.4625, "longitude": 85.8828, "district": "Cuttack"},
    {"name": "Rourkela", "state": "Odisha", "latitude": 22.2604, "longitude": 84.8536, "district": "Sundargarh"},
    {"name": "Sambalpur", "state": "Odisha", "latitude": 21.4669, "longitude": 83.9812, "district": "Sambalpur"},
    {"name": "Berhampur", "state": "Odisha", "latitude": 19.3149, "longitude": 84.7941, "district": "Ganjam"},
    {"name": "Balasore", "state": "Odisha", "latitude": 21.4934, "longitude": 86.9135, "district": "Balasore"},

    # Sikkim
    {"name": "Gangtok", "state": "Sikkim", "latitude": 27.3389, "longitude": 88.6065, "district": "East Sikkim", "is_capital": True},
    {"name": "Namchi", "state": "Sikkim", "latitude": 27.1667, "longitude": 88.3500, "district": "South Sikkim"},

    # User-provided sample coordinates
    {"name": "NASA Reference Point A", "state": "Reference Coordinates", "latitude": 32.929, "longitude": -95.770, "district": "Texas, USA"},
    {"name": "NASA Reference Point B", "state": "Reference Coordinates", "latitude": 5.0, "longitude": 10.0, "district": "Equatorial Region"},
]


class WeatherService:
    def __init__(self):
        try:
            self.db = MongoService().db
            self.collection = self.db[COLLECTION_NAME]
        except Exception as e:
            logger.warning(f"Failed to connect to MongoDB in WeatherService: {e}")
            self.collection = None

    def get_cities(self) -> List[Dict[str, Any]]:
        """Return the pre-configured city list with geographical coordinates."""
        return CITIES_LIST

    def build_api_url(
        self,
        latitude: float,
        longitude: float,
        start: str,
        end: str,
        parameters: str = DEFAULT_PARAMETERS,
        community: str = "re",
        units: str = "metric",
    ) -> str:
        """Construct the official NASA POWER daily point API URL."""
        params = {
            "start": start,
            "end": end,
            "latitude": f"{latitude:.4f}",
            "longitude": f"{longitude:.4f}",
            "community": community,
            "parameters": parameters,
            "format": "json",
            "units": units,
            "header": "true",
        }
        query_string = urllib.parse.urlencode(params)
        return f"{NASA_POWER_BASE_URL}?{query_string}"

    def fetch_nasa_power_data(
        self,
        latitude: float,
        longitude: float,
        start: str = "20240101",
        end: str = "20241231",
        parameters: str = DEFAULT_PARAMETERS,
        city_name: Optional[str] = None,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """
        Fetch historical daily weather and temperature parameters from NASA POWER API.
        Caches results in MongoDB for high performance and offline resilience.
        """
        # Normalize date strings (YYYYMMDD)
        start_clean = start.replace("-", "").strip()
        end_clean = end.replace("-", "").strip()

        cache_key = f"{latitude:.4f}_{longitude:.4f}_{start_clean}_{end_clean}"

        # 1. Check cache first (unless force_refresh is True)
        if not force_refresh and self.collection is not None:
            try:
                cached = self.collection.find_one({"cache_key": cache_key})
                if cached:
                    logger.info(f"Serving cached NASA POWER weather data for {cache_key}")
                    cached.pop("_id", None)
                    cached["source"] = "mongodb_cache"
                    return cached
            except Exception as e:
                logger.warning(f"Error reading weather cache: {e}")

        # 2. Build NASA POWER URL
        api_url = self.build_api_url(
            latitude=latitude,
            longitude=longitude,
            start=start_clean,
            end=end_clean,
            parameters=parameters,
        )

        raw_data = None
        source_label = "nasa_power_live"

        try:
            req = urllib.request.Request(
                api_url,
                headers={
                    "User-Agent": "RTG-PowerSystemAnalytics/1.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=18) as resp:
                content = resp.read().decode("utf-8")
                raw_data = json.loads(content)
                logger.info(f"Successfully fetched live data from NASA POWER for ({latitude}, {longitude})")
        except Exception as net_err:
            logger.warning(f"Live NASA POWER call failed for {api_url}: {net_err}. Using fallback calculation.")
            raw_data = self._generate_fallback_data(latitude, longitude, start_clean, end_clean)
            source_label = "fallback_climatic_model"

        # 3. Process & format raw data
        formatted_result = self._process_nasa_response(
            raw_data=raw_data,
            latitude=latitude,
            longitude=longitude,
            start_clean=start_clean,
            end_clean=end_clean,
            city_name=city_name,
            api_url=api_url,
            source_label=source_label,
        )

        # 4. Save to MongoDB cache
        if self.collection is not None and source_label == "nasa_power_live":
            try:
                to_save = dict(formatted_result)
                to_save["cache_key"] = cache_key
                to_save["updated_at"] = datetime.utcnow().isoformat()
                self.collection.update_one(
                    {"cache_key": cache_key},
                    {"$set": to_save},
                    upsert=True,
                )
            except Exception as e:
                logger.warning(f"Failed to cache weather data in MongoDB: {e}")

        return formatted_result

    def _process_nasa_response(
        self,
        raw_data: dict,
        latitude: float,
        longitude: float,
        start_clean: str,
        end_clean: str,
        city_name: Optional[str],
        api_url: str,
        source_label: str,
    ) -> Dict[str, Any]:
        """Transform raw NASA POWER JSON into clean time-series and summary stats."""
        properties = raw_data.get("properties", {})
        param_dict = properties.get("parameter", {})

        t2m_dict = param_dict.get("T2M", {})
        t2m_max_dict = param_dict.get("T2M_MAX", {})
        t2m_min_dict = param_dict.get("T2M_MIN", {})
        t2mdew_dict = param_dict.get("T2MDEW", {})
        t2mwet_dict = param_dict.get("T2MWET", {})
        ts_dict = param_dict.get("TS", {})
        t2m_range_dict = param_dict.get("T2M_RANGE", {})

        # Collect unique sorted dates
        all_dates = sorted(list(t2m_dict.keys()))

        daily_records = []
        valid_t2m = []
        valid_max = []
        valid_min = []

        for d_str in all_dates:
            def clean_val(val):
                if val is None or val <= -990.0:
                    return None
                return round(float(val), 2)

            t_val = clean_val(t2m_dict.get(d_str))
            max_val = clean_val(t2m_max_dict.get(d_str))
            min_val = clean_val(t2m_min_dict.get(d_str))
            dew_val = clean_val(t2mdew_dict.get(d_str))
            wet_val = clean_val(t2mwet_dict.get(d_str))
            ts_val = clean_val(ts_dict.get(d_str))
            range_val = clean_val(t2m_range_dict.get(d_str))

            if t_val is not None:
                valid_t2m.append(t_val)
            if max_val is not None:
                valid_max.append(max_val)
            if min_val is not None:
                valid_min.append(min_val)

            formatted_date = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:]}" if len(d_str) == 8 else d_str

            daily_records.append({
                "date": formatted_date,
                "date_raw": d_str,
                "t2m": t_val,
                "t2m_max": max_val,
                "t2m_min": min_val,
                "t2mdew": dew_val,
                "t2mwet": wet_val,
                "ts": ts_val,
                "t2m_range": range_val,
            })

        # Calculate latest day snapshot
        latest_record = daily_records[-1] if daily_records else {}

        # Statistical summary
        summary = {
            "period_avg_t2m": round(sum(valid_t2m) / len(valid_t2m), 2) if valid_t2m else None,
            "period_highest_max": max(valid_max) if valid_max else None,
            "period_lowest_min": min(valid_min) if valid_min else None,
            "total_days": len(daily_records),
            "latest_snapshot": latest_record,
        }

        # Resolve matched city name
        resolved_name = city_name
        if not resolved_name:
            for c in CITIES_LIST:
                if abs(c["latitude"] - latitude) < 0.08 and abs(c["longitude"] - longitude) < 0.08:
                    resolved_name = c["name"]
                    break
        if not resolved_name:
            resolved_name = f"Point ({latitude:.2f}°N, {longitude:.2f}°E)"

        return {
            "success": True,
            "location": {
                "name": resolved_name,
                "latitude": latitude,
                "longitude": longitude,
            },
            "query_range": {
                "start": start_clean,
                "end": end_clean,
            },
            "source": source_label,
            "api_url": api_url,
            "summary": summary,
            "daily_records": daily_records,
            "raw_parameters": list(param_dict.keys()),
        }

    def _generate_fallback_data(
        self, latitude: float, longitude: float, start_str: str, end_str: str
    ) -> dict:
        """
        Generate realistic seasonal meteorological temperature curves based on
        latitude and solar declination when public internet access is unreachable.
        """
        try:
            start_dt = datetime.strptime(start_str, "%Y%m%d")
            end_dt = datetime.strptime(end_str, "%Y%m%d")
        except Exception:
            start_dt = datetime(2024, 1, 1)
            end_dt = datetime(2024, 3, 31)

        t2m_dict = {}
        t2m_max_dict = {}
        t2m_min_dict = {}
        t2mdew_dict = {}
        t2mwet_dict = {}
        ts_dict = {}
        t2m_range_dict = {}

        curr = start_dt
        while curr <= end_dt:
            d_str = curr.strftime("%Y%m%d")
            day_of_year = curr.timetuple().tm_yday

            # Base annual sinusoidal curve for Eastern India / Subtropics
            # Peak in May (~day 135), coolest in Jan (~day 15)
            phase = (day_of_year - 15) / 365.25 * 2 * math.pi
            base_temp = 25.0 + 8.5 * math.sin(phase - 0.5)

            # Daily fluctuation simulation
            pseudo_random = math.sin(day_of_year * 17.3 + latitude * 3.7) * 2.2

            t_mean = round(base_temp + pseudo_random, 2)
            t_max = round(t_mean + 6.5 + pseudo_random * 0.4, 2)
            t_min = round(t_mean - 6.0 - pseudo_random * 0.4, 2)
            t_range = round(t_max - t_min, 2)
            dew = round(t_min - 2.5, 2)
            wet = round(t_mean - 3.0, 2)
            ts = round(t_mean + 1.2, 2)

            t2m_dict[d_str] = t_mean
            t2m_max_dict[d_str] = t_max
            t2m_min_dict[d_str] = t_min
            t2mdew_dict[d_str] = dew
            t2mwet_dict[d_str] = wet
            ts_dict[d_str] = ts
            t2m_range_dict[d_str] = t_range

            curr += timedelta(days=1)

        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [longitude, latitude, 0.0]},
            "properties": {
                "parameter": {
                    "T2M": t2m_dict,
                    "T2M_MAX": t2m_max_dict,
                    "T2M_MIN": t2m_min_dict,
                    "T2MDEW": t2mdew_dict,
                    "T2MWET": t2mwet_dict,
                    "TS": ts_dict,
                    "T2M_RANGE": t2m_range_dict,
                }
            },
        }
