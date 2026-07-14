import os
import secrets


def _load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


MONGO_URI = os.getenv("CREW_MONGO_URI", "mongodb://10.3.230.60:27017")
DATABASE_NAME = os.getenv("CREW_MONGO_DB_NAME", os.getenv("CREW_DATABASE_NAME", "crew_management"))

JWT_SECRET_KEY = os.getenv("CREW_JWT_SECRET")
if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = secrets.token_urlsafe(32)
    print("WARNING: CREW_JWT_SECRET is not set. Using a temporary runtime secret.")

JWT_ALGORITHM = os.getenv("CREW_JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("CREW_ACCESS_TOKEN_EXPIRE_HOURS", "8"))

ALLOWED_ORIGINS = _split_csv(
    os.getenv(
        "CREW_ALLOWED_ORIGINS",
        "http://localhost:3000,http://10.3.230.60:3000",
    )
)

DISABLE_API_DOCS = os.getenv("CREW_DISABLE_API_DOCS", "false").lower() in {"1", "true", "yes"}
MAX_REQUEST_BYTES = int(os.getenv("CREW_MAX_REQUEST_BYTES", str(10 * 1024 * 1024)))
ENABLE_HSTS = os.getenv("CREW_ENABLE_HSTS", "false").lower() in {"1", "true", "yes"}

