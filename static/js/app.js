/**
 * MeetRecord AI - Main Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Instances
  const audioMixer = new DualAudioMixer();
  const visualizer = new AudioWaveVisualizer(document.getElementById('audioWaveCanvas'));
  const recorder = new MeetingRecorder(audioMixer);

  // DOM Elements
  const livePreview = document.getElementById('livePreview');
  const playbackPreview = document.getElementById('playbackPreview');
  const videoPlaceholder = document.getElementById('videoPlaceholder');
  const liveBadge = document.getElementById('liveBadge');
  const recTimer = document.getElementById('recTimer');

  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnTranscribe = document.getElementById('btnTranscribe');
  const btnSummarize = document.getElementById('btnSummarize');

  const systemVolume = document.getElementById('systemVolume');
  const micVolume = document.getElementById('micVolume');
  const systemVolLabel = document.getElementById('systemVolLabel');
  const micVolLabel = document.getElementById('micVolLabel');
  const chkRecordMic = document.getElementById('chkRecordMic');

  const transcriptArea = document.getElementById('transcriptArea');
  const summaryArea = document.getElementById('summaryArea');
  const backendBadge = document.getElementById('backendBadge');
  const backendText = document.getElementById('backendText');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Exports
  const btnDownloadVideo = document.getElementById('btnDownloadVideo');
  const btnDownloadAudio = document.getElementById('btnDownloadAudio');
  const btnDownloadTxt = document.getElementById('btnDownloadTxt');
  const btnDownloadSrt = document.getElementById('btnDownloadSrt');
  const btnDownloadMd = document.getElementById('btnDownloadMd');

  // File Upload
  const fileUploadInput = document.getElementById('fileUploadInput');
  const btnTriggerUpload = document.getElementById('btnTriggerUpload');

  // State
  let recordedVideoBlob = null;
  let recordedAudioWavBlob = null;
  let currentTranscriptData = null;
  let currentSummaryData = null;
  let backendBaseUrl = '';

  // Initialize visualizer idle state
  visualizer.start();

  // Multi-port Backend Auto-Discovery
  async function checkBackend() {
    const candidates = [
      '',
      'http://127.0.0.1:8765',
      'http://localhost:8765',
      'http://127.0.0.1:8000',
      'http://localhost:8000'
    ];

    for (const base of candidates) {
      try {
        const url = base ? `${base}/api/system-info` : '/api/system-info';
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const info = await res.json();
          backendBaseUrl = base;
          backendBadge.classList.remove('offline');
          backendText.textContent = info.has_whisper 
            ? `Backend Activo (Whisper ${info.active_model})`
            : 'Backend Activo (Falta Faster-Whisper)';
          console.log("[MeetRecord AI] Backend conectado en:", base || 'mismo origen');
          return;
        }
      } catch (e) {
        // Intentar siguiente puerto
      }
    }

    backendBadge.classList.add('offline');
    backendText.textContent = 'Modo Local Offline';
  }
  checkBackend();
  // Re-check periodically every 10s in case user starts server later
  setInterval(checkBackend, 10000);

  // Toast Helper
  function showToast(msg, duration = 3500) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  // Volume Controls
  systemVolume.addEventListener('input', (e) => {
    const val = e.target.value;
    systemVolLabel.textContent = `${Math.round(val * 100)}%`;
    audioMixer.setSystemVolume(val);
  });

  micVolume.addEventListener('input', (e) => {
    const val = e.target.value;
    micVolLabel.textContent = `${Math.round(val * 100)}%`;
    audioMixer.setMicVolume(val);
  });

  // Recorder Event Handlers
  recorder.onStateChange = (state) => {
    if (state.status === 'recording') {
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        Pausar
      `;
      btnStop.disabled = false;
      liveBadge.style.display = 'flex';
      recTimer.style.display = 'block';
      videoPlaceholder.style.display = 'none';
      playbackPreview.style.display = 'none';
      livePreview.style.display = 'block';

      showToast("🔴 Grabando reunión. Habla y comparte pestañas con audio.");
    } else if (state.status === 'paused') {
      btnPause.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Reanudar
      `;
      showToast("⏸️ Grabación en pausa.");
    } else if (state.status === 'stopped') {
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      liveBadge.style.display = 'none';
      recTimer.style.display = 'none';

      // Disconnect and pause live stream preview completely
      try {
        livePreview.pause();
        livePreview.srcObject = null;
      } catch (e) {}
      livePreview.style.display = 'none';

      recordedVideoBlob = state.blob;
      if (recordedVideoBlob) {
        // Load recorded video paused with controls (NO AUTOPLAY)
        playbackPreview.src = URL.createObjectURL(recordedVideoBlob);
        playbackPreview.style.display = 'block';
        playbackPreview.pause();
        playbackPreview.currentTime = 0;

        btnDownloadVideo.disabled = false;
        btnDownloadAudio.disabled = false;
        btnTranscribe.disabled = false;

        showToast("⏹️ Grabación detenida y guardada. El video NO sigue grabando.", 4500);
      }
    }
  };

  recorder.onTimeUpdate = (formattedTime) => {
    recTimer.textContent = formattedTime;
  };

  recorder.onLiveTranscript = (data) => {
    if (data.final) {
      appendTranscriptSegment(`[${recorder.formatTime(data.time)}]`, data.final);
    }
  };

  function appendTranscriptSegment(timestamp, text) {
    const emptyMsg = transcriptArea.querySelector('.transcript-empty');
    if (emptyMsg) emptyMsg.remove();

    const seg = document.createElement('div');
    seg.className = 'segment-item';
    seg.innerHTML = `
      <div class="segment-timestamp">${timestamp}</div>
      <div class="segment-text">${escapeHtml(text)}</div>
    `;
    transcriptArea.appendChild(seg);
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Button Actions
  btnStart.addEventListener('click', async () => {
    try {
      const stream = await recorder.start({
        recordMic: chkRecordMic.checked,
        liveCaptions: true
      });
      livePreview.srcObject = stream;
      visualizer.attachAnalyser(audioMixer.getAnalyser());
    } catch (err) {
      console.error(err);
      if (err.name !== 'NotAllowedError') {
        showToast("❌ Error al capturar: " + err.message);
      }
    }
  });

  btnPause.addEventListener('click', () => {
    if (recorder.isPaused) {
      recorder.resume();
    } else {
      recorder.pause();
    }
  });

  btnStop.addEventListener('click', async () => {
    await recorder.stop();
    visualizer.stop();
  });

  // Transcription Flow
  btnTranscribe.addEventListener('click', async () => {
    if (!recordedVideoBlob) {
      showToast("⚠️ No hay grabación disponible.");
      return;
    }

    btnTranscribe.disabled = true;
    btnTranscribe.innerHTML = `
      <svg class="dot-indicator" viewBox="0 0 24 24" fill="currentColor"></svg>
      Extrayendo & Transcribiendo...
    `;
    showToast("⚙️ Procesando audio con Whisper... Puede tardar unos segundos.");

    try {
      // 1. Convert audio to 16kHz WAV in-browser
      if (!recordedAudioWavBlob) {
        recordedAudioWavBlob = await DualAudioMixer.exportToWav(recordedVideoBlob);
      }

      // 2. Try sending to backend Whisper
      const formData = new FormData();
      formData.append('file', recordedAudioWavBlob, 'meeting-audio.wav');
      formData.append('model_size', 'base');

      let response = null;
      const targets = [
        (backendBaseUrl ? `${backendBaseUrl}/api/transcribe` : ''),
        'http://127.0.0.1:8765/api/transcribe',
        'http://localhost:8765/api/transcribe',
        '/api/transcribe'
      ].filter(Boolean);

      for (const targetUrl of targets) {
        try {
          response = await fetch(targetUrl, {
            method: 'POST',
            body: formData
          });
          if (response && response.ok) break;
        } catch (netErr) {
          // continuar con siguiente endpoint
        }
      }

      if (response && response.ok) {
        const result = await response.json();
        currentTranscriptData = result;

        // Render transcript
        transcriptArea.innerHTML = '';
        if (result.segments && result.segments.length > 0) {
          result.segments.forEach(seg => {
            const m = Math.floor(seg.start / 60).toString().padStart(2, '0');
            const s = Math.floor(seg.start % 60).toString().padStart(2, '0');
            appendTranscriptSegment(`[${m}:${s}]`, seg.text);
          });
        } else {
          appendTranscriptSegment('[00:00]', result.text || 'Sin texto detectado.');
        }

        btnDownloadTxt.disabled = false;
        btnDownloadSrt.disabled = false;
        btnSummarize.disabled = false;

        btnSummarize.click();
        showToast("✨ ¡Transcripción completada con Whisper!");
        return;
      }

      // FALLBACK: Backend offline o error 404/501 (ej. python -m http.server)
      // Check if we captured live speech captions during the meeting
      const capturedItems = Array.from(transcriptArea.querySelectorAll('.segment-item'));
      if (capturedItems.length > 0) {
        const fullText = capturedItems.map(item => item.querySelector('.segment-text').textContent).join(' ');
        currentTranscriptData = { text: fullText, segments: [] };
        btnDownloadTxt.disabled = false;
        btnSummarize.disabled = false;
        btnSummarize.click();
        showToast("⚠️ Backend Whisper no activo. Se usó transcripción en vivo del navegador.", 5000);
      } else {
        showToast("⚠️ Backend offline. Para Whisper: ejecuta 'python server.py' en la terminal.", 6000);
      }

    } catch (err) {
      console.error(err);
      showToast("❌ " + err.message);
    } finally {
      btnTranscribe.disabled = false;
      btnTranscribe.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
        Transcribir con Whisper
      `;
    }
  });

  // Summarize Flow
  btnSummarize.addEventListener('click', async () => {
    let textToSummarize = "";
    if (currentTranscriptData && currentTranscriptData.text) {
      textToSummarize = currentTranscriptData.text;
    } else {
      const items = transcriptArea.querySelectorAll('.segment-text');
      textToSummarize = Array.from(items).map(i => i.textContent).join(' ');
    }

    if (!textToSummarize.trim()) {
      showToast("⚠️ Se requiere transcripción antes de resumir.");
      return;
    }

    btnSummarize.disabled = true;
    showToast("🧠 Generando minuta ejecutiva y puntos de acción...");

    try {
      let data = null;
      try {
        const sumUrl = (backendBaseUrl || 'http://127.0.0.1:8765') + '/api/summarize';
        const response = await fetch(sumUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: textToSummarize,
            meeting_title: 'Reunión Meet - ' + new Date().toLocaleDateString()
          })
        });
        if (response && response.ok) {
          data = await response.json();
        }
      } catch (e) {
        console.warn("[MeetRecord AI] Backend /api/summarize offline, usando motor local.");
      }

      // Client-side heuristic summarizer fallback
      if (!data) {
        const sentences = textToSummarize.replace(/\n/g, ". ").split(". ").map(s => s.trim()).filter(s => s.length > 8);
        const actionKeywords = ["acuerdo", "tarea", "hacer", "pendiente", "compromiso", "enviar", "revisar", "asignar", "fecha", "proximo", "próximo", "debe", "responsable", "queda"];
        const actionItems = [];
        const keyPoints = [];
        for (const s of sentences) {
          const low = s.toLowerCase();
          if (actionKeywords.some(kw => low.includes(kw))) {
            actionItems.push(s);
          } else if (keyPoints.length < 5) {
            keyPoints.push(s);
          }
        }
        data = {
          title: 'Reunión Meet - ' + new Date().toLocaleDateString(),
          summary: sentences.slice(0, 4).join(". ") || textToSummarize.slice(0, 300),
          keyPoints: keyPoints.length > 0 ? keyPoints : ["Grabación de reunión completada con éxito."],
          action_items: actionItems.length > 0 ? actionItems : [
            "Revisar la grabación para verificar acuerdos específicos.",
            "Agendar sesión de seguimiento con el equipo."
          ],
          word_count: textToSummarize.split(/\s+/).length
        };
      }

      currentSummaryData = data;

      // Render summary tab
      summaryArea.innerHTML = `
        <div class="summary-block">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Resumen Ejecutivo
          </h3>
          <p>${escapeHtml(data.summary)}</p>
        </div>

        <div class="summary-block">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Compromisos & Tareas Clave (Action Items)
          </h3>
          <ul class="action-item-list">
            ${data.action_items.map(item => `
              <li>
                <input type="checkbox" class="action-checkbox" />
                <span>${escapeHtml(item)}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        <div class="summary-block">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            Puntos Tratados (${data.word_count} palabras analizadas)
          </h3>
          <ul class="action-item-list">
            ${data.key_points.map(pt => `<li>• ${escapeHtml(pt)}</li>`).join('')}
          </ul>
        </div>
      `;

      btnDownloadMd.disabled = false;
      // Switch tab to summary
      document.querySelector('[data-tab="summary"]').click();
      showToast("🎉 ¡Minuta y tareas generadas!");

    } catch (err) {
      console.error(err);
      showToast("❌ Error al resumir: " + err.message);
    } finally {
      btnSummarize.disabled = false;
    }
  });

  // Downloads Helpers
  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  btnDownloadVideo.addEventListener('click', () => {
    if (recordedVideoBlob) {
      const name = `reunion-${new Date().toISOString().slice(0, 10)}.webm`;
      downloadBlob(recordedVideoBlob, name);
      showToast("💾 Descargando video WebM...");
    }
  });

  btnDownloadAudio.addEventListener('click', async () => {
    if (!recordedAudioWavBlob && recordedVideoBlob) {
      showToast("⏳ Extrayendo audio en alta definición...");
      recordedAudioWavBlob = await DualAudioMixer.exportToWav(recordedVideoBlob);
    }
    if (recordedAudioWavBlob) {
      downloadBlob(recordedAudioWavBlob, `audio-reunion-${new Date().toISOString().slice(0, 10)}.wav`);
      showToast("💾 Descargando audio WAV 16kHz...");
    }
  });

  btnDownloadTxt.addEventListener('click', () => {
    if (currentTranscriptData) {
      const blob = new Blob([currentTranscriptData.text], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `transcripcion-${new Date().toISOString().slice(0, 10)}.txt`);
    }
  });

  btnDownloadSrt.addEventListener('click', () => {
    if (currentTranscriptData && currentTranscriptData.segments) {
      let srtContent = "";
      currentTranscriptData.segments.forEach((seg, idx) => {
        const formatSrtTime = (seconds) => {
          const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
          const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
          const s = Math.floor(seconds % 60).toString().padStart(2, '0');
          const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
          return `${h}:${m}:${s},${ms}`;
        };
        srtContent += `${idx + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}\n\n`;
      });
      const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `subtitulos-${new Date().toISOString().slice(0, 10)}.srt`);
    }
  });

  btnDownloadMd.addEventListener('click', () => {
    if (currentSummaryData) {
      const mdContent = `# Minuta de Reunión: ${currentSummaryData.title}\n\n` +
        `**Fecha:** ${new Date().toLocaleDateString()}\n\n` +
        `## Resumen Ejecutivo\n${currentSummaryData.summary}\n\n` +
        `## Tareas y Compromisos\n` +
        currentSummaryData.action_items.map(i => `- [ ] ${i}`).join('\n') +
        `\n\n## Puntos Tratados\n` +
        currentSummaryData.key_points.map(p => `- ${p}`).join('\n');

      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, `minuta-${new Date().toISOString().slice(0, 10)}.md`);
    }
  });

  // Tabs Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Direct Audio/Video File Upload for Transcription
  btnTriggerUpload.addEventListener('click', () => fileUploadInput.click());
  fileUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast(`📂 Archivo cargado: ${file.name}. Listo para transcribir.`);
    recordedVideoBlob = file;
    recordedAudioWavBlob = null;
    btnTranscribe.disabled = false;
    btnDownloadVideo.disabled = false;
  });
});
