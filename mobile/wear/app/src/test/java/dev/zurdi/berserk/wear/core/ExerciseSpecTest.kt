package dev.zurdi.berserk.wear.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ExerciseSpecTest {
    private val fields = mapOf(
        "state" to "exercise",
        "weid" to 42L,
        "name" to " Press banca ",
        "setsDone" to 2,
        "setsTarget" to 4,
        "nextLabel" to "8 × 60 kg",
        "canLog" to true,
        "completed" to false,
        "sentAtEpochMs" to 1_000L,
    )

    @Test
    fun `decodes the phone's DataItem, trimming what the watch only paints`() {
        val spec = ExerciseSpec.decode(MapTimerFields(fields))!!
        assertEquals(42L, spec.weid)
        assertEquals("Press banca", spec.name)
        assertEquals("2/4", spec.progressLabel)
        assertEquals("8 × 60 kg", spec.nextLabel)
        assertEquals(true, spec.canLog)
        assertEquals(false, spec.completed)
    }

    @Test
    fun `none, a missing sentAt and a temp id from an offline phone`() {
        assertNull(ExerciseSpec.decode(MapTimerFields(fields + ("state" to "none"))))
        assertNull(ExerciseSpec.decode(MapTimerFields(fields - "sentAtEpochMs")))
        // ids temporales negativos (alta sin red en el móvil) valen: la web los resuelve
        assertEquals(-3L, ExerciseSpec.decode(MapTimerFields(fields + ("weid" to -3L)))!!.weid)
    }

    @Test
    fun `no routine target means the bare count and no next set label`() {
        val spec = ExerciseSpec.decode(MapTimerFields(fields + ("setsTarget" to 0) + ("nextLabel" to "") - "canLog"))!!
        assertEquals("2", spec.progressLabel)
        assertEquals("", spec.nextLabel)
        assertEquals(false, spec.canLog)
    }
}
