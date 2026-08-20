package dev.zurdi.berserk.wear.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class DisplayTitleTest {
    @Test
    fun `strips the kind prefix the phone sends`() {
        assertEquals("Press banca", displayTitle("Descanso · Press banca"))
        assertEquals("Correr", displayTitle("Cardio · Correr"))
    }

    @Test
    fun `keeps titles without separator and never returns empty`() {
        assertEquals("Torso A", displayTitle("Torso A"))
        assertEquals("Descanso · ", displayTitle("Descanso · "))
        assertEquals("", displayTitle(""))
    }
}
