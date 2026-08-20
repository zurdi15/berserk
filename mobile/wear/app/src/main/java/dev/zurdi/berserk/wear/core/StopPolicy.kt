package dev.zurdi.berserk.wear.core

/**
 * v0.29.0 (zurdi: "que la vibración no fuese una única vez, sino
 * constantemente hasta que yo le dé a OK"). Qué hacer con un `stopped` del
 * móvil depende de POR QUÉ paró:
 *  - finished: el descanso llegó a cero por sí solo y el móvil lo limpió en
 *    su gracia — el reloj ya está avisando (o debería): NO callar. Si el
 *    reloj aún lo tenía en marcha (alarma tardía, reloj desajustado), darlo
 *    por terminado ahora mismo.
 *  - cancelled (o cualquier otra cosa): el usuario lo paró o arrancó otra
 *    serie — callar y limpiar.
 */
enum class StopAction { IGNORE, STOP, FINISH_NOW }

object StopPolicy {
    fun onStopped(current: ActiveTimer?, reason: String): StopAction = when {
        current == null -> StopAction.STOP
        reason == TimerSpec.REASON_FINISHED -> if (current.isFinished) StopAction.IGNORE else StopAction.FINISH_NOW
        else -> StopAction.STOP
    }
}
