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

from PIL import Image

logger = logging.getLogger(__name__)

LQ_SUFFIX = ".lq.jpg"
LQ_WIDTH = 32
LQ_QUALITY = 40
UPLOAD_KINDS = ("exercises", "routines", "avatars", "body")
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
