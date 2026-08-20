package dev.zurdi.berserk.wear.state

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import dev.zurdi.berserk.wear.core.ActiveTimer
import dev.zurdi.berserk.wear.core.TimerBoard
import dev.zurdi.berserk.wear.core.TimerKind
import dev.zurdi.berserk.wear.core.TimerSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * El tablero, persistido en SharedPreferences y expuesto como StateFlow.
 * Persistido porque el listener de la Data Layer, la alarma de fin y la
 * Activity corren en momentos distintos y el proceso puede morir entre
 * medias: ninguno puede suponer que otro dejó el estado en memoria.
 */
class TimerRepository private constructor(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val state = MutableStateFlow(load())

    val board: StateFlow<TimerBoard> = state.asStateFlow()

    @Synchronized
    fun update(transform: (TimerBoard) -> TimerBoard): TimerBoard {
        val next = transform(state.value)
        persist(next)
        state.value = next
        return next
    }

    private fun persist(board: TimerBoard) {
        // commit síncrono: son unos bytes y el proceso puede morir justo después
        prefs.edit(commit = true) {
            clear()
            board.timers.values.forEach { putString(it.kind.wireName, encode(it)) }
        }
    }

    private fun load(): TimerBoard = TimerBoard(
        TimerKind.entries
            .mapNotNull { kind -> prefs.getString(kind.wireName, null)?.let { decode(kind, it) } }
            .associateBy { it.kind },
    )

    private fun encode(timer: ActiveTimer): String = JSONObject().apply {
        put("running", timer.spec.running)
        put("target", timer.spec.targetEpochMs)
        put("total", timer.spec.totalMs)
        put("title", timer.spec.title)
        put("sentAt", timer.spec.sentAtEpochMs)
        put("reason", timer.spec.reason)
        put("receivedAt", timer.receivedAtEpochMs)
        timer.finishedAtEpochMs?.let { put("finishedAt", it) }
        timer.acknowledgedAtEpochMs?.let { put("acknowledgedAt", it) }
    }.toString()

    private fun decode(kind: TimerKind, raw: String): ActiveTimer? = runCatching {
        val json = JSONObject(raw)
        ActiveTimer(
            spec = TimerSpec(
                kind = kind,
                running = json.optBoolean("running", true),
                targetEpochMs = json.getLong("target"),
                totalMs = json.optLong("total"),
                title = json.optString("title"),
                sentAtEpochMs = json.getLong("sentAt"),
                reason = json.optString("reason"),
            ),
            receivedAtEpochMs = json.optLong("receivedAt"),
            finishedAtEpochMs = if (json.has("finishedAt")) json.getLong("finishedAt") else null,
            acknowledgedAtEpochMs = if (json.has("acknowledgedAt")) json.getLong("acknowledgedAt") else null,
        )
    }.getOrNull()

    companion object {
        private const val PREFS = "berserk-wear-timers"

        @Volatile
        private var instance: TimerRepository? = null

        fun get(context: Context): TimerRepository =
            instance ?: synchronized(this) { instance ?: TimerRepository(context).also { instance = it } }
    }
}
