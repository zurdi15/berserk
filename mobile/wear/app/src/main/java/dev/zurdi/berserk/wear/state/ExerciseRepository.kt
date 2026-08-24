package dev.zurdi.berserk.wear.state

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import dev.zurdi.berserk.wear.core.ExerciseSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * v0.38.0: el ejercicio actual, persistido como el tablero de temporizadores
 * (TimerRepository) y por el mismo motivo — el listener de la Data Layer y la
 * Activity corren en momentos distintos y el proceso puede morir entre medias.
 */
class ExerciseRepository private constructor(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val state = MutableStateFlow(load())

    val exercise: StateFlow<ExerciseSpec?> = state.asStateFlow()

    @Synchronized
    fun set(spec: ExerciseSpec?) {
        prefs.edit(commit = true) {
            if (spec == null) remove(KEY) else putString(KEY, encode(spec))
        }
        state.value = spec
    }

    private fun load(): ExerciseSpec? = prefs.getString(KEY, null)?.let { decode(it) }

    private fun encode(spec: ExerciseSpec): String = JSONObject().apply {
        put("weid", spec.weid)
        put("name", spec.name)
        put("setsDone", spec.setsDone)
        put("setsTarget", spec.setsTarget)
        put("nextLabel", spec.nextLabel)
        put("canLog", spec.canLog)
        put("completed", spec.completed)
        put("sentAt", spec.sentAtEpochMs)
    }.toString()

    private fun decode(raw: String): ExerciseSpec? = runCatching {
        val json = JSONObject(raw)
        ExerciseSpec(
            weid = json.getLong("weid"),
            name = json.optString("name"),
            setsDone = json.optInt("setsDone"),
            setsTarget = json.optInt("setsTarget"),
            nextLabel = json.optString("nextLabel"),
            canLog = json.optBoolean("canLog"),
            completed = json.optBoolean("completed"),
            sentAtEpochMs = json.getLong("sentAt"),
        )
    }.getOrNull()

    companion object {
        private const val PREFS = "berserk-wear-exercise"
        private const val KEY = "current"

        @Volatile
        private var instance: ExerciseRepository? = null

        fun get(context: Context): ExerciseRepository =
            instance ?: synchronized(this) { instance ?: ExerciseRepository(context).also { instance = it } }
    }
}
