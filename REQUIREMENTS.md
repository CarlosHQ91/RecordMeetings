# REQUIREMENTS & ESPECIFICACIONES TÉCNICAS: MeetRecord AI

> **Objetivo del Proyecto**: Sistema de grabación y transcripción para reuniones de Google Meet (y otras plataformas) sin necesidad de permisos de anfitrión/administrador, con exportación de video, transcripción automática mediante Whisper e informe de minutas/resumen con IA.

---

## 1. Master Prompt del Proyecto (Contexto del Asistente)

```text
Eres MeetRecord AI Engine, un sistema especializado en:
1. Grabar sesiones de videollamada de alta fidelidad capturando stream de pantalla/pestaña y mezclando audio del sistema con el micrófono del usuario sin requerir elevación de privilegios de host en plataformas como Google Meet, Zoom o Teams.
2. Extraer pistas de audio y procesar transcripciones automáticas con marcas de tiempo (timestamps) e identificación de cambios de turno utilizando modelos Whisper.
3. Generar minutas ejecutivas estructuradas: resumen ejecutivo, acuerdos clave, puntos pendientes (action items con responsables sugeridos) y mapa de temas tratados.
```

---

## 2. Requerimientos Funcionales

### RF-01: Grabación sin permisos de Admin
- Captura de video/audio de pestaña o pantalla completa mediante API nativa del navegador (`getDisplayMedia`).
- Captura simultánea del micrófono local (`getUserMedia`).
- Mezclador de audio dual en tiempo real usando `AudioContext` / `ChannelMergerNode`:
  - Entrada 1: Audio de participantes (audio del sistema/pestaña Meet).
  - Entrada 2: Audio de la propia voz del usuario (micrófono local).
- Stream unificado enviado a `MediaRecorder` (codec VP9/Opus o H.264/AAC).

### RF-02: Exportación de Video
- Vista previa en tiempo real durante grabación (timer, estado, visualizador de onda de audio).
- Pausa / Reanudar / Detener grabación.
- Descarga directa en el navegador en formato `.webm` o conversión automática a `.mp4`.
- Gestión de almacenamiento de grabaciones locales.

### RF-03: Motor de Transcripción (Speech-to-Text)
- Extracción de audio (`.wav` 16kHz mono) desde el video grabado.
- Procesamiento con **Faster-Whisper** local (offline, sin costo de API, modelos `tiny`, `base`, `small`, `medium`) y opción de soporte API (Groq / OpenAI Whisper para velocidad instantánea).
- Generación de transcripción con timestamps, exportable a `.srt`, `.vtt`, `.txt` y `.json`.

### RF-04: Análisis Inteligente de Reunión (IA Summary)
- Generación de minuta automática post-transcripción:
  - Resumen en 3 líneas.
  - Decisiones tomadas.
  - Tareas asignadas (Action items).
  - Transcripción sincronizada.

---

## 3. Requerimientos No Funcionales & Restricciones

- **RND-01: Privacidad y Soberanía**: La grabación corre 100% en el equipo del usuario; no pasa por servidores de Google ni bots externos que alerten al host.
- **RND-02: Costo Operativo $0 (Totalmente Gratuito)**: Inferencia de Speech-to-Text ejecutada localmente con **faster-whisper**. Cero suscripciones, cero consumo de tokens de APIs externas, ilimitado y privado.
- **RND-03: Duración de Grabación Ilimitada**: Sin límites arbitrarios de tiempo (1h, 2h, 4h+). Tasa de compresión optimizada (~1.2 - 1.4 GB/hora a 1080p 30fps).
- **RND-04: Rendimiento**: Procesamiento de Whisper optimizado con cuantización INT8 sobre CPU multinúcleo o CUDA si existe GPU.
- **RND-05: UX/UI**: Interfaz gráfica moderna, modo oscuro, controles accesibles, indicador visual de niveles de audio para evitar grabaciones mudas.

---

## 4. Arquitectura del Sistema

```
[ Navegador Web (UI) ]
  ├── 1. getDisplayMedia (Video + Audio Pestaña Meet) ──┐
  ├── 2. getUserMedia (Audio Micrófono Usuario) ───────┼──> AudioContext (Mezclador Dual)
  │                                                    │            │
  ├── 3. MediaRecorder (Stream Combinado) <────────────┴────────────┘
  │       └── Genera Blob WebM / Descarga Video
  │
[ Backend Local (Python / FastAPI) ]
  ├── /api/transcribe: Recibe audio extraído o video
  ├── Motor FFmpeg: Normaliza y remuestrea audio a 16kHz WAV
  ├── Motor Faster-Whisper: Inferencia STT con timestamps
  └── /api/summarize: Minutas estructuradas con LLM
```

---

## 5. Pila Tecnológica Seleccionada

- **Frontend**: HTML5 Semántico + Vanilla JavaScript moderno (Web Audio API, MediaStreams API) + CSS de alta gama (Dark Glassmorphism, animaciones fluidas).
- **Backend API**: Python 3.10+ con **FastAPI** + **Uvicorn**.
- **Motor Multimedia**: **FFmpeg** para conversión, corte y extracción de audio.
- **Motor STT**: **faster-whisper** (CTranslate2, ultra-rápido y bajo consumo de RAM).

---

## 6. Registro de Avance (Changelog de Progreso)

- **[2026-10-23 - 13:48]**:
  - Implementación de interfaz gráfica web con diseño dark glassmorphism (`static/index.html`, `static/css/style.css`).
  - Motor de mezcla de audio dual implementado en `static/js/audio-mixer.js` (AudioContext + Ganancia independiente + Codificador PCM WAV 16kHz nativo sin necesidad de FFmpeg).
  - Motor de captura y grabación de video/pantalla implementado en `static/js/recorder.js` (WebM VP9/Opus con timer y transcripción en vivo).
  - Visualizador de frecuencias y ondas en canvas creado en `static/js/visualizer.js`.
  - Backend API FastAPI con Whisper y extractor de minutas estructuradas implementado en `server.py`.
  - **[2026-10-23 - 14:31]**:
    - Solución de FOUC e iconos SVG gigantes: se montaron rutas explícitas `/css` y `/js` en FastAPI (`server.py`) y se incrustó el CSS de Apple directamente en el `<head>` de `index.html` para evitar cualquier fallo de carga en navegadores.
    - Sincronizado y actualizado en GitHub (`CarlosHQ91/RecordMeetings`).
  - **Estado**: ✅ Servidor activo en `0.0.0.0:8765`, interfaz Apple UI blindada.

---

## 7. Estrategia de Despliegue en Otras PCs

### Método A: Paquete Portable Windows (Recomendado)
1. Copiar o comprimir la carpeta `RecordMeeting/` en un archivo `.zip`.
2. En la otra PC: Descomprimir y hacer doble clic en `setup.bat`.
3. El script:
   - Detecta si Python está instalado; si no, lo instala automáticamente vía `winget`.
   - Instala librerías en silencio.
   - Crea un acceso directo llamado **"MeetRecord AI"** en el Escritorio de Windows.
   - Inicia la aplicación en el navegador.

### Método B: Contenedor Docker (Oficina / Servidor / Red Local)
```bash
docker build -t meetrecord-ai .
docker run -d -p 8765:8765 --name meetrecord meetrecord-ai
```
Acceso desde cualquier equipo de la red en: `http://<IP-DEL-SERVIDOR>:8765`.

### Método C: Ejecutable Nativo (.exe con PyInstaller)
```bash
pip install pyinstaller
pyinstaller --noconfirm --onedir --windowed --add-data "static;static" server.py
```
Produce un ejecutable independiente en la carpeta `dist/server/server.exe`.

---

## 8. Despliegue en la Nube 24/7 (Render / Hugging Face Spaces)

Para tener el sistema activo 24 horas al día con una URL pública HTTPS gratuita y fija:

### Paso 1: Subir código a GitHub
- Repositorio oficial sincronizado: **[github.com/CarlosHQ91/RecordMeetings](https://github.com/CarlosHQ91/RecordMeetings)** (Rama: `main`).

### Paso 2: Desplegar en Render.com (Gratis)
1. Entra a [dashboard.render.com](https://dashboard.render.com) e inicia sesión con GitHub.
2. Haz clic en el botón azul **New +** (arriba a la derecha) y selecciona **Blueprint** (o **Web Service**).
3. Selecciona tu repositorio: `CarlosHQ91/RecordMeetings`.
4. Render detectará automáticamente el archivo `render.yaml` y construirá la imagen Docker.
5. Haz clic en **Apply** (o **Create Web Service**).
6. En 2-3 minutos tendrás tu URL pública HTTPS permanente:
   - Ejemplo: `https://recordmeetings.onrender.com`.

