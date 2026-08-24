package dev.zurdi.berserk.wear.core

/**
 * v0.38.0 (zurdi: "añadir serie desde el reloj y poder finalizar ejercicio"):
 * el ejercicio ACTUAL del entreno tal y como lo publica el móvil
 * (mobile/android BkWear.publishExercise ↔ frontend nativeShell.syncWearExercise,
 * DataItem /berserk/exercise): nombre, series hechas/objetivo y la siguiente
 * serie ya formateada por la web ("8 × 60 kg"). El reloj solo lo pinta y
 * devuelve órdenes con el weid — no sabe de rutinas, prefills ni unidades.
 */
data class ExerciseSpec(
    /** id del WorkoutExercise (negativo si nació sin red en el móvil: vale igual, la web lo resuelve) */
    val weid: Long,
    val name: String,
    val setsDone: Int,
    /** 0 = sin objetivo de rutina */
    val setsTarget: Int,
    /** vacío = no hay serie que registrar a ciegas */
    val nextLabel: String,
    /** ¿"+ Serie" registra algo de un toque? */
    val canLog: Boolean,
    val completed: Boolean,
    val sentAtEpochMs: Long,
) {
    /** "2/4" con objetivo, "2" sin él */
    val progressLabel: String get() = if (setsTarget > 0) "$setsDone/$setsTarget" else "$setsDone"

    companion object {
        const val PATH = "/berserk/exercise"
        const val KEY_STATE = "state"
        const val KEY_WEID = "weid"
        const val KEY_NAME = "name"
        const val KEY_SETS_DONE = "setsDone"
        const val KEY_SETS_TARGET = "setsTarget"
        const val KEY_NEXT_LABEL = "nextLabel"
        const val KEY_CAN_LOG = "canLog"
        const val KEY_COMPLETED = "completed"
        const val KEY_SENT_AT = "sentAtEpochMs"
        const val STATE_EXERCISE = "exercise"
        const val STATE_NONE = "none"

        /** null = sin ejercicio actual (state none) o DataItem inválido */
        fun decode(fields: TimerFields): ExerciseSpec? {
            if (fields.string(KEY_STATE) != STATE_EXERCISE) return null
            val sentAt = fields.long(KEY_SENT_AT, 0L)
            if (sentAt <= 0L) return null
            return ExerciseSpec(
                weid = fields.long(KEY_WEID, 0L),
                name = fields.string(KEY_NAME).orEmpty().trim(),
                setsDone = fields.int(KEY_SETS_DONE, 0).coerceAtLeast(0),
                setsTarget = fields.int(KEY_SETS_TARGET, 0).coerceAtLeast(0),
                nextLabel = fields.string(KEY_NEXT_LABEL).orEmpty().trim(),
                canLog = fields.boolean(KEY_CAN_LOG, false),
                completed = fields.boolean(KEY_COMPLETED, false),
                sentAtEpochMs = sentAt,
            )
        }
    }
}
