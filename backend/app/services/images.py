"""v0.26.0 — versiones low-res (LQIP) de toda la media subida.

Por cada imagen (ejercicios, rutinas, avatares, fotos de cuerpo) se genera
un `{nombre}.lq.jpg` minúsculo (32px de ancho, JPEG q40): el cliente lo
carga primero con blur y funde a la imagen real ("blur-up"), y el arranque
del backend rellena las que falten (subidas de antes de esta versión, o un
backup restaurado sin ellas) en un hilo de fondo.
"""

import io
import logging
import threading
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

LQ_SUFFIX = ".lq.jpg"
LQ_WIDTH = 32
LQ_QUALITY = 40
UPLOAD_KINDS = ("exercises", "routines", "avatars", "body")
# v0.40.0 avatar normalizado (ver normalize_avatar): lado mayor y calidad JPEG
AVATAR_MAX_SIDE = 1024
AVATAR_QUALITY = 85
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def lq_path_for(original: Path) -> Path:
    return original.with_name(original.name + LQ_SUFFIX)


def generate_lq(original: Path) -> bool:
    """Genera el LQIP de `original` (idempotente). False si no se pudo (un
    fichero corrupto no debe tumbar ni la subida ni el backfill)."""
    target = lq_path_for(original)
    if target.is_file():
        return True
    try:
        with Image.open(original) as img:
            img = img.convert("RGB")
            height = max(1, round(img.height * LQ_WIDTH / max(1, img.width)))
            img = img.resize((LQ_WIDTH, height), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=LQ_QUALITY)
        target.write_bytes(buffer.getvalue())
        return True
    except Exception:
        logger.warning("no se pudo generar el LQIP de %s", original, exc_info=True)
        return False


def normalize_avatar(data: bytes) -> tuple[bytes, str] | None:
    """v0.40.0 (zurdi: "quitar límite de 5 MB de la foto de perfil"): la foto
    de un móvil moderno pesa 8-15 MB y chocaba con el tope; en vez de guardar
    ese original entero para pintarlo en un círculo de 96 px, el avatar se
    re-encoda aquí a JPEG con lado máximo AVATAR_MAX_SIDE (orientación EXIF
    aplicada: sin ella las fotos verticales del móvil salían tumbadas). None
    si Pillow no la entiende — quien llama guarda el original tal cual (que
    ya pasó el filtro de content-type)."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img) or img
            img = img.convert("RGB")
            img.thumbnail((AVATAR_MAX_SIDE, AVATAR_MAX_SIDE), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=AVATAR_QUALITY, optimize=True)
        return buffer.getvalue(), ".jpg"
    except Exception:
        logger.warning("no se pudo normalizar el avatar; se guarda el original", exc_info=True)
        return None


def backfill_lq(uploads_root: Path) -> int:
    """Genera los LQIP que falten bajo uploads/ — devuelve cuántos creó."""
    created = 0
    for kind in UPLOAD_KINDS:
        directory = uploads_root / kind
        if not directory.is_dir():
            continue
        for file in directory.iterdir():
            if not file.is_file() or file.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            if file.name.endswith(LQ_SUFFIX):
                continue
            if not lq_path_for(file).is_file() and generate_lq(file):
                created += 1
    if created:
        logger.info("LQIP backfill: %d imágenes generadas", created)
    return created


def backfill_lq_async(uploads_root: Path) -> threading.Thread:
    """El backfill al arranque va en un hilo daemon: el boot no espera."""
    thread = threading.Thread(target=backfill_lq, args=(uploads_root,), daemon=True)
    thread.start()
    return thread
