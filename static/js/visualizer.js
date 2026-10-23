/**
 * MeetRecord AI - Real-time Audio Wave & Spectrum Visualizer
 */

class AudioWaveVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.analyser = null;
    this.animationId = null;
    this.dataArray = null;
  }

  attachAnalyser(analyser) {
    this.analyser = analyser;
    const bufferLength = analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    this.start();
  }

  start() {
    if (this.animationId) cancelAnimationFrame(this.animationId);

    const render = () => {
      this.animationId = requestAnimationFrame(render);
      if (!this.analyser) {
        this.drawIdle();
        return;
      }

      this.analyser.getByteFrequencyData(this.dataArray);
      
      const width = this.canvas.width;
      const height = this.canvas.height;
      this.ctx.clearRect(0, 0, width, height);

      // Gradient background subtle glow
      const barCount = 48;
      const barWidth = (width / barCount) - 3;
      let x = 2;

      for (let i = 0; i < barCount; i++) {
        const index = Math.floor((i / barCount) * (this.dataArray.length * 0.75));
        const val = this.dataArray[index] || 0;
        const percent = val / 255;
        const barHeight = Math.max(4, percent * (height - 6));

        // Create gradient from indigo to cyan
        const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.7, '#06b6d4');
        gradient.addColorStop(1, '#38bdf8');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.roundRect(x, height - barHeight, barWidth, barHeight, 3);
        this.ctx.fill();

        x += barWidth + 3;
      }
    };

    render();
  }

  drawIdle() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, height / 2);
    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.analyser = null;
    this.drawIdle();
  }
}

window.AudioWaveVisualizer = AudioWaveVisualizer;
