"""exercise load_mode (peso en kg vs nivel plano)

v0.17.0 (zurdi: "que en los ejercicios se puedan poner números planos, del 1
al 20, en vez de kg — opción para uno o para otro"): columna load_mode en
exercises ('weight' default | 'level'). El valor de la serie sigue viviendo
en weight_kg (un nivel es un número plano guardado tal cual, sin conversión
kg/lb); load_mode gobierna presentación y semántica de PRs/volumen. Solo
esquema, segura en instancias frescas.

Revision ID: a1f2c3d4e5b6
Revises: e7b83f5c1a09
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1f2c3d4e5b6'
down_revision: Union[str, Sequence[str], None] = 'e7b83f5c1a09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default: las filas existentes (y cualquier INSERT viejo en vuelo)
    # quedan en 'weight', el comportamiento de siempre
    op.add_column(
        "exercises",
        sa.Column("load_mode", sa.String(length=10), nullable=False, server_default="weight"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("exercises", "load_mode")
