package dev.zurdi.berserk.wear.core

import kotlin.math.abs

/**
 * v0.37.1 (zurdi: "los timers del reloj y de las notificaciones no van
 * parejos... el del reloj suele ir unos segundos por delante"): el móvil manda
 * instantes en SU epoch y el reloj los comparaba con el suyo. El Galaxy Watch
 * "sincroniza" la hora con el móvil, pero a segundos de precisión, y esos
 * segundos se ven de lleno en una cuenta atrás que corre en los dos sitios.
 *
 * Solución NTP de bolsillo: el reloj manda un ping con su monotónico (t0), el
 * móvil responde con su epoch (t1), el reloj anota su monotónico al recibir
 * (t2). Con rtt = t2 − t0, la hora del móvil en t2 es ≈ t1 + rtt/2, y el
 * desfase es esa hora menos la de pared del reloj en t2. El error es como
 * mucho la mitad de la asimetría del viaje (decenas de ms por Bluetooth). Se
 * descarta un rtt grande (ida y vuelta por Internet, o el móvil dormido) y
 * se prefiere siempre la muestra con menor rtt, que es la más fiable; la
 * muestra envejece para no quedarse con un desfase de hace horas si el reloj
 * se re-sincroniza por su cuenta.
 *
 * Todo lo que el reloj compara con un instante del móvil pasa por now().
 * Puro (sin Android) para poder probarlo; la persistencia la hace quien lo
 * carga (TimerRepository).
 */
object PhoneClock {
    /** ida y vuelta por encima de esto no dice nada fiable del desfase */
    const val MAX_RTT_MS = 1_500L
    /** una muestra con rtt peor que la vigente solo la sustituye si esta ya es vieja */
    const val SAMPLE_TTL_MS = 10 * 60 * 1_000L
    /** por debajo de esto el desfase es ruido: no merece re-programar alarmas */
    const val SIGNIFICANT_CHANGE_MS = 250L

    data class Sample(val offsetMs: Long, val rttMs: Long, val atElapsedMs: Long)

    @Volatile
    var current: Sample? = null
        private set

    /** epoch del MÓVIL ahora (el del reloj corregido) */
    fun now(watchEpochMs: Long = System.currentTimeMillis()): Long = watchEpochMs + offsetMs()

    fun offsetMs(): Long = current?.offsetMs ?: 0L

    /** epoch del móvil → epoch del reloj (para AlarmManager, que va en hora de pared del reloj) */
    fun toWatchEpoch(phoneEpochMs: Long): Long = phoneEpochMs - offsetMs()

    /** Restaura la última muestra persistida (arranque). */
    fun restore(sample: Sample?) {
        current = sample
    }

    /**
     * Un pong. Devuelve la muestra si se ha ACEPTADO como nueva vigente (para
     * persistirla), null si se ha descartado.
     */
    fun onPong(t0ElapsedMs: Long, phoneEpochAtReplyMs: Long, t2ElapsedMs: Long, watchEpochAtT2Ms: Long): Sample? {
        val rtt = t2ElapsedMs - t0ElapsedMs
        if (rtt < 0L || rtt > MAX_RTT_MS) return null
        val offset = (phoneEpochAtReplyMs + rtt / 2) - watchEpochAtT2Ms
        val sample = Sample(offset, rtt, t2ElapsedMs)
        val prev = current
        val stale = prev == null || t2ElapsedMs - prev.atElapsedMs > SAMPLE_TTL_MS || t2ElapsedMs < prev.atElapsedMs
        if (prev != null && !stale && rtt > prev.rttMs) return null
        current = sample
        return sample
    }

    fun isSignificantChange(before: Long, after: Long): Boolean = abs(after - before) >= SIGNIFICANT_CHANGE_MS
}
