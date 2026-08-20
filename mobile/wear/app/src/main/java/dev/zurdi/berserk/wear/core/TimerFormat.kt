package dev.zurdi.berserk.wear.core

import java.util.Locale

/** m:ss / h:mm:ss — mismo formato que frontend duration.ts::formatDuration. */
object TimerFormat {
    /** cuenta atrás: TECHO — 1:30 nada más arrancar y 0:01 hasta llegar a cero, como el CTA de la web */
    fun countdown(remainingMs: Long): String = clock(if (remainingMs <= 0L) 0L else (remainingMs + 999L) / 1000L)

    /** crono: SUELO */
    fun elapsed(elapsedMs: Long): String = clock(if (elapsedMs <= 0L) 0L else elapsedMs / 1000L)

    fun clock(totalSeconds: Long): String {
        val s = totalSeconds.coerceAtLeast(0L)
        val h = s / 3600L
        val m = (s % 3600L) / 60L
        val sec = s % 60L
        return if (h > 0L) String.format(Locale.ROOT, "%d:%02d:%02d", h, m, sec)
        else String.format(Locale.ROOT, "%d:%02d", m, sec)
    }
}
