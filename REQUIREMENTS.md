# REQUIREMENTS & ESPECIFICACIONES TÉCNICAS: MeetRecord AI

> **Objetivo del Proyecto**: Sistema de grabación y transcripción para reuniones de Google Meet (y otras plataformas) sin necesidad de permisos de anfitrión/administrador, con exportación de video, transcripción automática mediante Whisper e informe de minutas/resumen con IA.

---

## 1. Master Prompt del Proyecto (Contexto del Asistente)

```text
Eres MeetRecord AI Engine, un sistema especializado en:
1. Grabar sesiones de videollamada de alta fidelidad capturando stream de pantalla/pestaña y mezclando audio del sistema con el micrófono del usuario sin requerir elevación de privilegios de host en plataformas como Google Meet, Zoom o Teams.
2. Mantener un flujo dual de grabación para reuniones de 2+ horas: video local de alta definición (1080p) + flujo secundario de audio ultra-comprimido (24kbps Opus mono ~10.8 MB/hora) para envíos ultrarrápidos y sin saturación de memoria RAM.
3. Extraer pistas de audio y procesar transcripciones automáticas con marcas de tiempo (timestamps interactivos para saltar video) utilizando Groq Cloud Whisper (whisper-large-v3-turbo, 1-2s) o Faster-Whisper local.
4. Generar minutas ejecutivas estructuradas: resumen ejecutivo, acuerdos clave, puntos pendientes (action items con checkboxes) y mapa de temas tratados.
5. Ofrecer asistente interactivo Q&A ("Pregúntale a la Reunión") para responder preguntas en lenguaje natural sobre los acuerdos de la llamada.
```

---

## 2. Requerimientos Funcionales

### RF-01: Grabación sin permisos de Admin & Dual Stream Engine
- Captura de video/audio de pestaña o pantalla completa mediante API nativa del navegador (`getDisplayMedia`).
- Captura simultánea del micrófono local (`getUserMedia`).
- Mezclador de audio dual en tiempo real usando `AudioContext` / `ChannelMergerNode`:
  - Entrada 1: Audio de participantes (audio del sistema/pestaña Meet).
  - Entrada 2: Audio de la propia voz del usuario (micrófono local).
- **Dual Recording Concurrent Stream**:
  - **Canal 1 (Video + Audio)**: 1080p a 1.5 Mbps (`video/webm`) para previsualización instantánea y descarga íntegra local.
  - **Canal 2 (Pista Audio Ultra-Ligera)**: 24 kbps Opus mono (`audio/webm;codecs=opus`). Permite sesiones de 2 a 4 horas ocupando sólo ~21 MB a ~43 MB de payload.

### RF-02: Exportación y Reproducción de Medios
- Vista previa en tiempo real durante grabación (timer, estado, visualizador de onda de audio).
- Pausa / Reanudar / Detener grabación sincronizada entre ambos grabadores.
- Descarga directa en el navegador de video WebM y pista de audio compacta o WAV 16kHz.
- Botón de **Nueva Grabación** para descartar y reiniciar sin recargar la página.

### RF-03: Motor de Transcripción (Speech-to-Text)
- Priorización automática de **Groq Cloud Whisper API** (`whisper-large-v3-turbo`) cuando se proporciona API key: transcripción en 1 a 3 segundos con 0 MB de consumo de RAM.
- Motor de contingencia local con **Faster-Whisper** (`tiny` por defecto para servidores con 512MB RAM como Render Free Tier).
- **Compresión y Chunker FFmpeg Inteligente en Backend**: Si un archivo supera 20MB, se comprime automáticamente a MP3 24kbps mono. Si supera 24MB (>3 horas), se divide en fragmentos de 20 minutos (`chunk_%03d.mp3`), se transcriben individualmente y se reconstruye la transcripción unificada con offsets continuos.
- Renderizado interactivo con timestamps clicables `[MM:SS]` que saltan el video al segundo exacto.
- Buscador reactivo en tiempo real con resaltado de términos coincidentes.
- Exportación a `.srt`, `.txt` y `.md`.

### RF-04: Análisis Inteligente de Reunión (IA Summary)
- Generación de minuta ejecutiva automática post-transcripción:
  - Resumen ejecutivo consolidado.
  - Compromisos y tareas clave (*Action Items*) con casillas de verificación interactivas (`checkboxes`).
  - Lista de temas tratados y desglose analítico.
- Soporte para **Groq Cloud LLM** (modelos dinámicos descubiertos automáticamente como `llama-3.3-70b-versatile`) con fallback heurístico en cliente si no hay conexión externa.

### RF-05: Chat Interactivo "Pregúntale a la Reunión"
- Pestaña interactiva de preguntas y respuestas impulsada por IA.
- Permite hacer preguntas libres sobre la reunión (decisiones, tareas, plazos, responsables).
- Sugerencias rápidas tipo "pill" para consultas frecuentes con un solo clic.

---

## 3. Requerimientos No Funcionales & Restricciones

- **RND-01: Privacidad y Soberanía**: La captura corre en el equipo del usuario sin alertar a los administradores ni depender de bots invitados.
- **RND-02: Escalabilidad en la Nube (Render Free Tier 512MB RAM)**: 
  - La API de Groq Cloud elimina por completo el uso de CPU/RAM intensivo en el servidor Render.
  - Modelo local offline fijado en `tiny` (int8) para evitar caídas por OOM (Out Of Memory).
- **RND-03: Soporte de Reuniones Extensas (2 a 4+ Horas)**:
  - Al transmitir la pista de audio de 24 kbps en lugar del video completo (1.5 GB), el navegador no experimenta agotamiento de memoria RAM ni congelamientos de pestaña.
  - Cumplimiento garantizado del límite de 25 MB por archivo de la API de transcripción.
- **RND-04: Eliminación de Caché Fantasma**: Headers HTTP `no-cache`, `no-store`, `must-revalidate` y query versioning (`?v=4.0`).
- **RND-05: Estética Cupertino Light UI**: Interfaz limpia inspirada en Apple con tipografía Outfit, paleta de colores HSL, micro-animaciones y badges de estado.

---

## 4. Arquitectura del Sistema

```
[ Navegador Web (UI v4.0) ]
  ├── 1. getDisplayMedia (Video 1080p + Audio Pestaña Meet) ──┐
  ├── 2. getUserMedia (Micrófono Local) ─────────────────────┼──> DualAudioMixer (AudioContext)
  │                                                           │            │
  ├── 3. MediaRecorder Principal (Video 1080p 1.5Mbps) <──────┴────────────┤
  │       └── Descarga local / Reproductor interactivo                     │
  │                                                                        ▼
  ├── 4. AudioRecorder Secundario (Opus 24kbps mono ~10.8MB/h) <───────────┘
  │       └── Envío directo al transcriptor (sin saturar RAM de la pestaña)
  │
[ Backend FastAPI (server.py) ]
  ├── /api/transcribe/async & /api/transcribe:
  │     ├── prepare_audio_for_groq(): FFmpeg mono 24kbps + split en chunks si >24MB
  │     ├── Groq Cloud Whisper API (whisper-large-v3-turbo) [1-2 seg]
  │     └── Faster-Whisper local fallback (tiny int8)
  ├── /api/summarize: Minutas y tareas con Llama-3.3-70b
  └── /api/chat: Q&A contextual sobre la transcripción
```

---

## 5. Pila Tecnológica Seleccionada

- **Frontend**: HTML5 Semántico + Vanilla JavaScript moderno (Web Audio API, MediaStreams API, AudioNodes) + CSS Vanilla Cupertino Design System.
- **Backend API**: Python 3.10+ con **FastAPI** + **Uvicorn**.
- **Motor Multimedia**: **FFmpeg** (compresión 24kbps, segmentación temporal).
- **Inferencia STT**: **Groq Cloud Whisper API** (`whisper-large-v3-turbo`) y **faster-whisper** (CTranslate2).
- **Inferencia LLM**: Groq Cloud (`llama-3.3-70b-versatile` / descubrimiento dinámico).

---

## 6. Registro de Avance (Changelog de Progreso)

- **[2026-10-23]**:
  - Creación del proyecto base: mezclador de audio dual, captura de pantalla y servidor FastAPI con Whisper offline.
- **[2026-10-24]**:
  - **Optimización para reuniones de 2+ horas**: Implementado motor de grabación dual (video 1080p para el usuario + flujo ultra-comprimido Opus 24kbps para transcripción rápida).
  - **Backend FFmpeg Chunker**: Segmentación automática de grabaciones de más de 3 horas para cumplir con el límite de 25 MB de Groq.
  - **Groq Cloud Integration**: Soporte para `whisper-large-v3-turbo` (transcripción en 1-2s) y chat con descubrimiento dinámico de modelos (`/v1/models`).
  - **Pestaña "Pregúntale a la Reunión"**: Chat interactivo con la transcripción de la llamada.
  - **Buscador interactivo & Timestamps**: Búsqueda reactiva de palabras con resaltado y saltos automáticos en el video grabado.
  - **Fix de Renderizado & Auto-Rehidratación**: Inyección garantizada de transcripciones en el DOM (`renderTranscription`), fallback parser y auto-recarga al hacer clic en pestañas.
  - **Versión 4.0 activa**: Headers `no-cache`, `no-store` y cache busting en producción en Render.

---

## 7. Despliegue en la Nube 24/7 (Render)

- **Repositorio Oficial**: [github.com/CarlosHQ91/RecordMeetings](https://github.com/CarlosHQ91/RecordMeetings) (Rama: `main`).
- **Instancia Pública**: `https://recordmeetings.onrender.com`
- **Configuración Groq**: Para activar velocidad instantánea (1-2s), introduce tu API Key gratuita de [console.groq.com/keys](https://console.groq.com/keys) mediante el botón **⚡ Groq API** en la cabecera. La clave se guarda de forma segura en el `localStorage` de tu navegador.

