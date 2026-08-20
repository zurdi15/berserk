import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import Engine

from .auth import get_current_user, require_admin
from .config import get_settings
from .db import make_engine, make_sessionmaker
from .routers import admin, auth, backup, body, calendar as calendar_router, exercises, image_search, media, progress as progress_router, push, rotation, routines, sharing, social, users, workouts
from .seed import ensure_catalog
from .services.images import backfill_lq_async
from .services.push import PushScheduler, VapidKeys

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
API_PREFIX = "/api/v1"


def create_app(engine: Engine | None = None) -> FastAPI:
    settings = get_settings()
    if engine is None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        engine = make_engine(settings.db_url)

    # v0.36.1: el hilo del Web Push vive con el servidor, no con create_app()
    # — arranca y para con el ciclo de vida ASGI (uvicorn y TestClient `with`).
    # Lifespan y no add_event_handler: la imagen de producción llevaba una
    # FastAPI sin ese método y el push quedó apagado en silencio (v0.36.0)
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        scheduler = getattr(app.state, "push_scheduler", None)
        if scheduler:
            scheduler.start()
        yield
        if scheduler:
            scheduler.stop()

    app = FastAPI(
        title="berserk",
        lifespan=lifespan,
        description="Workout tracker self-hosted",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    # candado no-reentrante: export y restore lo adquieren sin bloquear (409
    # si ya hay una restauración en curso) en vez de encolar peticiones
    app.state.backup_lock = threading.Lock()

    # sembrar el catálogo global (idempotente)
    with app.state.sessionmaker() as session:
        ensure_catalog(session)

    # v0.26.0 LQIP: generar en fondo las miniaturas que falten (subidas de
    # antes de esta versión, o un backup restaurado sin ellas) — hilo daemon,
    # el arranque no espera
    backfill_lq_async(settings.data_dir / "uploads")

    # v0.36.0 Web Push: par VAPID (se genera la primera vez) + hilo daemon que
    # dispara los avisos de fin de descanso/cardio a su hora. Desactivable con
    # BK_PUSH_ENABLED=0; si el fichero de claves no se puede escribir, la app
    # arranca igual sin push (el router responde 503 push_disabled)
    app.state.push_keys = None
    app.state.push_scheduler = None
    if settings.push_enabled:
        try:
            app.state.push_keys = VapidKeys(settings.data_dir / "vapid.pem", settings.vapid_subject)
            app.state.push_scheduler = PushScheduler(app.state.sessionmaker, app.state.push_keys)
        except Exception as exc:  # noqa: BLE001 — sin push antes que sin app
            logging.getLogger("berserk.push").warning("web push desactivado: %s", exc)

    # protegidos: cualquier usuario con sesión
    app.include_router(
        users.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        sharing.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        exercises.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        routines.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        workouts.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        calendar_router.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        progress_router.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        body.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        media.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        social.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        rotation.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        image_search.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        push.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)]
    )
    # solo admin: gestión de usuarios e invitaciones
    app.include_router(
        admin.router, prefix=API_PREFIX, dependencies=[Depends(require_admin)]
    )
    # solo admin: exportar/restaurar la copia de seguridad completa
    app.include_router(
        backup.router, prefix=API_PREFIX, dependencies=[Depends(require_admin)]
    )
    # públicos: auth gestiona su propia protección endpoint a endpoint
    app.include_router(auth.router, prefix=API_PREFIX)

    @app.get(f"{API_PREFIX}/health", tags=["health"])
    def health():
        return {"status": "ok"}

    if settings.serve_static and STATIC_DIR.is_dir():
        assets_dir = STATIC_DIR / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        @app.head("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str):
            if full_path.startswith("api/"):
                return FileResponse(STATIC_DIR / "index.html", status_code=404)
            candidate = (STATIC_DIR / full_path).resolve()
            if (
                full_path
                and candidate.is_relative_to(STATIC_DIR)
                and candidate.is_file()
            ):
                # el service worker y el manifest nunca deben cachearse por HTTP:
                # un sw.js viejo retrasaría los deploys de la PWA
                if full_path == "sw.js":
                    return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
                if full_path == "manifest.webmanifest":
                    return FileResponse(
                        candidate,
                        media_type="application/manifest+json",
                        headers={"Cache-Control": "no-cache"},
                    )
                return FileResponse(candidate)
            if full_path == "favicon.ico":
                raise HTTPException(status_code=404)
            # el index nunca debe cachearse: referencia assets con hash que
            # cambian en cada build (index viejo = assets rotos tras desplegar)
            return FileResponse(
                STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"}
            )

    else:

        @app.get("/", include_in_schema=False)
        def dev_root():
            return HTMLResponse(
                "<h1>berserk · backend</h1>"
                "<p>Modo dev: la app se sirve en "
                "<a href='http://localhost:5173'>http://localhost:5173</a> "
                "(Vite con hot reload). Docs de la API: "
                "<a href='/api/docs'>/api/docs</a>.</p>"
            )

    return app
