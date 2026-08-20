package dev.zurdi.berserk.wear.core

/**
 * Acceso tipado a los campos de un DataItem. Interfaz mínima para que el
 * decodificador sea Kotlin puro (testeable en JVM) y el DataMap de Play
 * services solo aparezca en el adaptador (sync/DataMapFields).
 */
interface TimerFields {
    fun string(key: String): String?
    fun long(key: String, default: Long): Long
    fun int(key: String, default: Int): Int
}

class MapTimerFields(private val map: Map<String, Any?>) : TimerFields {
    override fun string(key: String): String? = map[key] as? String
    override fun long(key: String, default: Long): Long = (map[key] as? Number)?.toLong() ?: default
    override fun int(key: String, default: Int): Int = (map[key] as? Number)?.toInt() ?: default
}

/**
 * Estado de UN temporizador tal y como lo publica el móvil
 * (mobile/android BkWear.publishTimer ↔ frontend nativeShell.syncWearTimer).
 * El móvil es la única verdad: aquí no se calcula nada, solo se valida.
 */
data class TimerSpec(
    val kind: TimerKind,
    val running: Boolean,
    /** fin (cuenta atrás) o inicio (crono hacia arriba), epoch ms del móvil */
    val targetEpochMs: Long,
    /** duración total de la cuenta atrás (barra de progreso); 0 si no aplica */
    val totalMs: Long,
    /** título ya localizado por el móvil ("Descanso · Press banca"); vacío = título por defecto del kind */
    val title: String,
    val sentAtEpochMs: Long,
    /**
     * solo con stopped: "finished" = llegó a cero por sí solo (el móvil lo
     * limpia tras la gracia; el reloj sigue avisando hasta el OK) o
     * "cancelled" = lo paró el usuario / lo sustituyó otra serie (calla)
     */
    val reason: String = "",
) {
    sealed interface Decoded {
        data class Ok(val spec: TimerSpec) : Decoded
        data class Invalid(val reason: String) : Decoded
    }

    companion object {
        const val SCHEMA_VERSION = 1
        const val KEY_SCHEMA = "schema"
        const val KEY_KIND = "kind"
        const val KEY_STATE = "state"
        const val KEY_TARGET = "targetEpochMs"
        const val KEY_TOTAL = "totalMs"
        const val KEY_TITLE = "title"
        const val KEY_SENT_AT = "sentAtEpochMs"
        const val KEY_REASON = "reason"
        const val STATE_RUNNING = "running"
        const val STATE_STOPPED = "stopped"
        const val REASON_FINISHED = "finished"
        const val REASON_CANCELLED = "cancelled"

        /**
         * @param kindFromPath kind deducido del path del DataItem; si el
         * payload trae otro distinto es un bug del emisor y se rechaza.
         */
        fun decode(fields: TimerFields, kindFromPath: TimerKind? = null): Decoded {
            val wireKind = fields.string(KEY_KIND)
            val kind = TimerKind.fromWire(wireKind) ?: kindFromPath
                ?: return Decoded.Invalid("kind desconocido: $wireKind")
            if (kindFromPath != null && kind != kindFromPath) {
                return Decoded.Invalid("kind ${kind.wireName} en el path de ${kindFromPath.wireName}")
            }
            val running = when (val state = fields.string(KEY_STATE)) {
                STATE_RUNNING -> true
                STATE_STOPPED -> false
                else -> return Decoded.Invalid("state desconocido: $state")
            }
            val sentAt = fields.long(KEY_SENT_AT, 0L)
            if (sentAt <= 0L) return Decoded.Invalid("sentAtEpochMs ausente")
            val target = fields.long(KEY_TARGET, 0L)
            if (running && target <= 0L) return Decoded.Invalid("targetEpochMs ausente en un temporizador en marcha")
            var total = fields.long(KEY_TOTAL, 0L).coerceAtLeast(0L)
            // v0.35.0: una shell anterior a v0.35.0 mandaba totalMs = 0 (getLong
            // de Capacitor descartaba el Integer); para una cuenta atrás recién
            // arrancada, fin − envío ES la duración — mejor eso que un anillo vacío
            if (running && kind.countsDown && total <= 0L && target > sentAt) total = target - sentAt
            val title = fields.string(KEY_TITLE).orEmpty().trim()
            val reason = fields.string(KEY_REASON).orEmpty()
            return Decoded.Ok(TimerSpec(kind, running, target, total, title, sentAt, reason))
        }
    }
}
