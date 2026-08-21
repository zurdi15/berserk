package dev.zurdi.berserk.wear.core

import kotlin.math.abs

/**
 * Relojes. El móvil manda epoch (System.currentTimeMillis()) y las APIs del
 * reloj que pintan tiempo en vivo (Status.TimerPart / StopwatchPart) exigen
 * la base monotónica SystemClock.elapsedRealtime(): aquí vive la conversión.
 *
 * NO se corrige el desfase entre relojes a partir de sentAt: una "corrección"
 * confundiría un DataItem entregado tarde (reconexión, arranque, app recién
 * instalada) con un reloj mal puesto, desplazando el fin minutos enteros. Aquí
 * solo se mide, para el log. v0.37.1: el desfase real se mide con ida y vuelta
 * (PhoneClock) y todo el reloj trabaja en la hora del móvil vía PhoneClock.now().
 */
object ClockSync {
    const val SKEW_WARN_MS = 5_000L

    fun toElapsedRealtime(targetEpochMs: Long, nowEpochMs: Long, nowElapsedMs: Long): Long =
        nowElapsedMs + (targetEpochMs - nowEpochMs)

    /** > 0: el reloj va por delante del móvil, o el DataItem llegó tarde */
    fun skewMs(sentAtEpochMs: Long, nowEpochMs: Long): Long = nowEpochMs - sentAtEpochMs

    fun isSuspicious(sentAtEpochMs: Long, nowEpochMs: Long): Boolean =
        abs(skewMs(sentAtEpochMs, nowEpochMs)) > SKEW_WARN_MS
}
