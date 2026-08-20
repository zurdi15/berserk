# Changelog

All notable changes to this project are documented in this file.

## 0.35.1 - 2026-08-20

### Cambiado
- Reloj: el anillo de la cuenta atrás vuelve al diseño original (trazo fino con halo, círculo completo) y los botones OK y Cancelar son compactos y del mismo tamaño.
- App Android: el velo de fin de temporizador muestra "Descanso terminado" / "Cardio terminado", un 0:00 en grande y el ejercicio.

## 0.35.0 - 2026-08-20

### Arreglado
- Reloj: el anillo de la cuenta atrás ya se llena de verdad — la duración del temporizador llegaba al reloj como 0 por un fallo de lectura en la app Android; ahora viaja bien y, por si acaso, el reloj la deduce si faltara.

### Cambiado
- App Android: al terminar un descanso o un cardio ya no hay pantalla aparte — se abre la app y un velo con halo ámbar, el nombre del ejercicio y el OK cubre la pantalla hasta que lo pulsas (o hasta que lo callas desde la notificación o el reloj).
- Reloj y móvil: fuera los textos de "¡Tiempo!" y "Pulsa OK…"; la pantalla de alarma del reloj queda con el halo, el nombre y un OK más pequeño y con aire; en las notificaciones el ejercicio es el titular y el tipo va debajo.

## 0.34.1 - 2026-08-20

### Cambiado
- Notificaciones del móvil: si la rutina no tiene foto, la tarjeta muestra su runa (como el hero del pre-inicio); si el ejercicio no tiene foto, la runa de su grupo muscular.

## 0.34.0 - 2026-08-20

### Añadido
- App Android: al terminar un descanso o un cardio, el móvil vibra hasta que pulsas OK (en la pantalla de "¡Tiempo!" que se abre sola aunque esté bloqueado, o en la notificación), con tope de 60 segundos — igual que el reloj. El OK del móvil calla el reloj y el del reloj calla el móvil.

### Arreglado
- Si la conexión con el servidor se corta a medias (wifi sin salida, servidor mudo), la app ya no se queda colgada: a los 8 segundos pasa a modo sin conexión, los cambios del entreno se encolan y se reenvían al volver la red, y "Añadir ejercicio" ignora toques repetidos mientras uno sigue en curso.
- Reloj: el anillo de la cuenta atrás se dibuja más hacia dentro (antes quedaba bajo el cristal) y deja un hueco arriba para la hora.

## 0.33.2 - 2026-08-20

### Arreglado
- Reloj: al llegar a cero, la app ya no parpadea ni se reabre varias veces — la alarma no se rearmaba por releer el mismo temporizador al abrirse.

## 0.33.1 - 2026-08-20

### Arreglado
- Reloj: el anillo de la cuenta atrás se llena con el tiempo transcurrido (antes mostraba el restante y parecía un círculo fijo), sobre una pista gris tenue; el botón Cancelar usa los colores de berserk.

## 0.33.0 - 2026-08-20

### Añadido
- App Android: en Ajustes puedes elegir cómo se muestra el cronómetro en la barra — "Chip en vivo (Now Bar)" (notificación en tiempo real de Android 16; en Samsung hay que activar "Notificaciones en vivo para todas las aplicaciones" en Opciones de desarrollador) o "Tarjeta con imagen" (la tarjeta grande con la foto del ejercicio y el cronómetro).

### Cambiado
- Notificaciones del móvil: el ejercicio es el titular y el tipo (descanso, cardio, entrenando) va debajo, sin repetir el nombre.

### Arreglado
- El cronómetro del entreno se apaga siempre al terminar o descartar el entreno.

## 0.32.1 - 2026-08-20

### Arreglado
- Reloj: la runa de la pantalla de reposo distingue tres estados — móvil cerca por Bluetooth (encendida con halo), móvil solo por Internet (tenue) y sin móvil (apagada) — y se actualiza aunque el sistema no avise del cambio.

## 0.32.0 - 2026-08-20

### Cambiado
- Reloj: la pantalla de reposo se queda con la hora arriba, la runa en el centro —encendida con halo si el móvil está al alcance, apagada si no— y la versión pequeña abajo; desaparecen los textos de "sin temporizador", la ayuda y "móvil conectado".

## 0.31.2 - 2026-08-20

### Cambiado
- Reloj: el anillo de cuenta atrás usa el indicador circular de Material 3 (más grueso y pegado al borde) con el halo detrás.
- Reloj: se retira el servicio de primer plano de v0.31.1 — el tiempo en la Now Bar de One UI 8 Watch se activa en *Ajustes → Now Bar → berserk → Icono con texto* (ajuste por app), sin que la app tenga que hacer nada.

## 0.31.1 - 2026-08-20

### Cambiado
- Reloj: el temporizador en curso corre como servicio de primer plano, con el color de berserk y categoría de entreno, para que la Now Bar de One UI 8 Watch pueda mostrarlo con su tiempo como hace con las apps de Samsung (por confirmar en el reloj; la vía oficial sigue siendo Wear OS 7).

## 0.31.0 - 2026-08-20

### Añadido
- Now Bar de Samsung en el móvil: en Android 16 el descanso, el cardio y el tiempo de entreno son *Live Updates* — chip con el cronómetro en la barra de estado, tarjeta en la pantalla de bloqueo y presencia en la Now Bar de One UI 8 (con la imagen del ejercicio).
- Reloj preparado para la Now Bar: los temporizadores se publican también como Live Update, que Wear OS 7 (One UI 9 Watch) pintará en cuanto llegue al Galaxy Watch 8; en Wear OS 6 no cambia nada.

### Cambiado
- La app Android se moderniza a Capacitor 8 (Android 16 como objetivo, edge-to-edge: el contenido se extiende bajo las barras del sistema y sus iconos siguen al tema). Requiere Android 7.0 o superior.
- En Android 16 la tarjeta de notificación a medida deja paso a la tarjeta estándar promovida (la plataforma no admite vistas propias en los Live Updates); en Android 15 y anteriores se mantiene la de v0.30.0.
- El reloj deja de recibir las notificaciones puenteadas del móvil: su propia app ya muestra los temporizadores y la alarma, y duplicaban.

## 0.30.0 - 2026-08-20

### Añadido
- Notificaciones del móvil rediseñadas: el descanso, el cardio y el tiempo de entreno salen en una tarjeta con la imagen del ejercicio (o de la rutina), su nombre y el cronómetro en grande — también el aviso de fin.

### Cambiado
- Reloj: cuando suena la alarma, la app se abre directamente (también con la pantalla apagada o bloqueada) para pulsar OK sin pasar por la notificación; al dar al OK vuelves a la esfera.

## 0.29.0 - 2026-08-20

### Añadido
- Reloj: al llegar a cero, la vibración ya no es un único aviso — sigue en bucle hasta que pulsas OK (en la pantalla, en la notificación o descartándola), con un tope de 60 segundos.
- Reloj: capa visual — anillo de progreso con halo que respira, últimos 10 segundos en ámbar con tic háptico 3-2-1 si tienes la pantalla abierta, pantalla de "¡Tiempo!" con halo pulsante al ritmo de la vibración y runa iluminada en reposo.

### Cambiado
- El móvil le dice al reloj si un temporizador terminó solo o lo cancelaste: solo cancelar (o empezar otra serie) calla la alarma del reloj.

## 0.28.0 - 2026-08-20

### Añadido
- App para Galaxy Watch (Wear OS): la cuenta atrás del descanso, el countdown de cardio y el tiempo de entreno salen en el reloj — indicador en la esfera con el tiempo corriendo, pantalla propia con el tiempo en grande y vibración en la muñeca al llegar a cero; también se puede cancelar desde el reloj. Va como APK aparte en cada release (`berserk-wear-vX.Y.Z.apk`; instalación en `mobile/wear/README.md`) y necesita la app Android de la misma versión.
- La app Android muestra el countdown de cardio en la barra de notificaciones (cronómetro del sistema) y avisa con sonido al terminar, igual que el descanso.
- Ajustes indica si el móvil ve un reloj y si ese reloj tiene la app de berserk.

### Cambiado
- La app Android pide Android 6.0 o superior (antes 5.1): lo exige el enlace con el reloj.

## 0.27.0 - 2026-08-20

### Añadido
- Ya puedes cambiar tu nombre de usuario, en Perfil → Cuenta.
- El cambio de contraseña pide la actual y la nueva dos veces, para que una errata no te deje fuera de tu cuenta.

### Cambiado
- Perfil se ordena en dos secciones: **Ajustes**, con todo lo de la app (tema, idioma, unidades, zona horaria y la versión instalada), y **Cuenta**, con todo lo tuyo (foto, nombre de usuario, color y contraseña).
- La foto de perfil se cambia tocando el avatar, y se quita desde Cuenta.

### Eliminado
- Los botones "Editar" y "Quitar foto" que colgaban debajo de la foto de perfil.

## 0.26.0 - 2026-08-20

### Añadido
- Carga de imágenes con blur: cada imagen subida genera una miniatura que se muestra al instante (borrosa) mientras carga la real — y las ya subidas ganan la suya automáticamente al arrancar el backend.
- Si una imagen no puede cargar, siempre aparece el placeholder rúnico de la app (nunca el icono de imagen rota del navegador).

### Cambiado
- Entrenos y Cuerpo aprovechan ahora la precarga del arranque: la lista de ejercicios y tus medidas/fotos pintan al instante.

## 0.25.2 - 2026-08-20

### Arreglado
- La foto de perfil ya no se descarga de nuevo en cada visita: se cachea en el navegador y solo se refetchea cuando subes otra.

## 0.25.1 - 2026-08-20

### Arreglado
- Rutinas carga al instante: el plan rotatorio reutiliza los datos precargados en el arranque (y muestra un esqueleto de carga cuando aún no los hay), en vez de aparecer de golpe tras su propia petición.

## 0.25.0 - 2026-08-20

### Eliminado
- La planificación de entrenamientos desaparece: con las rutinas y el plan rotatorio ya no aportaba nada. El calendario queda como registro de lo entrenado (con el retro-registro de siempre) y Hoy se centra en el plan rotatorio.

### Cambiado
- Calendario: la card del entreno del día adopta la nueva estética — imagen de cada ejercicio y resumen de series×reps (3×8).
- Biblioteca: las filas de ejercicios pierden el borde, como en el resto de listados.
- Registro de series: el botón "Discos" se deshabilita (en vez de esconderse) al elegir nivel.

## 0.24.5 - 2026-08-19

### Arreglado
- El mapa muscular se veía verde en vez de aurora: los músculos se pintan ahora con el color exacto del tema (y cambian con el modo claro/oscuro).

## 0.24.4 - 2026-08-19

### Arreglado
- El doble scroll de verdad: la ventana ganaba ~3000px de scroll fantasma por un detalle de posicionamiento (elementos de accesibilidad anclándose al documento en vez de al contenedor de scroll). Ahora solo scrollea el contenido.
- La fila de filtro + búsqueda ya no se descuadra: la etiqueta del selector pasa a ser invisible (pero accesible) en las filas compactas.

### Cambiado
- El mapa muscular de Hoy es ahora un cuerpo humano realista (arte anatómico del proyecto wger): sistema muscular en grises con cada músculo trabajado encendido según su volumen.

## 0.24.3 - 2026-08-19

### Añadido
- Hoy: el nombre de la rutina entra letra a letra al cambiar de rutina en el hero, a juego con los números rotatorios.

## 0.24.2 - 2026-08-19

### Cambiado
- Entreno: al pasar de bloque en el stepper, la vista vuelve arriba para ver el primer ejercicio.
- Entrenos: desaparece el doble scroll — la lista de ejercicios fluye con la página, que es la única superficie de scroll.
- El selector de grupo muscular y la búsqueda comparten fila (un tercio / dos tercios) en Entrenos, la biblioteca y el diálogo de añadir ejercicio.
- Hoy: la etiqueta de minutos/ejercicios del hero ya no parpadea al cambiar de rutina y sus números ruedan con la animación de la app.

## 0.24.1 - 2026-08-19

### Cambiado
- Biblioteca: tocar un ejercicio abre directamente su editor (la vista detalle con el progreso queda en Progresión, donde tiene sentido).
- Entrenos: las cards del selector de ejercicios muestran más información — el máximo del ejercicio a la derecha y el tipo de medición como chip.
- Los chips de tipo (Cardio, Tiempo, Peso corporal) van en su propia fila, separados del grupo muscular, y no se repiten cuando el grupo ya dice lo mismo.

## 0.24.0 - 2026-08-19

### Añadido
- Búsqueda de imágenes de ejercicio desde la webapp: botón "Buscar imagen" en el editor de biblioteca contra free-exercise-db (~870 ejercicios en dominio público); la imagen elegida se descarga a tu instancia y el encuadre parte de cero.
- Sugerencia de progresión: si la última sesión cumpliste el objetivo entero de la rutina, la card del entreno propone subir el peso (+2.5 kg) y un toque abre el registro ya prefijado.
- Vista detalle por ejercicio: foto grande, grupo, récords, gráfica con métricas y rango, y el historial completo de sesiones — se abre tocando la fila de la biblioteca (con transición de la imagen) o desde "Ver detalle" en Entrenos.
- Cardio: métricas de Distancia (km) y Ritmo (min/km) en las gráficas, cuando hay datos de distancia.
- Rango temporal en las gráficas de Entrenos y del detalle: 3M / 6M / 1A / Todo.
- Mapa muscular en Hoy: silueta frente/espalda con cada grupo encendido según el volumen de las últimas semanas.
- La copia de seguridad incluye ahora las imágenes (ejercicios, rutinas, avatares y fotos de progreso) y el restaurado las repone; las copias antiguas siguen restaurando sin tocar tus imágenes actuales.

### Cambiado
- Admin: la contraseña de otro usuario se cambia desde el propio formulario de editar (campo opcional), sin botón aparte.

## 0.23.1 - 2026-08-19

### Cambiado
- Registro de series: el stepper de peso/nivel queda alineado con el de reps (el toggle kg/nivel descolgaba la columna).
- Entreno: más aire entre la imagen del ejercicio y las series; la columna de series es más corta y estrecha en vez de estirarse hasta el borde de la card.
- Plan rotatorio repensado: fuera la card interior redundante, el índice respira por la izquierda y los nombres de rutina van en multilínea sin truncarse.
- Listado de rutinas: cada fila muestra la foto de la rutina si la tiene (con el pozo rúnico de fallback) — antes solo salía la runa.
- "Nueva rutina" se coloca entre el plan rotatorio y la lista, alineado a la derecha.

## 0.23.0 - 2026-08-19

### Añadido
- Tiempo objetivo para cardio en rutinas: el editor cambia "Series objetivo" por "Tiempo objetivo" (stepper mm:ss), se muestra en el pre-inicio en vez de "x series", viaja al duplicar rutinas y al guardar un entreno como rutina, y alimenta el tiempo por defecto de "Empezar".
- Progreso de cardio por tiempos: en Entrenos, los ejercicios de cardio/tiempo muestran una única métrica "Tiempo" (minutos totales por sesión) en lugar de peso/volumen/est. 1RM.
- Tooltip en las gráficas: tocar cerca de un punto lo resalta y muestra la fecha y el valor exacto; el drag-zoom accidental desaparece.
- El selector de rutinas del plan rotatorio indica de quién es cada rutina (chip de usuario o "Global").
- Chip del grupo muscular bajo el nombre de cada ejercicio en el picker de Entrenos.

### Cambiado
- Entreno: el header muestra solo el cronómetro y el nombre de la rutina (la fecha se va); la card de cardio pierde el acento lateral y sus dos acciones ocupan la fila a partes iguales; las filas de series son un poco más compactas.
- Rutinas: "Nueva rutina" vive arriba (como en la biblioteca) y el plan rotatorio adopta la estética del facelift, con espacio real tras "Te toca:".
- Biblioteca y editor de rutina unifican sus footers: Cancelar a la izquierda y Guardar a la derecha, a fila completa; los botones de imagen quedan centrados bajo el marco.
- Entrenos: las imágenes del picker pasan a 9:16, como el resto de la app.
- Hoy: la etiqueta "~min · ejercicios" del hero es más legible sobre foto (píldora con scrim + blur y un punto más de tamaño).

### Arreglado
- Asumiendo otro usuario como admin, las imágenes de rutinas y las fotos de cuerpo del usuario asumido no cargaban (los <img> no llevan la cabecera de act-as; ahora un admin puede pedir cualquier media).

## 0.22.1 - 2026-08-19

### Changed
- El editor de rutinas replica el layout del entrenamiento: la foto del ejercicio en vertical (9:16, con su encuadre) a la izquierda y los objetivos (series, reps, peso, descanso y bloque) a la derecha.
- El selector de ejercicios se ve como la biblioteca: imagen de cada ejercicio (o su runa) y un chip del grupo muscular bajo el nombre.

## 0.22.0 - 2026-08-19

### Added
- Pre-carga de arranque: nada más entrar, la app trae en paralelo los datos de todas las secciones — la primera visita a cada una pinta al instante, sin esperar red.
- Splash de arranque: la runa tallándose cubre la carga inicial y la app aparece entera de golpe, sin saltos de elementos.
- Encuadre de la foto del ejercicio: la preview del editor es ahora un marco 9:16 (como se ve en la app) y puedes arrastrar la imagen y hacer zoom — tal cual la dejes es exactamente como se verá en todas partes.

### Fixed
- El botón atrás de la preview del entrenamiento vuelve a funcionar, y esa pantalla marca la sección de Entreno en el menú (no "Hoy").
- El avatar del menú inferior ya no se estira con fotos no cuadradas: siempre circular, como en Perfil.

### Changed
- Biblioteca: los nombres de ejercicio ya no se cortan (pasan a varias líneas), desaparece la etiqueta "Catálogo predefinido", las acciones de editar/borrar van en columna a la derecha (editar arriba) y el selector de grupos musculares se muestra siempre entero.

## 0.21.3 - 2026-08-19

### Fixed
- Las flechas del carrusel de "hoy toca" se centran verticalmente en la card, despejadas del nombre de la rutina.
- El item Perfil del menú inferior recupera su etiqueta aunque haya foto de perfil, y el avatar mide lo mismo que las runas vecinas.
- La cabecera de la preview del entrenamiento es coherente con el modo claro (niebla pálida con el brillo aurora); en oscuro sigue idéntica.

## 0.21.2 - 2026-08-19

### Fixed
- La preview del entrenamiento (antes de darle a empezar) recupera su cabecera de antes: isla oscura con la runa a plena presencia, sin el blur del hero de Hoy (que se queda como está).
- El botón "atrás" de esa cabecera se ve ahora también en modo oscuro: círculo translúcido con borde, no solo el chevron.

## 0.21.1 - 2026-08-19

### Changed
- El hero de Hoy pierde la card cuando no hay foto: fondo completamente transparente — el contenido y la runa flotan sobre la página con la tinta del tema (en oscuro la card negra-sobre-negro parecía no existir; en claro era un bloque demasiado oscuro). Con foto de rutina sigue siendo la isla nocturna de siempre.
- La runa de fondo del hero va ahora tenue y con un blur suave: deja de competir con el texto.
- Las filas de opciones (Perfil y demás listas) llevan borde: en tema claro ya no se funden con el fondo.

## 0.21.0 - 2026-08-19

### Added
- Las rutinas pueden tener imagen propia: súbela, cámbiala o quítala desde el editor de la rutina. El hero de Hoy y el pre-inicio usan ESA imagen (o la runa si no hay) — ya no toman prestada la foto del primer ejercicio.
- La gráfica por ejercicio entiende niveles: pestaña "Nivel" (solo si el ejercicio tiene series en modo nivel) y chips con el peso y/o nivel máximo conseguidos, sin ir a Récords. Si el ejercicio es solo-nivel, la gráfica abre directamente en "Nivel".
- Si tienes foto de perfil, la barra inferior muestra tu avatar en lugar de la runa de Perfil (sin etiqueta, con anillo aurora cuando estás dentro).

### Changed
- Las fotos de ejercicio son ahora verticales (9:16) y más grandes: en la biblioteca cada fila luce su foto, y en el player la imagen acompaña a las series a su izquierda.
- Todas las secciones cargan al instante al volver: lo último que viste aparece de inmediato (con su animación de entrada) mientras el dato fresco llega en background y se actualiza de forma reactiva.
- El hero de Hoy se redistribuye: "HOY TOCA" arriba con su margen, nombre y flechas en la parte alta y el CTA abajo; las flechas del carrusel animan solo el contenido (nombre, runa, meta), nunca la card entera. En tema claro la card es una isla nocturna: siempre oscura, con letras blancas y sombra.
- El bloque "Última vez" del player queda siempre visible, también después de marcar series.
- "Nuevo ejercicio" vive ahora arriba, pegado a la derecha del título de la biblioteca.
- Todos los ejercicios son de catálogo global: desaparece la privacidad por ejercicio (ser el autor solo importa para editarlo o borrarlo).
- Checkbox y radios propios de la casa en grupos musculares, modo superserie y editor de rutina — fuera el azul genérico del navegador.

### Fixed
- El sheet "Añadir ejercicio" recarga el catálogo al abrirse: un ejercicio creado a mitad de entreno ya aparece en la lista sin salir del player.

## 0.20.0 - 2026-08-19

### Added
- Foto de perfil: toca el avatar en Perfil para ponerla o cambiarla, y "Quitar foto" para borrarla (JPG/PNG/WebP, mismo esquema seguro que las fotos de ejercicio).
- El nombre en inglés de un ejercicio es ahora opcional: sin traducción, la app en inglés enseña el nombre en español en vez de una fila vacía; vaciar el campo al editar borra la traducción.
- Al terminar un entreno: scroll automático arriba (la runa berserk se talla a la vista), pulso neón de bordes y una ráfaga de chispas aurora/ember — cerrar un entreno ya se siente como un logro.
- Los checks de serie se pueden DES-marcar: quitar el check de una serie hecha la borra (funciona también sin conexión) y la fila reaparece como pendiente para re-marcarla.

### Changed
- El hero de Hoy ya no recorta el "HOY TOCA" en móvil, es más alto (la runa de fondo se luce), el texto lleva sombra y queda siempre POR ENCIMA de la runa/foto, y las flechas del carrusel animan el cambio de rutina (la runa se re-talla con cada una).
- Los sheets se cierran arrastrando la rayita hacia abajo (el panel sigue al dedo), y "Añadir ejercicio" tiene un único scroll: el de la lista.
- La pastilla activa de las pestañas (Progresión, Récords, métricas de la gráfica) se desliza animada al cambiar de sección.
- Las runas de los días del calendario van agrupadas y un punto más pequeñas: ya no rozan las esquinas redondeadas.
- La serie activa del entreno tiene más aire alrededor del check (nada apelmazado contra el borde de la selección).

### Fixed
- App Android: el gesto de atrás navega a la pantalla anterior en vez de cerrar la app (en la raíz la manda al fondo, conservando el entreno en curso). Requiere la APK nueva de esta release.

## 0.19.0 - 2026-08-19

### Changed
- Lavado de cara integral ("facelift"): misma alma nórdica (runas, aurora, glows, animaciones talladas), estructura nueva mucho más amable — cards grandes y redondeadas (24px), tipografía grande en caja mixta con la voz en mayúsculas relegada a eyebrows ("HOY", "BLOQUE 3"), botones pill de 48px, pestañas segmentadas, y las fotos de los ejercicios como protagonistas en toda la app (con pozo rúnico de respaldo donde no hay foto).
- Hoy se reorganiza: saludo grande con la fecha, la racha como chip ember al lado, y un HERO del entreno que toca (foto o runa con glow, "Hoy toca", duración estimada y CTA "Vamos a entrenar") con flechas ‹ › para fijar otra rutina del plan; la sesión planificada del día aparece como chip dentro del hero.
- El player se rediseña entero: header limpio (crono grande + nombre del entreno + kebab), barra de progreso segmentada por bloques con punto en el actual, título "Bloque n" y filas de serie estilo checklist; la gestión (reordenar, descanso, bloque, quitar, descartar, auto-descanso, grupos musculares) se muda a sheets kebab del entreno y de cada ejercicio, y borrar una serie vive ahora en el pie de su cajón de edición.
- Perfil pasa de pestañas a hub: avatar con anillo de tu color, "Tu actividad reciente" con los 7 puntos de la semana y una fila rúnica por sección (Ajustes, Rutinas, Biblioteca, Compartir, Admin); los enlaces #routines/#library/#admin siguen funcionando.
- Calendario y Progresión heredan el lenguaje nuevo: mes grande con chevrons circulares, celdas más aireadas, heatmap en su card, tiles de totales grandes y el picker de ejercicios con las fotos de la biblioteca.
- El cierre de entreno es ahora celebratorio: la runa de la casa tallándose, "¡Entreno terminado!" y la duración como métrica protagonista, con sets/volumen en tiles.

### Added
- Series pendientes con check de un toque: las series que faltan hasta el objetivo de la rutina aparecen prefijadas (esta sesión > última sesión > objetivo) como filas fantasma — tocar el check la registra al instante por el mismo camino de siempre (descanso, PRs y neón incluidos, también sin conexión); tocar la fila abre el cajón para ajustarla.
- "Completar todo el bloque": registra de un toque todas las series pendientes con objetivo del bloque visible.
- Pantalla de pre-inicio de rutina: hero con foto, "N bloques · N ejercicios · ~N min" (duración estimada nueva) y la lista de ejercicios por bloque antes de "Empezar entrenamiento" — tocar una rutina en Hoy o en Entreno lleva aquí en vez de arrancar a ciegas.

## 0.18.1 - 2026-08-19

### Added
- Bloques editables en pleno entreno: cada card tiene ahora "Bloque: X" — mueve el ejercicio a un bloque existente, sácalo, o estrena un bloque nuevo con nombre sin salir del entrenamiento (funciona también sin conexión). Estrenar el primer bloque activa el stepper al momento.

### Changed
- El botón "Añadir aquí" de los bloques del editor de rutinas pasa a llamarse "Añadir ejercicio a bloque".

## 0.18.0 - 2026-08-15

### Changed
- El modo kg/nivel se elige ahora al registrar cada serie, con un toggle en el propio cajón — un día la polea libre es la de kg y otro la de los niveles. El ajuste por ejercicio de la biblioteca desaparece (las series y récords antiguos en modo nivel se migran solos), la última serie marca el modo por defecto de la siguiente, y una misma tanda puede mezclar kg y niveles. Los récords de nivel solo compiten contra récords de nivel.

## 0.17.2 - 2026-08-14

### Added
- Selector de "Bloque" en cada fila del editor de rutinas: mueve un ejercicio ya existente a un bloque existente, sácalo a "sin bloque", o estrena un bloque nuevo desde la propia fila — pensado para organizar en bloques las rutinas creadas antes de que existieran.

## 0.17.1 - 2026-08-14

### Added
- Entrada directa del peso: tocar el valor del stepper de carga (cajón de series y objetivo del editor de rutinas) abre un campo para teclear literalmente cualquier peso, aceptando tanto punto como coma decimal.

## 0.17.0 - 2026-08-14

### Added
- Bloques en las rutinas y stepper por bloques en el entreno: define bloques con nombre en el editor (crear, renombrar, disolver, añadir dentro; las flechas en la frontera cambian el ejercicio de bloque), y el entreno en vivo se trocea en steps navegables — chips con progreso, solo el bloque visible en pantalla y "anterior/siguiente"; añadir un ejercicio mientras miras un bloque lo mete en ese bloque (también sin conexión).
- Modo "nivel" por ejercicio: números planos (1-20) en vez de kg para máquinas asistidas/con posiciones — elegible en la biblioteca, sin conversión kg/lb ni calculadora de discos, con récords de nivel máximo y fuera de los agregados de volumen.
- Modo admin "actuar como": un administrador puede operar la app entera como cualquier usuario (rutinas, ejercicios, entrenos…) desde Perfil → Admin, con banda persistente y salida en un toque.

### Changed
- El entreno ya no se desmonta al navegar: volver a la pestaña pinta al instante el estado retenido (bloque del stepper incluido) y refresca en segundo plano.
- El "última vez" de la card de ejercicio pasa a líneas separadas (fecha + una línea por serie), como en el cajón de registrar — menos densidad.

## 0.16.0 - 2026-08-13

### Fixed
- La app Android se cerraba al registrar una serie: el aviso de fin de descanso (setAlarmClock) necesitaba el permiso de alarmas exactas de Android 13+ que no declarábamos, y la excepción tumbaba el proceso. La APK nueva lo declara y, si el sistema lo negara, degrada a una alarma inexacta antes que cerrarse. Además el bundle web deja de invocar la alarma en APKs viejas: sin actualizar ya no crashea (el aviso cae al respaldo inexacto hasta que instales la nueva).
- El día actual del calendario apenas se distinguía: su borde aurora perdía contra el gris de las celdas normales; ahora la celda de hoy es inconfundible.

### Added
- La app avisa cuando hay APK nueva: toast al arrancar y botón de descarga directa en Perfil → Configuración (compara la versión instalada con la del bundle del servidor).
- Scrollbars en aurora en todas partes, también en móvil (antes salía la barra gris del sistema).

## 0.15.0 - 2026-08-10

### Added
- El plan rotatorio ya se edita del todo: además del orden (flechas), puedes fijar a mano cuál toca hoy tocando la rutina en el editor. El ajuste manual vale hasta que termines cualquier entreno del plan — a partir de ahí la rotación continúa en orden desde el que hiciste.

## 0.14.2 - 2026-08-10

### Added
- La versión de la app es visible en Perfil → Sistema ("berserk vX.Y.Z", con "· app" en el shell Android) — para comprobar de un vistazo que tienes el último despliegue y no un bundle cacheado.

## 0.14.1 - 2026-08-10

### Fixed
- Empezar el entreno sugerido por el plan rotatorio ya no falla cuando la rutina que toca es una plantilla global de otro usuario (o del catálogo antiguo): arrancar acepta cualquier rutina visible, igual que el plan.

### Changed
- Hoy reordenado: "Te toca" va encima de la sesión programada, con la actividad social justo debajo.

## 0.14.0 - 2026-08-10

### Added
- **Plan rotatorio de rutinas**: define tu semana como una lista ordenada de rutinas (4 grupos, 3 + cardio, lo que sea) y la app siempre te dice cuál toca — en Hoy con arranque de un toque, y marcada en la lista del entreno. El orden manda: si una semana no completas el ciclo, la siguiente retoma exactamente donde lo dejaste. El plan se edita en Perfil → Rutinas.

## 0.13.2 - 2026-08-08

### Fixed
- Notificaciones en Android 14+: la app pide el permiso una sola vez al arrancar (y avisa si está denegado), y el aviso sonoro del fin de descanso usa el mecanismo de alarmas del reloj — exento de la restricción de alarmas exactas que hacía que no llegara. Los permisos de notificación y vibración quedan declarados correctamente.

## 0.13.1 - 2026-08-08

### Added
- En la app Android, notificaciones permanentes con cronómetro del sistema (como las del reloj): mientras entrenas, el tiempo de entreno corre en la barra de notificaciones y en la pantalla de bloqueo; durante el descanso, la cuenta atrás visible en vivo — y el aviso sonoro al llegar a cero se mantiene. Icono de barra propio (la runa en monocromo).

## 0.13.0 - 2026-08-08

### Added
- **App Android** (shell Capacitor): un WebView contra tu servidor con la misma sesión — siempre al día sin reinstalar. La APK firmada se adjunta a cada release de GitHub (instalable directa o vía Obtainium). Lo que aporta sobre la PWA: la notificación del fin de descanso suena aunque el móvil esté bloqueado o la app cerrada.

## 0.12.0 - 2026-08-08

### Added
- **Calculadora de discos** en el registro de series de fuerza: peso objetivo → discos por lado, con barra e inventario del gym configurables (persisten en el dispositivo). Si el inventario no llega al peso exacto, lo dice.
- **Notas por ejercicio**: una nota persistente ("asiento en el 5, agarre ancho") visible en la card del entreno cada sesión, editable de un toque.
- **Fotos en los ejercicios**: sube una imagen a cualquier ejercicio editable desde la biblioteca y aparece como miniatura en la biblioteca, en las cards del entreno y en el editor de rutinas.
- **Fotos de progreso** en Progresión → Cuerpo (privadas): sube fotos con fecha, y elige dos para el comparador antes/después.
- **Feed social en Hoy**: actividad de la semana de quienes comparten su registro contigo (qué entrenaron, PRs, volumen) y una comparativa amistosa de racha, entrenos y volumen semanal. Sin nadie compartiendo, la sección no aparece.

## 0.11.8 - 2026-08-08

### Fixed
- Editar una entrada de peso ya no abre un diálogo titulado "Nueva entrada": el sheet se titula "Editar entrada" cuando se llega desde el lápiz de una fila.

### Changed
- En todas las superficies con filtro de grupo y buscador de ejercicios (biblioteca, añadir ejercicio, picker de progresión), el selector de grupo va siempre arriba y la búsqueda debajo.

## 0.11.7 - 2026-08-08

### Added
- Todo lo que se borra sale con animación: la card, fila o entrada se difumina mientras el resto de la lista cierra el hueco deslizándose. Aplica a ejercicios del entreno, series, filas del editor de rutinas, rutinas, ejercicios y grupos de la biblioteca, invitaciones, usuarios de admin, accesos compartidos y entradas de cuerpo.

## 0.11.6 - 2026-08-08

### Changed
- El cajón de "Registrar tiempo" de cardio pierde su botón "Empezar": esa opción ya está en la propia card, junto a "Registrar tiempo". El cajón queda solo para registrar un tiempo ya hecho.

## 0.11.5 - 2026-08-08

### Changed
- Al empezar un cardio ya se elige cuánto tiempo: "Empezar" abre un selector con presets en minutos y ajuste fino, partiendo del objetivo que anuncia el propio botón. El tiempo elegido es el del countdown y el de la serie que se registra sola al terminar. Las duraciones de cardio se leen como reloj (20:00) en toda la tarjeta y en el cajón.
- Quitar un ejercicio que todavía no tiene nada registrado ya no pide confirmación: la X lo borra directa. Si tiene series, el paso de confirmar sigue igual.

## 0.11.4 - 2026-08-08

### Changed
- El final del timer de descanso ya no muestra un ✓: el contador se difumina mientras el cuadrado del CTA se estrecha al tamaño de la runa, y la runa se talla directamente sobre él. Al empezar un descanso la animación es simétrica (el contador crece desde el hueco de la runa).

## 0.11.3 - 2026-08-08

### Fixed
- El encabezado de editar entreno ya no se rompe en móviles estrechos: la flecha de volver y el título comparten fila, y "Guardar como rutina" es un botón a todo el ancho debajo.

## 0.11.2 - 2026-08-08

### Changed
- En la card de un ejercicio de cardio del entreno, "Registrar tiempo" y "Empezar" comparten fila con la X de borrar (acciones a la izquierda, borrar a la derecha), igual que "Añadir serie" en los ejercicios de fuerza.

## 0.11.1 - 2026-08-08

### Added
- Las búsquedas ya no distinguen acentos: "eliptica" encuentra "Elíptica" (y al revés) en la biblioteca, al añadir ejercicio, en el picker de progresión y en los selectores filtrables.

### Changed
- El panel de hora apila sus botones en vertical — Aplicar arriba y Cancelar abajo, a todo el ancho — y el botón Limpiar desaparece.
- En el editor de rutinas, los ejercicios de cardio ya no muestran reps, peso ni descanso (solo series objetivo); al guardar se purgan esos campos de rutinas antiguas.
- En admin, el botón "Generar invitación" pasa a estar debajo de la lista de invitaciones (o del mensaje de vacío).

## 0.11.0 - 2026-08-07

### Added
- Objetivo de peso corporal: card en Progresión → Cuerpo para fijar tu peso objetivo, con saludo de cuánto te queda cada vez que registras un peso (`users.goal_weight_kg`, migración `664da4568810`).
- Grupo muscular **Cardio** (global, runa raidho): primario de todos los ejercicios de cardio y visible en todos los selectores de grupo.
- `GroupFilterSelect`: el filtro por grupo muscular es ahora un componente compartido, presente en la biblioteca, en añadir ejercicio y en el picker de progresión.
- Registrar un entreno pasado desde el calendario permite elegir la hora de inicio (antes se forzaba a las 12:00).

### Changed
- El panel de hora (`BkTimeField`) pierde el botón Cancelar — Escape o tocar fuera ya cancelan — y su pie deja de desbordar por la derecha en móvil.

## 0.10.0 - 2026-08-07

- Rest timer ending feels finished now: the central button holds an aurora check with a full glow for a beat, the cancel X folds away, and the rune carves itself back in — no more abrupt vanish.
- Cardio cards show your last 4 sessions and offer two clean actions: log the time you did, or start the countdown (targeting your last time) that logs itself on completion. The inline form is gone.
- Editing a routine now works exactly like the live workout: exercise cards, superset blocks with their edit sheet, and the same add-exercise search — supersets included via the pair check.
- The add-exercise sheet and the Progress exercise picker carry the library's muscle-group filter and its smarter search (typing "cardio" finds the treadmill anywhere).

## 0.9.5 - 2026-08-07

- The auto-rest toggle now lives in the workout header, under the timer and date, sharing a row with the muscle-group chips.

## 0.9.4 - 2026-08-07

- Cardio blocks are now self-contained: the duration/distance form lives right on the card (no more "Add cardio" button or drawer detour) and cardio never triggers a rest — no rest control, no auto timer.
- The cardio countdown ends with real feedback: 0:00 pulses with a glow and a "Time's up!" caption, holds for a beat, then hands off smoothly — and the PR celebration rune fades in instead of popping.
- Default rest between sets is now 60s (was 90s).
- Exercise library: a search bar and a muscle-group filter over the whole list. Search matches both languages and the measurement type (typing "cardio" finds the treadmill), non-strength rows carry a type chip, and everything sorts by the name you actually see. The add-exercise search in workouts matches the same way.
- The exercise form's redundant "Global" and "Visible to everyone" checkboxes merged into a single visibility select: private, visible to everyone, or global catalog.
- Live workout polish: the muscle-group chips moved into the header under the timer, and each card's remove control is now a delete icon sharing the row with "Add set".

## 0.9.3 - 2026-08-07

- Progress > Workouts: picking an exercise now opens its chart in a drawer (titled with the exercise) instead of rendering it under the list — the tab is just the list, nothing else ever scrolls.

## 0.9.2 - 2026-08-07

- Fixed the "cards repaint in a different shade right after their entrance animation" glitch across every section: the global grain overlay now always sits above the content, animating or not.
- Library polish: the muscle-groups button is full-width ("Ver grupos musculares") and the drawer shows the list and the new-group button directly under its single title, without a nested card.

## 0.9.1 - 2026-08-07

- Supersets: the block header now opens an edit sheet — swap either exercise for another (it takes the same slot and stays linked, with a warning if it had logged sets) or dissolve the group.
- The rest control shows only on the last exercise of a superset: rest belongs to the round, not to every member.

## 0.9.0 - 2026-08-07

- Swipe left or right anywhere to move between sections (Today, Calendar, Workout, Progress, Profile) — horizontal-scrolling areas and the chart keep their own gestures.
- The library is now simply the exercise catalog; muscle groups moved to a sheet behind a button instead of a second row of tabs.
- Pinned tab strips span the full screen width (scrolled cards no longer peek past their edge), the calendar's month selector scrolls with the page again, and Progress > Workouts can no longer overscroll past its chart under any circumstances.

## 0.8.2 - 2026-08-07

- Progress > Workouts no longer scrolls the page at all: the exercise list is the only thing that scrolls, sized to the exact visible space, and picking an exercise unfolds the chart smoothly while the list cedes room gradually.

## 0.8.1 - 2026-08-07

- Progress > Workouts: the exercise list now fills the screen until you pick one — then it shrinks smoothly while the chart block animates in. The pointless "All exercises" option is gone.

## 0.8.0 - 2026-08-07

- Supersets are now created where exercises are added: tick "Superset" in the add-exercise sheet and pick two — they land already linked in their block. The chain buttons between cards are gone; the block header carries the single dissolve control.
- The exercise picker list now takes up most of the screen instead of a short strip.

## 0.7.0 - 2026-08-07

- Supersets can now be created and dissolved inside the live workout: a chain toggle between cards links or splits them (closed chain = linked, in the editor too), works offline, and grouped exercises render inside one aurora-bordered block with a single "Superset A" header.
- The rest timer's cancel is a red X sitting right next to the countdown in the central button — always visible, no tap needed — and dismissing it (or the timer ending) animates the button narrowing while the rune carves itself back in.
- Pinned bars (tabs, month bar, workout chrono) now carry the same subtle grain as the page background instead of reading as a flat different color.

## 0.6.0 - 2026-08-07

- Gym offline: the live workout works without coverage — log, edit and delete sets, add or remove exercises, start from an already-seen routine and finish the workout, all applied instantly on-device and queued for sync. A shell band shows the pending count; when connectivity returns everything replays in order, exactly once (server-side idempotent dedupe), with a toast confirming the sync.
- Today, calendar, routines and every other read fall back to the last thing you saw when there is no network, and the live workout survives reloading the app offline.
- Records are still detected on sync (the celebration stays a live-only event), and destructive flows (discard) deliberately require network.

## 0.5.1 - 2026-08-07

- Your own calendar dots now paint in your user color (aurora stays only for users without a color set); the viewed athlete's color still rules in athlete mode.

## 0.5.0 - 2026-08-07

- Supersets: link exercises into A/B groups in the routine editor; grouped cards show joined in the workout with a "next up" hint, and the automatic rest fires only when the group's round closes — solo exercises rest as always.
- One scroll to rule the app: sections scroll as a normal page again (also on mobile), while tab strips, the calendar month bar and the workout chrono stay pinned on top as you scroll; the desktop scrollbar returns to the window edge.
- Mobile scrollbars are native again (appear while scrolling, fade out); the thin aurora bar stays on desktop pointers only.

## 0.4.4 - 2026-08-07

- Fixed a mobile regression from 0.4.3: every section's content box ended ~128px above the bottom bar (a leftover flow spacer double-counted the navbar reserve once all views got their own internal scroll). All sections now end with a uniform clean margin above the bar.

## 0.4.3 - 2026-08-07

- App-wide scroll model: every section pins its chrome (tab strips, headers) and scrolls its own content internally, ending cleanly above the bottom bar — and section changes always start at the top.
- The central button hosts the whole rest-timer story now: fixed height in every state (no more navbar resize), and while resting on the workout screen a tap expands it to reveal the cancel action.
- Rest seconds accept manual values besides the presets; steppers pin minus and plus to the row edges so x.5 values never shift the buttons.
- Library and admin lists load with skeleton rows instead of jumping; new routines default to Global; day-sheet user chips are uniform and show your own name and color.
- Assorted polish: "New routine" sits below the list, routine cards center their rune and actions, and the redundant auto-rest label is gone.

## 0.4.2 - 2026-08-07

- The day sheet grows per-user tabs: opening a day shows your training and, one tab per sharing user who trained that day, theirs — read-only, with their records of the day.
- Routines simplified to one "Global" check: marked global and everyone can see, use or duplicate it (ownership stays yours); duplicating works on your own routines too, and the admin-only globalize conversion is gone.
- The library splits into Exercises and Muscle groups tabs; ownership chips sit smaller on their own row, and every exercise shows its primary group as a rune-plus-name chip.
- Muscle distribution now lives in Today below the week summary; filtered records drop the redundant kind label; the shared-users legend is just the users, and the rune legend got its info icon back.

## 0.4.1 - 2026-08-07

- Fixed mobile scrolling: content no longer hides behind the bottom navigation bar.
- Your own calendar now shows ambient dots for every user who shares their log with you, each in their color, with a small legend — no need to enter their profile.
- Routines, exercises and muscle groups each render as a single unified list with creator attribution (you, global catalog, or another user), instead of split sections.
- Text buttons are one visual step more compact on phones.

## 0.4.0 - 2026-08-07

- Light theme: a nordic-day palette (pale fog surfaces, WCAG AA-tuned aurora and ember) selectable in Settings as dark, light or system, applied before first paint and re-theming the charts live.
- Athlete view mode now survives reloads: viewing a shared user's calendar keeps their workouts and their color on the dots, exactly where you left off.
- Admins can fully edit users: username, color and admin status from a unified sheet, with password reset kept deliberately separate.
- Validation errors finally speak: invalid passwords are caught inline before submitting, and any remaining validation error names the field instead of "something failed".
- Personal records can be filtered by kind (max weight, volume, estimated 1RM), a past workout can be logged from a routine with its exercises preloaded, and every user renders with their color dot across sharing and admin.
- Desktop chrome: the top bar gained the sliding section indicator, items align to its bottom edge, and the scrollbar lives at the window edge instead of hugging the centered content.
- Public routines referencing private exercises now say so instead of showing blank rows, templates explain themselves, and tab URLs carry anchors that restore the active tab on load.

## 0.3.2 - 2026-08-07

- Your custom exercises can be made visible to everyone: other users see them with attribution and can train with them, while editing stays yours.
- Routine templates: mark a routine as visible to all, copy someone else's template (or an admin's global one) into your own list as a snapshot, and admins can promote a routine to a global template.
- The cardio countdown now survives the phone killing the tab: it resumes where it was on return, and if it finished while you were away the set logs itself with the full duration.
- README screenshots and feature list now reflect the current app.

## 0.3.1 - 2026-08-07

- Retroactive workouts can now record their real start time and duration, and editing a workout's date moves its timestamps along with it — gym-time stats reflect reality.
- Rest timer on your terms: cancel it early from the workout header, or switch off automatic rest entirely (the preference sticks).
- The aurora set signature was refined: streaks stay invisible until fired, turn the top corners at constant speed, and the side trails fade out as the light crosses the top.
- The set drawer's steppers were compacted so weight and reps always sit side by side without overlapping on narrow phones.
- The body-tracking tab gained the unified empty state, and the login screen no longer scrolls.

## 0.3.0 - 2026-08-07

- Workout flow redesigned around compact exercise cards and a bottom logging drawer: new sets prefill from your last effective set, the previous session's sets are shown line by line, "log and another" chains fast consecutive sets, and rest between sets is configurable per exercise (workout → routine → default).
- Muscle groups are now derived automatically from the workout's exercises (with backfill for existing history), a finished workout can be saved as a routine, cardio logs as its own block with a target-duration countdown that auto-logs on completion, and a stretched check rides along each workout.
- Logging a set fires an aurora signature: two light streaks race up the screen edges and meet at the top — personal records still take the ember celebration.
- Calendar: one dot per workout (colored by the viewed athlete's color), planned sessions as hollow dots, today marked by its border, icon actions to delete/skip/replan, a fixed 3×4 annual heatmap with horizontal weeks and flat brightness, "schedule session" deep-links into today's day sheet, and deleting a past workout no longer resurrects a planned session.
- Rest timer takes over the central rune with a live countdown, the button glows while a workout is in progress, and a mobile notification fires when rest ends in the background.
- The full Elder Futhark is available for routines, every rune ships as a reusable SVG asset, and muscle groups carry a dedicated rune with a unified picker in create and edit.
- Library: admins manage global exercises and the predefined catalog, muscle-group tags show everywhere exercises are listed, and creation flows live in drawers.
- Progress: a lifetime stats tab (gym hours, cardio time, distance, volume, longest streak and more) leads the reordered tabs, and the muscle distribution states exactly what it measures.
- Sharing picks users from a directory instead of a guess-the-username field, each user has a color, and empty states are unified with their action button in place.
- A reusable search-list primitive powers exercise picking, confirm/cancel swaps animate, the set drawer is centered with side-by-side steppers, and stray dash placeholders are gone.

## 0.2.0 - 2026-08-06

- Custom form primitives replacing every native picker: a filterable select, a time field, and a mini-calendar date field, all with full keyboard support, ARIA semantics, and a shared layer stack so Escape always closes the topmost surface.
- Retroactive training: log a past workout from the calendar (created already finished on that date) and edit any registered workout — sets, exercises, muscle tags, feeling, note, and the date itself — with personal records dated to the workout's day.
- Calendar day sheet overhaul: one unified card per training with full info (routine, time and duration, exercises, totals, feeling, note), the day's personal records, and scheduling restricted to today-or-future with a minimum time for today.
- Lifetime stats tab in Progress: workouts, gym and cardio hours, distance, volume lifted, sets and reps, PR count, average session length, and the longest weekly streak.
- Admin backup and restore: a consistent SQLite snapshot exported as a zip with an integrity manifest, and a validated, atomic restore that keeps the previous database as a fallback.
- Routine cards now expand to show their exercises inline, with unified icon-only actions across the app (edit, password, delete).
- Motion overhaul: numbers roll in with a count-up, chart lines draw progressively inside a fully mounted frame, the annual heatmap cascades cell by cell in a fixed 3×4 month grid, and section changes animate smoothly in the navigation bar.
- Refined chrome: berserk rune favicon, new navigation runes (Sowilo, Tyr, Dagaz), a stable aurora-styled scrollbar, placeholder-style field labels with a single focus ring, and drawers that animate in and out with proper safe-area padding.

## 0.1.0 - 2026-08-06

- Authentication with server-side sessions, first-admin bootstrap on an empty instance, and single-use invites with public redemption.
- Full training domain: a 59-exercise seeded catalog, custom exercises and muscle groups, routines, and a calendar-to-workout state machine.
- Live PR detection during logging, using an Epley 1RM estimate.
- Progress analytics: streak tracking, a training heatmap, and muscle-group distribution.
- Body tracking (weight and measurements) and read-only sharing of a training log with another user.
- A norse-futurist, token-driven design system (aurora/ember palettes, Chakra Petch display type, pure-CSS entry animations, runic iconography) with CI-enforced token and utility guards.
- Five core views (Today, Calendar, Workout, Progress, Profile) as an installable, bilingual (ES/EN) PWA, with a global rest timer, PR celebration, an athlete view-mode for shared logs, and kg/lb display.
- Hardening and release prep: a non-root container image, SHA-pinned CI workflows, a ghcr.io release workflow, and a README with screenshots and a deployment guide.
