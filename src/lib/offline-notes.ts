"use client";

export interface NoteDraft {
  clientKey: string;
  deviceId: string;
  lang: string;
  createdAt: string;
  rating: number;
  recalled: string;
  feeling: string;
  sessionId: number | null;
}

export type NoteInput = Omit<NoteDraft, "clientKey" | "createdAt">;
export const NOTES_CHANGED = "nocta:notes-changed";
const KEY = "nocta.pending-notes.v1";
let flushing: Promise<void> | null = null;

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTES_CHANGED));
}

export function pendingNotes(deviceId?: string): NoteDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is NoteDraft => Boolean(
      item && typeof item === "object" && typeof item.clientKey === "string" &&
      typeof item.deviceId === "string" && (!deviceId || item.deviceId === deviceId),
    ));
  } catch { return []; }
}

function writeQueue(items: NoteDraft[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    notify();
    return true;
  } catch { return false; }
}

async function send(note: NoteDraft): Promise<boolean> {
  try {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": note.deviceId },
      body: JSON.stringify(note),
    });
    return response.ok;
  } catch { return false; }
}

export async function saveNote(input: NoteInput): Promise<"server" | "local" | "error"> {
  const clientKey = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const note: NoteDraft = { ...input, clientKey, createdAt: new Date().toISOString() };
  if (await send(note)) {
    notify();
    return "server";
  }
  return writeQueue([...pendingNotes(), note]) ? "local" : "error";
}

/** Sıradaki notlar ağ gelince aynı clientKey ile tekrar gönderilir. */
export function flushPendingNotes(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    while (true) {
      const [next] = pendingNotes();
      if (!next || !(await send(next))) break;
      if (!writeQueue(pendingNotes().filter((item) => item.clientKey !== next.clientKey))) break;
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
