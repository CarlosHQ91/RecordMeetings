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
  const playbackReadyBadge = document.getElementById('playbackReadyBadge');
  const recTimer = document.getElementById('recTimer');

  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnTranscribe = document.getElementById('btnTranscribe');
  const btnSummarize = document.getElementById('btnSummarize');
  const btnReset = document.getElementById('btnReset');

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

  // Groq API Settings Elements
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const modalSettings = document.getElementById('modalSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const inputGroqApiKey = document.getElementById('inputGroqApiKey');
  const btnSaveGroqKey = document.getElementById('btnSaveGroqKey');
  const btnRemoveGroqKey = document.getElementById('btnRemoveGroqKey');
  const groqStatusLabel = document.getElementById('groqStatusLabel');

  function syncGroqUI() {
    const savedKey = (localStorage.getItem('meetrecord_groq_api_key') || '').trim();
    if (savedKey) {
      if (btnOpenSettings) btnOpenSettings.classList.add('active');
      if (groqStatusLabel) groqStatusLabel.textContent = 'Groq Cloud (Activo ⚡)';
      if (inputGroqApiKey) inputGroqApiKey.value = savedKey;
    } else {
      if (btnOpenSettings) btnOpenSettings.classList.remove('active');
      if (groqStatusLabel) groqStatusLabel.textContent = 'Groq API (⚡ 1s)';
      if (inputGroqApiKey) inputGroqApiKey.value = '';
    }
  }
  syncGroqUI();

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
      syncGroqUI();
      if (modalSettings) modalSettings.style.display = 'flex';
    });
  }
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      if (modalSettings) modalSettings.style.display = 'none';
    });
  }
  if (modalSettings) {
    modalSettings.addEventListener('click', (e) => {
      if (e.target === modalSettings) modalSettings.style.display = 'none';
    });
  }
  if (btnSaveGroqKey) {
    btnSaveGroqKey.addEventListener('click', () => {
      const key = (inputGroqApiKey.value || '').trim();
      if (!key) {
        showToast("⚠️ Ingresa una clave válida (empieza con gsk_)");
        return;
      }
      localStorage.setItem('meetrecord_groq_api_key', key);
      syncGroqUI();
      if (modalSettings) modalSettings.style.display = 'none';
      showToast("⚡ ¡Groq Cloud activado! Transcripciones en 1-2s.");
      checkBackend();
    });
  }
  if (btnRemoveGroqKey) {
    btnRemoveGroqKey.addEventListener('click', () => {
      localStorage.removeItem('meetrecord_groq_api_key');
      syncGroqUI();
      if (modalSettings) modalSettings.style.display = 'none';
      showToast("ℹ️ Clave Groq borrada.");
      checkBackend();
    });
  }

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

  const isWebHosted = window.location.protocol.startsWith('http') && 
                      !['localhost', '127.0.0.1'].includes(window.location.hostname);
  let backendBaseUrl = isWebHosted ? window.location.origin : 'http://127.0.0.1:8765';

  // Initialize visualizer idle state
  visualizer.start();

  // Multi-port Backend Auto-Discovery
  async function checkBackend() {
    const candidates = isWebHosted 
      ? [window.location.origin] 
      : ['http://127.0.0.1:8765', 'http://localhost:8765', 'http://127.0.0.1:8000', window.location.origin];

    for (const base of candidates) {
      if (!base) continue;
      try {
        const cleanBase = base.replace(/\/+$/, '');
        const res = await fetch(`${cleanBase}/api/system-info`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const info = await res.json();
          backendBaseUrl = cleanBase;
          backendBadge.classList.remove('offline');
          const userKey = (localStorage.getItem('meetrecord_groq_api_key') || '').trim();
          if (info.has_groq || userKey) {
            backendText.textContent = 'Backend Activo (Groq Cloud ⚡)';
            if (groqStatusLabel) groqStatusLabel.textContent = 'Groq Cloud (Activo ⚡)';
          } else {
            backendText.textContent = info.has_whisper 
              ? `Backend Activo (Whisper ${info.active_model})`
              : 'Backend Activo (Falta Faster-Whisper)';
          }
          console.log("[MeetRecord AI] Backend conectado en:", cleanBase);
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
      playbackReadyBadge.style.display = 'none';
      btnReset.style.display = 'none';

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
      if (state.audioBlob) {
        recordedAudioWavBlob = state.audioBlob;
      }
      if (recordedVideoBlob) {
        // Load recorded video paused with controls (NO AUTOPLAY)
        playbackPreview.src = URL.createObjectURL(recordedVideoBlob);
        playbackPreview.style.display = 'block';
        playbackPreview.pause();
        playbackPreview.currentTime = 0;
        playbackReadyBadge.style.display = 'flex';

        btnDownloadVideo.disabled = false;
        btnDownloadAudio.disabled = false;
        btnTranscribe.disabled = false;
        btnReset.style.display = 'inline-flex';

        const audioSizeMb = recordedAudioWavBlob ? (recordedAudioWavBlob.size / (1024 * 1024)).toFixed(1) : '0';
        showToast(`⏹️ Grabación lista (Audio ultra-ligero: ${audioSizeMb} MB). Transcripción ultra-rápida habilitada.`, 5000);
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

  function appendTranscriptSegment(timestamp, text, seconds = 0) {
    const emptyMsg = transcriptArea.querySelector('.transcript-empty');
    if (emptyMsg) emptyMsg.remove();

    const seg = document.createElement('div');
    seg.className = 'segment-item';
    seg.dataset.seconds = seconds;
    seg.innerHTML = `
      <div class="segment-timestamp" title="Clic para reproducir video desde este segundo">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>${timestamp}</span>
      </div>
      <div class="segment-text">${escapeHtml(text)}</div>
    `;

    const tsBtn = seg.querySelector('.segment-timestamp');
    tsBtn.addEventListener('click', () => {
      if (playbackPreview && playbackPreview.src) {
        playbackPreview.currentTime = Math.max(0, seconds - 0.2);
        playbackPreview.play();
        document.querySelectorAll('.segment-item').forEach(el => el.classList.remove('active-seek'));
        seg.classList.add('active-seek');
        showToast(`⏱️ Saltando video a ${timestamp}`);
      } else {
        showToast(`⏱️ Marca de tiempo: ${timestamp}`);
      }
    });

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

  // Reset / Discard & Start New Recording without page reload
  btnReset.addEventListener('click', () => {
    // 1. Reset recorded blobs & data
    recordedVideoBlob = null;
    recordedAudioWavBlob = null;
    currentTranscriptData = null;
    currentSummaryData = null;

    // 2. Reset video elements
    playbackPreview.pause();
    playbackPreview.src = '';
    playbackPreview.style.display = 'none';
    playbackReadyBadge.style.display = 'none';
    liveBadge.style.display = 'none';
    recTimer.style.display = 'none';
    recTimer.textContent = '00:00:00';
    videoPlaceholder.style.display = 'flex';

    // 3. Reset visualizer
    visualizer.stop();

    // 4. Reset action buttons
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    btnTranscribe.disabled = true;
    btnReset.style.display = 'none';

    // 5. Reset download buttons
    btnDownloadVideo.disabled = true;
    btnDownloadAudio.disabled = true;
    btnDownloadTxt.disabled = true;
    btnDownloadSrt.disabled = true;
    btnDownloadMd.disabled = true;
    btnSummarize.disabled = true;

    // 6. Reset transcription, search and chat panels
    if (document.getElementById('searchTranscript')) {
      document.getElementById('searchTranscript').value = '';
    }
    if (document.getElementById('searchResultCount')) {
      document.getElementById('searchResultCount').textContent = '';
    }
    transcriptArea.innerHTML = `
      <div class="transcript-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>La transcripción aparecerá aquí durante o después de la reunión. Haz clic en los timestamps para saltar el video.</span>
      </div>
    `;

    summaryArea.innerHTML = `
      <div class="summary-block" style="text-align: center; color: var(--text-tertiary); padding: 3rem 1rem;">
        <p>Genera la transcripción primero para obtener el resumen ejecutivo y lista de tareas automáticas.</p>
      </div>
    `;

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">💬</div>
          <h4>Pregúntale a la Reunión</h4>
          <p>Pregunta lo que sea sobre la reunión grabada. IA responderá basándose en la transcripción exacta.</p>
          <div class="chat-suggestions">
            <button class="chat-pill" onclick="window.askSuggested && window.askSuggested('¿Cuáles fueron las decisiones más importantes tomadas?')">📌 Decisiones más importantes</button>
            <button class="chat-pill" onclick="window.askSuggested && window.askSuggested('¿Quién tiene tareas o compromisos asignados?')">📋 Tareas y responsables</button>
            <button class="chat-pill" onclick="window.askSuggested && window.askSuggested('¿Se mencionaron fechas límite o plazos acordados?')">📅 Fechas límite y plazos</button>
          </div>
        </div>
      `;
    }

    // Reset tab to transcription
    const tabFirst = document.querySelector('[data-tab="transcription"]');
    if (tabFirst) tabFirst.click();

    showToast("✨ Grabación anterior descartada. Listo para grabar de nuevo.");
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
    const activeGroq = (localStorage.getItem('meetrecord_groq_api_key') || '').trim();
    if (activeGroq) {
      showToast("⚡ Procesando audio con Groq Cloud Whisper (1 a 3 seg)...");
    } else {
      showToast("⚙️ Procesando audio con Whisper... Puede tardar unos segundos.");
    }

    try {
      // Prioritize ultra-compact audio (24kbps Opus, ~10MB/hr) over full 1080p video (1.5GB/hr)
      // This prevents tab memory crashes, bypasses Groq 25MB limits, and uploads in 1-2 seconds
      const fileToSend = recordedAudioWavBlob || recordedVideoBlob;
      const fileName = recordedAudioWavBlob ? 'meeting-audio.webm' : 'meeting-recording.webm';

      const formData = new FormData();
      formData.append('file', fileToSend, fileName);
      formData.append('model_size', 'tiny');
      if (activeGroq) {
        formData.append('api_key', activeGroq);
      }

      const base = backendBaseUrl || (isWebHosted ? window.location.origin : 'http://127.0.0.1:8765');
      const asyncUrl = `${base}/api/transcribe/async`;

      let jobStarted = false;
      let job_id = null;

      try {
        const jobRes = await fetch(asyncUrl, { method: 'POST', body: formData });
        if (jobRes && jobRes.ok) {
          const jobJson = await jobRes.json();
          job_id = jobJson.job_id;
          jobStarted = true;
        }
      } catch (e) {
        console.warn("[MeetRecord AI] Async endpoint no disponible, probando fallback...");
      }

      if (jobStarted && job_id) {
        showToast("⏳ Transcripción iniciada en segundo plano. Procesando...");
        // Poll status
        const pollJob = async () => {
          return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
              try {
                const sRes = await fetch(`${base}/api/transcribe/status/${job_id}`);
                if (!sRes.ok) return;
                const jobData = await sRes.json();

                if (jobData.status === 'processing') {
                  const p = jobData.progress || 0;
                  btnTranscribe.innerHTML = `
                    <span class="dot-indicator"></span> Transcribiendo: ${p}%
                  `;
                  // Stream segments in real time to UI
                  if (jobData.segments && jobData.segments.length > 0) {
                    transcriptArea.innerHTML = '';
                    jobData.segments.forEach(seg => {
                      const m = Math.floor(seg.start / 60).toString().padStart(2, '0');
                      const s = Math.floor(seg.start % 60).toString().padStart(2, '0');
                      appendTranscriptSegment(`[${m}:${s}]`, seg.text, seg.start || 0);
                    });
                  }
                } else if (jobData.status === 'completed') {
                  clearInterval(interval);
                  resolve(jobData);
                } else if (jobData.status === 'error') {
                  clearInterval(interval);
                  reject(new Error(jobData.error || 'Error en transcripción'));
                }
              } catch (err) {}
            }, 1800);
          });
        };

        const result = await pollJob();
        currentTranscriptData = result;

        btnDownloadTxt.disabled = false;
        btnDownloadSrt.disabled = false;
        btnSummarize.disabled = false;
        btnSummarize.click();
        showToast("✨ ¡Transcripción de reunión completada con éxito!");
        return;
      }

      // Synchronous fallback
      let response = null;
      const syncTargets = isWebHosted
        ? [`${base}/api/transcribe`, '/api/transcribe']
        : [`${base}/api/transcribe`, 'http://127.0.0.1:8765/api/transcribe', '/api/transcribe'];

      for (const targetUrl of syncTargets) {
        try {
          response = await fetch(targetUrl, { method: 'POST', body: formData });
          if (response && response.ok) break;
        } catch (netErr) {}
      }

      if (response && response.ok) {
        const result = await response.json();
        currentTranscriptData = result;

        transcriptArea.innerHTML = '';
        if (result.segments && result.segments.length > 0) {
          result.segments.forEach(seg => {
            const m = Math.floor(seg.start / 60).toString().padStart(2, '0');
            const s = Math.floor(seg.start % 60).toString().padStart(2, '0');
            appendTranscriptSegment(`[${m}:${s}]`, seg.text, seg.start || 0);
          });
        } else {
          appendTranscriptSegment('[00:00]', result.text || 'Sin texto detectado.', 0);
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
        const base = backendBaseUrl || (isWebHosted ? window.location.origin : 'http://127.0.0.1:8765');
        const sumUrl = `${base}/api/summarize`;
        const userGroqKey = (localStorage.getItem('meetrecord_groq_api_key') || '').trim();
        const response = await fetch(sumUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: textToSummarize,
            meeting_title: 'Reunión Meet - ' + new Date().toLocaleDateString(),
            api_key: userGroqKey || undefined
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
    if (recordedAudioWavBlob) {
      const isWav = recordedAudioWavBlob.type.includes('wav');
      const ext = isWav ? 'wav' : 'webm';
      downloadBlob(recordedAudioWavBlob, `audio-reunion-${new Date().toISOString().slice(0, 10)}.${ext}`);
      showToast(`💾 Descargando audio (${ext.toUpperCase()})...`);
      return;
    }
    if (recordedVideoBlob) {
      showToast("⏳ Extrayendo pista de audio...");
      try {
        const wav = await DualAudioMixer.exportToWav(recordedVideoBlob);
        if (wav) {
          recordedAudioWavBlob = wav;
          downloadBlob(wav, `audio-reunion-${new Date().toISOString().slice(0, 10)}.wav`);
          showToast("💾 Descargando audio WAV...");
        }
      } catch (e) {
        showToast("❌ Error al extraer audio: " + e.message);
      }
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

  // Search in Transcription
  const searchTranscript = document.getElementById('searchTranscript');
  const searchResultCount = document.getElementById('searchResultCount');

  if (searchTranscript) {
    searchTranscript.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const items = transcriptArea.querySelectorAll('.segment-item');
      if (!items.length) return;

      if (!q) {
        items.forEach(item => {
          item.style.display = 'block';
          const textEl = item.querySelector('.segment-text');
          textEl.innerHTML = escapeHtml(textEl.textContent);
        });
        if (searchResultCount) searchResultCount.textContent = '';
        return;
      }

      let count = 0;
      let firstMatch = null;

      items.forEach(item => {
        const textEl = item.querySelector('.segment-text');
        const raw = textEl.textContent;
        const lower = raw.toLowerCase();
        if (lower.includes(q)) {
          item.style.display = 'block';
          count++;
          if (!firstMatch) firstMatch = item;
          const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          textEl.innerHTML = escapeHtml(raw).replace(regex, '<mark class="highlight-match">$1</mark>');
        } else {
          item.style.display = 'none';
        }
      });

      if (searchResultCount) {
        searchResultCount.textContent = count ? `${count} coincidencia(s)` : 'Sin resultados';
      }
      if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // Interactive Chat Q&A with Meeting
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const btnSendChat = document.getElementById('btnSendChat');

  async function sendChatMessage(query) {
    const q = (query || (chatInput ? chatInput.value : '')).trim();
    if (!q) return;

    let transcriptText = "";
    if (currentTranscriptData && currentTranscriptData.text) {
      transcriptText = currentTranscriptData.text;
    } else {
      const items = transcriptArea.querySelectorAll('.segment-text');
      transcriptText = Array.from(items).map(i => i.textContent).join(' ');
    }

    if (!transcriptText.trim()) {
      showToast("⚠️ Primero genera la transcripción de la reunión.");
      return;
    }

    if (chatInput) chatInput.value = '';

    // Remove welcome card if present
    const welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.style.display = 'none';

    // User message bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user';
    userMsg.innerHTML = `<div class="chat-bubble">${escapeHtml(q)}</div>`;
    chatMessages.appendChild(userMsg);

    // Assistant loading bubble
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'chat-msg assistant';
    assistantMsg.innerHTML = `<div class="chat-bubble">⏳ Consultando reunión con IA...</div>`;
    chatMessages.appendChild(assistantMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const base = backendBaseUrl || (isWebHosted ? window.location.origin : 'http://127.0.0.1:8765');
      const userGroqKey = (localStorage.getItem('meetrecord_groq_api_key') || '').trim();
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          question: q,
          api_key: userGroqKey || undefined
        })
      });

      if (res.ok) {
        const json = await res.json();
        let formatted = escapeHtml(json.answer || '')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n\n/g, '<br><br>')
          .replace(/\n/g, '<br>');
        assistantMsg.querySelector('.chat-bubble').innerHTML = formatted;
      } else {
        assistantMsg.querySelector('.chat-bubble').textContent = "❌ Error al consultar asistente.";
      }
    } catch (err) {
      assistantMsg.querySelector('.chat-bubble').textContent = "⚠️ Error de conexión con el backend.";
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  if (btnSendChat) {
    btnSendChat.addEventListener('click', () => sendChatMessage());
  }
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  window.askSuggested = function(question) {
    const chatTabBtn = document.querySelector('[data-tab="chat"]');
    if (chatTabBtn) chatTabBtn.click();
    sendChatMessage(question);
  };
});
