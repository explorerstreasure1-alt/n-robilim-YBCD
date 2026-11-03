import type { LangCode } from "./languages";

/**
 * Sayı sözcüğü üretimi — 7 dilde gerçek, doğru sözcükler.
 * Sayı sözcükleri ayrı bir öğrenme kategorisidir; kelime hedefini doldurmak için kullanılmaz.
 */

const enOnes = [
  "zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen",
];
const enTens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function en1000(n: number): string {
  if (n < 20) return enOnes[n];
  if (n < 100) return enTens[Math.floor(n / 10)] + (n % 10 ? "-" + enOnes[n % 10] : "");
  if (n < 1000) return enOnes[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + en1000(n % 100) : "");
  if (n < 1_000_000) return en1000(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + en1000(n % 1000) : "");
  return String(n);
}

const frOnes = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"];
function fr1000(n: number): string {
  if (n < 20) return frOnes[n];
  if (n < 60) {
    const t = ["", "vingt", "trente", "quarante", "cinquante"][Math.floor(n / 10)];
    return t + (n % 10 ? " et " + frOnes[n % 10] : "");
  }
  if (n < 70) return "soixante" + (n % 10 ? " et " + frOnes[n % 10] : "");
  if (n < 80) return "soixante-" + frOnes[n % 20];
  if (n < 100) return "quatre-vingt" + (n % 20 ? "-" + frOnes[n % 20] : "s");
  if (n < 1000) return frOnes[Math.floor(n / 100)] + " cent" + (Math.floor(n / 100) > 1 ? "s" : "") + (n % 100 ? " " + fr1000(n % 100) : "");
  if (n < 1_000_000) return fr1000(Math.floor(n / 1000)) + " mille" + (n % 1000 ? " " + fr1000(n % 1000) : "");
  return String(n);
}

const esOnes = ["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve"];
const esTens = ["","","veinte","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
const esHundreds = ["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];
function es1000(n: number): string {
  if (n === 100) return "cien";
  if (n < 20) return esOnes[n];
  if (n === 21) return "veintiuno";
  if (n < 30) return "veinti" + esOnes[n - 20];
  if (n < 100) return esTens[Math.floor(n / 10)] + (n % 10 ? " y " + esOnes[n % 10] : "");
  if (n < 1000) return esHundreds[Math.floor(n / 100)] + (n % 100 ? " " + es1000(n % 100) : "");
  if (n < 1_000_000) return es1000(Math.floor(n / 1000)) + " mil" + (n % 1000 ? " " + es1000(n % 1000) : "");
  return String(n);
}

const itOnes = ["zero","uno","due","tre","quattro","cinque","sei","sette","otto","nove","dieci","undici","dodici","tredici","quattordici","quindici","sedici","diciassette","diciotto","diciannove"];
function itJoin(a: string, b: string): string {
  if (!b) return a;
  const elide = (a === "venti" || a === "trenta" || a === "quaranta" || a === "cinquanta" || a === "sessanta" || a === "settanta" || a === "ottanta" || a === "novanta") && (b === "uno" || b === "otto");
  return elide ? a + b.slice(1) : a + b;
}
function it1000(n: number): string {
  if (n < 20) return itOnes[n];
  if (n < 100) {
    const t = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"][Math.floor(n / 10)];
    const u = n % 10;
    if (u === 1 || u === 8) return itJoin(t, itOnes[u]);
    return t + (u ? " " + itOnes[u] : "");
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    return (h === 1 ? "cento" : itOnes[h] + "cento") + (n % 100 ? it1000(n % 100) : "");
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    return (k === 1 ? "mille" : itOnes[k] + "mila") + (n % 1000 ? " " + it1000(n % 1000) : "");
  }
  return String(n);
}

const ruOnes = ["ноль","один","два","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
const ruTens = ["","","двадцать","тридцать","сорок","пятьдесят","шестьдесят","семьдесят","восемьдесят","девяносто"];
const ruHundreds = ["","сто","двести","триста","четыреста","пятьсот","шестьсот","семьсот","восемьсот","девятьсот"];
function ru1000(n: number): string {
  if (n < 20) return ruOnes[n];
  if (n < 100) return ruTens[Math.floor(n / 10)] + (n % 10 ? " " + ruOnes[n % 10] : "");
  if (n < 1000) return ruHundreds[Math.floor(n / 100)] + (n % 100 ? " " + ru1000(n % 100) : "");
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    let tail = "тысяч";
    if (k % 10 === 1 && k % 100 !== 11) tail = "тысяча";
    else if (k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14)) tail = "тысячи";
    return ru1000(k) + " " + tail + (rest ? " " + ru1000(rest) : "");
  }
  return String(n);
}

const jaDigits = ["ぜろ","いち","に","さん","よん","ご","ろく","なな","はち","きゅう"];
const jaHyaku = ["ひゃく","にひゃく","さんびゃく","よんひゃく","ごひゃく","ろっぴゃく","ななひゃく","はっぴゃく","きゅうひゃく"];
const jaSen = ["せん","にせん","さんぜん","よんせん","ごせん","ろくせん","ななせん","はちせん","きゅうせん"];
function ja1000(n: number): string {
  if (n < 10) return jaDigits[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    return (t === 1 ? "じゅう" : jaDigits[t] + "じゅう") + (n % 10 ? jaDigits[n % 10] : "");
  }
  if (n < 1000) return jaHyaku[Math.floor(n / 100) - 1] + (n % 100 ? ja1000(n % 100) : "");
  if (n < 1_000_000) return jaSen[Math.floor(n / 1000) - 1] + (n % 1000 ? ja1000(n % 1000) : "");
  return String(n);
}

const zhDigits = ["零","一","二","三","四","五","六","七","八","九"];
function zh1000(n: number): string {
  if (n < 10) return zhDigits[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    return (t === 1 ? "十" : zhDigits[t] + "十") + (n % 10 ? zhDigits[n % 10] : "");
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let s = (h === 1 ? "一百" : zhDigits[h] + "百");
    if (rest === 0) return s;
    if (rest < 10) return s + "零" + zhDigits[rest];
    return s + zh1000(rest);
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    let s = (k === 1 ? "一千" : zhDigits[k] + "千");
    if (rest === 0) return s;
    if (rest < 100) return s + "零" + zh1000(rest);
    return s + zh1000(rest);
  }
  return String(n);
}

export function numberWord(lang: LangCode, n: number): string {
  switch (lang) {
    case "en": return en1000(n);
    case "fr": return fr1000(n);
    case "es": return es1000(n);
    case "it": return it1000(n);
    case "ru": return ru1000(n);
    case "ja": return ja1000(n);
    case "zh": return zh1000(n);
  }
}
