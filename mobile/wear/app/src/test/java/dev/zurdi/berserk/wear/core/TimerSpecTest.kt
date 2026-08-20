package dev.zurdi.berserk.wear.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TimerSpecTest {
    private fun fields(vararg pairs: Pair<String, Any?>) = MapTimerFields(mapOf(*pairs))

    @Test
    fun `decodes a running countdown`() {
        val decoded = TimerSpec.decode(
            fields("kind" to "rest", "state" to "running", "targetEpochMs" to 1_000_000L, "totalMs" to 90_000L, "title" to " Descanso · Press banca ", "sentAtEpochMs" to 910_000L),
            TimerKind.REST,
        )
        val spec = (decoded as TimerSpec.Decoded.Ok).spec
        assertEquals(TimerKind.REST, spec.kind)
        assertTrue(spec.running)
        assertEquals(1_000_000L, spec.targetEpochMs)
        assertEquals(90_000L, spec.totalMs)
        assertEquals("Descanso · Press banca", spec.title)
        assertEquals(910_000L, spec.sentAtEpochMs)
    }

    @Test
    fun `stopped needs no target and carries its reason`() {
        val decoded = TimerSpec.decode(fields("kind" to "cardio", "state" to "stopped", "sentAtEpochMs" to 5L, "reason" to "finished"))
        val spec = (decoded as TimerSpec.Decoded.Ok).spec
        assertEquals(TimerKind.CARDIO, spec.kind)
        assertTrue(!spec.running)
        assertEquals(TimerSpec.REASON_FINISHED, spec.reason)
        val legacy = (TimerSpec.decode(fields("kind" to "cardio", "state" to "stopped", "sentAtEpochMs" to 5L)) as TimerSpec.Decoded.Ok).spec
        assertEquals("", legacy.reason)
    }

    @Test
    fun `kind falls back to the DataItem path and rejects a mismatch`() {
        val fromPath = TimerSpec.decode(fields("state" to "running", "targetEpochMs" to 10L, "sentAtEpochMs" to 1L), TimerKind.WORKOUT)
        assertEquals(TimerKind.WORKOUT, (fromPath as TimerSpec.Decoded.Ok).spec.kind)

        val mismatch = TimerSpec.decode(fields("kind" to "rest", "state" to "running", "targetEpochMs" to 10L, "sentAtEpochMs" to 1L), TimerKind.CARDIO)
        assertTrue(mismatch is TimerSpec.Decoded.Invalid)
    }

    @Test
    fun `rejects unknown kind, unknown state, missing sentAt and running without target`() {
        assertTrue(TimerSpec.decode(fields("kind" to "nap", "state" to "running", "targetEpochMs" to 1L, "sentAtEpochMs" to 1L)) is TimerSpec.Decoded.Invalid)
        assertTrue(TimerSpec.decode(fields("kind" to "rest", "state" to "paused", "targetEpochMs" to 1L, "sentAtEpochMs" to 1L)) is TimerSpec.Decoded.Invalid)
        assertTrue(TimerSpec.decode(fields("kind" to "rest", "state" to "running", "targetEpochMs" to 1L)) is TimerSpec.Decoded.Invalid)
        assertTrue(TimerSpec.decode(fields("kind" to "rest", "state" to "running", "sentAtEpochMs" to 1L)) is TimerSpec.Decoded.Invalid)
    }

    @Test
    fun `missing or negative total falls back to target minus sentAt for a running countdown`() {
        val spec = (TimerSpec.decode(fields("kind" to "rest", "state" to "running", "targetEpochMs" to 100_000L, "totalMs" to -5L, "sentAtEpochMs" to 10_000L)) as TimerSpec.Decoded.Ok).spec
        assertEquals(90_000L, spec.totalMs)
        assertEquals("", spec.title)
        val explicit = (TimerSpec.decode(fields("kind" to "rest", "state" to "running", "targetEpochMs" to 100_000L, "totalMs" to 60_000L, "sentAtEpochMs" to 10_000L)) as TimerSpec.Decoded.Ok).spec
        assertEquals(60_000L, explicit.totalMs)
        val stopwatch = (TimerSpec.decode(fields("kind" to "workout", "state" to "running", "targetEpochMs" to 10_000L, "sentAtEpochMs" to 10_000L)) as TimerSpec.Decoded.Ok).spec
        assertEquals(0L, stopwatch.totalMs)
    }

    @Test
    fun `kind resolves from wire name and from path`() {
        assertEquals(TimerKind.CARDIO, TimerKind.fromPath("/berserk/timer/cardio"))
        assertEquals(null, TimerKind.fromPath("/berserk/timer/"))
        assertEquals(null, TimerKind.fromPath("/other/rest"))
        assertEquals("/berserk/timer/workout", TimerKind.WORKOUT.path)
    }
}
