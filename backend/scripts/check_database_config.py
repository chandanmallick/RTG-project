"""Validate effective database configuration without opening a connection."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config.settings import MONGO_URI
from config.database_policy import internal_database_uri
from crew_legacy.config import MONGO_URI as crew_uri

internal_database_uri(MONGO_URI)
internal_database_uri(os.getenv("CREW_LOCAL_MONGO_URI", crew_uri))
print("Internal database configuration validated")
