from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BK_")

    data_dir: Path = Path("/data")
    # en dev (dev.sh) se pone a 0 para que :8000 no sirva una SPA compilada obsoleta
    serve_static: bool = True
    # duración de la sesión (cookie bk_session); se renueva sola al usar la app
    session_ttl_days: int = 30
    # marcar la cookie como Secure (activar en despliegues con HTTPS)
    cookie_secure: bool = False
    # coste de bcrypt (los tests lo bajan a 4 para no pagar el coste real por hash)
    bcrypt_rounds: int = 12
    # validez de los enlaces de invitación que genera el admin
    invite_ttl_hours: int = 72

    @property
    def db_path(self) -> Path:
        return self.data_dir / "berserk.db"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
