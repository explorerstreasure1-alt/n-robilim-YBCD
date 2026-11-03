import { getExample, exampleCounts } from "@/lib/examples";
import { LANGUAGES } from "@/lib/languages";

export const dynamic = "force-dynamic";

/** Kaynak ve katkıda bulunanlar korunmuş gerçek cümle örneği. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("summary") === "1") return Response.json({ counts: exampleCounts() });
  const lang = url.searchParams.get("lang") || "en";
  const word = (url.searchParams.get("word") || "").trim();
  if (!LANGUAGES.some((item) => item.code === lang) || !word || word.length > 100) {
    return Response.json({ error: "geçersiz dil veya kelime" }, { status: 400 });
  }
  return Response.json({ example: getExample(lang, word) });
}
