"""v0.12.0 — media y notas por ejercicio.

Ficheros bajo BK_DATA_DIR/uploads/{exercises,body} con nombre uuid.ext:
el nombre en disco jamás viene del cliente (sin traversal posible) y el
GET localiza SIEMPRE por id en DB, nunca por path arbitrario. La imagen de
un ejercicio hereda su visibilidad (get_visible_exercise) y subirla exige
poder editarlo (_can_edit); las fotos de cuerpo son PRIVADAS del dueño —
no viajan por sharing, a diferencia del resto de datos de Cuerpo.
"""

import os
import uuid
from datetime import date as date_type
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..db import get_db
from ..models import BodyPhoto, Exercise, ExerciseNote, Routine, User
from ..schemas.media import BodyPhotoOut, ExerciseNoteIn, ExerciseNoteOut
from ..services.images import generate_lq, lq_path_for, normalize_avatar
from .exercises import _can_edit, get_visible_exercise
from .routines import _editable_routine, _visible_template

router = APIRouter(tags=["media"])

# content-types de imagen aceptados → extensión canónica en disco
IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
# v0.40.0 (zurdi: "quitar límite de 5 MB de la foto de perfil"): 5 MB se
# quedaba corto para cualquier foto de móvil actual. El tope sigue existiendo
# (el fichero entero pasa por memoria y es un servidor de 256 MB), pero con
# margen de sobra; el avatar además se re-encoda pequeño al guardarlo.
MAX_IMAGE_BYTES = 25 * 1024 * 1024
# v0.40.0: las URL de media versionadas (?v=) y las fotos de cuerpo (un id =
# un fichero, inmutable) se cachean fuerte; sin versión, el navegador
# revalida por ETag (304, sin cuerpo) — nunca vuelve a bajar la foto entera
IMAGE_CACHE_CONTROL = "private, max-age=604800"
IMAGE_REVALIDATE_CONTROL = "private, no-cache"

# v0.40.0 (zurdi: "cualquier cambio a mitad de entreno salta el 'no hay
# conexión'"): las dependencias yield de FastAPI se cierran DESPUÉS de enviar
# la respuesta, así que cada imagen mantenía su conexión SQLite ocupada
# mientras el fichero viajaba por la red del gimnasio — abrir la biblioteca
# lanzaba ~60 descargas lentas, agotaba el pool (5+10) y el resto de la API
# esperaba 30 s (visto en los logs del pod: "QueuePool limit ... reached").
# scope="function" suelta la sesión en cuanto el handler devuelve.
FileDb = Depends(get_db, scope="function")


def _file_user(request: Request, response: Response, db: Session = FileDb) -> User:
    # mismo resolvedor que CurrentUser, pero sobre la sesión de scope
    # "function": la cadena entera del handler suelta su conexión antes de
    # empezar a mandar el fichero (get_current_user con Depends(get_db) a
    # secas abriría una segunda sesión, de scope request, que sí quedaría
    # retenida hasta el final del streaming)
    return get_current_user(request, response, db)


FileUser = Depends(_file_user)


def _uploads_dir(kind: str) -> Path:
    directory = get_settings().data_dir / "uploads" / kind
    directory.mkdir(parents=True, exist_ok=True)
    return directory


async def _read_image(file: UploadFile) -> tuple[bytes, str]:
    ext = IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(status_code=422, detail="unsupported_image_type")
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="image_too_large")
    return data, ext


def _serve_image(path: Path, lq: bool, request: Request, cacheable: bool = True) -> Response:
    # v0.26.0 LQIP: ?lq=1 sirve la miniatura borrosa si existe (fallback a la
    # original — una imagen sin LQIP aún es mejor que un 404)
    file = path
    if lq:
        lq_file = lq_path_for(path)
        if lq_file.is_file():
            file = lq_file
    # v0.40.0: el stat va por delante para tener el ETag ya en cabeceras y
    # poder contestar 304 a un If-None-Match sin abrir el fichero
    response = FileResponse(file, stat_result=os.stat(file))
    cache_control = IMAGE_CACHE_CONTROL if cacheable else IMAGE_REVALIDATE_CONTROL
    etag = response.headers.get("etag")
    if etag and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": cache_control})
    response.headers["Cache-Control"] = cache_control
    return response


def _versioned(request: Request) -> bool:
    # el cliente versiona la URL con image_version (raíz uuid del fichero,
    # nueva por subida): con ?v= la cache fuerte es segura
    return bool(request.query_params.get("v"))


def _remove_with_lq(path: Path) -> None:
    _delete_quietly(path)
    _delete_quietly(lq_path_for(path))


def _delete_quietly(path: Path) -> None:
    # el fichero puede no existir (backup restaurado sin uploads, borrado a
    # mano): la operación de DB no debe fallar por eso
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


# ---------- imagen de ejercicio ----------


@router.post("/exercises/{exercise_id}/image", response_model=None, status_code=204)
async def upload_exercise_image(
    exercise_id: int, file: UploadFile, user: CurrentUser, db: Session = Depends(get_db)
):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not _can_edit(exercise.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    data, ext = await _read_image(file)
    filename = f"{uuid.uuid4().hex}{ext}"
    target = _uploads_dir("exercises") / filename
    target.write_bytes(data)
    generate_lq(target)
    if exercise.image_path:
        _remove_with_lq(_uploads_dir("exercises") / exercise.image_path)
    exercise.image_path = filename
    db.commit()


@router.get("/exercises/{exercise_id}/image")
def get_exercise_image(
    exercise_id: int, request: Request, user: User = FileUser, db: Session = FileDb, lq: bool = False
):
    exercise = get_visible_exercise(db, user.id, exercise_id)
    if exercise is None or not exercise.image_path:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("exercises") / exercise.image_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    return _serve_image(path, lq, request, cacheable=_versioned(request))


@router.delete("/exercises/{exercise_id}/image", status_code=204)
def delete_exercise_image(exercise_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not _can_edit(exercise.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    if exercise.image_path:
        _remove_with_lq(_uploads_dir("exercises") / exercise.image_path)
        exercise.image_path = None
        db.commit()


# ---------- imagen de rutina ----------


@router.post("/routines/{routine_id}/image", response_model=None, status_code=204)
async def upload_routine_image(
    routine_id: int, file: UploadFile, user: CurrentUser, db: Session = Depends(get_db)
):
    # v0.20.x (zurdi): la rutina puede llevar SU imagen (hero de Hoy y
    # pre-inicio); sin ella manda la runa — nunca la foto de un ejercicio
    routine = _editable_routine(db, user, routine_id)
    data, ext = await _read_image(file)
    filename = f"{uuid.uuid4().hex}{ext}"
    target = _uploads_dir("routines") / filename
    target.write_bytes(data)
    generate_lq(target)
    if routine.image_path:
        _remove_with_lq(_uploads_dir("routines") / routine.image_path)
    routine.image_path = filename
    db.commit()


@router.get("/routines/{routine_id}/image")
def get_routine_image(
    routine_id: int, request: Request, user: User = FileUser, db: Session = FileDb, lq: bool = False
):
    # misma regla de visibilidad que el resto de la rutina (propia, global o
    # plantilla legacy) — _visible_template ya lanza 404 si no aplica.
    # v0.23.0 (zurdi: "asumiendo otro user como admin fallan las imágenes de
    # hero de las rutinas"): los <img> del navegador no llevan la cabecera
    # X-Bk-Act-As (solo la añade el fetch de client.ts), así que llegan con
    # la identidad REAL del admin — un admin ve cualquier media, igual que ya
    # ve cualquier dato vía act-as en la API
    if user.is_admin:
        routine = db.get(Routine, routine_id)
        if routine is None:
            raise HTTPException(status_code=404, detail="not_found")
    else:
        routine = _visible_template(db, user, routine_id)
    if not routine.image_path:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("routines") / routine.image_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    return _serve_image(path, lq, request, cacheable=_versioned(request))


@router.delete("/routines/{routine_id}/image", status_code=204)
def delete_routine_image(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    routine = _editable_routine(db, user, routine_id)
    if routine.image_path:
        _remove_with_lq(_uploads_dir("routines") / routine.image_path)
        routine.image_path = None
        db.commit()


# ---------- foto de perfil ----------


@router.post("/users/me/avatar", response_model=None, status_code=204)
async def upload_avatar(file: UploadFile, user: CurrentUser, db: Session = Depends(get_db)):
    # v0.19.x (zurdi: "que se pueda poner foto de perfil") — mismo esquema
    # que la imagen de ejercicio: uuid.ext en disco, columna con el nombre
    data, ext = await _read_image(file)
    # v0.40.0: sin tope práctico para la foto — se guarda ya reducida (ver
    # normalize_avatar); si Pillow no la lee, el original tal cual
    normalized = normalize_avatar(data)
    if normalized is not None:
        data, ext = normalized
    filename = f"{uuid.uuid4().hex}{ext}"
    target = _uploads_dir("avatars") / filename
    target.write_bytes(data)
    generate_lq(target)
    db_user = db.get(User, user.id)
    assert db_user is not None
    if db_user.avatar_path:
        _remove_with_lq(_uploads_dir("avatars") / db_user.avatar_path)
    db_user.avatar_path = filename
    db.commit()


@router.get("/users/{user_id}/avatar")
def get_avatar(
    user_id: int, request: Request, user: User = FileUser, db: Session = FileDb, lq: bool = False
):
    # visible para cualquier usuario autenticado de la instancia: el avatar
    # es identidad (perfil hoy; feed/compartidos mañana), no dato de entreno
    target = db.get(User, user_id)
    if target is None or not target.avatar_path:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("avatars") / target.avatar_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    # v0.25.2: el cliente versiona la URL (?v=avatar_version, uuid nuevo por
    # subida) — cachear fuerte es seguro y evita refetches por visita
    return _serve_image(path, lq, request)


@router.delete("/users/me/avatar", status_code=204)
def delete_avatar(user: CurrentUser, db: Session = Depends(get_db)):
    db_user = db.get(User, user.id)
    if db_user is not None and db_user.avatar_path:
        _remove_with_lq(_uploads_dir("avatars") / db_user.avatar_path)
        db_user.avatar_path = None
        db.commit()


# ---------- nota por usuario y ejercicio ----------


@router.get("/exercises/{exercise_id}/note", response_model=ExerciseNoteOut)
def get_exercise_note(exercise_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    if get_visible_exercise(db, user.id, exercise_id) is None:
        raise HTTPException(status_code=404, detail="not_found")
    note = db.scalar(
        select(ExerciseNote).where(
            ExerciseNote.user_id == user.id, ExerciseNote.exercise_id == exercise_id
        )
    )
    return ExerciseNoteOut(note=note.note if note else "")


@router.put("/exercises/{exercise_id}/note", response_model=ExerciseNoteOut)
def upsert_exercise_note(
    exercise_id: int, payload: ExerciseNoteIn, user: CurrentUser, db: Session = Depends(get_db)
):
    if get_visible_exercise(db, user.id, exercise_id) is None:
        raise HTTPException(status_code=404, detail="not_found")
    note = db.scalar(
        select(ExerciseNote).where(
            ExerciseNote.user_id == user.id, ExerciseNote.exercise_id == exercise_id
        )
    )
    text = payload.note.strip()
    if not text:
        # nota vacía = borrar: el cliente no necesita un endpoint aparte
        if note is not None:
            db.delete(note)
            db.commit()
        return ExerciseNoteOut(note="")
    if note is None:
        note = ExerciseNote(user_id=user.id, exercise_id=exercise_id, note=text)
        db.add(note)
        try:
            db.commit()
        except IntegrityError:
            # v0.40.0: dos PUT casi simultáneos (blur + botón, o el reintento
            # tras un timeout del cliente) veían ambos "no hay nota" y el
            # segundo INSERT reventaba con un 500 (visto en los logs del pod).
            # El perdedor de la carrera actualiza la fila que ya existe.
            db.rollback()
            note = db.scalar(
                select(ExerciseNote).where(
                    ExerciseNote.user_id == user.id, ExerciseNote.exercise_id == exercise_id
                )
            )
            if note is None:
                raise
            note.note = text
            db.commit()
    else:
        note.note = text
        db.commit()
    return ExerciseNoteOut(note=text)


# ---------- fotos de progreso (privadas) ----------


@router.get("/body/photos", response_model=list[BodyPhotoOut])
def list_body_photos(user: CurrentUser, db: Session = Depends(get_db)):
    return db.scalars(
        select(BodyPhoto)
        .where(BodyPhoto.owner_id == user.id)
        .order_by(BodyPhoto.date.desc(), BodyPhoto.id.desc())
    ).all()


@router.post("/body/photos", response_model=BodyPhotoOut, status_code=201)
async def upload_body_photo(
    photo_date: date_type, file: UploadFile, user: CurrentUser, db: Session = Depends(get_db)
):
    data, ext = await _read_image(file)
    filename = f"{uuid.uuid4().hex}{ext}"
    target = _uploads_dir("body") / filename
    target.write_bytes(data)
    generate_lq(target)
    photo = BodyPhoto(owner_id=user.id, date=photo_date, path=filename)
    db.add(photo)
    db.commit()
    return photo


@router.get("/body/photos/{photo_id}/file")
def get_body_photo(
    photo_id: int, request: Request, user: User = FileUser, db: Session = FileDb, lq: bool = False
):
    photo = db.get(BodyPhoto, photo_id)
    # v0.23.0: mismo bypass admin que exercise/routine image — bajo act-as la
    # LISTA ya sale (fetch con cabecera), pero el <img> del fichero llega con
    # la identidad real del admin y rompía la galería del usuario asumido
    if photo is None or (photo.owner_id != user.id and not user.is_admin):
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("body") / photo.path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    # un id de foto es siempre el mismo fichero: cache fuerte sin versión
    return _serve_image(path, lq, request)


@router.delete("/body/photos/{photo_id}", status_code=204)
def delete_body_photo(photo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    photo = db.get(BodyPhoto, photo_id)
    if photo is None or photo.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")
    _remove_with_lq(_uploads_dir("body") / photo.path)
    db.delete(photo)
    db.commit()
