# berserk · Wear OS

App de reloj (Galaxy Watch 8 / Wear OS 6+) que muestra los temporizadores de berserk: cuenta atrás de descanso, countdown de cardio y crono del entreno, con vibración en la muñeca al llegar a cero. No habla con el servidor ni con la web: **la shell Android del móvil ([mobile/android](../android)) publica cada temporizador en la Wear OS Data Layer y el reloj lo pinta**.

```
Web (restTimer.ts / WorkoutExerciseCard.vue / activeWorkout.ts)
  └─ nativeShell.ts::syncWearTimer            (no-op en web y en shells viejas)
       └─ BkOngoing.syncTimer → BkWear.publishTimer
            └─ DataItem /berserk/timer/<rest|cardio|workout>   (persiste; Bluetooth vía Play services)
                 └─ TimerListenerService.onDataChanged         (reloj, aunque la app esté cerrada)
                      └─ TimerEngine.apply
                           ├─ TimerRepository    (SharedPreferences + StateFlow para la pantalla)
                           ├─ TimerNotifier      (notificación ongoing con cronómetro del sistema
                           │                      + OngoingActivity(Status.TimerPart) en la esfera)
                           └─ TimerAlarms        (AlarmManager exacto → TimerAlarmReceiver: vibra + "¡Tiempo!")
Cancelar desde el reloj: PhoneLink → MessageClient /berserk/cmd/cancel → BkWearListenerService (móvil)
  → limpia notificación y alarma en nativo, publica `stopped`, y avisa a la web (evento timerCancelled).

v0.38.0 — el ejercicio actual (segunda página del pager, con "+ Serie" y "Terminar"):
Web (WorkoutView decide cuál es; la WorkoutExerciseCard `current` lo publica)
  └─ nativeShell.ts::syncWearExercise → BkOngoing.syncExercise → BkWear.publishExercise
       └─ DataItem /berserk/exercise (nombre, series hechas/objetivo, siguiente serie, canLog, completed)
            └─ TimerListenerService → TimerEngine.applyExercise → ExerciseRepository (StateFlow)
Órdenes: PhoneLink → /berserk/cmd/logSet | /berserk/cmd/completeExercise (cuerpo = weid)
  → BkWearListenerService → evento `exerciseCommand` a la web (misma ruta que el check de la card:
    outbox, descanso automático, PRs); sin WebView vivo el móvil contesta /berserk/cmd/undelivered
    y el reloj enseña "Abre berserk en el móvil".
```

Decisiones que conviene conocer antes de tocar nada:

- **Sin foreground service.** Lo que se ve (cronómetro de la notificación, indicador de la esfera) lo renderiza Wear OS a partir de la notificación; el aviso a cero lo dispara una alarma. Así nada depende de que el proceso sobreviva ni de las restricciones de Android 12+ para arrancar servicios desde segundo plano.
- **El móvil es la única verdad.** El reloj no calcula fines ni duraciones: recibe `targetEpochMs` absoluto y lo pinta. Si se cancela desde el reloj y el móvil no está al alcance, el DataItem del móvil seguirá diciendo `running` y lo resucitará al reconectar mientras no haya vencido.
- **Un DataItem por temporizador**, para que un `stopped` del descanso nunca pise el crono del entreno. Los DataItems vencidos hace más de 15 s al llegar (reconexión, arranque) se ignoran sin vibrar a destiempo. Y como persisten, un `stopped` viejo de OTRO tipo solo puede parar la alarma de su propio tipo (`AlarmService.stopIfRunning(kind)`, v0.38.0): al abrirse la app por la alarma se releen todos y antes apagaban la que acababa de empezar.
- **El ejercicio actual solo se enseña con el crono del entreno en marcha y si se publicó después de arrancarlo** (`TimerBoard.exerciseFor`): el DataItem persiste y, si no, el reloj enseñaría el último ejercicio del entreno anterior.
- **Mismo `applicationId` (`dev.zurdi.berserk`) y misma firma que la shell**: es lo que exige la Data Layer. El `namespace` del código es `dev.zurdi.berserk.wear`.

## Compilar

Proyecto Gradle independiente (AGP 9 / Kotlin 2.3 / Compose for Wear OS Material 3), JDK 21:

```
cd mobile/wear
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

La release firmada la hace CI (`.github/workflows/android.yml`, job `wear`) con el mismo keystore y la misma derivación de `versionCode` que la shell, y la adjunta a la GitHub Release como `berserk-wear-vX.Y.Z.apk`.

## Instalar en el reloj (sin Play Store)

1. En el reloj: **Ajustes → Acerca del reloj → Software → pulsa 5 veces "Versión de software"**. En *Opciones de desarrollador* activa **Depuración ADB**, **Depuración inalámbrica** y **Desactivar Wi-Fi automática** (si no, el reloj apaga la Wi-Fi al ir por Bluetooth y pierdes la conexión).
2. Reloj y PC en la **misma Wi-Fi** (sin aislamiento de clientes; un hotspot vale). En *Depuración inalámbrica → Vincular nuevo dispositivo* aparece IP, puerto y código:
   ```
   adb pair IP:PUERTO_DE_VINCULACION     # pide el código
   adb connect IP:PUERTO                 # el puerto de conexión es OTRO (pantalla principal de depuración)
   adb install -r berserk-wear-vX.Y.Z.apk
   ```
3. Abre la app en el reloj una vez y acepta el permiso de notificaciones (sin él no hay cronómetro en la esfera).
4. En el móvil, la shell de la **misma versión** (o posterior con el puente): en *Perfil → Ajustes* debe leerse "Reloj vinculado: Galaxy Watch8". Arranca un descanso: la cuenta atrás aparece en el reloj en uno o dos segundos.
5. Apaga la depuración inalámbrica al terminar: gasta batería.

Para actualizar, repite `adb connect` + `adb install -r`. La app del reloj es deliberadamente "tonta" (solo pinta estado), así que rara vez cambia.

En debug, las dos APKs (shell y reloj) tienen que firmarse con el **mismo** keystore de debug (la misma máquina) y sin `applicationIdSuffix`: la Data Layer falla en silencio si el paquete o la firma no coinciden.

## Now Bar de One UI 8 Watch

La Now Bar del reloj muestra por defecto **solo el icono** de las apps de terceros; el tiempo en vivo aparece al cambiar el modo **por app**: en el reloj, *Ajustes → Now Bar → berserk → Icono con texto* (el ajuste no es global: el temporizador de Samsung puede estar en texto y berserk en icono). No depende de nada de la app — v0.31.1 probó con un foreground service y no hacía falta. Con Wear OS 7 (One UI 9 Watch) los temporizadores van además como Live Update.

## Depurar

```
adb logcat -s BkWear        # motor, listener, alarmas y enlace con el móvil (misma etiqueta en la shell)
```

Estados de la pantalla de reposo: *Móvil conectado* = la shell de berserk está al alcance por la Data Layer; *Móvil no conectado* = reloj emparejado pero sin la shell, sin Bluetooth o sin Play services.
