/**
 * MeetRecord AI - Dual Audio Mixer Engine
 * Combines Tab/System Audio with Microphone Audio into a single balanced stream
 * Includes client-side WAV encoding for zero-dependency transcription.
 */

class DualAudioMixer {
  constructor() {
    this.audioContext = null;
    this.systemSource = null;
    this.micSource = null;
    this.systemGain = null;
    this.micGain = null;
    this.destination = null;
    this.analyser = null;
  }

  init() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API no soportado en este navegador.");
    }
    this.audioContext = new AudioContextClass();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    // Gain nodes
    this.systemGain = this.audioContext.createGain();
    this.micGain = this.audioContext.createGain();

    this.systemGain.gain.value = 1.0;
    this.micGain.gain.value = 1.2; // Boost user mic slightly by default

    // Route both gains to destination & analyser
    this.systemGain.connect(this.destination);
    this.systemGain.connect(this.analyser);

    this.micGain.connect(this.destination);
    this.micGain.connect(this.analyser);
  }

  attachSystemStream(stream) {
    if (!this.audioContext) this.init();
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      this.systemSource = this.audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      this.systemSource.connect(this.systemGain);
      return true;
    }
    return false;
  }

  attachMicStream(stream) {
    if (!this.audioContext) this.init();
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      this.micSource = this.audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      this.micSource.connect(this.micGain);
      return true;
    }
    return false;
  }

  setSystemVolume(val) {
    if (this.systemGain) {
      this.systemGain.gain.setTargetAtTime(parseFloat(val), this.audioContext.currentTime, 0.05);
    }
  }

  setMicVolume(val) {
    if (this.micGain) {
      this.micGain.gain.setTargetAtTime(parseFloat(val), this.audioContext.currentTime, 0.05);
    }
  }

  getMixedAudioTrack() {
    if (this.destination && this.destination.stream) {
      const tracks = this.destination.stream.getAudioTracks();
      return tracks.length > 0 ? tracks[0] : null;
    }
    return null;
  }

  getAnalyser() {
    return this.analyser;
  }

  close() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Encodes audio buffer into 16-bit PCM WAV (Mono 16kHz) for Whisper
   */
  static async exportToWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const decodedAudio = await tempCtx.decodeAudioData(arrayBuffer);
    
    // Downmix to mono
    const length = decodedAudio.length;
    const numChannels = decodedAudio.numberOfChannels;
    const monoData = new Float32Array(length);

    for (let c = 0; c < numChannels; c++) {
      const channelData = decodedAudio.getChannelData(c);
      for (let i = 0; i < length; i++) {
        monoData[i] += channelData[i] / numChannels;
      }
    }

    // Convert Float32 to 16-bit PCM WAV
    const wavBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(wavBuffer);

    // Write WAV header
    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true);  // AudioFormat (PCM)
    view.setUint16(22, 1, true);  // NumChannels (Mono = 1)
    view.setUint32(24, 16000, true); // SampleRate (16kHz)
    view.setUint32(28, 16000 * 2, true); // ByteRate
    view.setUint16(32, 2, true);  // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    writeString(view, 36, 'data');
    view.setUint32(40, length * 2, true);

    // PCM samples
    let offset = 44;
    for (let i = 0; i < length; i++) {
      let s = Math.max(-1, Math.min(1, monoData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    tempCtx.close();
    return new Blob([view], { type: 'audio/wav' });
  }
}

window.DualAudioMixer = DualAudioMixer;
