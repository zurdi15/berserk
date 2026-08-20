package dev.zurdi.berserk.wear.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TimerBoardTest {
    private fun timer(kind: TimerKind, target: Long, sentAt: Long, total: Long = 60_000L, finishedAt: Long? = null) =
        ActiveTimer(TimerSpec(kind, true, target, total, "", sentAt), receivedAtEpochMs = sentAt, finishedAtEpochMs = finishedAt)

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
    fun `finished countdowns leave the live set, are held briefly and pruned later`() {
        val rest = timer(TimerKind.REST, target = 100_000L, sentAt = 40_000L, finishedAt = 100_000L)
        val board = TimerBoard().with(rest)
        assertTrue(board.live.isEmpty())
        assertNull(board.primary())
        assertEquals(TimerKind.REST, board.recentlyFinished(nowEpochMs = 103_000L)?.kind)
        assertNull(board.recentlyFinished(nowEpochMs = 100_000L + TimerBoard.FINISHED_HOLD_MS))
        assertEquals(1, board.pruned(nowEpochMs = 130_000L).timers.size)
        assertEquals(0, board.pruned(nowEpochMs = 100_000L + TimerBoard.FINISHED_KEEP_MS).timers.size)
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
