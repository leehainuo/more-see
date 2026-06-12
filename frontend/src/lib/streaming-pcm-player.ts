export class StreamingPcmPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private outputGain: GainNode | null = null;
  private playbackGeneration = 0;
  private onIdle: (() => void) | null = null;

  async appendChunk(base64Audio: string, sampleRate: number) {
    const context = this.ensureAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const samples = decodePcm16Base64(base64Audio);
    if (samples.length === 0) {
      return;
    }

    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ensureGainNode(context));
    const generation = this.playbackGeneration;

    const startTime = Math.max(context.currentTime + 0.02, this.nextStartTime || 0);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      if (generation !== this.playbackGeneration) {
        return;
      }
      if (this.activeSources.size === 0) {
        this.nextStartTime = context.currentTime;
        this.onIdle?.();
      }
    };
  }

  setOnIdle(callback: (() => void) | null) {
    this.onIdle = callback;
  }

  stop() {
    this.playbackGeneration += 1;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Ignore nodes already stopped by the browser.
      }
    }
    this.activeSources.clear();
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    } else {
      this.nextStartTime = 0;
    }
  }

  setVolume(volume: number) {
    const gain = this.outputGain;
    if (!gain) {
      return;
    }
    gain.gain.value = Math.max(0, Math.min(1, volume));
  }

  dispose() {
    this.stop();
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    this.outputGain = null;
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.nextStartTime = this.audioContext.currentTime;
    }
    return this.audioContext;
  }

  private ensureGainNode(context: AudioContext) {
    if (!this.outputGain) {
      this.outputGain = context.createGain();
      this.outputGain.gain.value = 1;
      this.outputGain.connect(context.destination);
    }
    return this.outputGain;
  }
}

function decodePcm16Base64(base64Audio: string): Float32Array {
  const binary = window.atob(base64Audio);
  const sampleCount = Math.floor(binary.length / 2);
  const samples = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const low = binary.charCodeAt(index * 2);
    const high = binary.charCodeAt(index * 2 + 1);
    let value = (high << 8) | low;
    if (value >= 0x8000) {
      value -= 0x10000;
    }
    samples[index] = value / 32768;
  }

  return samples;
}
