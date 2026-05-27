import logging
import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from contextlib import asynccontextmanager

from config import DRY_RUN, DEBUG, LOG_MAX_LINES, TOR_DATA_DIR
from detector import scan_apps
from rotator import rotate_single
from restarter import is_docker_accessible, get_docker_client
from models import RotateRequest, HealthResponse
from i18n import TRANSLATIONS

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("onion_rotator")

_in_memory_logs: list[dict] = []


class LogHandler(logging.Handler):
    def emit(self, record):
        entry = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "message": self.format(record),
        }
        _in_memory_logs.append(entry)
        if len(_in_memory_logs) > LOG_MAX_LINES:
            _in_memory_logs.pop(0)


logging.getLogger("onion_rotator").addHandler(LogHandler())


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"=== Onion Rotator v1.0.1 starting ===")
    logger.info(f"DRY_RUN={DRY_RUN}, DEBUG={DEBUG}")
    logger.info(f"TOR_DATA_DIR={TOR_DATA_DIR}")
    logger.info(f"tor_data_exists={os.path.isdir(TOR_DATA_DIR)}")

    docker_ok = is_docker_accessible()
    logger.info(f"docker_accessible={docker_ok}")
    if docker_ok:
        try:
            info = get_docker_client().info()
            logger.info(f"docker_version={info.get('ServerVersion', 'unknown')}")
        except Exception:
            pass
    else:
        logger.warning("Docker socket not accessible — restart will fail")

    yield
    logger.info("Onion Rotator shutting down")


app = FastAPI(title="Onion Rotator", version="1.0.1", lifespan=lifespan)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        tor_data_dir=TOR_DATA_DIR,
        tor_data_accessible=os.path.isdir(TOR_DATA_DIR),
        docker_accessible=is_docker_accessible(),
        dry_run=DRY_RUN,
    )


@app.get("/api/apps")
async def get_apps():
    apps = scan_apps()
    return {"apps": apps, "dry_run": DRY_RUN}


@app.post("/api/rotate")
async def rotate(request: RotateRequest):
    app_ids = request.app_ids
    if not app_ids:
        return JSONResponse(
            status_code=400,
            content={"error": "no_apps_selected", "results": []},
        )

    all_apps = scan_apps()
    app_map = {a["app_id"]: a for a in all_apps}

    results = []
    for app_id in app_ids:
        if app_id not in app_map:
            results.append({
                "app_id": app_id,
                "old_onion": "",
                "new_onion": "",
                "status": "invalid_hostname",
                "message": "app_not_found",
            })
            continue

        app = app_map[app_id]
        result = rotate_single(
            app_id=app_id,
            hostname_path=app["hostname_path"],
            current_onion=app["onion_address"],
        )
        results.append(result)

    return {"results": results}


@app.get("/api/logs")
async def get_logs():
    return {"logs": _in_memory_logs[-100:]}


@app.get("/api/i18n")
async def get_translations():
    return TRANSLATIONS


@app.get("/", response_class=HTMLResponse)
async def index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path) as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Onion Rotator</h1><p>Frontend not found.</p>")
