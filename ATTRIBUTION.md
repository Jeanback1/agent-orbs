# Atribución

Agent Orbs utiliza como referencia la integración local de Claude Code y Codex de Pixel Agents, en la copia modificada por Jean en `~/pixel-agents-custom`.

La inspección de procesos Linux en `server/processes.mjs` adapta el método de `server/src/terminal/localProcesses.ts` y `nativeTerminalFocus.ts` de Pixel Agents. La detección de metadatos y los adaptadores de eventos se basan en los formatos observados en esa integración, con implementación independiente.

Pixel Agents: Copyright (c) 2026 Pablo De Lucca, licencia MIT. Texto completo en `LICENSE.pixel-agents`.

La interfaz, distribución, shaders procedurales y servicio de Agent Orbs son propios de esta aplicación. No se incluyen sprites ni recursos gráficos de Pixel Agents.
