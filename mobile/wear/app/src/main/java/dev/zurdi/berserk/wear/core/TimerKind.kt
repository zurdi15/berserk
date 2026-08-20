package dev.zurdi.berserk.wear.core

/**
 * Los tres temporizadores que el móvil publica en la Data Layer, UNO POR
 * DataItem (`/berserk/timer/<kind>`): así un `stopped` del descanso nunca
 * pisa el crono del entreno, y el frontend los sincroniza desde sitios
 * independientes (restTimer.ts, WorkoutExerciseCard.vue, activeWorkout.ts).
 */
enum class TimerKind(val wireName: String, val countsDown: Boolean) {
    REST("rest", countsDown = true),
    CARDIO("cardio", countsDown = true),
    WORKOUT("workout", countsDown = false);

    /** id de la notificación ongoing de este temporizador */
    val notificationId: Int get() = NOTIFICATION_BASE + ordinal

    /** id de la notificación "¡Tiempo!" (distinta de la ongoing: conviven unos segundos) */
    val doneNotificationId: Int get() = DONE_NOTIFICATION_BASE + ordinal

    val path: String get() = PATH_PREFIX + wireName

    companion object {
        const val PATH_PREFIX = "/berserk/timer/"
        private const val NOTIFICATION_BASE = 2001
        private const val DONE_NOTIFICATION_BASE = 2101

        fun fromWire(name: String?): TimerKind? = entries.firstOrNull { it.wireName == name }

        fun fromPath(path: String?): TimerKind? =
            path?.takeIf { it.startsWith(PATH_PREFIX) }?.let { fromWire(it.removePrefix(PATH_PREFIX)) }
    }
}
