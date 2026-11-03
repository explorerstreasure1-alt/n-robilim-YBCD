"use client";

import { useSyncExternalStore } from "react";
import { engine } from "./audio";

export type MicrophoneStatus = "off" | "requesting" | "on" | "error";
export interface MicrophoneSnapshot {
  status: MicrophoneStatus;
  message: string;
}

const OFF: MicrophoneSnapshot = { status: "off", message: "" };

/**
 * Mikrofon yalnızca açık kullanıcı isteğiyle alınır. Akış hiçbir ses düğümüne
 * bağlanmaz, kaydedilmez ve sunucuya aktarılmaz. Yalnızca uygulamanın kendi
 * mikrofon kullanımı izlenebilir; başka uygulamaların mikrofonu algılanamaz.
 */
class MicrophoneController {
  private snapshot: MicrophoneSnapshot = OFF;
  private stream: MediaStream | null = null;
  private requestId = 0;
  private listeners = new Set<() => void>();
  private pageHookAdded = false;

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => OFF;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(status: MicrophoneStatus, message = "") {
    this.snapshot = { status, message };
    this.listeners.forEach((listener) => listener());
  }

  async open() {
    if (this.snapshot.status === "on" || this.snapshot.status === "requesting") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.update("error", "Mikrofon bu tarayıcıda kullanılamıyor. HTTPS veya localhost ve mikrofon desteği gerekli.");
      return;
    }
    const id = ++this.requestId;
    this.update("requesting", "Tarayıcıdan mikrofon izni bekleniyor.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (id !== this.requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getAudioTracks()[0];
      if (!track) {
        stream.getTracks().forEach((item) => item.stop());
        this.update("error", "Kullanılabilir mikrofon bulunamadı.");
        return;
      }
      this.stream = stream;
      engine.setMicrophoneActive(true);
      track.addEventListener("ended", () => {
        if (this.stream === stream) this.close();
      }, { once: true });
      if (!this.pageHookAdded && typeof window !== "undefined") {
        window.addEventListener("pagehide", () => this.close());
        this.pageHookAdded = true;
      }
      this.update("on");
    } catch (err) {
      if (id !== this.requestId) return;
      const name = err instanceof Error ? err.name : "";
      const message = name === "NotAllowedError" || name === "SecurityError"
        ? "Mikrofon izni verilmedi. Tarayıcı site izinlerinden açıp yeniden deneyebilirsin."
        : name === "NotFoundError"
          ? "Mikrofon bulunamadı. Bağlantını kontrol edip tekrar dene."
          : "Mikrofon açılamadı. Tarayıcı ve cihaz izinlerini kontrol et.";
      engine.setMicrophoneActive(false);
      this.update("error", message);
    }
  }

  close() {
    ++this.requestId;
    const old = this.stream;
    this.stream = null;
    old?.getTracks().forEach((track) => track.stop());
    engine.setMicrophoneActive(false);
    this.update("off");
  }
}

export const microphone = new MicrophoneController();

export function useMicrophone() {
  return useSyncExternalStore(microphone.subscribe, microphone.getSnapshot, microphone.getServerSnapshot);
}
