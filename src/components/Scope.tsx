"use client";

import { useEffect, useRef } from "react";

interface Props {
  phase: "prep" | "sub";
  reverb: number;
  running: boolean;
  sleeping: boolean;
  lowPower?: boolean;
  visible?: boolean;
}

/**
 * Osiloskop bandı. Faz değişiminde karakter değiştirir:
 * prep = yoğun delta/theta izi · sub = yavaşça çekilmiş sakin çizgi + yankı izleri
 */
export default function Scope({ phase, reverb, running, sleeping, lowPower = false, visible = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ phase, reverb, running, sleeping, lowPower });
  useEffect(() => {
    stateRef.current = { phase, reverb, running, sleeping, lowPower };
  }, [phase, reverb, running, sleeping, lowPower]);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    let w = 0;
    let h = 0;
    let frame = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const trace = (time: number, s: number, amp: number) => {
      const mid = h / 2;
      const pts: number[] = [];
      for (let x = 0; x <= w; x += 2) {
        const p = x / w;
        let y: number;
        if (s < 0.5) {
          // hazırlık: yoğun, çok katmanlı delta/theta
          y =
            Math.sin(p * 26 + time * 2.1) * 0.42 +
            Math.sin(p * 11 - time * 1.3) * 0.3 +
            Math.sin(p * 47 + time * 3.4) * 0.14 +
            (Math.random() - 0.5) * 0.08;
        } else {
          // bilinçaltı yükleme: yavaş nabız, yumuşak envanter
          const pulse = Math.sin(time * 0.55 - p * 4);
          y =
            Math.sin(p * 6.2 - time * 0.5) * 0.5 +
            Math.pow(Math.max(0, pulse), 6) * 0.55 * Math.sin(p * 30) +
            Math.sin(p * 15 + time * 0.22) * 0.1;
        }
        pts.push(mid + y * amp);
      }
      return pts;
    };

    const draw = () => {
      const s = stateRef.current;
      ctx.clearRect(0, 0, w, h);

      // ızgara: kazınmış panel çizgileri
      ctx.strokeStyle = "rgba(255,179,92,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,179,92,0.09)";
      ctx.beginPath();
      ctx.moveTo(0, h / 2 + 0.5);
      ctx.lineTo(w, h / 2 + 0.5);
      ctx.stroke();

      const phaseShift = s.phase === "prep" ? 0 : 1;
      const amp = (s.phase === "prep" ? 0.34 : 0.2) * h * (s.sleeping ? 0.55 : 1);
      const pts = trace(t, phaseShift, amp);
      const trails = 1 + Math.round(s.reverb * 6);

      for (let k = trails - 1; k >= 0; k--) {
        const lag = k * 9;
        const alpha = (k === 0 ? 0.9 : 0.14 / (k * 0.8)) * (s.running ? 1 : 0.32);
        ctx.strokeStyle = `rgba(255,179,92,${alpha})`;
        ctx.lineWidth = k === 0 ? 1.35 : 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const idx = Math.min(pts.length - 1, Math.max(0, Math.round((x - lag) / 2)));
          const y = pts[idx];
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // başlangıç tarama işareti
      if (s.running) {
        const sx = (t * 42) % w;
        ctx.fillStyle = "rgba(255,179,92,0.5)";
        ctx.fillRect(sx, h / 2 - amp - 8, 1, amp * 2 + 16);
      }

      t += 0.016;
    };

    // pil iyileştirme: düşük güçte ve sekme arka plandayken kare hızı düşer
    const loop = () => {
      frame += 1;
      const skip = document.hidden ? 20 : stateRef.current.lowPower ? 2 : 1;
      if (frame % skip === 0) draw();
      raf = requestAnimationFrame(loop);
    };

    if (reduced) draw();
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reverb, reduced, visible]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
