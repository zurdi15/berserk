from pathlib import Path

from app.config import Settings


def test_db_url_derives_from_data_dir(tmp_path: Path):
    s = Settings(data_dir=tmp_path)
    assert s.db_path == tmp_path / "berserk.db"
    assert s.db_url == f"sqlite:///{tmp_path / 'berserk.db'}"


def test_env_overrides_with_bk_prefix(monkeypatch):
    monkeypatch.setenv("BK_SESSION_TTL_DAYS", "7")
    monkeypatch.setenv("BK_COOKIE_SECURE", "true")
    s = Settings()
    assert s.session_ttl_days == 7
    assert s.cookie_secure is True
