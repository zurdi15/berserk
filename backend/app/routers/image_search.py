"""v0.24.0 — búsqueda de imágenes de ejercicio desde la webapp.

Fuente: free-exercise-db (github.com/yuhonas/free-exercise-db), ~870
ejercicios con imágenes en dominio público. El índice JSON se baja UNA vez
y se cachea en memoria (TTL); la imagen elegida se DESCARGA al backend y se
guarda como imagen del ejercicio (mismo flujo que el upload manual: nada de
hotlinking, sobrevive offline y el encuadre WYSIWYG aplica encima).

Anti-SSRF: el import por URL solo acepta https hacia los hosts de la
allowlist — jamás una URL arbitraria del cliente hacia la red interna.
"""

import json
import time
import unicodedata
import urllib.request
import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import Exercise
from .exercises import _can_edit
from .media import MAX_IMAGE_BYTES, _delete_quietly, _uploads_dir

router = APIRouter(tags=["image-search"])

INDEX_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
ALLOWED_IMAGE_HOSTS = {"raw.githubusercontent.com"}
INDEX_TTL_SECONDS = 6 * 3600
FETCH_TIMEOUT_SECONDS = 15
MAX_RESULTS = 24

# extensión canónica por sufijo de URL — raw.githubusercontent no siempre
# manda un content-type de imagen, así que el sufijo del path es el criterio
# primario y el content-type el secundario
_EXT_BY_SUFFIX = {".jpg": ".jpg", ".jpeg": ".jpg", ".png": ".png", ".webp": ".webp"}


def _fetch_url(url: str) -> bytes:
    """Único punto de red del módulo — los tests lo monkeypatchean."""
    with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_SECONDS) as resp:  # noqa: S310 (https + allowlist)
        return resp.read(MAX_IMAGE_BYTES * 4)


_index_cache: dict = {"at": 0.0, "items": []}


def _load_index() -> list[dict]:
    now = time.monotonic()
    if _index_cache["items"] and now - _index_cache["at"] < INDEX_TTL_SECONDS:
        return _index_cache["items"]
    try:
        raw = json.loads(_fetch_url(INDEX_URL))
    except Exception as error:  # red caída/GitHub inaccesible: error explícito
        if _index_cache["items"]:
            return _index_cache["items"]  # índice rancio > fallo
        raise HTTPException(status_code=502, detail="image_search_unavailable") from error
    items = [
        {"name": item.get("name") or "", "images": item.get("images") or []}
        for item in raw
        if item.get("images")
    ]
    _index_cache.update(at=now, items=items)
    return items


def _fold(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn"
    )


class ImageSearchResult(BaseModel):
    name: str
    image_urls: list[str]


@router.get("/exercise-image-search", response_model=list[ImageSearchResult])
def search_exercise_images(
    user: CurrentUser, q: str = Query(min_length=2, max_length=80)
):
    del user  # cualquier usuario autenticado puede buscar
    needle = _fold(q.strip())
    results = []
    for item in _load_index():
        if needle in _fold(item["name"]):
            results.append(
                ImageSearchResult(
                    name=item["name"],
                    image_urls=[IMAGE_BASE + path for path in item["images"]],
                )
            )
            if len(results) >= MAX_RESULTS:
                break
    return results


class ImageImportIn(BaseModel):
    url: str = Field(max_length=500)


@router.post("/exercises/{exercise_id}/image/from-url", response_model=None, status_code=204)
def import_exercise_image(
    exercise_id: int, payload: ImageImportIn, user: CurrentUser, db: Session = Depends(get_db)
):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not _can_edit(exercise.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")

    parsed = urlparse(payload.url)
    suffix = next((ext for sfx, ext in _EXT_BY_SUFFIX.items() if parsed.path.lower().endswith(sfx)), None)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_IMAGE_HOSTS or suffix is None:
        raise HTTPException(status_code=422, detail="image_url_not_allowed")

    try:
        data = _fetch_url(payload.url)
    except Exception as error:
        raise HTTPException(status_code=502, detail="image_download_failed") from error
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="image_too_large")

    # mismo destino y limpieza que upload_exercise_image (media.py)
    filename = f"{uuid.uuid4().hex}{suffix}"
    (_uploads_dir("exercises") / filename).write_bytes(data)
    if exercise.image_path:
        _delete_quietly(_uploads_dir("exercises") / exercise.image_path)
    exercise.image_path = filename
    # una imagen nueva resetea el encuadre al neutro — el de la foto anterior
    # no significa nada sobre esta
    exercise.image_pos_x = 50
    exercise.image_pos_y = 50
    exercise.image_zoom = 1
    db.commit()

