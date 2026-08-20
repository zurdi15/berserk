package dev.zurdi.berserk.wear.core

import org.junit.Assert.assertEquals
import org.junit.Test

class StopPolicyTest {
    private val running = ActiveTimer(TimerSpec(TimerKind.REST, true, 100_000L, 60_000L, "", 40_000L), receivedAtEpochMs = 40_000L)
    private val alarming = running.copy(finishedAtEpochMs = 100_000L)
    private val acknowledged = alarming.copy(acknowledgedAtEpochMs = 101_000L)

    @Test
    fun `finished from the phone never silences an alarm that is already ringing`() {
        assertEquals(StopAction.IGNORE, StopPolicy.onStopped(alarming, TimerSpec.REASON_FINISHED))
        assertEquals(StopAction.IGNORE, StopPolicy.onStopped(acknowledged, TimerSpec.REASON_FINISHED))
    }

    @Test
    fun `finished while the watch still counts means the alarm is late - finish now`() {
        assertEquals(StopAction.FINISH_NOW, StopPolicy.onStopped(running, TimerSpec.REASON_FINISHED))
    }

    @Test
    fun `cancelled, unknown reasons and unknown timers stop everything`() {
        assertEquals(StopAction.STOP, StopPolicy.onStopped(alarming, TimerSpec.REASON_CANCELLED))
        assertEquals(StopAction.STOP, StopPolicy.onStopped(running, TimerSpec.REASON_CANCELLED))
        assertEquals(StopAction.STOP, StopPolicy.onStopped(running, ""))
        assertEquals(StopAction.STOP, StopPolicy.onStopped(null, TimerSpec.REASON_FINISHED))
    }
}

class SameInstanceTest {
    private val spec = TimerSpec(TimerKind.REST, true, 100_000L, 60_000L, "", 40_000L)
    private val timer = ActiveTimer(spec, receivedAtEpochMs = 40_000L)

    @Test
    fun `the same DataItem re-applied is the same instance, a new start is not`() {
        assertEquals(true, timer.isSameInstance(spec))
        assertEquals(true, timer.isSameInstance(spec.copy(title = "otro título", reason = "")))
        assertEquals(false, timer.isSameInstance(spec.copy(sentAtEpochMs = 41_000L)))
        assertEquals(false, timer.isSameInstance(spec.copy(targetEpochMs = 130_000L)))
        assertEquals(false, timer.isSameInstance(spec.copy(kind = TimerKind.CARDIO)))
    }
}
