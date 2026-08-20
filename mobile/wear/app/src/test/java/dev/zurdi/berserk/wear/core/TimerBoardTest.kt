package dev.zurdi.berserk.wear.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TimerBoardTest {
    private fun timer(kind: TimerKind, target: Long, sentAt: Long, total: Long = 60_000L, finishedAt: Long? = null, ackedAt: Long? = null) =
        ActiveTimer(TimerSpec(kind, true, target, total, "", sentAt), receivedAtEpochMs = sentAt, finishedAtEpochMs = finishedAt, acknowledgedAtEpochMs = ackedAt)

    @Test
    fun `the newest countdown is primary and the workout stopwatch is the fallback`() {
        val workout = timer(TimerKind.WORKOUT, target = 0L, sentAt = 1L, total = 0L)
        val rest = timer(TimerKind.REST, target = 100_000L, sentAt = 50L)
        val cardio = timer(TimerKind.CARDIO, target = 200_000L, sentAt = 60L)

        assertEquals(TimerKind.WORKOUT, TimerBoard().with(workout).primary()?.kind)
        assertEquals(TimerKind.REST, TimerBoard().with(workout).with(rest).primary()?.kind)
        assertEquals(TimerKind.CARDIO, TimerBoard().with(workout).with(rest).with(cardio).primary()?.kind)
        assertEquals(TimerKind.WORKOUT, TimerBoard().with(workout).with(rest).without(TimerKind.REST).primary()?.kind)
        assertNull(TimerBoard().primary())
    }

    @Test
    fun `a finished countdown leaves the live set and alarms until acknowledged`() {
        val rest = timer(TimerKind.REST, target = 100_000L, sentAt = 40_000L, finishedAt = 100_000L)
        val board = TimerBoard().with(rest)
        assertTrue(board.live.isEmpty())
        assertNull(board.primary())
        assertEquals(TimerKind.REST, board.alarming()?.kind)
        assertTrue(rest.isAlarming)

        val acked = board.with(rest.copy(acknowledgedAtEpochMs = 103_000L))
        assertNull(acked.alarming())
        assertTrue(!acked.timers.getValue(TimerKind.REST).isAlarming)
    }

    @Test
    fun `pruning keeps alarming timers until the failsafe and drops acknowledged ones quickly`() {
        val alarming = TimerBoard().with(timer(TimerKind.REST, target = 100_000L, sentAt = 40_000L, finishedAt = 100_000L))
        assertEquals(1, alarming.pruned(nowEpochMs = 100_000L + TimerBoard.ALARM_FAILSAFE_MS - 1L).timers.size)
        assertEquals(0, alarming.pruned(nowEpochMs = 100_000L + TimerBoard.ALARM_FAILSAFE_MS).timers.size)

        val acked = TimerBoard().with(timer(TimerKind.REST, target = 100_000L, sentAt = 40_000L, finishedAt = 100_000L, ackedAt = 105_000L))
        assertEquals(1, acked.pruned(nowEpochMs = 105_000L + TimerBoard.ACKNOWLEDGED_KEEP_MS - 1L).timers.size)
        assertEquals(0, acked.pruned(nowEpochMs = 105_000L + TimerBoard.ACKNOWLEDGED_KEEP_MS).timers.size)

        val running = TimerBoard().with(timer(TimerKind.WORKOUT, target = 0L, sentAt = 1L, total = 0L))
        assertEquals(1, running.pruned(nowEpochMs = 999_999_999L).timers.size)
    }

    @Test
    fun `remaining, elapsed, progress and due for countdown and stopwatch`() {
        val rest = timer(TimerKind.REST, target = 100_000L, sentAt = 10_000L, total = 90_000L)
        assertEquals(60_000L, rest.remainingMs(40_000L))
        assertEquals(30_000L, rest.elapsedMs(40_000L))
        assertEquals(60f / 90f, rest.progress(40_000L), 0.0001f)
        assertEquals(0f, rest.progress(200_000L), 0f)
        assertTrue(!rest.isDue(99_999L))
        assertTrue(rest.isDue(100_000L))

        val workout = timer(TimerKind.WORKOUT, target = 10_000L, sentAt = 10_000L, total = 0L)
        assertEquals(0L, workout.remainingMs(50_000L))
        assertEquals(40_000L, workout.elapsedMs(50_000L))
        assertEquals(0f, workout.progress(50_000L), 0f)
        assertTrue(!workout.isDue(999_999L))
    }
}
