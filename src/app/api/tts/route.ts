import { bad, json } from "@/lib/server";
import { synthesize } from "@/lib/tts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Satır okunuşu: audio/mpeg döner, istemci bunu yankı zincirinden geçirir. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const text = (url.searchParams.get("text") || "").slice(0, 400).trim();
  const lang = url.searchParams.get("lang") || "en";
  if (!text) return bad("text gerekli");

  try {
    const result = await synthesize(text, lang);
    if (!result) return json({ error: "tts-unavailable" }, { status: 503 });
    return new Response(new Uint8Array(result.audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Provider": result.provider,
        "X-TTS-Cached": result.cached ? "1" : "0",
      },
    });
  } catch {
    return json({ error: "tts-failed" }, { status: 503 });
  }
}
