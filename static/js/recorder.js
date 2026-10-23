/**
 * MeetRecord AI - Screen & Dual Audio Recorder Engine
 * Bypasses Google Meet host limitations by capturing local desktop/tab stream directly.
 */

class MeetingRecorder {
  constructor(audioMixer) {
    this.audioMixer = audioMixer;
    this.screenStream = null;
    this.micStream = null;
    this.combinedStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = null;
    this.elapsedTime = 0;
    this.timerInterval = null;

    this.onStateChange = null;
    this.onTimeUpdate = null;
    this.onDataAvailable = null;
    this.onLiveTranscript = null;

    // Optional SpeechRecognition (Chrome Web Speech API)
    this.speechRecognition = null;
    this.isLiveCaptioning = false;
  }

  async start(options = { recordMic: true, liveCaptions: true }) {
    try {
      this.recordedChunks = [];
      this.elapsedTime = 0;

      // 1. Capture Google Meet Tab / Screen + Tab Audio
      // Important: Google Chrome allows sharing tab audio when selecting "Chrome Tab"
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: { ideal: 24, max: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          suppressLocalAudioPlayback: false,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      // Handle user clicking "Stop sharing" on Chrome native banner
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.stop();
      };

      // 2. Capture Microphone (if enabled)
      if (options.recordMic) {
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } catch (micErr) {
          console.warn("[MeetRecord AI] Micrófono no disponible o denegado:", micErr);
          this.micStream = null;
        }
      }

      // 3. Connect streams to Dual Audio Mixer
      this.audioMixer.init();
      const hasSystemAudio = this.audioMixer.attachSystemStream(this.screenStream);
      if (this.micStream) {
        this.audioMixer.attachMicStream(this.micStream);
      }

      // 4. Combine Video Track + Mixed Audio Track
      const mixedAudioTrack = this.audioMixer.getMixedAudioTrack();
      const videoTrack = this.screenStream.getVideoTracks()[0];

      const tracksToRecord = [videoTrack];
      if (mixedAudioTrack) {
        tracksToRecord.push(mixedAudioTrack);
      } else if (this.screenStream.getAudioTracks().length > 0) {
        // Fallback to direct track
        tracksToRecord.push(this.screenStream.getAudioTracks()[0]);
      }

      this.combinedStream = new MediaStream(tracksToRecord);

      // 5. Select Best Supported Codec
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      // Optimized bitrate (1.5 Mbps) for rock-solid stability up to 4+ hours
      this.mediaRecorder = new MediaRecorder(this.combinedStream, {
        mimeType: selectedMime || 'video/webm',
        videoBitsPerSecond: 1500000 
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          if (this.onDataAvailable) this.onDataAvailable(event.data);
        }
      };

      this.mediaRecorder.start(2000); // 2 second slices for low CPU overhead
      this.isRecording = true;
      this.isPaused = false;
      this.startTime = Date.now();
      this.startTimer();

      // 6. Optional: Live In-Browser Transcription (Web Speech API)
      if (options.liveCaptions) {
        this.startLiveSpeechRecognition();
      }

      if (this.onStateChange) this.onStateChange({ status: 'recording', mimeType: selectedMime });
      return this.combinedStream;

    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  pause() {
    if (this.mediaRecorder && this.isRecording && !this.isPaused) {
      this.mediaRecorder.pause();
      this.isPaused = true;
      clearInterval(this.timerInterval);
      if (this.onStateChange) this.onStateChange({ status: 'paused' });
    }
  }

  resume() {
    if (this.mediaRecorder && this.isRecording && this.isPaused) {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.startTime = Date.now() - (this.elapsedTime * 1000);
      this.startTimer();
      if (this.onStateChange) this.onStateChange({ status: 'recording' });
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.isRecording && !this.isPaused) {
        resolve(null);
        return;
      }

      this.isRecording = false;
      this.isPaused = false;
      clearInterval(this.timerInterval);
      this.stopLiveSpeechRecognition();

      // Stop input media tracks immediately to release screen & mic hardware
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(t => t.stop());
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
      }

      this.mediaRecorder.onstop = () => {
        const fullBlob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType });
        this.cleanup();
        if (this.onStateChange) this.onStateChange({ status: 'stopped', blob: fullBlob });
        resolve(fullBlob);
      };

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        this.cleanup();
        resolve(null);
      }
    });
  }

  startTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.formatTime(this.elapsedTime));
      }
    }, 500);
  }

  formatTime(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  startLiveSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'es-ES';

      this.speechRecognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (this.onLiveTranscript) {
          this.onLiveTranscript({ final: finalTranscript, interim: interimTranscript, time: this.elapsedTime });
        }
      };

      this.speechRecognition.onerror = (e) => {
        console.warn("[MeetRecord AI] Speech recognition error:", e.error);
      };

      this.speechRecognition.onend = () => {
        if (this.isRecording && !this.isPaused && this.speechRecognition) {
          try { this.speechRecognition.start(); } catch(e){}
        }
      };

      this.speechRecognition.start();
      this.isLiveCaptioning = true;
    } catch (e) {
      console.warn("[MeetRecord AI] No se pudo inicializar SpeechRecognition:", e);
    }
  }

  stopLiveSpeechRecognition() {
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch (e) {}
      this.speechRecognition = null;
    }
    this.isLiveCaptioning = false;
  }

  cleanup() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach(t => t.stop());
      this.combinedStream = null;
    }
    if (this.audioMixer) {
      this.audioMixer.close();
    }
    clearInterval(this.timerInterval);
  }
}

window.MeetingRecorder = MeetingRecorder;
