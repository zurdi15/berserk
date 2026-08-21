package dev.zurdi.berserk.wear.core

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PhoneClockTest {
    @After
    fun reset() = PhoneClock.restore(null)

    @Test
    fun `offset is the phone time at t2 minus the watch wall clock`() {
        // el reloj va 3 s por delante del móvil; ida y vuelta de 200 ms
        val sample = PhoneClock.onPong(t0ElapsedMs = 10_000, phoneEpochAtReplyMs = 1_000_000_100, t2ElapsedMs = 10_200, watchEpochAtT2Ms = 1_000_003_200)
        assertNotNull(sample)
        assertEquals(-3_000L, sample!!.offsetMs)
        assertEquals(200L, sample.rttMs)
        assertEquals(1_000_003_200 - 3_000, PhoneClock.now(1_000_003_200))
        assertEquals(1_000_060_000 + 3_000, PhoneClock.toWatchEpoch(1_000_060_000))
    }

    @Test
    fun `slow round trips are discarded and worse samples do not replace a fresh better one`() {
        assertNull(PhoneClock.onPong(0, 5_000, 2_000, 5_000))
        assertNotNull(PhoneClock.onPong(10_000, 1_000_000_000, 10_100, 1_000_000_050))
        // rtt peor, muestra vigente reciente: se ignora
        assertNull(PhoneClock.onPong(20_000, 1_000_000_000, 20_900, 1_000_000_000))
        assertEquals(0L, PhoneClock.offsetMs())
        // rtt igual o mejor: sustituye
        assertNotNull(PhoneClock.onPong(30_000, 1_000_000_000, 30_080, 1_000_000_040))
    }

    @Test
    fun `an old sample gives way to any valid new one`() {
        assertNotNull(PhoneClock.onPong(0, 1_000_000_000, 50, 1_000_000_025))
        val later = PhoneClock.SAMPLE_TTL_MS + 1_000
        assertNotNull(PhoneClock.onPong(later, 2_000_000_000, later + 800, 2_000_000_400 + 1_000))
        assertEquals(-1_000L, PhoneClock.offsetMs())
    }

    @Test
    fun `without samples the watch clock is trusted as is`() {
        assertEquals(123L, PhoneClock.now(123L))
        assertEquals(123L, PhoneClock.toWatchEpoch(123L))
    }
}
