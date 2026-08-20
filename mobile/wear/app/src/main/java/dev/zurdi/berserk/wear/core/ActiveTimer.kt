package dev.zurdi.berserk.wear.core

/** Un TimerSpec aceptado por el reloj, con lo que el reloj sabe de él. */
data class ActiveTimer(
    val spec: TimerSpec,
    /** epoch local del reloj en que se recibió */
    val receivedAtEpochMs: Long,
    /** epoch local en que la cuenta atrás llegó a cero (alarma); null mientras corre */
    val finishedAtEpochMs: Long? = null,
    /** epoch local del OK del usuario (o del tope de la alarma); null mientras avisa */
    val acknowledgedAtEpochMs: Long? = null,
) {
    val kind: TimerKind get() = spec.kind

    /** fin de la cuenta atrás / inicio del crono, en epoch (ver ClockSync: se confía en la hora de ambos) */
    val targetEpochMs: Long get() = spec.targetEpochMs

    val isFinished: Boolean get() = finishedAtEpochMs != null

    /** llegó a cero y nadie ha dado al OK todavía: la alarma sigue */
    val isAlarming: Boolean get() = isFinished && acknowledgedAtEpochMs == null

    fun remainingMs(nowEpochMs: Long): Long = if (kind.countsDown) targetEpochMs - nowEpochMs else 0L

    fun elapsedMs(nowEpochMs: Long): Long =
        if (kind.countsDown) {
            (spec.totalMs - remainingMs(nowEpochMs)).coerceIn(0L, spec.totalMs.coerceAtLeast(0L))
        } else {
            (nowEpochMs - targetEpochMs).coerceAtLeast(0L)
        }

    /** fracción que QUEDA (1 → recién arrancado, 0 → terminado); 0 si no es cuenta atrás */
    fun progress(nowEpochMs: Long): Float =
        if (!kind.countsDown || spec.totalMs <= 0L) 0f
        else (remainingMs(nowEpochMs).toFloat() / spec.totalMs.toFloat()).coerceIn(0f, 1f)

    fun isDue(nowEpochMs: Long): Boolean = kind.countsDown && remainingMs(nowEpochMs) <= 0L
}
