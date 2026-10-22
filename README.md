# Agent Orbs

Un observatorio local de sesiones de Claude Code y Codex. Cada terminal abierta es una esfera neuronal de partículas: naranja oscuro para Claude, verde oscuro para Codex. Las sesiones se acomodan suavemente al aparecer y desaparecer.

## Abrir e iniciar

Abrir **http://127.0.0.1:3210** en el navegador.

```sh
cd ~/agent-orbs
npm ci
npm run build
npm run install:hooks
./start.sh
```

Node.js 22.12+ (o 24/26), npm y Linux con `/proc`. `sqlite3` es opcional: permite recuperar títulos automáticos de Codex. Sin él se usan el índice de nombres y la carpeta del proyecto. La app funciona sin Pixel Agents ejecutándose.

Para instalar la unidad de usuario desde un clon situado en `~/agent-orbs`:

```sh
mkdir -p ~/.config/systemd/user
cp agent-orbs.service ~/.config/systemd/user/
systemctl --user daemon-reload
```

El servicio de usuario permite iniciarla sin mantener una terminal abierta:

```sh
systemctl --user start agent-orbs
systemctl --user status agent-orbs
systemctl --user stop agent-orbs
```

No se activa automáticamente al iniciar sesión. Si lo quieres: `systemctl --user enable agent-orbs`.

Para otro puerto: `PORT=3211 ./start.sh`. En systemd, cambiar `Environment=PORT=3210` en la unidad instalada y ejecutar `systemctl --user daemon-reload` y `systemctl --user restart agent-orbs`.

## Qué muestra

- Un orb por terminal principal; los subagentes contribuyen a su actividad.
- Vista principal minimalista: orbes flotando y hora abajo a la izquierda. El botón «···» abre el panel con sesiones, conexión y controles. Seleccionar un orb abre sus datos de solo lectura en ese panel.
- Estados: trabajando, respuesta final, en espera, requiere intervención y detectada (identidad o estado aún desconocidos).
- Una sesión centrada; dos a ambos lados; varias en una constelación con espacio entre los orbes.
- Zoom, reducción de movimiento y modo demo dentro del panel; reconexión automática y alternativa visual si no hay WebGL2.
- **Explorar demo** permite probar 0–20 sesiones y añadir hasta 40, sin abrir agentes ni cambiar sesiones reales. Los datos simulados están señalados.

## Detección y límites

La detección de terminales se actualiza cada 1,5 s. Dos comprobaciones consecutivas sin el proceso eliminan el orb. El estado se obtiene de hooks y lectura incremental de registros locales. Los registros de sesiones identificadas se revisan cada 200 ms, independientemente de la comprobación de procesos. Un daemon por sí solo no cuenta como terminal.

Se distingue cada proceso por PID y tiempo de inicio; cada conversación por proveedor e ID. Dos sesiones en la misma carpeta nunca se vinculan por coincidencia de carpeta. Un proceso sin asociación comprobable aparece como **Sesión detectada**, con su proveedor y carpeta.

**Codex con daemon compartido:** las versiones que ejecutan hooks en el daemon no siempre exponen a qué TUI corresponde cada conversación. En ese caso se conserva el orb provisional, sin atribuirle mensajes de otra sesión. Para permitir la asociación directa al abrir una terminal nueva, se puede usar `codex --no-daemon`; los hooks deben estar activos y puede hacer falta la primera señal de sesión. También se reconocen IDs explícitos al reanudar y archivos JSONL abiertos por el proceso. No se modifican tus opciones globales de Codex ni se desactiva el daemon de sesiones existentes.

Codex puede pedir revisar los hooks nuevos en `/hooks`. La instalación conserva los de Pixel Agents. Si las sesiones ya estaban abiertas, sus procesos aparecen enseguida, aunque para recibir hooks nuevos puede ser necesario reiniciar esa terminal. La falta de señales deja el estado en desconocido, nunca implica que esté trabajando.

La primera versión está dirigida a sesiones interactivas de terminal en esta PC; no a la app de escritorio, sesiones remotas o ejecuciones no interactivas. El tiempo mostrado mide cuánto lleva observada la sesión por este servicio, no su antigüedad histórica. Al reiniciar el servicio vuelve a comenzar ese tiempo; no se guarda historial de conversaciones.

## Datos locales y retirada

Los hooks envían solo ID, tipo de evento, nombre de herramienta y contexto de proceso. No envían argumentos, prompts ni respuestas. El colector lee fragmentos de los registros para metadatos y estado; su contenido no se entrega al navegador.

Estado: `~/.agent-orbs/server.json` contiene el puerto y un token local, con permisos `0600`. Copias anteriores de las configuraciones: `~/.agent-orbs/backups/`, también privadas. No publiques esos archivos.

La instalación añade únicamente sus propios comandos a `~/.claude/settings.json` y `~/.codex/hooks.json`. La retirada quita esos comandos y conserva los demás valores:

```sh
cd ~/agent-orbs
npm run remove:hooks
systemctl --user stop agent-orbs
```

El proyecto y las copias quedan disponibles. La unidad instalada es `~/.config/systemd/user/agent-orbs.service`. No se modifican fuentes, configuración ni ejecución de Pixel Agents.

## Desarrollo y verificación

```sh
npm test
npm run build
npm audit --omit=dev
# Con el servicio iniciado y Chromium instalado:
node scripts/browser-check.mjs
# Desarrollo, con backend iniciado en el puerto 3210:
npm run dev
```

Las pruebas unitarias verifican identidades, cierres, estados, datos parciales, distribución y conservación de hooks. La comprobación de navegador prueba orbes con 1, 2, 3, 4, 8 y 20 sesiones, ficha, teclado, tamaño móvil, alternativa sin WebGL y controles de acceso local.

El renderizado usa WebGL2 con partículas y conexiones animadas en la GPU, sin imágenes externas. Solicita alto rendimiento, comparte geometría y ajusta la densidad según el tamaño de los orbes. La animación utiliza requestAnimationFrame a la frecuencia que permite el navegador y la pantalla, sin un temporizador de FPS. Ajusta y recupera calidad automáticamente, y pausa cuando la pestaña no está visible. El servicio escucha exclusivamente en `127.0.0.1`, sin cuentas ni nube.

Atribución de la integración de referencia en [ATTRIBUTION.md](ATTRIBUTION.md).

## Validación realizada en esta PC

- Compilación de producción y 17 pruebas automatizadas aprobadas, incluida una integración aislada de ambos adaptadores con procesos simulados, hooks reales, SSE, reinicio y cierre abrupto.
- Chromium con WebGL2: orbes de ambos colores y distribuciones de 1, 2, 3, 4, 8 y 20 sesiones; sin orbes superpuestos en la vista de escritorio probada. También se comprobó la vista vacía, ficha, Escape, tamaño móvil y alternativa sin WebGL.
- Reconexión del navegador verificada deteniendo y arrancando el servicio real, sin recargar la página.
- Claude real identificado automáticamente; Codex real identificado al reanudar una sesión con ID explícito. Su estado quedó desconocido al no recibirse actividad comprobable durante esa prueba. La terminal de Codex previamente abierta con daemon compartido permanece provisional.
- Cero vulnerabilidades reportadas por `npm audit --omit=dev` al finalizar la implementación.

Capturas locales de demostración en `test-results/`. Esas imágenes no contienen conversaciones reales. El servicio se dejó iniciado, sin activar el arranque automático.

## Diseño neuronal y animaciones

El diseño seleccionado es el **4 · Enjambre**. Cada orb tiene hasta 12.000 partículas; los pequeños usan menos para mantener la fluidez. Los puntos circulan entre nodos conectados y alrededor de la esfera. Los colores de Claude y Codex se mantienen.

- **En espera / detectada:** flotación más amplia pero tranquila, circulación lenta y luz tenue.
- **Trabajando:** circulación más rápida, conexiones más visibles y nodos más luminosos.
- **Respuesta final:** mayor brillo, expansión del halo de los nodos y movimiento más intenso, con transiciones suaves. Tras la última señal conserva el efecto durante 2,2 s y vuelve al reposo. Una nueva tarea lo interrumpe.

La respuesta final se identifica por `final`/`final_answer` de Codex y por texto de Claude con `stop_reason: end_turn`. No se confunde con comentarios previos a herramientas ni con el pensamiento. El efecto empieza cuando el proveedor escribe esa señal; si solo la publica al completar el texto, se verá al finalizar, sin inventar un estado durante la generación. Las respuestas históricas no activan el efecto al abrir o reiniciar la app.

El panel «···» muestra los FPS medidos y, en modo demo, permite seleccionar **En espera**, **Trabajando** y **Respuesta final**. La vista principal sigue mostrando únicamente los orbes y la hora.

```sh
node scripts/animation-check.mjs
node scripts/benchmark.mjs test-results/particle-performance.json
```

La prueba visual comprueba que trabajo brilla más que reposo y respuesta final más que trabajo, con capturas en `test-results/neural-*.png`. El benchmark mide 180 intervalos de animación con 2 y 20 sesiones a 1440×1000 y registra también el renderizador utilizado. El navegador automatizado de esta PC utiliza SwiftShader (software), por lo que sus resultados no son una medición de la RTX 3070 ni garantizan la frecuencia del monitor. El indicador del panel permite comprobar el resultado en el navegador real.

Comparación local del render anterior y el neuronal, con el mismo Chromium/SwiftShader, viewport y cantidad de sesiones:

| Orbes | Render anterior | Render neuronal |
|---|---:|---:|
| 2 | 33,8 FPS | ~60 FPS |
| 20 | 29,5 FPS | ~60 FPS |

Mediciones de referencia con 180 intervalos por escenario, después de 1 s de estabilización. El modo automatizado medido se sincroniza aproximadamente a 60 Hz; la app no impone ese límite al navegador de escritorio.
