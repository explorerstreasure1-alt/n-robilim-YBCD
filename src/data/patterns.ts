import type { LangCode } from "../lib/languages";

/**
 * Kalıp cümle mimarisi.
 * Her dilde 40 temel isim × 6 kalıp = 240 dilbilgisel olarak doğru cümle.
 * Artikel/cinsiyet uyumu elle doğrulanmış biçimde saklanır; çekim gerektiren
 * kalıplar bilinçli olarak seçilmedi (yalın/adıl hâli güvenli çerçeveler).
 */

export interface Noun {
  n: string;
  a?: string;
  t: string;
}

export interface Frame {
  s: string;
  t: string;
}

export interface PatternPack {
  code: LangCode;
  nouns: Noun[];
  frames: Frame[];
}

const TR = [
  "ev","su","kapı","pencere","masa","sandalye","yatak","oda","mutfak","anahtar",
  "telefon","araba","yol","sokak","şehir","okul","para","zaman","gece","sabah",
  "yemek","ekmek","süt","kahve","çay","kitap","kalem","çanta","ayakkabı","şapka",
  "saat","doktor","hastane","deniz","güneş","yağmur","çocuk","aile","müzik","köpek",
];

function nouns(list: Array<[string, string] | string>): Noun[] {
  return list.map((item, i) => {
    const [n, a] = Array.isArray(item) ? item : [item, ""];
    return { n, a, t: TR[i] };
  });
}

export const PATTERNS: PatternPack[] = [
  {
    code: "en",
    nouns: nouns([
      "house","water","door","window","table","chair","bed","room","kitchen","key",
      "phone","car","road","street","city","school","money","time","night","morning",
      "food","bread","milk","coffee","tea","book","pen","bag","shoe","hat",
      "clock","doctor","hospital","sea","sun","rain","child","family","music","dog",
    ]),
    frames: [
      { s: "Where is the {n}?", t: "{T} nerede?" },
      { s: "This is my {n}.", t: "Bu benim {T}." },
      { s: "The {n} is here.", t: "{T} burada." },
      { s: "I need the {n}.", t: "{T} lazım." },
      { s: "I like the {n}.", t: "{T} hoşuma gidiyor." },
      { s: "The {n} is not here.", t: "{T} burada değil." },
    ],
  },
  {
    code: "fr",
    nouns: nouns([
      ["maison","la"],["eau","l'"],["porte","la"],["fenêtre","la"],["table","la"],
      ["chaise","la"],["lit","le"],["chambre","la"],["cuisine","la"],["clé","la"],
      ["téléphone","le"],["voiture","la"],["route","la"],["rue","la"],["ville","la"],
      ["école","l'"],["argent","l'"],["temps","le"],["nuit","la"],["matin","le"],
      ["repas","le"],["pain","le"],["lait","le"],["café","le"],["thé","le"],
      ["livre","le"],["stylo","le"],["sac","le"],["chaussure","la"],["chapeau","le"],
      ["horloge","l'"],["médecin","le"],["hôpital","l'"],["mer","la"],["soleil","le"],
      ["pluie","la"],["enfant","l'"],["famille","la"],["musique","la"],["chien","le"],
    ]),
    frames: [
      { s: "Où est {a}{n} ?", t: "{T} nerede?" },
      { s: "Voici {a}{n}.", t: "İşte {T}." },
      { s: "{A}{n} est ici.", t: "{T} burada." },
      { s: "Je cherche {a}{n}.", t: "{T} arıyorum." },
      { s: "J'aime {a}{n}.", t: "{T} seviyorum." },
      { s: "{A}{n} n'est pas ici.", t: "{T} burada değil." },
    ],
  },
  {
    code: "es",
    nouns: nouns([
      ["casa","la"],["agua","el"],["puerta","la"],["ventana","la"],["mesa","la"],
      ["silla","la"],["cama","la"],["habitación","la"],["cocina","la"],["llave","la"],
      ["teléfono","el"],["coche","el"],["carretera","la"],["calle","la"],["ciudad","la"],
      ["escuela","la"],["dinero","el"],["tiempo","el"],["noche","la"],["mañana","la"],
      ["comida","la"],["pan","el"],["leche","la"],["café","el"],["té","el"],
      ["libro","el"],["bolígrafo","el"],["bolsa","la"],["zapato","el"],["sombrero","el"],
      ["reloj","el"],["médico","el"],["hospital","el"],["mar","el"],["sol","el"],
      ["lluvia","la"],["niño","el"],["familia","la"],["música","la"],["perro","el"],
    ]),
    frames: [
      { s: "¿Dónde está {a}{n}?", t: "{T} nerede?" },
      { s: "Aquí está {a}{n}.", t: "İşte {T}." },
      { s: "{A}{n} está aquí.", t: "{T} burada." },
      { s: "Busco {a}{n}.", t: "{T} arıyorum." },
      { s: "Me gusta {a}{n}.", t: "{T} hoşuma gidiyor." },
      { s: "{A}{n} no está aquí.", t: "{T} burada değil." },
    ],
  },
  {
    code: "it",
    nouns: nouns([
      ["casa","la"],["acqua","l'"],["porta","la"],["finestra","la"],["tavolo","il"],
      ["sedia","la"],["letto","il"],["stanza","la"],["cucina","la"],["chiave","la"],
      ["telefono","il"],["macchina","la"],["strada","la"],["via","la"],["città","la"],
      ["scuola","la"],["denaro","il"],["tempo","il"],["notte","la"],["mattina","la"],
      ["cibo","il"],["pane","il"],["latte","il"],["caffè","il"],["tè","il"],
      ["libro","il"],["penna","la"],["borsa","la"],["scarpa","la"],["cappello","il"],
      ["orologio","l'"],["medico","il"],["ospedale","l'"],["mare","il"],["sole","il"],
      ["pioggia","la"],["bambino","il"],["famiglia","la"],["musica","la"],["cane","il"],
    ]),
    frames: [
      { s: "Dov'è {a}{n}?", t: "{T} nerede?" },
      { s: "Ecco {a}{n}.", t: "İşte {T}." },
      { s: "{A}{n} è qui.", t: "{T} burada." },
      { s: "Cerco {a}{n}.", t: "{T} arıyorum." },
      { s: "Mi piace {a}{n}.", t: "{T} hoşuma gidiyor." },
      { s: "{A}{n} non è qui.", t: "{T} burada değil." },
    ],
  },
  {
    code: "ru",
    nouns: nouns([
      "дом","вода","дверь","окно","стол","стул","кровать","комната","кухня","ключ",
      "телефон","машина","дорога","улица","город","школа","деньги","время","ночь","утро",
      "еда","хлеб","молоко","кофе","чай","книга","ручка","сумка","обувь","шляпа",
      "часы","врач","больница","море","солнце","дождь","ребёнок","семья","музыка","собака",
    ]),
    frames: [
      { s: "Где {n}?", t: "{T} nerede?" },
      { s: "Вот {n}.", t: "İşte {T}." },
      { s: "{N} здесь.", t: "{T} burada." },
      { s: "Там {n}.", t: "{T} orada." },
      { s: "Это {n}.", t: "Bu {T}." },
      { s: "{N} не здесь.", t: "{T} burada değil." },
    ],
  },
  {
    code: "ja",
    nouns: nouns([
      "家","水","ドア","窓","テーブル","椅子","ベッド","部屋","台所","鍵",
      "電話","車","道","通り","町","学校","お金","時間","夜","朝",
      "食事","パン","牛乳","コーヒー","お茶","本","ペン","かばん","靴","帽子",
      "時計","医者","病院","海","太陽","雨","子供","家族","音楽","犬",
    ]),
    frames: [
      { s: "{n}はどこですか。", t: "{T} nerede?" },
      { s: "これは{n}です。", t: "Bu {T}." },
      { s: "{n}はここにあります。", t: "{T} burada." },
      { s: "{n}があります。", t: "{T} var." },
      { s: "{n}をください。", t: "{T} lütfen." },
      { s: "{n}はここにありません。", t: "{T} burada değil." },
    ],
  },
  {
    code: "zh",
    nouns: nouns([
      "房子","水","门","窗户","桌子","椅子","床","房间","厨房","钥匙",
      "手机","汽车","路","街道","城市","学校","钱","时间","晚上","早上",
      "食物","面包","牛奶","咖啡","茶","书","笔","包","鞋","帽子",
      "钟","医生","医院","大海","太阳","雨","孩子","家人","音乐","狗",
    ]),
    frames: [
      { s: "{n}在哪里？", t: "{T} nerede?" },
      { s: "这是{n}。", t: "Bu {T}." },
      { s: "{n}在这里。", t: "{T} burada." },
      { s: "我有{n}。", t: "Bende {T} var." },
      { s: "我需要{n}。", t: "{T} lazım." },
      { s: "{n}不在这里。", t: "{T} burada değil." },
    ],
  },
];

export const PATTERN_BY_CODE = Object.fromEntries(PATTERNS.map((p) => [p.code, p])) as Record<
  LangCode,
  PatternPack
>;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function fill(frame: string, noun: Noun): string {
  const art = noun.a ?? "";
  const tight = art.endsWith("'") || art.endsWith("’");
  const join = (a: string) => (!a ? "" : tight ? a : a + " ");
  return frame
    .replace(/\{a\}/g, join(art))
    .replace(/\{A\}/g, join(cap(art)))
    .replace(/\{n\}/g, noun.n)
    .replace(/\{N\}/g, cap(noun.n));
}

export interface PatternLine {
  s: string;
  t: string;
}

/** İsim başına 6 kalıp — sıralı, tekrarsız, çevirisiyle birlikte. */
export function buildPatternLines(code: LangCode): PatternLine[] {
  const pack = PATTERN_BY_CODE[code];
  const out: PatternLine[] = [];
  for (const noun of pack.nouns) {
    for (const frame of pack.frames) {
      out.push({ s: fill(frame.s, noun), t: frame.t.replace(/\{T\}/g, noun.t) });
    }
  }
  return out;
}
