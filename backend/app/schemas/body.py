from datetime import date as date_type

from pydantic import BaseModel, Field, model_validator


class BodyIn(BaseModel):
    weight_kg: float | None = Field(None, gt=0, le=500)
    waist_cm: float | None = Field(None, gt=0, le=300)
    chest_cm: float | None = Field(None, gt=0, le=300)
    arm_cm: float | None = Field(None, gt=0, le=150)
    thigh_cm: float | None = Field(None, gt=0, le=200)
    hip_cm: float | None = Field(None, gt=0, le=300)

    @model_validator(mode="after")
    def _not_empty(self):
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("empty_entry")
        return self


class BodyEntryOut(BaseModel):
    date: date_type
    weight_kg: float | None
    waist_cm: float | None
    chest_cm: float | None
    arm_cm: float | None
    thigh_cm: float | None
    hip_cm: float | None

    model_config = {"from_attributes": True}
