from pydantic import BaseModel, Field, field_validator


def _validate_password_bytes(value: str) -> str:
    # bcrypt trunca/lanza a partir de 72 bytes; mejor 422 explícito que un 500
    if len(value.encode()) > 72:
        raise ValueError("password_too_long")
    return value


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)

    @field_validator("password")
    @classmethod
    def _password_byte_limit(cls, value: str) -> str:
        return _validate_password_bytes(value)


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)

    @field_validator("new_password")
    @classmethod
    def _password_byte_limit(cls, value: str) -> str:
        return _validate_password_bytes(value)


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    locale: str
    units: str
    timezone: str
    color: str | None

    model_config = {"from_attributes": True}


class StatusOut(BaseModel):
    bootstrapped: bool
