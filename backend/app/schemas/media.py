from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ExerciseNoteIn(BaseModel):
    # vacía = borrar la nota (upsert de un solo endpoint, ver routers/media.py)
    note: str = Field(max_length=500)


class ExerciseNoteOut(BaseModel):
    note: str


class BodyPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
