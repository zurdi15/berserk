from pydantic import BaseModel


class RestoreResult(BaseModel):
    restored: bool
    workouts: int
    previous_revision: str | None
