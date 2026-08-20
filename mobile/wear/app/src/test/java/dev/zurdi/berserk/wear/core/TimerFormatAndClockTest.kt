package dev.zurdi.berserk.wear.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TimerFormatAndClockTest {
    @Test
    fun `countdown rounds up and elapsed rounds down`() {
        assertEquals("1:30", TimerFormat.countdown(90_000L))
        assertEquals("1:30", TimerFormat.countdown(89_001L))
        assertEquals("0:01", TimerFormat.countdown(1L))
        assertEquals("0:00", TimerFormat.countdown(0L))
        assertEquals("0:00", TimerFormat.countdown(-5_000L))
        assertEquals("1:29", TimerFormat.elapsed(89_999L))
        assertEquals("1:00:05", TimerFormat.elapsed(3_605_000L))
    }

    @Test
    fun `epoch target converts to the elapsedRealtime base`() {
        // ahora: epoch 1_000_000, uptime 500 → un fin 30s en el futuro cae en uptime 30_500
        assertEquals(30_500L, ClockSync.toElapsedRealtime(1_030_000L, 1_000_000L, 500L))
        // un inicio 40s en el pasado (crono) cae en uptime negativo: válido para StopwatchPart
        assertEquals(-39_500L, ClockSync.toElapsedRealtime(960_000L, 1_000_000L, 500L))
    }

    @Test
    fun `skew is only measured, never applied`() {
        assertEquals(700L, ClockSync.skewMs(sentAtEpochMs = 1_000L, nowEpochMs = 1_700L))
        assertFalse(ClockSync.isSuspicious(sentAtEpochMs = 1_000L, nowEpochMs = 1_700L))
        assertTrue(ClockSync.isSuspicious(sentAtEpochMs = 1_000L, nowEpochMs = 1_000L + ClockSync.SKEW_WARN_MS + 1L))
        assertTrue(ClockSync.isSuspicious(sentAtEpochMs = 20_000L, nowEpochMs = 1_000L))
    }
}
