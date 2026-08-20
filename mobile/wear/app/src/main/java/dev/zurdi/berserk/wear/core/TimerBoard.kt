package dev.zurdi.berserk.wear.core

/**
 * Lo que el reloj tiene entre manos: como mucho un temporizador por kind.
 * Decide cuál manda en la esfera (la Ongoing Activity es UNA) y qué enseñar
 * en pantalla.
 */
data class TimerBoard(val timers: Map<TimerKind, ActiveTimer> = emptyMap()) {

    /** en marcha (no terminados) */
    val live: List<ActiveTimer> get() = timers.values.filter { !it.isFinished }

    /**
     * El que manda: la cuenta atrás más reciente (descanso o cardio; en la
     * práctica nunca coinciden) y, si no hay ninguna, el crono del entreno.
     */
    fun primary(): ActiveTimer? =
        live.filter { it.kind.countsDown }.maxByOrNull { it.spec.sentAtEpochMs }
            ?: live.firstOrNull { !it.kind.countsDown }

    /** crono del entreno en marcha, para pintarlo pequeño bajo la cuenta atrás */
    fun workout(): ActiveTimer? = live.firstOrNull { it.kind == TimerKind.WORKOUT }

    /** cuenta atrás que acaba de llegar a cero (para el "¡Tiempo!" en pantalla) */
    fun recentlyFinished(nowEpochMs: Long, holdMs: Long = FINISHED_HOLD_MS): ActiveTimer? =
        timers.values
            .filter { it.finishedAtEpochMs != null && nowEpochMs - it.finishedAtEpochMs < holdMs }
            .maxByOrNull { it.finishedAtEpochMs!! }

    fun with(timer: ActiveTimer): TimerBoard = copy(timers = timers + (timer.kind to timer))

    fun without(kind: TimerKind): TimerBoard = copy(timers = timers - kind)

    /** poda terminados hace rato sin `stopped` del móvil (móvil muerto o sin enlace) */
    fun pruned(nowEpochMs: Long, keepFinishedMs: Long = FINISHED_KEEP_MS): TimerBoard =
        copy(timers = timers.filterValues { it.finishedAtEpochMs == null || nowEpochMs - it.finishedAtEpochMs < keepFinishedMs })

    companion object {
        /** cuánto se sostiene el "¡Tiempo!" en pantalla */
        const val FINISHED_HOLD_MS = 6_000L
        const val FINISHED_KEEP_MS = 60_000L
    }
}
