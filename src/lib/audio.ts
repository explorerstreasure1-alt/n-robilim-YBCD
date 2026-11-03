export type OutputMode = "binaural" | "speaker";
export type SessionPhase = "prep" | "sub";

/**
 * NOCTA sinyal motoru.
 *
 * Zincir:  taşıyıcı katmanı ─┐
 *          okunuş katmanı  ─┴→ dry + konvolüsyon yankı + filtreli delay
 *                            → limiter → master → analyser → çıkış
 *
 * - Hoparlör modunda taşıyıcı, genlik modülasyonu (monaural beat) + hafif
 *   detune/stereo genişletme ile verilir; seviye kompanzasyonu uygulanır,
 *   böylece dizüstü hoparlöründen de net duyulur.
 * - Okunuşlar gerçek ses dosyası olarak çalınır; aynı yankı zincirinden geçer.
 * - Osilatörler bir kez kurulur, seansta yalnız gain zarfları değişir; bu
 *   sayede durdur/başlat yarışları ve sessiz kalma sorunu oluşmaz.
 */

interface Nodes {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  analyser: AnalyserNode;
  mix: GainNode;
  dry: GainNode;
  convolver: ConvolverNode;
  reverbReturn: GainNode;
  delay: DelayNode;
  delayTone: BiquadFilterNode;
  feedback: GainNode;
  toneBus: GainNode;
  toneGate: GainNode;
  voiceBus: GainNode;
  voiceSpatial: PannerNode;
  voiceSpatialGain: GainNode;
  voiceCenterGain: GainNode;
  noiseSpatial: PannerNode;
  noiseSpatialGain: GainNode;
  noiseCenterGain: GainNode;
  stereoOutput: GainNode;
  monoOutput: GainNode;
  toneReverb: GainNode;
  toneDelay: GainNode;
  voiceReverb: GainNode;
  voiceDelay: GainNode;
  am: GainNode;
  amDepth: GainNode;
  breathDepth: GainNode;
  oscL: OscillatorNode;
  oscR: OscillatorNode;
  panL: StereoPannerNode;
  panR: StereoPannerNode;
  sub: OscillatorNode;
  subGain: GainNode;
  harm: OscillatorNode;
  harmGain: GainNode;
  lfo: OscillatorNode;
  pulseWave: PeriodicWave;
  breath: OscillatorNode;
  noise: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseFilter: BiquadFilterNode;
}

/** HRTF kullanılamazsa tarayıcının equal-power uzamsallaştırmasına düş. */
function makeSpatialPanner(ctx: AudioContext, x: number, y: number, z: number): PannerNode {
  const panner = ctx.createPanner();
  try {
    panner.panningModel = "HRTF";
  } catch {
    panner.panningModel = "equalpower";
  }
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 8;
  panner.rolloffFactor = 0.25;
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
  return panner;
}

function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  // erken yansımalar + üstel kuyruk: salon hissi, metalik değil
  const taps = [0.011, 0.019, 0.031, 0.047, 0.068, 0.097, 0.131];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const white = Math.random() * 2 - 1;
      lp += (white - lp) * 0.34; // yüksekleri yumuşat
      d[i] = lp * Math.pow(1 - t, 2.4) * 0.7;
    }
    taps.forEach((tap, k) => {
      const idx = Math.floor((tap + ch * 0.004) * rate);
      if (idx < len) d[idx] += (k % 2 ? -1 : 1) * (0.55 - k * 0.06);
    });
  }
  return buf;
}

/**
 * Yükseltilmiş kosinüs zarflı nabız dalgası (isokronik).
 * Hoparlörde kulaklar arası fark oluşmadığı için kortikal sürüklenmeyi
 * genlik nabzı sağlar; keskin geçiş olmadığından tık/çıtlama duyulmaz.
 */
function makePulseWave(ctx: AudioContext, duty = 0.5, harmonics = 40): PeriodicWave {
  const N = 512;
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = i / N;
    samples[i] = p < duty ? 0.5 * (1 - Math.cos((2 * Math.PI * p) / duty)) : 0;
  }
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  let mean = 0;
  for (let i = 0; i < N; i++) mean += samples[i];
  mean /= N;
  for (let k = 1; k <= harmonics; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const ang = (2 * Math.PI * k * i) / N;
      re += samples[i] * Math.cos(ang);
      im += samples[i] * Math.sin(ang);
    }
    real[k] = (2 * re) / N;
    imag[k] = (2 * im) / N;
  }
  // DC bileşeni kaldırılır; taban seviye am.gain ile verilir
  real[0] = 0;
  const scale = 1 / Math.max(0.0001, 1 - mean);
  for (let k = 1; k <= harmonics; k++) {
    real[k] *= scale;
    imag[k] *= scale;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makePinkNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
  }
  return buf;
}

class NoctaEngine {
  private n: Nodes | null = null;
  private carrier = 210;
  private beat = 4.2;
  private mode: OutputMode = "speaker";
  private speakerStyle: "isochronic" | "monaural" = "isochronic";
  private phase: SessionPhase = "prep";
  private reverb = 0.25;
  private volume = 0.55;
  private spatialDepth = 0.5;
  private microphoneActive = false;
  private voicePosition = 0;
  private running = false;
  private fading = false;
  private fadeTimer: number | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private scheduledVoices = new Set<AudioBufferSourceNode>();
  private listeners = new Set<() => void>();

  get isRunning() {
    return this.running;
  }
  get currentPhase() {
    return this.phase;
  }
  get outputMode() {
    return this.mode;
  }
  get isMicrophoneActive() {
    return this.microphoneActive;
  }
  /** Cihazın konuşma sentezi Web Audio'ya bağlanamaz; 3D/mono için ses dosyası gerekir. */
  requiresProcessedVoice() {
    return this.mode === "binaural" || this.microphoneActive;
  }
  get contextState() {
    return this.n?.ctx.state ?? "kapalı";
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  /** Grafik bir kez kurulur. */
  async ensure(): Promise<AudioContext> {
    if (!this.n) {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: "playback" });

      const master = ctx.createGain();
      master.gain.value = 0;

      // Son aşamadaki yumuşak sınırlayıcı, ses seviyesi yükselse de ani pikleri bastırır.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 10;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.3;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;

      const mix = ctx.createGain();
      mix.gain.value = 1;
      mix.connect(master);
      master.connect(limiter);

      // Mikrofon açıkken tüm karışımı (L+R)/2 olarak birleştirip aynı sinyali
      // her iki çıkış kanalına göndeririz. Yalnızca panner'ı ortalamak yetmez.
      const stereoOutput = ctx.createGain();
      const monoOutput = ctx.createGain();
      stereoOutput.gain.value = this.microphoneActive ? 0 : 1;
      monoOutput.gain.value = this.microphoneActive ? 1 : 0;
      limiter.connect(stereoOutput);
      stereoOutput.connect(analyser);
      const splitter = ctx.createChannelSplitter(2);
      const left = ctx.createGain();
      const right = ctx.createGain();
      const monoSum = ctx.createGain();
      const monoToStereo = ctx.createChannelMerger(2);
      left.gain.value = 0.5;
      right.gain.value = 0.5;
      monoSum.channelCount = 1;
      monoSum.channelCountMode = "explicit";
      limiter.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
      left.connect(monoSum);
      right.connect(monoSum);
      monoSum.connect(monoToStereo, 0, 0);
      monoSum.connect(monoToStereo, 0, 1);
      monoToStereo.connect(monoOutput);
      monoOutput.connect(analyser);
      analyser.connect(ctx.destination);

      const dry = ctx.createGain();
      dry.gain.value = 0.85;
      dry.connect(mix);

      const convolver = ctx.createConvolver();
      // Kısa, yumuşak oda yankısı: telaffuzun anlaşılabilirliği korunur.
      convolver.buffer = makeImpulse(ctx, 1.65);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.7;
      convolver.connect(reverbReturn);
      reverbReturn.connect(mix);

      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.38;
      const delayTone = ctx.createBiquadFilter();
      delayTone.type = "lowpass";
      delayTone.frequency.value = 2100;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.42;
      delay.connect(delayTone);
      delayTone.connect(feedback);
      feedback.connect(delay);
      delayTone.connect(mix);

      const toneReverb = ctx.createGain();
      const toneDelay = ctx.createGain();
      const voiceReverb = ctx.createGain();
      const voiceDelay = ctx.createGain();
      toneReverb.connect(convolver);
      voiceReverb.connect(convolver);
      toneDelay.connect(delay);
      voiceDelay.connect(delay);

      const toneBus = ctx.createGain();
      toneBus.gain.value = 0.5;
      const toneGate = ctx.createGain();
      toneGate.gain.value = 0;
      toneGate.connect(toneBus);
      toneBus.connect(dry);
      toneBus.connect(toneReverb);
      toneBus.connect(toneDelay);

      // Konuşma: düşük uğultuyu temizle, hafifçe eşitle, sonra merkez veya
      // gerçek HRTF 3D konumuna yumuşak geçişle gönder.
      const voiceBus = ctx.createGain();
      voiceBus.gain.value = 1;
      const voiceHighpass = ctx.createBiquadFilter();
      voiceHighpass.type = "highpass";
      voiceHighpass.frequency.value = 85;
      const voiceCompressor = ctx.createDynamicsCompressor();
      voiceCompressor.threshold.value = -24;
      voiceCompressor.knee.value = 18;
      voiceCompressor.ratio.value = 2.5;
      voiceCompressor.attack.value = 0.012;
      voiceCompressor.release.value = 0.22;
      const voiceCenterGain = ctx.createGain();
      const voiceSpatialGain = ctx.createGain();
      const voiceSpatial = makeSpatialPanner(ctx, 0.32, 0.05, -1.2);
      const voiceOutput = ctx.createGain();
      voiceBus.connect(voiceHighpass);
      voiceHighpass.connect(voiceCompressor);
      voiceCompressor.connect(voiceCenterGain);
      voiceCenterGain.connect(voiceOutput);
      voiceCompressor.connect(voiceSpatialGain);
      voiceSpatialGain.connect(voiceSpatial);
      voiceSpatial.connect(voiceOutput);
      voiceOutput.connect(dry);
      voiceOutput.connect(voiceReverb);
      voiceOutput.connect(voiceDelay);

      // --- taşıyıcı katmanı ---
      const am = ctx.createGain();
      am.gain.value = 0.62;
      am.connect(toneGate);

      const oscL = ctx.createOscillator();
      const oscR = ctx.createOscillator();
      oscL.type = "sine";
      oscR.type = "sine";
      const panL = ctx.createStereoPanner();
      const panR = ctx.createStereoPanner();
      oscL.connect(panL);
      oscR.connect(panR);
      panL.connect(am);
      panR.connect(am);

      const sub = ctx.createOscillator();
      sub.type = "sine";
      const subGain = ctx.createGain();
      sub.connect(subGain);
      subGain.connect(am);

      // küçük hoparlörlerde algılanabilirlik için üst harmonik
      const harm = ctx.createOscillator();
      harm.type = "triangle";
      const harmGain = ctx.createGain();
      harm.connect(harmGain);
      harmGain.connect(am);

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      const amDepth = ctx.createGain();
      lfo.connect(amDepth);
      amDepth.connect(am.gain);

      const breath = ctx.createOscillator();
      breath.type = "sine";
      breath.frequency.value = 0.08;
      const breathDepth = ctx.createGain();
      // Yavaş ve hafif nefes zarfı; ses seviyesini negatife düşürmez.
      breathDepth.gain.value = 0.05;
      breath.connect(breathDepth);
      breathDepth.connect(am.gain);

      const noise = ctx.createBufferSource();
      noise.buffer = makePinkNoise(ctx, 8);
      noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 520;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.1;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      // Ortam sesi, konuşmadan ayrı ve sabit bir 3D konumda kalır.
      const noiseCenterGain = ctx.createGain();
      const noiseSpatialGain = ctx.createGain();
      const noiseSpatial = makeSpatialPanner(ctx, -0.6, 0.18, -1.6);
      noiseGain.connect(noiseCenterGain);
      noiseCenterGain.connect(toneGate);
      noiseGain.connect(noiseSpatialGain);
      noiseSpatialGain.connect(noiseSpatial);
      noiseSpatial.connect(toneGate);

      [oscL, oscR, sub, harm, lfo, breath].forEach((o) => o.start());
      noise.start();

      this.n = {
        ctx, master, limiter, analyser, mix, dry, convolver, reverbReturn, delay, delayTone,
        feedback, toneBus, toneGate, voiceBus, toneReverb, toneDelay, voiceReverb, voiceDelay,
        voiceSpatial, voiceSpatialGain, voiceCenterGain, noiseSpatial, noiseSpatialGain, noiseCenterGain,
        stereoOutput, monoOutput,
        am, amDepth, breathDepth, oscL, oscR, panL, panR, sub, subGain, harm, harmGain,
        lfo, pulseWave: makePulseWave(ctx), breath, noise, noiseGain, noiseFilter,
      };

      this.applyMode();
      this.applyPhase();
      this.applyMix();

      const resume = () => {
        if (this.n && this.running && this.n.ctx.state !== "running") {
          this.n.ctx.resume().catch(() => undefined);
        }
      };
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("focus", resume);
      ctx.onstatechange = () => this.emit();
    }
    if (this.n.ctx.state !== "running") {
      try {
        await this.n.ctx.resume();
      } catch {
        /* kullanıcı etkileşimi bekleniyor */
      }
    }
    this.emit();
    return this.n.ctx;
  }

  private applyMode() {
    const n = this.n;
    if (!n) return;
    const t = n.ctx.currentTime;
    // Mikrofon açıkken binaural fark kapatılır; iki kanala eşit, sakin sinyal verilir.
    const binaural = this.mode === "binaural" && !this.microphoneActive;
    const half = binaural ? this.beat / 2 : 0;
    n.oscL.frequency.setTargetAtTime(this.carrier - half, t, 0.6);
    n.oscR.frequency.setTargetAtTime(
      this.carrier + half + (binaural || this.microphoneActive ? 0 : 0.6), t, 0.6,
    );
    n.panL.pan.setTargetAtTime(binaural ? -1 : -0.65, t, 0.6);
    n.panR.pan.setTargetAtTime(binaural ? 1 : 0.65, t, 0.6);
    n.sub.frequency.setTargetAtTime(this.carrier / 2, t, 0.6);
    n.subGain.gain.setTargetAtTime(binaural ? 0.16 : 0.3, t, 0.6);
    n.harm.frequency.setTargetAtTime(this.carrier * 2, t, 0.6);
    n.harmGain.gain.setTargetAtTime(binaural ? 0.02 : 0.07, t, 0.6);
    // binaural'de AM yok (vuru zaten kulaklar arası farktan doğar)
    // hoparlörde: isokronik nabız (keskin ama tık üretmeyen zarf) veya yumuşak monaural
    if (binaural) {
      n.lfo.type = "sine";
      n.am.gain.setTargetAtTime(0.85, t, 0.8);
      n.amDepth.gain.setTargetAtTime(0, t, 0.8);
    } else if (this.microphoneActive) {
      // Eşit ses modunda güçlü nabız yerine daha rahat, yumuşak modülasyon.
      n.lfo.type = "sine";
      n.am.gain.setTargetAtTime(0.64, t, 0.8);
      n.amDepth.gain.setTargetAtTime(0.14, t, 0.8);
    } else if (this.speakerStyle === "isochronic") {
      n.lfo.setPeriodicWave(n.pulseWave);
      // Taban her zaman modülasyon derinliğinden yüksek: faz çevrilmesi yok.
      n.am.gain.setTargetAtTime(0.62, t, 0.8);
      n.amDepth.gain.setTargetAtTime(0.24, t, 0.8);
    } else {
      n.lfo.type = "sine";
      n.am.gain.setTargetAtTime(0.65, t, 0.8);
      n.amDepth.gain.setTargetAtTime(0.20, t, 0.8);
    }
    n.noiseFilter.frequency.setTargetAtTime(binaural ? 620 : 430, t, 1);
    this.applySpatial();
    this.applyVolume();
  }

  /** Kulaklıkta HRTF; mikrofon açıkken bütün sesler birebir eşit mono. */
  private applySpatial() {
    const n = this.n;
    if (!n) return;
    const t = n.ctx.currentTime;
    const depth = this.mode === "binaural" && !this.microphoneActive
      ? Math.min(0.8, Math.max(0, this.spatialDepth))
      : 0;
    n.voiceCenterGain.gain.setTargetAtTime(1 - depth * 0.55, t, 0.2);
    n.voiceSpatialGain.gain.setTargetAtTime(depth * 0.8, t, 0.2);
    n.noiseCenterGain.gain.setTargetAtTime(1 - depth * 0.45, t, 0.2);
    n.noiseSpatialGain.gain.setTargetAtTime(depth * 0.65, t, 0.2);
    // Merkez ve 3D yollar arasında tıklama olmadan kısa geçiş.
    n.stereoOutput.gain.setTargetAtTime(this.microphoneActive ? 0 : 1, t, 0.045);
    n.monoOutput.gain.setTargetAtTime(this.microphoneActive ? 1 : 0, t, 0.045);
  }

  setMicrophoneActive(active: boolean) {
    if (this.microphoneActive === active) return;
    // İşlenmemiş sistem sesi mono karışımından geçmez; geçişte durdurulur.
    if (active && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.microphoneActive = active;
    this.applyMode();
    this.applyPhase();
    this.emit();
  }

  setSpatialDepth(depth: number) {
    this.spatialDepth = Math.max(0, Math.min(0.8, depth));
    this.applySpatial();
  }

  private applyPhase() {
    const n = this.n;
    if (!n) return;
    const t = n.ctx.currentTime;
    const prep = this.phase === "prep";
    // Dil evresinde taşıyıcı geri çekilir; okunuşlar daha anlaşılır kalır.
    const base = this.mode === "binaural" ? (prep ? 0.6 : 0.2) : prep ? 0.95 : 0.34;
    n.toneBus.gain.setTargetAtTime(base, t, 4);
    n.lfo.frequency.setTargetAtTime(this.beat, t, 6);
    n.noiseGain.gain.setTargetAtTime(prep ? 0.12 : 0.05, t, 4);
    n.feedback.gain.setTargetAtTime(prep ? 0.14 : 0.22, t, 2);
    this.applyMix();
  }

  private applyMix() {
    const n = this.n;
    if (!n) return;
    const t = n.ctx.currentTime;
    const prep = this.phase === "prep";
    const r = Math.max(0, Math.min(0.9, this.reverb));
    n.toneReverb.gain.setTargetAtTime(r * (prep ? 0.16 : 0.28), t, 0.8);
    n.toneDelay.gain.setTargetAtTime(r * (prep ? 0.02 : 0.06), t, 0.8);
    // Hafif oda yankısı + çok düşük gecikmeli yansıma; kelimeler net kalır.
    n.voiceReverb.gain.setTargetAtTime(r * 0.48, t, 0.6);
    n.voiceDelay.gain.setTargetAtTime(r * 0.1, t, 0.6);
    n.dry.gain.setTargetAtTime(0.92 - r * 0.10, t, 0.6);
    n.delay.delayTime.setTargetAtTime(prep ? 0.28 : 0.24, t, 1.2);
  }

  private applyVolume() {
    const n = this.n;
    if (!n) return;
    // Kulaklıkta daha düşük tavan, hoparlörde hafif telafi. Fiziksel ses
    // seviyesi cihaz sesine bağlı olduğu için düşükten başlanması önerilir.
    const comp = this.mode === "speaker" ? 1.1 : 0.75;
    const target = this.running ? Math.max(0.0001, Math.min(0.9, this.volume * comp)) : 0.0001;
    if (!this.fading) n.master.gain.setTargetAtTime(target, n.ctx.currentTime, 0.35);
  }

  async start(opts: { carrier: number; beat: number; mode: OutputMode }) {
    if (this.fadeTimer !== null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.carrier = opts.carrier;
    this.beat = opts.beat;
    this.mode = opts.mode;
    const ctx = await this.ensure();
    this.fading = false;
    this.running = true;
    const t = ctx.currentTime;
    this.n!.toneGate.gain.cancelScheduledValues(t);
    this.n!.toneGate.gain.setTargetAtTime(1, t, 1.6);
    this.applyMode();
    this.applyPhase();
    this.n!.master.gain.cancelScheduledValues(t);
    this.n!.master.gain.setValueAtTime(Math.max(0.0001, this.n!.master.gain.value), t);
    this.applyVolume();
    this.emit();
  }

  stop(fadeSeconds = 1.4) {
    const n = this.n;
    this.running = false;
    if (this.fadeTimer !== null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.clearScheduledVoices();
    this.stopVoice();
    this.clearPhaseTransition();
    if (!n) {
      this.emit();
      return;
    }
    const t = n.ctx.currentTime;
    this.fading = true;
    n.master.gain.cancelScheduledValues(t);
    n.master.gain.setValueAtTime(Math.max(0.0001, n.master.gain.value), t);
    n.master.gain.exponentialRampToValueAtTime(0.0001, t + fadeSeconds);
    n.toneGate.gain.setTargetAtTime(0, t, fadeSeconds / 3);
    window.setTimeout(() => {
      this.fading = false;
      this.emit();
    }, fadeSeconds * 1000 + 60);
    this.emit();
  }

  fadeOut(seconds: number): Promise<void> {
    if (!this.n || this.fading) return Promise.resolve();
    this.fading = true;
    const t = this.n.ctx.currentTime;
    const g = this.n.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.0001, t + seconds);
    return new Promise<void>((resolve) => {
      this.fadeTimer = window.setTimeout(() => {
        this.fadeTimer = null;
        this.stop(0.4);
        resolve();
      }, seconds * 1000);
    });
  }

  /** Duraklatma veya cihaz değişiminde eski otomasyonları iptal et. */
  private clearPhaseTransition() {
    const n = this.n;
    if (!n) return;
    const now = n.ctx.currentTime;
    for (const param of [n.toneBus.gain, n.noiseGain.gain, n.oscL.frequency, n.oscR.frequency, n.lfo.frequency]) {
      const value = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    }
  }

  /** Konuşma başlamadan önce taşıyıcıyı Web Audio saatinde yumuşakça geri çek. */
  schedulePhaseTransition(remainingSeconds: number) {
    const n = this.n;
    if (!n || !this.running || remainingSeconds <= 0) return;
    const now = n.ctx.currentTime;
    const at = now + remainingSeconds;
    this.clearPhaseTransition();
    const prepBase = this.mode === "binaural" ? 0.6 : 0.95;
    const subBase = this.mode === "binaural" ? 0.2 : 0.34;
    n.toneBus.gain.setTargetAtTime(prepBase, now, 3);
    n.toneBus.gain.setTargetAtTime(subBase, at, 6);
    n.noiseGain.gain.setTargetAtTime(0.12, now, 3);
    n.noiseGain.gain.setTargetAtTime(0.05, at, 6);
    const binaural = this.mode === "binaural" && !this.microphoneActive;
    const startHalf = binaural ? this.beat / 2 : 0;
    const endHalf = binaural ? 0.4 : 0;
    const detune = binaural || this.microphoneActive ? 0 : 0.6;
    n.oscL.frequency.setTargetAtTime(this.carrier - startHalf, now, 2);
    n.oscR.frequency.setTargetAtTime(this.carrier + startHalf + detune, now, 2);
    n.lfo.frequency.setTargetAtTime(this.beat, now, 2);
    n.lfo.frequency.setTargetAtTime(0.8, at, 8);
    n.oscL.frequency.setTargetAtTime(this.carrier - endHalf, at, 8);
    n.oscR.frequency.setTargetAtTime(this.carrier + endHalf + detune, at, 8);
  }

  /** Önceden indirilmiş cümleyi ses motorunun saatine planla. */
  scheduleVoice(buffer: AudioBuffer, delaySeconds: number, rate = 1, gain = 0.7) {
    const n = this.n;
    if (!n || !this.running || delaySeconds < 0.2) return false;
    const source = n.ctx.createBufferSource();
    source.buffer = buffer;
    const safeRate = Math.min(1.1, Math.max(0.85, rate));
    source.playbackRate.value = safeRate;
    const level = Math.min(1.1, Math.max(0, gain));
    const start = n.ctx.currentTime + delaySeconds;
    const duration = Math.max(0.12, buffer.duration / safeRate);
    const envelope = n.ctx.createGain();
    const attack = Math.min(0.16, duration / 3);
    const release = Math.min(0.18, duration / 3);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + attack);
    envelope.gain.setValueAtTime(level, start + Math.max(attack, duration - release));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope);
    envelope.connect(n.voiceBus);
    this.scheduledVoices.add(source);
    source.onended = () => {
      this.scheduledVoices.delete(source);
      source.disconnect();
      envelope.disconnect();
    };
    source.start(start);
    return true;
  }

  clearScheduledVoices() {
    for (const source of this.scheduledVoices) {
      try { source.stop(); } catch { /* zaten durmuş */ }
    }
    this.scheduledVoices.clear();
  }

  setMode(mode: OutputMode) {
    if (mode === "binaural" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.mode = mode;
    this.applyMode();
    this.applyPhase();
    this.emit();
  }
  setCarrier(hz: number) {
    if (Math.abs(this.carrier - hz) < 0.01) return;
    this.carrier = hz;
    this.applyMode();
  }
  /** Frekans kayması uzun zaman sabitiyle yapılır: ani geçiş uyarılma yaratır. */
  setBeat(hz: number) {
    if (Math.abs(this.beat - hz) < 0.02) return;
    this.beat = hz;
    const n = this.n;
    if (!n) return;
    const t = n.ctx.currentTime;
    const binaural = this.mode === "binaural" && !this.microphoneActive;
    const half = binaural ? hz / 2 : 0;
    n.oscL.frequency.setTargetAtTime(this.carrier - half, t, 8);
    n.oscR.frequency.setTargetAtTime(this.carrier + half + (binaural || this.microphoneActive ? 0 : 0.6), t, 8);
    n.lfo.frequency.setTargetAtTime(hz, t, 8);
  }
  setSpeakerStyle(style: "isochronic" | "monaural") {
    this.speakerStyle = style;
    this.applyMode();
  }
  setPhase(phase: SessionPhase) {
    if (phase === this.phase) return;
    this.phase = phase;
    this.applyPhase();
    this.emit();
  }
  setReverb(v: number) {
    this.reverb = v;
    this.applyMix();
  }
  setVolume(v: number) {
    this.volume = v;
    this.applyVolume();
  }
  setVoiceLevel(v: number) {
    if (!this.n) return;
    this.n.voiceBus.gain.setTargetAtTime(v, this.n.ctx.currentTime, 0.3);
  }

  /** Çıkış seviyesi (0-1) — ses gerçekten akıyor mu göstergesi. */
  getLevel(): number {
    const n = this.n;
    if (!n) return 0;
    const arr = new Uint8Array(n.analyser.frequencyBinCount);
    n.analyser.getByteTimeDomainData(arr);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = (arr[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / arr.length) * 3.2);
  }

  /**
   * Ön yükleme sırasında canlı AudioContext yaratmamak için (tarayıcı otomatik
   * oynatma kısıtı) çözme işlemi gerekirse çevrimdışı bağlamda yapılır.
   */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    if (this.n) return await this.n.ctx.decodeAudioData(data);
    const OfflineCtor: typeof OfflineAudioContext =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const off = new OfflineCtor(2, 1024, 44100);
    return await off.decodeAudioData(data);
  }

  /** Seans kapalıyken de okunuş/test duyulabilsin diye çıkışı geçici aç. */
  private openForVoice() {
    const n = this.n;
    if (!n || this.running) return;
    this.fading = false;
    const comp = this.mode === "speaker" ? 1.1 : 0.75;
    n.master.gain.cancelScheduledValues(n.ctx.currentTime);
    n.master.gain.setTargetAtTime(Math.max(0.03, Math.min(0.9, this.volume * comp)), n.ctx.currentTime, 0.08);
  }

  private closeAfterVoice() {
    const n = this.n;
    if (!n || this.running || this.voiceSource) return;
    n.master.gain.setTargetAtTime(0.0001, n.ctx.currentTime, 0.45);
  }

  /** Okunuşu efekt zincirinden geçirerek çal. */
  async playVoice(
    buffer: AudioBuffer,
    rate = 1,
    gain = 1,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    const ctx = await this.ensure();
    if (!isCurrent()) return;
    this.stopVoice();
    this.openForVoice();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const safeRate = Math.min(1.1, Math.max(0.85, rate));
    src.playbackRate.value = safeRate;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    const duration = Math.max(0.12, buffer.duration / safeRate);
    const safeGain = Math.min(1.1, Math.max(0, gain));
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(safeGain, now + Math.min(0.08, duration / 3));
    g.gain.setValueAtTime(safeGain, now + Math.max(0.08, duration - 0.12));
    g.gain.linearRampToValueAtTime(0, now + duration);
    // Cümleler arasında çok hafif, yavaş bir uzamsal yer değişimi.
    // Ani tam-sol/tam-sağ hareketleri yoktur.
    this.voicePosition += 1;
    const x = this.voicePosition % 2 ? 0.32 : -0.32;
    if (this.n!.voiceSpatial.positionX) {
      this.n!.voiceSpatial.positionX.setTargetAtTime(x, now, 0.7);
    } else {
      this.n!.voiceSpatial.setPosition(x, 0.05, -1.2);
    }
    src.connect(g);
    g.connect(this.n!.voiceBus);
    src.start();
    this.voiceSource = src;
    return new Promise<void>((resolve) => {
      src.onended = () => {
        if (this.voiceSource === src) this.voiceSource = null;
        try {
          g.disconnect();
        } catch {
          /* yoksay */
        }
        // Yankı kuyruğunun doğal biçimde sönmesine izin ver.
        window.setTimeout(() => this.closeAfterVoice(), 900);
        resolve();
      };
    });
  }

  stopVoice() {
    if (this.voiceSource) {
      try {
        this.voiceSource.stop();
      } catch {
        /* yoksay */
      }
      this.voiceSource = null;
      this.closeAfterVoice();
    }
  }

  /** 3 saniyelik deneme sinyali — hoparlörden ses geliyor mu? */
  async testTone(): Promise<void> {
    const ctx = await this.ensure();
    const n = this.n!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.2);
    g.gain.setValueAtTime(0.32, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    g.connect(n.voiceBus);

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(this.carrier, t);
    o.frequency.linearRampToValueAtTime(this.carrier * 1.5, t + 3);
    const trem = ctx.createOscillator();
    trem.frequency.value = this.beat;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.12;
    trem.connect(tremDepth);
    tremDepth.connect(g.gain);
    o.connect(g);
    o.start(t);
    trem.start(t);
    o.stop(t + 3.1);
    trem.stop(t + 3.1);

    // test sırasında master açık olmalı
    const wasRunning = this.running;
    if (!wasRunning) {
      this.fading = false;
      n.master.gain.cancelScheduledValues(t);
      const comp = this.mode === "speaker" ? 1.1 : 0.75;
      n.master.gain.setTargetAtTime(Math.max(0.05, Math.min(0.9, this.volume * comp)), t, 0.15);
      window.setTimeout(() => {
        if (!this.running) {
          const tt = n.ctx.currentTime;
          n.master.gain.setTargetAtTime(0.0001, tt, 0.4);
        }
      }, 3200);
    }
    return new Promise<void>((r) => window.setTimeout(() => r(), 3200));
  }
}

export const engine = new NoctaEngine();

export const TTS_LANG: Record<string, string> = {
  en: "en-US", fr: "fr-FR", it: "it-IT", es: "es-ES", ru: "ru-RU", ja: "ja-JP", zh: "zh-CN", tr: "tr-TR",
};

/** Cihaz sesi yedeği: mevcut sesler arasından en kalitelisini seç. */
export function pickDeviceVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const all = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  const pool = all.filter((v) => v.lang.toLowerCase().startsWith(base));
  if (!pool.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const s = v.name.toLowerCase();
    let n = 0;
    if (/natural|neural|premium|enhanced|plus/.test(s)) n += 6;
    if (/google/.test(s)) n += 5;
    if (/microsoft/.test(s)) n += 3;
    if (/online|cloud/.test(s)) n += 2;
    if (!v.localService) n += 2;
    return n;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

export function speakDevice(text: string, lang: string, rate = 0.85, volume = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickDeviceVoice(TTS_LANG[lang] ?? lang);
    if (v) u.voice = v;
    u.lang = TTS_LANG[lang] ?? lang;
    u.rate = rate;
    u.pitch = 0.95;
    u.volume = volume;
    synth.speak(u);
  } catch {
    /* yoksay */
  }
}

export function stopSpeech() {
  engine.stopVoice();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/**
 * Kulaklık algılama. Etiket okunamazsa (çoğu masaüstü tarayıcı) varsayılan
 * hoparlördür — böylece kullanıcı seansı başlatır başlatmaz ses duyar.
 */
export async function detectOutput(): Promise<{ mode: OutputMode; label: string }> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outs = devices.filter((d) => d.kind === "audiooutput" && d.label);
    // Takılı ama seçili olmayan başka bir kulaklık yanlışlıkla algılanmasın.
    const selected = outs.find((d) => d.deviceId === "default") ?? (outs.length === 1 ? outs[0] : undefined);
    const label = selected?.label ?? "";
    if (/headphone|earphone|headset|kulaklık|airpods|buds|bluetooth|earbud/i.test(label)) {
      return { mode: "binaural", label: label || "kulaklık" };
    }
    if (label) return { mode: "speaker", label };
  } catch {
    /* yoksay */
  }
  return { mode: "speaker", label: "sistem hoparlörü" };
}
