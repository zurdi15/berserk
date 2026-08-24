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
    fun `v0_39_0 the next set arrives broken down for the steppers, with defaults for older phones`() {
        // móvil antiguo: sin desglose → sin steppers
        val bare = ExerciseSpec.decode(MapTimerFields(fields))!!
        assertEquals(false, bare.hasReps)
        assertEquals(false, bare.hasLoad)
        assertEquals(ExerciseSpec.LOAD_NONE, bare.loadMode)

        val broken = ExerciseSpec.decode(MapTimerFields(fields + mapOf(
            "reps" to 8, "loadMode" to "weight", "load" to 60.0, "loadUnit" to "kg",
            "loadStep" to 2.5, "loadMin" to 2.5, "loadMax" to 500.0,
        )))!!
        assertEquals(true, broken.hasReps)
        assertEquals(true, broken.hasLoad)
        assertEquals(8, broken.reps)
        assertEquals(60.0, broken.load, 0.0)
        assertEquals(2.5, broken.loadStep, 0.0)
        assertEquals("kg", broken.loadUnit)

        // nivel: sin unidad; un loadMode desconocido cae a none
        val level = ExerciseSpec.decode(MapTimerFields(fields + mapOf("reps" to 12, "loadMode" to "level", "load" to 10.0, "loadStep" to 1.0, "loadMin" to 1.0, "loadMax" to 100.0)))!!
        assertEquals(ExerciseSpec.LOAD_LEVEL, level.loadMode)
        assertEquals(ExerciseSpec.LOAD_NONE, ExerciseSpec.decode(MapTimerFields(fields + ("loadMode" to "stones")))!!.loadMode)
        // sin canLog (ejercicio hecho) no hay steppers aunque venga el desglose
        assertEquals(false, ExerciseSpec.decode(MapTimerFields(fields + mapOf("reps" to 8, "canLog" to false)))!!.hasReps)
    }

    @Test
    fun `no routine target means the bare count and no next set label`() {
        val spec = ExerciseSpec.decode(MapTimerFields(fields + ("setsTarget" to 0) + ("nextLabel" to "") - "canLog"))!!
        assertEquals("2", spec.progressLabel)
        assertEquals("", spec.nextLabel)
        assertEquals(false, spec.canLog)
    }
}
