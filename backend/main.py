# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.sync_routes import router

from routes.pipeline_routes import (router as pipeline_router)

from routes.log_routes import (router as log_router)

from scheduler.jobs import scheduler

from routes.rtg_dashboard_routes import router as rtg_dashboard_router

from routes.psp_routes import router as psp_router
from routes.frequency_routes import router as frequency_router

import urllib3


urllib3.disable_warnings(
    urllib3.exceptions.InsecureRequestWarning
)

app = FastAPI(
    title="Power Portal Backend"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.on_event("startup")
async def startup_event():

    scheduler.start()

@app.get("/")
def root():

    return {
        "status":
            "RTG Backend Running"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)