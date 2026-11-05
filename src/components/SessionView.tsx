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
import { DESCENT, PROTOCOL_NOTES, SO_HZ, buildSchedule, protocolSleep, protocolMorning, protocolEvening, protocolDeepSleep, protocolFocus, protocolPowerNap, slotAt } from "@/lib/protocol";
import Scope from "./Scope";
import MicrophoneControl from "./MicrophoneControl";
import QuickAudioLab from "./QuickAudioLab";

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
  const [advanced, setAdvanced] = useState(false);
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

  const prepSec = settings.sessionMode === "focus" ? 0 : settings.prepMinutes * 60;
  const baseBlock = sessionBase ?? progress[lang]?.blockIndex ?? 0;
  const [blockOffset, setBlockOffset] = useState(0);
  const currentBlock = (baseBlock + blockOffset) % Math.max(1, totalBlocks);
  const subElapsed = Math.max(0, elapsed - prepSec);
  const inBlock = subElapsed % BLOCK_SEC;
  const phase: "prep" | "sub" = settings.sessionMode === "focus" ? "sub" : elapsed >= prepSec ? "sub" : "prep";
  const protocol = useMemo(() => {
    if (settings.sessionMode === "focus") return protocolFocus(elapsed, prepSec);
    if (settings.sessionMode === "morning") return protocolMorning(elapsed, prepSec);
    if (settings.sessionMode === "evening") return protocolEvening(elapsed, prepSec);
    if (settings.sessionMode === "deep") return protocolDeepSleep(elapsed, prepSec);
    if (settings.sessionMode === "nap") return protocolPowerNap(elapsed, prepSec);
    return protocolSleep(elapsed, prepSec);
  }, [elapsed, prepSec, settings.sessionMode]);
  const schedule = useMemo(
    () => settings.sessionMode === "focus"
      ? buildSchedule(7, BLOCK_SEC / 2).map((item) => ({ ...item, t: item.t * 0.58 }))
      : buildSchedule(7, BLOCK_SEC),
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

  useEffect(() => engine.setReverb(settings.reverb), [settings.reverb]);
  useEffect(() => engine.setSpatialDepth(settings.spatialDepth), [settings.spatialDepth]);
  useEffect(() => engine.setSpeakerStyle(settings.speakerStyle), [settings.speakerStyle]);
  useEffect(() => {
    engine.setVolume(settings.volume * (settings.sleepDetect && sleeping && phase === "sub" ? 0.55 : 1));
  }, [settings.volume, settings.sleepDetect, sleeping, phase]);

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
  }, [running, phase, prepSec, outputMode, microphone.status, settings.speakerStyle, meta.carrier, scheduleRevision]);

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
      engine.setReverb(settings.reverb);
      engine.setSpeakerStyle(settings.speakerStyle);
      engine.setVolume(settings.volume * (settings.sleepDetect && sleeping && phase === "sub" ? 0.55 : 1));
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

  useEffect(() => {
    if (!running || fading || settings.timerMinutes <= 0) return;
    const limit = settings.timerMinutes * 60;
    const fadeStart = Math.max(0, limit - settings.fadeMinutes * 60);
    const timer = window.setInterval(() => {
      const seconds = startedAtRef.current === null
        ? elapsedRef.current : Math.max(0, (Date.now() - startedAtRef.current) / 1000);
      if (seconds < fadeStart) return;
      window.clearInterval(timer);
      setFading(true);
      const fadeSeconds = Math.max(0.5, limit - seconds);
      void engine.fadeOut(fadeSeconds);
      const minutes = Math.round(seconds / 60);
      const blocks = Math.floor(Math.max(0, seconds - prepSec) / BLOCK_SEC) + 1;
      fadeTimerRef.current = window.setTimeout(() => void finishRef.current(minutes, blocks), fadeSeconds * 1000 + 600);
    }, 500);
    return () => window.clearInterval(timer);
  }, [running, fading, settings.timerMinutes, settings.fadeMinutes, prepSec]);

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
        <Scope phase={phase} reverb={settings.reverb} running={running} sleeping={settings.sleepDetect && sleeping} lowPower={settings.batterySaver} visible={visible && !screenDark} />
        <div className="relative flex h-full flex-col justify-between p-4 md:p-8">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip accent>
              <span className="num text-[12px]">{protocol.hz.toFixed(1)}</span> Hz · {protocol.band}
            </Chip>
            <Chip>{settings.sessionMode === "focus" ? "ALFA · YOĞUN TEKRAR" : phase === "prep" ? "1 · DİNLENME" : "2 · DİL TEKRARI"}</Chip>
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
                    : settings.sessionMode === "focus"
                      ? "Alfa eşliğinde yoğun tekrar. Konuşmalar anında başlar."
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
                {settings.timerMinutes > 0
                  ? `${Math.max(0, Math.round(settings.timerMinutes - elapsed / 60))} DK KALDI`
                  : "SABAHA KADAR"}
                {settings.sleepDetect && sleeping && " · HAREKETSİZLİK"}
                {fading && " · KISILIYOR"}
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
                  <span className="label text-bone">{settings.sessionMode === "focus" ? "ALFA YOĞUN TEKRAR" : settings.sessionMode === "morning" ? "SABAH · ALFA" : settings.sessionMode === "evening" ? "AKŞAM · TETA" : settings.sessionMode === "deep" ? "DERİN UYKU" : settings.sessionMode === "nap" ? "GÜÇLÜ KISA UYKU" : "UYKUYA GEÇİŞ"}</span>
                  <span className="label-sm text-amber">{settings.sessionMode === "focus" ? "ANINDA BAŞLAR" : settings.sessionMode === "morning" ? "ALFA YÜKSELİŞİ" : settings.sessionMode === "evening" ? "BİLİNÇ AÇIK" : settings.sessionMode === "deep" ? "DELTA YOĞUN" : settings.sessionMode === "nap" ? "KÜSAK UYKU" : "KONUŞMA YOK"}</span>
                </div>
                 <p className="mt-1 text-[12px] leading-relaxed text-dim">
                   {settings.sessionMode === "focus" ? "Alfa eşliğinde anında tekrar ve daha sık döngü." : settings.sessionMode === "morning" ? "Delta'dan alfa'ya bilinç yükselişi." : settings.sessionMode === "evening" ? "Alfa'dan teta'ya, bilinci açık bırakan huzur." : settings.sessionMode === "deep" ? "Delta bantında derin uyku pulsu." : settings.sessionMode === "nap" ? "20 dakikalık güçlü kısa uyku." : "Yumuşak frekans ve sakin ortam sesi."}
                 </p>
                 <div className="mt-3 grid grid-cols-2 gap-1" aria-label="Oturum modu">
                   {([
                     { id: "sleep", label: "GECE", hint: "alfa -> delta" },
                     { id: "focus", label: "YOĞUN TEKRAR", hint: "sabit alfa" },
                     { id: "morning", label: "SABAH", hint: "delta -> alfa" },
                     { id: "evening", label: "AKŞAM", hint: "bilinci açık" },
                     { id: "deep", label: "DERİN UYKU", hint: "delta yoğun" },
                     { id: "nap", label: "GÜÇLÜ KISA UYKU", hint: "20 dk pulsu" },
                   ] as const).map((mode) => (
                     <button key={mode.id} type="button" onClick={() => patch({ sessionMode: mode.id })}
                       disabled={running || elapsed > 0} aria-pressed={settings.sessionMode === mode.id}
                       className={`flex min-h-[52px] flex-col items-center justify-center border px-2 transition-colors disabled:cursor-not-allowed ${settings.sessionMode === mode.id ? "border-amber text-amber" : "border-line text-dim hover:text-bone disabled:opacity-50"}`}>
                       <span className="label" style={{ color: "inherit" }}>{mode.label}</span>
                       <span className="label-sm mt-1">{mode.hint}</span>
                     </button>
                   ))}
                   {settings.sessionMode === "sleep" && (
                     <div className="mt-3 grid grid-cols-3 gap-1" aria-label="Uykuya geçiş süresi">
                       {[35, 40, 45].map((minutes) => (
                         <button key={minutes} onClick={() => patch({ prepMinutes: minutes })}
                           disabled={running || elapsed > 0} aria-pressed={settings.prepMinutes === minutes}
                           className={`label min-h-[42px] border transition-colors disabled:cursor-not-allowed ${settings.prepMinutes === minutes ? "border-amber text-amber" : "border-line text-dim hover:text-bone disabled:opacity-50"}`}>
                           {minutes} DK
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
              </div>
            </div>
            <div className="my-3 border-t border-line" />
            <div className="flex items-start gap-3">
              <span className="num text-[11px] text-amber">02</span>
              <div>
                <span className="label text-bone">DİL SESLERİ</span>
                 <p className="mt-1 text-[12px] leading-relaxed text-dim">
                   {settings.sessionMode === "focus"
                     ? "Yabancı dil anında başlar; Türkçe anlam daha kısık ve hemen ardından gelir."
                     : `${settings.prepMinutes}. dakikadan sonra net, hafif yankılı ve aralıklı okunuşlar başlar.`}
                 </p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <label htmlFor="session-timer" className="label text-dim">SEANS BİTİŞİ</label>
            <select id="session-timer" value={settings.timerMinutes}
              onChange={(event) => patch({ timerMinutes: Number(event.target.value) })}
               className="num min-h-[44px] rounded-md border border-line bg-black px-3 text-[12px] text-bone focus:border-amber focus:outline-none md:rounded-none">
              <option value={0}>Sabaha kadar</option>
              <option value={30}>30 dakika</option>
              <option value={90}>90 dakika</option>
              <option value={120}>2 saat</option>
              <option value={240}>4 saat</option>
            </select>
          </div>
          {settings.timerMinutes > 0 && settings.timerMinutes <= settings.prepMinutes && (
            <p className="mt-2 border-l-2 border-amber/60 pl-2 text-[11px] leading-relaxed text-amber/80">
              Seans, dil sesleri başlamadan biter. Konuşmaları duymak için daha uzun süre seç.
            </p>
          )}
          {audioError && <p role="alert" className="mt-3 border-l-2 border-amber pl-2 text-[12px] text-amber">{audioError}</p>}
        </div>

        <Disclosure title="FREKANS NASIL ÇALIŞIR?" icon={<Waves className="h-4 w-4" strokeWidth={1.5} />}>
          <ol className="space-y-px">
            {DESCENT.slice(0, 5).map((a, i) => {
              const active = phase === "prep" && protocol.stageIndex === i;
              const done = phase === "sub" || protocol.progress > (DESCENT[i + 1]?.at ?? 1);
              return (
                <li key={a.at} className={`flex items-center gap-3 border-l-2 px-3 py-2 ${active ? "border-amber bg-[#120f0a]" : "border-transparent"}`}>
                  <span className={`num w-12 shrink-0 text-[12px] ${active ? "text-amber" : done ? "text-dim" : "text-dim2"}`}>
                    {a.hz} Hz
                  </span>
                  <span className={`label w-14 shrink-0 ${active ? "text-amber" : ""}`}>{a.band}</span>
                  <span className={`min-w-0 flex-1 truncate text-[12px] ${active ? "text-bone" : "text-dim2"}`}>{a.label}</span>
                  <span className="label-sm shrink-0">{Math.round(a.at * settings.prepMinutes)}′</span>
                </li>
              );
            })}
            <li className={`flex items-center gap-3 border-l-2 px-3 py-2 ${phase === "sub" ? "border-amber bg-[#120f0a]" : "border-transparent"}`}>
              <span className={`num w-12 shrink-0 text-[12px] ${phase === "sub" ? "text-amber" : "text-dim2"}`}>{SO_HZ} Hz</span>
              <span className={`label w-14 shrink-0 ${phase === "sub" ? "text-amber" : ""}`}>SALINIM</span>
              <span className={`min-w-0 flex-1 truncate text-[12px] ${phase === "sub" ? "text-bone" : "text-dim2"}`}>Pekiştirme + okunuş</span>
              <span className="label-sm shrink-0">{settings.prepMinutes}′+</span>
            </li>
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-dim2">
            Hz değeri sesin vuru hızıdır; uygulama beyin dalgası veya uyku evresi ölçmez.
          </p>
          <button onClick={() => setWhy((v) => !v)} className="label mt-3 flex min-h-[36px] w-full items-center justify-between border border-line px-3 text-dim hover:border-amber hover:text-amber">
            NEDEN BÖYLE ÇALIŞIYOR?
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${why ? "rotate-180" : ""}`} strokeWidth={1.6} />
          </button>
          {why && (
            <div className="mt-2 space-y-3 border-l border-line pl-3">
              {PROTOCOL_NOTES.map((n) => (
                <div key={n.title}>
                  <p className="label text-amber/90">{n.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{n.body}</p>
                </div>
              ))}
            </div>
          )}
          <a href="https://doi.org/10.1371/journal.pone.0286023" target="_blank" rel="noreferrer"
            className="mt-3 inline-block text-[11px] text-amber/85 underline underline-offset-4">
            Bilimsel inceleme · PLOS ONE, 2023 ↗
          </a>
        </Disclosure>

        <div className="border-b border-line px-4 py-4 md:px-5">
          <QuickAudioLab sourceText={pool[0]?.text ?? lines[0]?.text} translationText={pool[0]?.translation ?? lines[0]?.translation} />
        </div>

        <Section title="SES" icon={<Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />}>
          <div className="grid grid-cols-3 gap-px">
            {([
              { id: "auto", label: "OTO", icon: Radio },
              { id: "binaural", label: "3D KULAKLIK", icon: Headphones },
              { id: "speaker", label: "HOPARLÖR", icon: Speaker },
            ] as const).map((m) => {
              const Icon = m.icon;
              const on = settings.output === m.id;
              return (
                <button key={m.id} onClick={() => patch({ output: m.id })}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1.5 border transition-colors ${on ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  <span className="label" style={{ color: "inherit" }}>{m.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="label-sm truncate">{outputLabel}</p>
            <p className="label-sm shrink-0 text-amber/80">
              {microphone.status === "on" ? "EŞİT KANAL" : outputMode === "binaural" ? "HRTF 3D" : "STEREO"}
            </p>
          </div>
          {settings.output === "auto" && (
            <p className="mt-1 text-[10.5px] leading-relaxed text-dim2">
              Otomatik algılama tarayıcıya bağlıdır. Algılanmazsa 3D KULAKLIK’ı seç.
            </p>
          )}

          <div className="mt-4 space-y-4">
            <Slider label="SES SEVİYESİ" value={settings.volume} min={0.05} max={1} step={0.01}
              display={`${Math.round(settings.volume * 100)}%`} onChange={(v) => patch({ volume: v })} />
            <Slider label="YUMUŞAK YANKI" value={settings.reverb} min={0} max={0.9} step={0.01}
              display={`${Math.round(settings.reverb * 100)}%`} onChange={(v) => patch({ reverb: v })} />
            {outputMode === "binaural" && microphone.status !== "on" && (
              <Slider label="3D DERİNLİK" value={settings.spatialDepth} min={0} max={0.8} step={0.01}
                display={`${Math.round(settings.spatialDepth * 100)}%`} onChange={(v) => patch({ spatialDepth: v })} />
            )}
          </div>

          <details className="group mt-4 border border-line">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-3">
              <span className="label">MİKROFON VE DENGELİ SES</span>
              <span className="flex items-center gap-2">
                <span className={`label-sm ${microphone.status === "on" ? "text-amber" : ""}`}>{microphone.status === "on" ? "AÇIK" : "KAPALI"}</span>
                <ChevronDown className="h-4 w-4 text-dim transition-transform group-open:rotate-180" strokeWidth={1.5} />
              </span>
            </summary>
            <div className="p-2 pt-0"><MicrophoneControl /></div>
          </details>
          <button
            type="button"
            onClick={() => void previewVoice()}
            disabled={voiceStatus === "loading" || !pool.length || (running && phase === "prep")}
            className="label mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 border border-amber/70 text-amber transition-colors hover:bg-amber hover:text-black disabled:opacity-35"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={1.6} />
            {voiceStatus === "loading" ? "SES HAZIRLANIYOR…" : "DİL SESİNİ ÖNİZLE"}
          </button>
          <p aria-live="polite" className="mt-2 text-[11px] leading-relaxed text-dim2">
            {running && phase === "prep"
              ? "Hazırlık süresince dil seslendirmesi kapalıdır."
              : voiceStatus === "unavailable"
                ? "İşlenmiş ses alınamadı. İnternet bağlantını kontrol edip tekrar dene."
                : voiceStatus === "device"
                  ? "Cihaz sesi çalıyor; cihaz sesi yankı ve 3D efektinden geçmez."
                  : microphone.status === "on"
                    ? "Mikrofon açıkken ses dosyası merkezde ve iki kulağa eşit çalınır."
                    : outputMode === "binaural"
                      ? "Konuşma ve ortam kulaklık için hafifçe uzamsallaştırılır."
                      : "Yankı hafiftir; konuşmanın anlaşılır kalması önceliklidir."}
          </p>

          <div className="mt-3 flex items-center gap-3 border border-line px-3 py-2">
            <Meter value={level} active={running || testing} wide />
            <button
              onClick={async () => {
                setTesting(true);
                await engine.testTone();
                setTesting(false);
              }}
              disabled={testing}
              className="label ml-auto flex min-h-[36px] items-center gap-1.5 border border-line px-3 text-dim hover:border-amber hover:text-amber disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
              {testing ? "ÇALIYOR…" : "SES TESTİ"}
            </button>
          </div>
          {silent && (
            <p className="mt-2 border-l-2 border-amber pl-3 text-[11px] leading-relaxed text-amber/90">
              Çıkış sessiz görünüyor. Sistem sesini aç, çıkışı HOPARLÖR seç ve SES TESTİ’ne bas.
            </p>
          )}
        </Section>

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

        <div className="border-b border-line">
          <button onClick={() => setAdvanced((v) => !v)} className="flex min-h-[52px] w-full items-center justify-between px-4 md:px-5">
            <span className="label text-bone">İNCE AYAR</span>
            <span className="flex items-center gap-2">
              <span className="label-sm">{settings.prepMinutes}′ · {settings.voiceSource === "cloud" ? "STÜDYO" : "CİHAZ"}</span>
              <ChevronDown className={`h-4 w-4 text-dim transition-transform ${advanced ? "rotate-180" : ""}`} strokeWidth={1.6} />
            </span>
          </button>

          {advanced && (
            <div className="space-y-5 px-4 pb-5 md:px-5">
              <div>
                <span className="label">UYKUYA GEÇİŞ SÜRESİ</span>
                <div className="mt-2 grid grid-cols-3 gap-px">
                  {[35, 40, 45].map((v) => (
                    <button key={v} onClick={() => patch({ prepMinutes: v })}
                      disabled={running || elapsed > 0} aria-pressed={settings.prepMinutes === v}
                      className={`label min-h-[44px] border transition-colors disabled:cursor-not-allowed ${settings.prepMinutes === v ? "border-amber text-amber" : "border-line text-dim hover:text-bone disabled:opacity-50"}`}>
                      {v} DK
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">ZAMANLAYICI</span>
                <div className="mt-2 flex flex-wrap gap-px">
                  {[0, 30, 90, 120, 240].map((v) => (
                    <button key={v} onClick={() => patch({ timerMinutes: v })}
                      className={`label min-h-[40px] border px-3 transition-colors ${settings.timerMinutes === v ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                      {v === 0 ? "SABAHA KADAR" : `${v} DK`}
                    </button>
                  ))}
                </div>
                <p className="label-sm mt-2">BİTİŞTE {settings.fadeMinutes} DK YUMUŞAK KISILMA</p>
              </div>

              <div>
                <span className="label">HOPARLÖR DALGA BİÇİMİ</span>
                <div className="mt-2 grid grid-cols-2 gap-px">
                  {([
                    { id: "isochronic", label: "NABIZ", hint: "isokronik · belirgin" },
                    { id: "monaural", label: "YUMUŞAK", hint: "monaural · sakin" },
                  ] as const).map((s) => (
                    <button key={s.id} onClick={() => patch({ speakerStyle: s.id })}
                      className={`flex min-h-[52px] flex-col items-center justify-center border transition-colors ${settings.speakerStyle === s.id ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                      <span className="label" style={{ color: "inherit" }}>{s.label}</span>
                      <span className="label-sm mt-1">{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">OKUNUŞ KAYNAĞI</span>
                <div className="mt-2 grid grid-cols-2 gap-px">
                  {([
                    { id: "cloud", label: "STÜDYO", hint: "yankılı" },
                    { id: "device", label: "CİHAZ", hint: "yedek" },
                  ] as const).map((v) => (
                    <button key={v.id} onClick={() => patch({ voiceSource: v.id })}
                      className={`flex min-h-[52px] flex-col items-center justify-center border transition-colors ${settings.voiceSource === v.id ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                      <span className="label" style={{ color: "inherit" }}>{v.label}</span>
                      <span className="label-sm mt-1">{v.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Slider label="OKUMA HIZI" value={settings.voiceRate} min={0.85} max={1.1} step={0.01}
                display={`${settings.voiceRate.toFixed(2)}×`} onChange={(v) => patch({ voiceRate: v })} />
              <Slider label="OKUMA SEVİYESİ" value={settings.voiceLevel} min={0.2} max={1.4} step={0.01}
                display={`${Math.round(settings.voiceLevel * 100)}%`} onChange={(v) => patch({ voiceLevel: v })} />

              <button
                onClick={() => void previewVoice()}
                disabled={voiceStatus === "loading" || !pool.length || (running && phase === "prep")}
                className="label min-h-[42px] w-full border border-line text-dim hover:border-amber hover:text-amber disabled:opacity-35"
              >
                ÖRNEK CÜMLEYİ DİNLE
              </button>

              <label className="flex min-h-[44px] cursor-pointer items-center justify-between border-b border-line/60">
                <span className="label">OKUNUŞ AÇIK</span>
                <input type="checkbox" checked={settings.speak} onChange={(e) => patch({ speak: e.target.checked })} className="h-5 w-5 accent-[#ffb35c]" />
              </label>
               <label className="flex min-h-[44px] cursor-pointer items-center justify-between border-b border-line/60">
                 <span className="label">HAREKETE GÖRE SESİ KIS</span>
                <input type="checkbox" checked={settings.sleepDetect} onChange={(e) => patch({ sleepDetect: e.target.checked })} className="h-5 w-5 accent-[#ffb35c]" />
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center justify-between border-b border-line/60">
                <span className="label">PİL İYİLEŞTİRME</span>
                <input type="checkbox" checked={settings.batterySaver} onChange={(e) => patch({ batterySaver: e.target.checked })} className="h-5 w-5 accent-[#ffb35c]" />
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <span className="label">KONUM</span>
                  <span className="num text-[11px] text-dim">{Math.round(elapsed / 60)} DK</span>
                </div>
                <input type="range" min={0} max={180} step={1} value={Math.min(180, Math.round(elapsed / 60))}
                  onChange={(e) => scrub(Number(e.target.value))} aria-label="Seans zamanını kaydır" />
                <p className="label-sm">GEÇİŞİ HEMEN DİNLEMEK İÇİN {settings.prepMinutes}′ SONRASINA KAYDIR</p>
              </div>
            </div>
          )}
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
