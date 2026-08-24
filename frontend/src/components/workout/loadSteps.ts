// v0.39.0 (zurdi: "cambiar los pesos/niveles y las reps desde el reloj"):
// los pasos y topes de la carga vivían dentro de SetForm.vue; ahora los
// comparte WorkoutExerciseCard (el desglose de la siguiente serie que se
// manda al reloj — nativeShell.WearExerciseSync) para que los steppers de la
// muñeca se muevan exactamente como los del cajón.

// paso/valores por defecto en el espacio de la unidad del usuario: 2.5 kg es
// un incremento natural, 2.5 lb no lo es (los discos son de 5 lb)
export const WEIGHT_UI = {
  kg: { step: 2.5, initial: 20, max: 500 },
  lb: { step: 5, initial: 45, max: 1100 },
} as const

// v0.18.0 (zurdi: "el modo se pone cuando VAS A HACER el ejercicio — un día
// la polea libre es la de kg y otro la de niveles"): en nivel el valor viaja
// TAL CUAL en weight_kg (sin displayToKg/kgToDisplay: el nivel 12 es 12 en
// cualquier unidad); rango generoso (zurdi dijo "del 1 al 20" pero hay
// máquinas con más posiciones), paso 1.
export const LEVEL_UI = { step: 1, initial: 10, max: 100 } as const

/** suelo del stepper de carga del cajón: 1 en nivel, 2.5 en peso (sea kg o lb) */
export const LOAD_MIN = { weight: 2.5, level: 1 } as const
