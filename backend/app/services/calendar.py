"""Agregados del calendario. Nada de este módulo hace commit."""

from collections import defaultdict
from datetime import date as date_type

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ShareGrant, User, Workout
from ..schemas.calendar import SharedUserOut


def shared_calendar_users(
    db: Session, viewer_id: int, first: date_type, last: date_type
) -> list[SharedUserOut]:
    """Overlay de puntitos (SHARED-DOTS): un SharedUserOut por cada usuario
    que me ha concedido acceso (ShareGrant.owner_id -> yo == viewer_id), con
    los días del mes [first, last] en los que ese usuario tiene >=1 entreno
    TERMINADO (ended_at no nulo — un entreno activo aún no cuenta). Dos
    queries fijas (grants+users, luego fechas agrupadas por dueño) sin
    importar cuántos usuarios compartan conmigo: nunca N+1.
    """
    grantors = db.execute(
        select(ShareGrant.owner_id, User.username, User.color)
        .join(User, User.id == ShareGrant.owner_id)
        .where(ShareGrant.viewer_id == viewer_id)
        .order_by(User.username)
    ).all()
    if not grantors:
        return []

    grantor_ids = [row.owner_id for row in grantors]
    # una única query agrupada para TODOS los grantors a la vez (no un query
    # por usuario dentro del bucle de abajo)
    date_rows = db.execute(
        select(Workout.owner_id, Workout.date)
        .where(
            Workout.owner_id.in_(grantor_ids),
            Workout.date >= first,
            Workout.date <= last,
            Workout.ended_at.is_not(None),
        )
        .distinct()
    ).all()
    dates_by_owner: dict[int, list[date_type]] = defaultdict(list)
    for owner_id, day in date_rows:
        dates_by_owner[owner_id].append(day)

    return [
        SharedUserOut(
            user_id=owner_id,
            username=username,
            color=color,
            dates=sorted(dates_by_owner.get(owner_id, [])),
        )
        for owner_id, username, color in grantors
    ]
