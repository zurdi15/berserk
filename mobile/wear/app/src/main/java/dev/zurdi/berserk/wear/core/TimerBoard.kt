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

    /**
     * v0.29.0: cuenta atrás que llegó a cero y aún espera el OK — manda sobre
     * todo lo demás en pantalla (la alarma es lo urgente, el crono puede esperar)
     */
    fun alarming(): ActiveTimer? =
        timers.values.filter { it.isAlarming }.maxByOrNull { it.finishedAtEpochMs!! }

    fun with(timer: ActiveTimer): TimerBoard = copy(timers = timers + (timer.kind to timer))

    fun without(kind: TimerKind): TimerBoard = copy(timers = timers - kind)

    /**
     * Poda: los terminados con OK se van enseguida; los que avisan sin OK
     * tienen un tope de seguridad muy por encima del de la alarma, por si el
     * servicio que vibra murió sin darse por enterado.
     */
    fun pruned(
        nowEpochMs: Long,
        keepAcknowledgedMs: Long = ACKNOWLEDGED_KEEP_MS,
        failsafeMs: Long = ALARM_FAILSAFE_MS,
    ): TimerBoard = copy(
        timers = timers.filterValues { timer ->
            when {
                timer.finishedAtEpochMs == null -> true
                timer.acknowledgedAtEpochMs != null -> nowEpochMs - timer.acknowledgedAtEpochMs < keepAcknowledgedMs
                else -> nowEpochMs - timer.finishedAtEpochMs < failsafeMs
            }
        },
    )

    companion object {
        const val ACKNOWLEDGED_KEEP_MS = 10_000L
        const val ALARM_FAILSAFE_MS = 150_000L
    }
}
