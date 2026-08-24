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
    // v0.39.0 (zurdi: "cambiar los pesos/niveles y las reps desde el reloj"):
    // la siguiente serie DESGLOSADA para los steppers. reps 0 = sin stepper de
    // reps; loadMode none = sin carga. La carga llega en unidades de PANTALLA
    // (kg/lb, según el usuario) o como nivel plano, con el paso y los topes
    // del formulario del móvil; el reloj devuelve lo que enseña, tal cual.
    val reps: Int = 0,
    val loadMode: String = LOAD_NONE,
    val load: Double = 0.0,
    /** "kg" / "lb" con loadMode weight; vacío con level */
    val loadUnit: String = "",
    val loadStep: Double = 0.0,
    val loadMin: Double = 0.0,
    val loadMax: Double = 0.0,
) {
    /** "2/4" con objetivo, "2" sin él */
    val progressLabel: String get() = if (setsTarget > 0) "$setsDone/$setsTarget" else "$setsDone"

    val hasReps: Boolean get() = canLog && reps > 0
    val hasLoad: Boolean get() = canLog && loadMode != LOAD_NONE && loadStep > 0.0

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
        const val KEY_REPS = "reps"
        const val KEY_LOAD_MODE = "loadMode"
        const val KEY_LOAD = "load"
        const val KEY_LOAD_UNIT = "loadUnit"
        const val KEY_LOAD_STEP = "loadStep"
        const val KEY_LOAD_MIN = "loadMin"
        const val KEY_LOAD_MAX = "loadMax"
        const val STATE_EXERCISE = "exercise"
        const val STATE_NONE = "none"
        const val LOAD_WEIGHT = "weight"
        const val LOAD_LEVEL = "level"
        const val LOAD_NONE = "none"

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
                reps = fields.int(KEY_REPS, 0).coerceAtLeast(0),
                loadMode = fields.string(KEY_LOAD_MODE).let { if (it == LOAD_WEIGHT || it == LOAD_LEVEL) it else LOAD_NONE },
                load = fields.double(KEY_LOAD, 0.0),
                loadUnit = fields.string(KEY_LOAD_UNIT).orEmpty().trim(),
                loadStep = fields.double(KEY_LOAD_STEP, 0.0),
                loadMin = fields.double(KEY_LOAD_MIN, 0.0),
                loadMax = fields.double(KEY_LOAD_MAX, 0.0),
            )
        }
    }
}
