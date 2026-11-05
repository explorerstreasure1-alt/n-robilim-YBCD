"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown, Headphones, Moon, Pause, Play, Radio, Repeat, Speaker, Star, Volume2, Waves, Zap,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { LANGUAGES, LANG_BY_CODE, type LangCode } from "@/lib/languages";
import { engine, detectOutput, stopSpeech, type OutputMode } from "@/lib/audio";
import { loadLine, playLine, prefetch, stopLine, type VoiceResult } from "@/lib/voice";
import { useMicrophone } from "@/lib/microphone";
import { DESCENT, PROTOCOL_NOTES, SO_HZ, buildSchedule, protocolSleep, protocolMorning, slotAt } from "@/lib/protocol";
import Scope from "./Scope";
import MicrophoneControl from "./MicrophoneControl";


const BLOCK_SEC = 35 * 60;
const TOTAL_BLOCKS = 858;

interface Line {
  line: number;
  text: string;
  translation: string;
  rhyme: string | null;
  tier: number;
  wordId: number;
  word?: string | null;
  wordTranslation?: string | null;
  exampleSource?: string | null;
  exampleTranslationSource?: string | null;
}

type StudyLine = {
  text: string;
  translation: string;
  rhyme: string | null;
  hard: boolean;
  word?: string | null;
  wordTranslation?: string | null;
  exampleSource?: string | null;
  exampleTranslationSource?: string | null;
};

interface Props {
  onStatus: (s: { running: boolean; phase: "prep" | "sub"; elapsed: number; lang: LangCode }) => void;
  onSessionEnd: (sessionId: number | null) => void;
  stopRequest: number;
  visible: boolean;
}

export default function SessionView({ onStatus, onSessionEnd, stopRequest, visible }: Props) {
  const { lang: selectedLang, setLang, settings, patch, progress, setProgress, deviceId, favorites, refreshStreak } = useStore();
  const [sessionLang, setSessionLang] = useState<LangCode | null>(null);
  const [sessionBase, setSessionBase] = useState<number | null>(null);
  const lang = sessionLang ?? selectedLang;
  const meta = LANG_BY_CODE[lang];

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [linesKey, setLinesKey] = useState("");
  const [reviewLines, setReviewLines] = useState<Line[]>([]);
  const [reviewKey, setReviewKey] = useState("");
  const [hard, setHard] = useState<Omit<StudyLine, "hard" | "rhyme">[]>([]);
  const [scheme, setScheme] = useState("AAAA");
  const [totalBlocks, setTotalBlocks] = useState(TOTAL_BLOCKS);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [detectedOutput, setDetectedOutput] = useState<{ mode: OutputMode; label: string }>({ mode: "speaker", label: "sistem hoparlörü" });
  const outputMode = settings.output === "auto" ? detectedOutput.mode : settings.output;
  const outputLabel = settings.output === "auto" ? detectedOutput.label : settings.output === "binaural" ? "kulaklık · elle" : "hoparlör · elle";
  const [sleeping, setSleeping] = useState(false);
  const [fading, setFading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [silent, setSilent] = useState(false);
  const [why, setWhy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceResult | "loading" | null>(null);
  const [audioError, setAudioError] = useState("");
  const [screenDark, setScreenDark] = useState(false);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const microphone = useMicrophone();

  const elapsedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const sessionRequestRef = useRef<Promise<number | null> | null>(null);
  const sessionEpochRef = useRef(0);
  const spokenRef = useRef(-1);
  const scheduledSlotsRef = useRef(new Set<number>());
  const currentElapsed = () => startedAtRef.current === null
    ? elapsedRef.current
    : Math.max(0, (Date.now() - startedAtRef.current) / 1000);

  const prepSec = settings.prepMinutes * 60;
  const baseBlock = sessionBase ?? progress[lang]?.blockIndex ?? 0;
  const [blockOffset, setBlockOffset] = useState(0);
  const currentBlock = (baseBlock + blockOffset) % Math.max(1, totalBlocks);
  const subElapsed = Math.max(0, elapsed - prepSec);
  const inBlock = subElapsed % BLOCK_SEC;
  const phase: "prep" | "sub" = elapsed >= prepSec ? "sub" : "prep";
  const protocol = useMemo(() => {
    if (settings.sessionMode === "morning") return protocolMorning(elapsed, prepSec);
    return protocolSleep(elapsed, prepSec);
  }, [elapsed, prepSec, settings.sessionMode]);
  const schedule = useMemo(
    () => buildSchedule(7, BLOCK_SEC),
    [settings.sessionMode],
  );
  const slotIndex = phase === "sub" ? slotAt(schedule, inBlock) : -1;
  const slot = slotIndex >= 0 ? schedule[slotIndex] : null;

  useEffect(() => {
    let alive = true;
    fetch(`/api/blocks?lang=${lang}&index=${currentBlock}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d.lines)) return;
        setLines(d.lines);
        setLinesKey(`${lang}:${currentBlock}`);
        setScheme(d.scheme || "AAAA");
        setTotalBlocks(d.totalBlocks || TOTAL_BLOCKS);
        prefetch(lang, d.lines.map((l: Line) => l.text));
      })
      .catch(() => undefined);
    fetch(`/api/blocks?lang=${lang}&index=${Math.max(0, currentBlock - 1)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d.lines)) return;
        setReviewLines(d.lines);
        setReviewKey(`${lang}:${Math.max(0, currentBlock - 1)}`);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [lang, currentBlock]);

  useEffect(() => {
    let alive = true;
    if (!deviceId) return;
    fetch(`/api/favorites?device=${encodeURIComponent(deviceId)}&lang=${lang}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const items = (d.items ?? [])
          .filter((f: { text: string | null }) => f.text)
          .map((f: { text: string; translation: string; example?: { sentence: string; translation: string; attribution: string; translationAttribution: string } | null }) =>
            f.example ? {
              text: f.example.sentence, translation: f.example.translation,
              word: f.text, wordTranslation: f.translation,
              exampleSource: f.example.attribution, exampleTranslationSource: f.example.translationAttribution,
            } : { text: f.text, translation: f.translation });
        setHard(items);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [deviceId, lang, favorites]);

  const pool = useMemo(() => {
    if (linesKey !== `${lang}:${currentBlock}`) return [];
    const base: StudyLine[] = lines.map((l) => ({
      text: l.text, translation: l.translation, rhyme: l.rhyme, hard: false,
      word: l.word, wordTranslation: l.wordTranslation,
      exampleSource: l.exampleSource, exampleTranslationSource: l.exampleTranslationSource,
    }));
    if (!hard.length) return base;
    [2, 5].forEach((pos, k) => {
      const pick = hard[(currentBlock * 2 + k) % hard.length];
      if (base[pos] && pick) base[pos] = { ...pick, rhyme: null, hard: true };
    });
    return base;
  }, [lines, linesKey, hard, currentBlock, lang]);

  const reviewPool = useMemo(
    () => reviewKey === `${lang}:${Math.max(0, currentBlock - 1)}`
      ? reviewLines.map((l): StudyLine => ({
          text: l.text, translation: l.translation, rhyme: l.rhyme, hard: false,
          word: l.word, wordTranslation: l.wordTranslation,
          exampleSource: l.exampleSource, exampleTranslationSource: l.exampleTranslationSource,
        }))
      : [],
    [reviewLines, reviewKey, lang, currentBlock],
  );

  const shown = slot?.review && reviewPool.length ? reviewPool : pool;
  const activeLine = phase === "sub" && slot ? shown[slot.line] : undefined;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startedAtRef.current === null) return;
      const seconds = Math.max(0, (Date.now() - startedAtRef.current) / 1000);
      elapsedRef.current = seconds;
      setElapsed(seconds);
      setBlockOffset(Math.floor(Math.max(0, seconds - prepSec) / BLOCK_SEC));
    };
    tick();
    const i = window.setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(i);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running, prepSec]);

  useEffect(() => { engine.setBeat(protocol.hz); }, [protocol.hz]);
  useEffect(() => { engine.setPhase(phase); }, [phase]);

  const statusRef = useRef(onStatus);
  useEffect(() => { statusRef.current = onStatus; }, [onStatus]);
  useEffect(() => {
    statusRef.current({ running, phase, elapsed, lang });
  }, [running, phase, elapsed, lang]);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let quiet = 0;
    let frame = 0;
    const tick = () => {
      frame += 1;
      if (frame % 3 === 0 && !document.hidden) {
        const v = engine.getLevel();
        setLevel(v);
        if (engine.isRunning && v < 0.008) quiet += 1;
        else quiet = 0;
        setSilent(quiet > 50);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  useEffect(() => {
    engine.setVolume(settings.volume);
  }, [settings.volume]);

  useEffect(() => {
    if (settings.output !== "auto") return;
    let alive = true;
    const refresh = () => {
      void detectOutput().then((result) => { if (alive) setDetectedOutput(result); });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [settings.output]);
  useEffect(() => engine.setMode(outputMode), [outputMode]);
  useEffect(() => engine.setCarrier(meta.carrier), [meta.carrier]);

  useEffect(() => {
    let previous = engine.contextState;
    return engine.subscribe(() => {
      const next = engine.contextState;
      if (previous === "suspended" && next === "running" && engine.isRunning && startedAtRef.current !== null) {
        const seconds = Math.max(0, (Date.now() - startedAtRef.current) / 1000);
        elapsedRef.current = seconds;
        setElapsed(seconds);
        setScheduleRevision((revision) => revision + 1);
      }
      previous = next;
    });
  }, []);

  useEffect(() => {
    if (!running || phase !== "prep") return;
    engine.schedulePhaseTransition(Math.max(0, prepSec - currentElapsed()));
  }, [running, phase, prepSec, outputMode, microphone.status, meta.carrier, scheduleRevision]);

  useEffect(() => {
    if (!running || !settings.speak || !pool.length) return;
    if (settings.voiceSource !== "cloud" && !engine.requiresProcessedVoice()) return;
    let cancelled = false;
    const scheduledSlots = scheduledSlotsRef.current;
    const uniqueTexts = Array.from(new Set([...pool, ...reviewPool].map((line) => line.text)));
    void Promise.all(uniqueTexts.map(async (text) => [text, await loadLine(lang, text)] as const)).then((items) => {
      if (cancelled || !engine.isRunning) return;
      const buffers = new Map(items);
      const elapsedNow = currentElapsed();
      schedule.forEach((item, index) => {
        const source = item.review && reviewPool.length ? reviewPool : pool;
        const text = source[item.line]?.text;
        const buffer = text ? buffers.get(text) : null;
        const delay = prepSec + blockOffset * BLOCK_SEC + item.t - elapsedNow;
        if (!buffer || delay < 0.75) return;
        if (engine.scheduleVoice(buffer, delay, settings.voiceRate, settings.voiceLevel * 0.8)) {
          scheduledSlots.add(currentBlock * 10000 + index);
        }
      });
    });
    return () => {
      cancelled = true;
      engine.clearScheduledVoices();
      scheduledSlots.clear();
    };
  }, [running, lang, currentBlock, blockOffset, prepSec, pool, reviewPool, schedule,
    settings.speak, settings.voiceSource, settings.voiceRate, settings.voiceLevel,
    outputMode, microphone.status, scheduleRevision]);

  useEffect(() => {
    if (!running || !settings.speak || phase !== "sub") stopLine();
  }, [running, settings.speak, phase]);

  useEffect(() => {
    if (!running || !settings.speak || phase !== "sub" || !slot || !activeLine) return;
    const key = currentBlock * 10000 + slotIndex;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    if (scheduledSlotsRef.current.has(key)) return;
    void playLine({
      lang,
      text: activeLine.text,
      source: settings.voiceSource,
      rate: settings.voiceRate,
      level: Math.min(1, settings.voiceLevel * 0.95),
    }).then((result) => {
      if (result !== "cancelled") setVoiceStatus(result);
      if (result === "cloud" && activeLine.translation) {
        void playLine({
          lang: "tr",
          text: activeLine.translation,
          source: "cloud",
          rate: Math.max(0.9, settings.voiceRate - 0.08),
          level: settings.voiceLevel * 0.42,
          delaySeconds: 1.15,
        });
      }
    });
  }, [running, settings.speak, settings.voiceSource, settings.voiceRate, settings.voiceLevel, phase, slot, slotIndex, activeLine, lang, currentBlock]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `NOCTA · ${meta.name}`,
        artist: phase === "prep" ? `${protocol.band} ${protocol.hz} Hz` : activeLine?.text ?? "pekiştirme",
        album: `Blok ${currentBlock + 1}/${totalBlocks}`,
      });
      navigator.mediaSession.playbackState = running ? "playing" : "paused";
    } catch { /* yoksay */ }
  }, [running, activeLine, currentBlock, totalBlocks, phase, protocol.band, protocol.hz, meta.name]);

  useEffect(() => {
    if (!running || !settings.sleepDetect) return;
    let still = 0;
    let last = Date.now();
    let previous: { x: number; y: number; z: number } | null = null;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const current = { x: a.x, y: a.y, z: a.z };
      const difference = previous
        ? Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z)
        : Infinity;
      previous = current;
      const now = Date.now();
      const dt = Math.max(0, Math.min(1, (now - last) / 1000));
      last = now;
      if (difference < 0.16) still += dt;
      else still = Math.max(0, still - dt * 3);
      if (still > 45) setSleeping(true);
      else if (still < 5) setSleeping(false);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [running, settings.sleepDetect]);

  const start = async () => {
    setAudioError("");
    try {
      await engine.start({ carrier: meta.carrier, beat: protocol.hz, mode: outputMode });
      if (engine.contextState !== "running") throw new Error("audio-not-running");
      engine.setVolume(settings.volume);
    } catch {
      engine.stop(0.2);
      setAudioError("Ses başlatılamadı. Cihazın sesini açıp tekrar başlatmayı dene.");
      return;
    }
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = null;
    if (sessionLang === null) setSessionLang(lang);
    if (sessionBase === null) setSessionBase(baseBlock);
    startedAtRef.current = Date.now() - elapsedRef.current * 1000;
    setFading(false);
    setRunning(true);
    if (sessionId !== null || sessionRequestRef.current) return;
    const epoch = sessionEpochRef.current;
    const request = fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body: JSON.stringify({ action: "start", lang, mode: outputMode, scheme, deviceId }),
    }).then((response) => response.ok ? response.json() : null)
      .then((result) => (typeof result?.session?.id === "number" ? result.session.id as number : null))
      .catch(() => null);
    sessionRequestRef.current = request;
    const id = await request;
    if (sessionEpochRef.current === epoch) setSessionId(id);
    if (sessionRequestRef.current === request) sessionRequestRef.current = null;
  };

  const finish = useCallback(
    async (_minutes: number, _blocks: number, openNote = true) => {
      const finalElapsed = startedAtRef.current === null
        ? elapsedRef.current
        : Math.max(0, (Date.now() - startedAtRef.current) / 1000);
      const finalOffset = Math.floor(Math.max(0, finalElapsed - prepSec) / BLOCK_SEC);
      const finalBlock = (baseBlock + finalOffset) % Math.max(1, totalBlocks);
      const pendingSession = sessionRequestRef.current;
      sessionEpochRef.current += 1;
      sessionRequestRef.current = null;
      startedAtRef.current = null;
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
      setRunning(false);
      setScreenDark(false);
      stopSpeech();
      stopLine();
      engine.stop();
      setProgress(lang, finalBlock, Math.round(finalElapsed));
      elapsedRef.current = 0;
      setElapsed(0);
      setBlockOffset(0);
      setSessionBase(null);
      setSessionLang(null);
      setFading(false);
      setSleeping(false);
      spokenRef.current = -1;
      setSessionId(null);
      if (openNote) onSessionEnd(sessionId);
      const endedSessionId = sessionId ?? (pendingSession ? await pendingSession : null);
      if (endedSessionId !== null) {
        try {
          const response = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-device-id": deviceId },
            body: JSON.stringify({
              action: "end", sessionId: endedSessionId,
              minutes: Math.max(1, Math.round(finalElapsed / 60)), blocks: finalOffset + 1,
            }),
          });
          if (response.ok) await refreshStreak();
        } catch { /* çevrimdışı ilerleme zaten yerelde saklandı */ }
      }
    },
    [deviceId, sessionId, lang, baseBlock, prepSec, totalBlocks, setProgress, refreshStreak, onSessionEnd],
  );

  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; }, [finish]);
  useEffect(() => {
    if (stopRequest > 0 && engine.isRunning) {
      const e = elapsedRef.current;
      void finishRef.current(Math.max(1, Math.round(e / 60)), Math.floor(Math.max(0, e - prepSec) / BLOCK_SEC) + 1, false);
    }
  }, [stopRequest, prepSec]);

  const pause = () => {
    const seconds = currentElapsed();
    startedAtRef.current = null;
    elapsedRef.current = seconds;
    setElapsed(seconds);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = null;
    setFading(false);
    setRunning(false);
    setScreenDark(false);
    setSleeping(false);
    stopSpeech();
    stopLine();
    engine.stop();
    const offset = Math.floor(Math.max(0, seconds - prepSec) / BLOCK_SEC);
    setBlockOffset(offset);
    setProgress(lang, (baseBlock + offset) % Math.max(1, totalBlocks), Math.round(seconds));
  };

  const scrub = (minutes: number) => {
    elapsedRef.current = minutes * 60;
    if (startedAtRef.current !== null) startedAtRef.current = Date.now() - elapsedRef.current * 1000;
    setElapsed(elapsedRef.current);
    setBlockOffset(Math.floor(Math.max(0, elapsedRef.current - prepSec) / BLOCK_SEC));
    setScheduleRevision((revision) => revision + 1);
    spokenRef.current = -1;
  };

  const startRef = useRef(start);
  const pauseRef = useRef(pause);
  useEffect(() => {
    startRef.current = start;
    pauseRef.current = pause;
  });
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", () => { if (!engine.isRunning) void startRef.current(); });
      navigator.mediaSession.setActionHandler("pause", () => { if (engine.isRunning) pauseRef.current(); });
      navigator.mediaSession.setActionHandler("stop", () => {
        if (engine.isRunning || elapsedRef.current > 0) void finishRef.current(1, 1, false);
      });
    } catch { /* bazı tarayıcılar bütün kontrolleri desteklemez */ }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("stop", null);
      } catch { /* yoksay */ }
    };
  }, []);

  // Timer removed - session runs until user stops it

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const previewVoice = async () => {
    const text = pool[0]?.text;
    if (!text || (running && phase === "prep")) return;
    setVoiceStatus("loading");
    const result = await playLine({
      lang, text, source: settings.voiceSource, rate: settings.voiceRate, level: settings.voiceLevel,
    });
    if (result !== "cancelled") setVoiceStatus(result);
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto md:flex md:overflow-hidden">
      <section className="relative h-[34svh] min-h-[220px] max-h-[300px] w-full shrink-0 overflow-hidden border-b border-line md:h-auto md:min-h-0 md:max-h-none md:flex-1 md:border-b-0 md:border-r">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0908] via-black to-black opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/40" />
        <Scope phase={phase} reverb={0} running={running} sleeping={false} lowPower={false} visible={visible && !screenDark} />
        <div className="relative flex h-full flex-col justify-between p-4 md:p-8">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip accent>
              <span className="num text-[12px]">{protocol.hz.toFixed(1)}</span> Hz · {protocol.band}
            </Chip>
            <Chip>{phase === "prep" ? "1 · DİNLENME" : "2 · DİL TEKRARI"}</Chip>
            <span className="hidden md:contents"><Chip>BLOK {currentBlock + 1}/{totalBlocks}</Chip></span>
            {microphone.status === "on" ? (
              <Chip accent>EŞİT SES</Chip>
            ) : outputMode === "binaural" ? (
              <Chip accent>3D KULAKLIK</Chip>
            ) : null}
            {slot?.review && phase === "sub" && (
              <Chip accent>
                <Repeat className="h-3 w-3" strokeWidth={1.6} /> TEKRAR
              </Chip>
            )}
          </div>
          <div className="max-w-3xl">
            {!running ? (
              <>
                <p className="font-display text-[clamp(1.7rem,5vw,3rem)] italic leading-[1.05] text-bone">
                  {elapsed > 0 ? "Biraz ara." : `Bu gece ${meta.name}.`}
                </p>
                <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-dim">
                  {elapsed > 0
                    ? "Ses duraklatıldı. Hazır olduğunda kaldığın yerden devam edebilirsin."
                    : `${settings.prepMinutes} dakika konuşmasız dinlenme, ardından net ve hafif yankılı dil tekrarları.`}
                </p>
              </>
            ) : phase === "prep" ? (
              <>
                <p className="rise font-display text-[clamp(1.4rem,4vw,2.5rem)] italic leading-[1.1] text-bone/85">
                  {protocol.label}
                </p>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-dim">
                  Bu bölümde konuşma yok; yalnızca yumuşak arka plan sesi çalıyor.
                </p>
                <p className="label mt-3 text-amber/80">
                  OKUNUŞLAR {mmss(Math.max(0, prepSec - elapsed))} SONRA
                </p>
              </>
            ) : activeLine ? (
              <>
                <p
                  key={`${currentBlock}-${slotIndex}`}
                  className="rise font-display text-[clamp(1.45rem,4.2vw,3.1rem)] italic leading-[1.08] text-bone"
                  style={{ textShadow: "0 2px 30px rgba(0,0,0,0.9)" }}
                >
                  {activeLine.text}
                </p>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-dim md:text-sm">{activeLine.translation}</p>
                {activeLine.word && <p className="label-sm mt-2 text-amber/80">KELİME: {activeLine.word} · {activeLine.wordTranslation}</p>}
              </>
            ) : (
              <p className="font-display text-2xl italic text-bone">Pekiştirme evresi…</p>
            )}
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="num text-[2rem] leading-none text-bone md:text-5xl">{mmss(elapsed)}</div>
              <div className="label mt-1.5">
                "DINLEME DEVAM EDIYOR"
              </div>
            </div>
            <Meter value={level} active={running} />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[3px] bg-line">
          {DESCENT.slice(0, 5).map((a, i) => (
            <span
              key={a.at}
              className="h-full border-r border-black/60 last:border-r-0"
              style={{
                width: `${((DESCENT[i + 1]?.at ?? 1) - a.at) * 100}%`,
                background: phase === "sub" || protocol.progress >= a.at ? "#ffb35c" : "transparent",
                opacity: phase === "sub" ? 0.45 : 1,
              }}
            />
          ))}
        </div>
      </section>

      <aside className="scroll-thin w-full shrink-0 md:w-[382px] md:overflow-y-auto">
        <div className="scroll-thin flex gap-2 overflow-x-auto border-b border-line pb-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              disabled={running || elapsed > 0}
              aria-label={l.name}
              aria-pressed={lang === l.code}
              className={`label min-h-[48px] shrink-0 px-4 min-w-[48px] transition-colors disabled:cursor-not-allowed ${lang === l.code ? "bg-amber text-black" : "text-dim hover:text-bone disabled:opacity-50"}`}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="border-b border-line p-4 md:p-5">
          <div className="flex items-center gap-4">
            <button
              onClick={running ? pause : start}
              className={`flex h-[78px] w-[78px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                running ? "border-amber text-amber" : "breath border-amber bg-amber text-black"
              }`}
              aria-label={running ? "Seansı duraklat" : elapsed > 0 ? "Seansa devam et" : "Seansı başlat"}
            >
              {running ? <Pause className="h-7 w-7" strokeWidth={1.4} /> : <Play className="ml-1 h-8 w-8" strokeWidth={1.2} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="label text-bone">{running ? "SEANS SÜRÜYOR" : elapsed > 0 ? "DEVAM ET" : "SEANSI BAŞLAT"}</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-dim">
                {running ? "Duraklatmak için tuşa dokun. Düşük sesle dinle." : `${meta.name} · ${settings.prepMinutes} dk konuşmasız başlangıç`}
              </p>
              {(running || elapsed > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {running && (
                    <button onClick={() => setScreenDark(true)}
                      className="label flex min-h-[40px] items-center gap-1.5 border border-line px-2.5 text-dim hover:border-amber hover:text-amber">
                      <Moon className="h-3.5 w-3.5" strokeWidth={1.5} /> KARART
                    </button>
                  )}
                  <button onClick={() => void finish(Math.max(1, Math.round(elapsed / 60)), Math.floor(subElapsed / BLOCK_SEC) + 1)}
                    className="label min-h-[40px] border border-line px-2.5 text-dim hover:border-amber hover:text-amber">
                    BİTİR
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-line bg-[#0c0a08] p-3.5 md:rounded-none">
            <div className="flex items-start gap-3">
              <span className="num text-[11px] text-amber">01</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="label text-bone">{settings.sessionMode === "morning" ? "SABAH · ALFA" : "GECE · DINLENME"}</span>
                  <span className="label-sm text-amber">{settings.sessionMode === "morning" ? "ALFA YÜKSELİŞİ" : "ÖNCE DINLENME, SONRA DİL"}</span>
                </div>
                 <p className="mt-1 text-[12px] leading-relaxed text-dim">
                   {settings.sessionMode === "morning" ? "İlk 15 dk alfa dalgası, ardından okumalar başlar." : `\${settings.prepMinutes} dakika konuşmasız dinlenme, ardından hafif yankılı dil tekrarları.`}
                 </p>
                 <div className="mt-3 grid grid-cols-2 gap-1" aria-label="Oturum modu">
                   {[
                     { id: "sleep", label: "GECE", hint: "önce dinlen, sonra dil" },
                     { id: "morning", label: "SABAH", hint: "alfa ile bilinç, sonra okuma" },
                   ].map((mode) => (
                     <button key={mode.id} type="button" onClick={() => patch({ sessionMode: mode.id as "sleep" | "morning" })}
                       disabled={running || elapsed > 0} aria-pressed={settings.sessionMode === mode.id}
                       className={`flex min-h-[52px] flex-col items-center justify-center border px-2 transition-colors disabled:cursor-not-allowed ${settings.sessionMode === mode.id ? "border-amber text-amber" : "border-line text-dim hover:text-bone disabled:opacity-50"}`}>
                       <span className="label" style={{ color: "inherit" }}>{mode.label}</span>
                       <span className="label-sm mt-1">{mode.hint}</span>
                     </button>
                   ))}
                 </div>
                 <div className="mt-3 grid grid-cols-3 gap-1" aria-label="Dinlenme süresi">
                   {[35, 40, 45].map((minutes) => (
                     <button key={minutes} onClick={() => patch({ prepMinutes: minutes })}
                       disabled={running || elapsed > 0} aria-pressed={settings.prepMinutes === minutes}
                       className={`label min-h-[42px] border transition-colors disabled:cursor-not-allowed ${settings.prepMinutes === minutes ? "border-amber text-amber" : "border-line text-dim hover:text-bone disabled:opacity-50"}`}>
                       {minutes} DK
                     </button>
                   ))}
                 </div>
              </div>
            </div>
            <div className="my-3 border-t border-line" />
            <div className="flex items-start gap-3">
              <span className="num text-[11px] text-amber">02</span>
              <div>
                <span className="label text-bone">DİL SESLERİ</span>
                 <p className="mt-1 text-[12px] leading-relaxed text-dim">
                   ${settings.prepMinutes}. dakikadan sonra net, hafif yankılı ve aralıklı okunuşlar başlar.
                 </p>
              </div>
            </div>
            {audioError && <p role="alert" className="mt-3 border-l-2 border-amber pl-2 text-[12px] text-amber">{audioError}</p>}
          </div>


        </div>
        <div className="border-b border-line px-4 py-4 md:px-5">
          <div className="mb-3 flex items-center gap-2 text-amber/80">
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            <h3 className="label text-bone">SES</h3>
          </div>
          <Slider label="SES SEVİYESİ" value={settings.volume} min={0.05} max={1} step={0.01}
            display={`${Math.round(settings.volume * 100)}%`} onChange={(v) => patch({ volume: v })} />
          <div className="mt-3 flex items-center gap-3 border border-line px-3 py-2">
            <Meter value={level} active={running || testing} wide />
            <button
              onClick={async () => { setTesting(true); await engine.testTone(); setTesting(false); }}
              disabled={testing}
              className="label ml-auto flex min-h-[36px] items-center gap-1.5 border border-line px-3 text-dim hover:border-amber hover:text-amber disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
              {testing ? "ÇALIYOR…" : "SES TESTİ"}
            </button>
          </div>
        </div>

        <Disclosure title={slot?.review ? "ÖNCEKİ BLOK · TEKRAR" : "BU GECEKİ İÇERİK"} icon={<Repeat className="h-4 w-4" strokeWidth={1.5} />}>
          <ol>
            {Array.from({ length: 7 }).map((_, i) => {
              const l = shown[i];
              const active = running && phase === "sub" && slot?.line === i;
              return (
                <li key={i} className={`flex items-start gap-3 border-l-2 px-3 py-2 transition-colors ${active ? "border-amber bg-[#120f0a]" : "border-transparent"}`}>
                  <span className={`num pt-[3px] text-[10px] ${active ? "text-amber" : "text-dim2"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-snug ${active ? "text-bone" : "text-dim"}`}>
                      {running && phase === "prep" ? "· · ·" : l?.text ?? "—"}
                    </span>
                    {active && <span className="mt-0.5 block text-[11px] text-dim2">{l?.translation}</span>}
                  </span>
                  {l?.hard ? (
                    <Star className="mt-1 h-3 w-3 shrink-0 text-amber" strokeWidth={1.6} fill="#ffb35c" />
                  ) : (
                    <span className={`label-sm pt-1 ${active ? "text-amber" : ""}`}>
                      {running && phase === "prep" ? "" : l?.rhyme ?? ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] leading-relaxed text-dim2">
            Yedi satır önce sık, sonra seyrek tekrar edilir; araya önceki blok girer.
            {hard.length > 0 && " Zor kelimeler 3. ve 6. sıraya yerleştirildi."}
          </p>
          {shown.some((line) => line.exampleSource) && (
            <details className="mt-3 text-[11px] leading-relaxed text-dim2">
              <summary className="cursor-pointer text-amber/80">Cümle kaynakları · Tatoeba / CC BY 2.0 FR</summary>
              {shown.map((line, i) => line.exampleSource && (
                <p key={`${line.word}-${i}`} className="mt-2 [overflow-wrap:anywhere]">
                  {i + 1}. {line.word}: {line.exampleSource}{line.exampleTranslationSource ? ` · ${line.exampleTranslationSource}` : ""}
                </p>
              ))}
              <a href="/licenses/tatoeba-examples.txt" className="mt-2 inline-block text-amber/80 underline">Lisans bilgisi</a>
            </details>
          )}
        </Disclosure>

        <div className="border-b border-line px-4 py-4 md:px-5">
          <p className="label-sm text-dim2">Yat ve dinlen. Seans başladığında dil tekrarları otomatik başlar.</p>
        </div>

        <div className="flex items-start gap-2 px-4 py-4 text-dim2 md:px-5">
          <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <div className="space-y-2 text-[11px] leading-relaxed">
            <p>Düşük sesle başla; rahatsız olursan sesi kıs veya seansı durdur.</p>
            <p>Seslerin uyutacağı veya bilinci açık tutacağı garanti değildir; uygulama uyku evresini ölçmez.</p>
            <p>Telefonun güç tasarrufu veya tarayıcı arka plan kısıtları sesi durdurabilir.</p>
          </div>
        </div>
      </aside>
      {running && screenDark && (
        <button type="button" onClick={() => setScreenDark(false)} aria-label="Ekranı yeniden aç"
          className="fixed inset-0 z-40 flex h-dvh w-full flex-col items-center justify-center gap-4 bg-black text-[#6d5a43]">
          <Moon className="h-8 w-8 text-[#3d3021]" strokeWidth={1.1} />
          <span className="label-sm text-[#6d5a43]">EKRANI AÇMAK İÇİN DOKUN</span>
        </button>
      )}
    </div>
  );
}
  function Chip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
    return (
      <span className={`label flex items-center gap-1.5 border bg-black/60 px-2 py-1 ${accent ? "border-amber/60 text-amber" : "border-line text-dim"}`}>
        {children}
      </span>
    );
  }

  function Disclosure({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
      <section className="border-b border-line">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left md:px-5">
          <span className="text-amber/80">{icon}</span>
          <span className="label flex-1 text-bone">{title}</span>
          <ChevronDown className={`h-4 w-4 text-dim transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
        </button>
        {open && <div className="px-4 pb-5 md:px-5">{children}</div>}
      </section>
    );
  }

  function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
      <section className="border-b border-line px-4 py-4 md:px-5">
        <div className="mb-3 flex items-center gap-2 text-amber/80">
          {icon}
          <h3 className="label text-bone">{title}</h3>
        </div>
        {children}
      </section>
    );
  }

  function Meter({ value, active, wide = false }: { value: number; active: boolean; wide?: boolean }) {
    const bars = wide ? 16 : 10;
    return (
      <span className="flex items-end gap-[3px]" aria-label="Çıkış seviyesi">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className={`w-[3px] transition-all duration-100 ${active && value * bars > i ? "bg-amber" : "bg-line2"}`}
            style={{ height: 5 + i * (wide ? 1.1 : 1.4) }} />
        ))}
      </span>
    );
  }

  function Slider({ label, value, min, max, step, display, onChange }: {
    label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void;
  }) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <span className="label">{label}</span>
          <span className="num text-[11px] text-amber">{display}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      </div>
    );
  }
