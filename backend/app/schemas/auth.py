from pydantic import BaseModel, Field


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    locale: str
    units: str
    timezone: str

    model_config = {"from_attributes": True}


class StatusOut(BaseModel):
    bootstrapped: bool
