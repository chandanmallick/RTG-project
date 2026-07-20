# main.py

import os
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config.settings import RUN_SCHEDULER

from routes.sync_routes import router

from routes.pipeline_routes import (router as pipeline_router)

from routes.log_routes import (router as log_router)

from scheduler.jobs import scheduler

from routes.rtg_dashboard_routes import router as rtg_dashboard_router

from routes.psp_routes import router as psp_router
from routes.frequency_routes import router as frequency_router
from routes.old_logbook_routes import router as old_logbook_router
from routes.crew_routes import router as crew_router
from routes.crew_legacy_routes import router as crew_legacy_router
from routes.dso_report_routes import router as dso_report_router

import urllib3


urllib3.disable_warnings(
    urllib3.exceptions.InsecureRequestWarning
)

app = FastAPI(
    title=os.getenv(
        "APP_BACKEND_TITLE",
        "ASTRO Backend"
    )
)

uploads_directory = Path(__file__).resolve().parent / "uploads"
uploads_directory.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_directory)), name="crew-uploads")

cors_origins_raw = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "*"
)

cors_origins = [
    origin.strip()
    for origin in cors_origins_raw.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):

    start_time = time.perf_counter()

    response = await call_next(request)

    duration_ms = (
        time.perf_counter() - start_time
    ) * 1000

    print(
        (
            f"API HIT {request.method} "
            f"{request.url.path}"
            f"{'?' + request.url.query if request.url.query else ''} "
            f"-> {response.status_code} "
            f"({duration_ms:.1f} ms)"
        ),
        flush=True
    )

    return response

app.include_router(
    router,
    prefix="/api"
)

app.include_router(
    pipeline_router
)

app.include_router(
    log_router,
    prefix="/api"
)

app.include_router(
    rtg_dashboard_router
)

app.include_router(
    psp_router
)

app.include_router(
    frequency_router
)

app.include_router(
    old_logbook_router
)

app.include_router(
    crew_router
)

app.include_router(
    crew_legacy_router
)

app.include_router(
    dso_report_router
)

@app.on_event("startup")
async def startup_event():

    if RUN_SCHEDULER:
        print("Scheduler enabled: starting background jobs", flush=True)
        scheduler.start()
    else:
        print("Scheduler disabled: RUN_SCHEDULER=false", flush=True)

@app.get("/")
def root():

    return {
        "status":
            "RTG Backend Running"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
