# MeetRecord AI: Grabador & Transcriptor de Google Meet (Sin Permisos de Admin)

Sistema autónomo para grabar videollamadas de Google Meet (o Zoom/Teams) en video de alta calidad y audio dual, sin necesidad de ser el anfitrión o administrador de la reunión. Incluye transcripción mediante Whisper y generación automática de minutas con IA.

---

## 🚀 Inicio Rápido (1 Clic en Windows)

Tienes dos formas de ejecutar la herramienta:

### Opción 1: Modo Inmediato Standalone (Sin instalaciones)
Doble clic en:
👉 `start_standalone.bat`
* Inicia inmediatamente con el motor nativo de Python en `http://localhost:8765`.
* Graba video HD, mezcla audios (Meet + Micrófono), genera ondas visuales y exporta en Video WebM, Audio WAV y subtítulos en vivo.

### Opción 2: Modo Completo con IA Whisper
Doble clic en:
👉 `start.bat`
* Instala automáticamente las librerías (`fastapi`, `uvicorn`, `faster-whisper`).
* Levanta el servidor de transcripción offline de alta precisión y análisis de minutas en `http://localhost:8765`.

---

## 🎙️ ¿Cómo grabar Google Meet sin ser Admin?

1. Abre tu reunión de **Google Meet** en Google Chrome.
2. Abre la app en `http://localhost:8765` y haz clic en **"Iniciar Grabación"**.
3. En la ventana emergente de Chrome:
   - Selecciona la pestaña **"Pestaña de Chrome"** -> Elige la pestaña de **Google Meet**.
   - **¡IMPORTANTE!** Marca la casilla abajo a la izquierda: **"Compartir audio de la pestaña"** *(Share tab audio)*.
4. El sistema mezclará en tiempo real el audio de todos los participantes con tu micrófono personal.
5. Al terminar la reunión, presiona **"Detener"**.
6. Puedes:
   - Descargar el video (`.webm`)
   - Descargar el audio en alta fidelidad (`.wav` 16kHz mono)
   - Transcribir con un clic y descargar el texto (`.txt`), subtítulos (`.srt`) o minuta (`.md`).

---

## 🛠️ Arquitectura Técnica

- **Captura de Pantalla/Pestaña**: API estándar `getDisplayMedia` de HTML5.
- **Captura de Micrófono**: API `getUserMedia`.
- **Mezclador de Audio**: `AudioContext` con nodos `GainNode` independientes para equilibrar la voz de la reunión vs tu propia voz.
- **Visualizador**: Canvas en tiempo real con análisis FFT del espectro de audio.
- **Conversor de Audio**: Codificador nativo JavaScript a 16-bit PCM WAV (16,000 Hz) para compatibilidad directa con modelos Whisper sin depender de FFmpeg en el sistema operativo.
- **Motor STT**: `faster-whisper` (CTranslate2) con cuantización INT8 para rendimiento veloz en CPU.
