"""v0.12.0 — media y notas por ejercicio.

Ficheros bajo BK_DATA_DIR/uploads/{exercises,body} con nombre uuid.ext:
el nombre en disco jamás viene del cliente (sin traversal posible) y el
GET localiza SIEMPRE por id en DB, nunca por path arbitrario. La imagen de
un ejercicio hereda su visibilidad (get_visible_exercise) y subirla exige
poder editarlo (_can_edit); las fotos de cuerpo son PRIVADAS del dueño —
no viajan por sharing, a diferencia del resto de datos de Cuerpo.
"""

import uuid
from datetime import date as date_type
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..config import get_settings
from ..db import get_db
from ..models import BodyPhoto, Exercise, ExerciseNote, User
from ..schemas.media import BodyPhotoOut, ExerciseNoteIn, ExerciseNoteOut
from .exercises import _can_edit, get_visible_exercise
from .routines import _editable_routine, _visible_template

router = APIRouter(tags=["media"])

# content-types de imagen aceptados → extensión canónica en disco
IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


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
    (_uploads_dir("exercises") / filename).write_bytes(data)
    if exercise.image_path:
        _delete_quietly(_uploads_dir("exercises") / exercise.image_path)
    exercise.image_path = filename
    db.commit()


@router.get("/exercises/{exercise_id}/image")
def get_exercise_image(exercise_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    exercise = get_visible_exercise(db, user.id, exercise_id)
    if exercise is None or not exercise.image_path:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("exercises") / exercise.image_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(path)


@router.delete("/exercises/{exercise_id}/image", status_code=204)
def delete_exercise_image(exercise_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not _can_edit(exercise.owner_id, user):
        raise HTTPException(status_code=404, detail="not_found")
    if exercise.image_path:
        _delete_quietly(_uploads_dir("exercises") / exercise.image_path)
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
    (_uploads_dir("routines") / filename).write_bytes(data)
    if routine.image_path:
        _delete_quietly(_uploads_dir("routines") / routine.image_path)
    routine.image_path = filename
    db.commit()


@router.get("/routines/{routine_id}/image")
def get_routine_image(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    # misma regla de visibilidad que el resto de la rutina (propia, global o
    # plantilla legacy) — _visible_template ya lanza 404 si no aplica
    routine = _visible_template(db, user, routine_id)
    if not routine.image_path:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("routines") / routine.image_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(path)


@router.delete("/routines/{routine_id}/image", status_code=204)
def delete_routine_image(routine_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    routine = _editable_routine(db, user, routine_id)
    if routine.image_path:
        _delete_quietly(_uploads_dir("routines") / routine.image_path)
        routine.image_path = None
        db.commit()


# ---------- foto de perfil ----------


@router.post("/users/me/avatar", response_model=None, status_code=204)
async def upload_avatar(file: UploadFile, user: CurrentUser, db: Session = Depends(get_db)):
    # v0.19.x (zurdi: "que se pueda poner foto de perfil") — mismo esquema
    # que la imagen de ejercicio: uuid.ext en disco, columna con el nombre
    data, ext = await _read_image(file)
    filename = f"{uuid.uuid4().hex}{ext}"
    (_uploads_dir("avatars") / filename).write_bytes(data)
    db_user = db.get(User, user.id)
    assert db_user is not None
    if db_user.avatar_path:
        _delete_quietly(_uploads_dir("avatars") / db_user.avatar_path)
    db_user.avatar_path = filename
    db.commit()


@router.get("/users/{user_id}/avatar")
def get_avatar(user_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    # visible para cualquier usuario autenticado de la instancia: el avatar
    # es identidad (perfil hoy; feed/compartidos mañana), no dato de entreno
    target = db.get(User, user_id)
    if target is None or not target.avatar_path:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("avatars") / target.avatar_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(path)


@router.delete("/users/me/avatar", status_code=204)
def delete_avatar(user: CurrentUser, db: Session = Depends(get_db)):
    db_user = db.get(User, user.id)
    if db_user is not None and db_user.avatar_path:
        _delete_quietly(_uploads_dir("avatars") / db_user.avatar_path)
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
    (_uploads_dir("body") / filename).write_bytes(data)
    photo = BodyPhoto(owner_id=user.id, date=photo_date, path=filename)
    db.add(photo)
    db.commit()
    return photo


@router.get("/body/photos/{photo_id}/file")
def get_body_photo(photo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    photo = db.get(BodyPhoto, photo_id)
    if photo is None or photo.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")
    path = _uploads_dir("body") / photo.path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    return FileResponse(path)


@router.delete("/body/photos/{photo_id}", status_code=204)
def delete_body_photo(photo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    photo = db.get(BodyPhoto, photo_id)
    if photo is None or photo.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not_found")
    _delete_quietly(_uploads_dir("body") / photo.path)
    db.delete(photo)
    db.commit()
