import type { LangCode } from "../lib/languages";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export type Level = (typeof LEVELS)[number];
export const TOPICS = [
  { id: "pronouns", label: "Zamirler" },
  { id: "verbs", label: "Fiiller" },
  { id: "grammar", label: "Dil bilgisi ve bağlaçlar" },
  { id: "expressions", label: "Günlük ifadeler" },
  { id: "family", label: "Aile ve insanlar" },
  { id: "home", label: "Ev ve yaşam" },
  { id: "food", label: "Yiyecek ve içecek" },
  { id: "travel", label: "Seyahat ve ulaşım" },
  { id: "health", label: "Sağlık ve beden" },
  { id: "education", label: "Eğitim ve öğrenme" },
  { id: "work", label: "İş ve para" },
  { id: "feelings", label: "Duygular ve ilişkiler" },
  { id: "nature", label: "Doğa ve çevre" },
  { id: "time", label: "Zaman ve sayılar" },
  { id: "abstract", label: "Soyut ve akademik" },
  { id: "general", label: "Genel kelimeler" },
] as const;
export type Topic = (typeof TOPICS)[number]["id"];

export interface CurriculumEntry {
  text: string;
  translation: string;
  level: Level;
  topic: Topic;
  pos: string;
  tier: 1 | 3;
}

// Seçilmiş başlangıç, dil bilgisi ve ileri düzey ifadeler.
// Sıra: seviye, konu, tür, Türkçe, İngilizce, Rusça, İtalyanca, İspanyolca, Japonca, Çince, Fransızca.
type R = [Level, Topic, string, string, string, string, string, string, string, string, string];
const ROWS: R[] = [
  ["A1","pronouns","zamir","ben","I","я","io","yo","私","我","je"],
  ["A1","pronouns","zamir","sen","you","ты","tu","tú","あなた","你","tu"],
  ["A1","pronouns","zamir","o (erkek)","he","он","lui","él","彼","他","il"],
  ["A1","pronouns","zamir","o (kadın)","she","она","lei","ella","彼女","她","elle"],
  ["A1","pronouns","zamir","biz","we","мы","noi","nosotros","私たち","我们","nous"],
  ["A1","pronouns","zamir","siz","you (plural)","вы","voi","ustedes","皆さん","你们","vous"],
  ["A1","pronouns","zamir","onlar","they","они","loro","ellos","彼ら","他们","ils"],
  ["A1","pronouns","zamir","bu","this","это","questo","esto","これ","这","ceci"],
  ["A1","pronouns","zamir","kim","who","кто","chi","quién","誰","谁","qui"],
  ["A1","pronouns","zamir","ne","what","что","cosa","qué","何","什么","quoi"],
  ["A1","verbs","fiil","olmak","to be","быть","essere","ser","です","是","être"],
  ["A1","verbs","fiil","yapmak","to do","делать","fare","hacer","する","做","faire"],
  ["A1","verbs","fiil","gitmek","to go","идти","andare","ir","行く","去","aller"],
  ["A1","verbs","fiil","gelmek","to come","приходить","venire","venir","来る","来","venir"],
  ["A1","verbs","fiil","konuşmak","to speak","говорить","parlare","hablar","話す","说","parler"],
  ["A1","verbs","fiil","dinlemek","to listen","слушать","ascoltare","escuchar","聞く","听","écouter"],
  ["A1","verbs","fiil","anlamak","to understand","понимать","capire","entender","理解する","理解","comprendre"],
  ["A1","verbs","fiil","öğrenmek","to learn","учиться","imparare","aprender","学ぶ","学习","apprendre"],
  ["A1","verbs","fiil","yemek yemek","to eat","есть","mangiare","comer","食べる","吃","manger"],
  ["A1","verbs","fiil","içmek","to drink","пить","bere","beber","飲む","喝","boire"],
  ["A1","verbs","fiil","okumak","to read","читать","leggere","leer","読む","读","lire"],
  ["A1","verbs","fiil","yazmak","to write","писать","scrivere","escribir","書く","写","écrire"],
  ["A1","expressions","kalıp cümle","Merhaba.","Hello.","Здравствуйте.","Ciao.","Hola.","こんにちは。","你好。","Bonjour."],
  ["A1","expressions","kalıp cümle","Teşekkür ederim.","Thank you.","Спасибо.","Grazie.","Gracias.","ありがとうございます。","谢谢。","Merci."],
  ["A1","expressions","kalıp cümle","Lütfen.","Please.","Пожалуйста.","Per favore.","Por favor.","お願いします。","请。","S'il vous plaît."],
  ["A1","expressions","kalıp cümle","Anlamıyorum.","I don't understand.","Я не понимаю.","Non capisco.","No entiendo.","分かりません。","我不明白。","Je ne comprends pas."],
  ["A1","expressions","kalıp cümle","Adın ne?","What is your name?","Как тебя зовут?","Come ti chiami?","¿Cómo te llamas?","お名前は何ですか。","你叫什么名字？","Comment tu t'appelles ?"],
  ["A1","family","isim","anne","mother","мама","madre","madre","母","母亲","mère"],
  ["A1","family","isim","baba","father","папа","padre","padre","父","父亲","père"],
  ["A1","home","isim","ev","house","дом","casa","casa","家","房子","maison"],
  ["A1","food","isim","su","water","вода","acqua","agua","水","水","eau"],
  ["A1","food","isim","ekmek","bread","хлеб","pane","pan","パン","面包","pain"],
  ["A1","time","isim","bugün","today","сегодня","oggi","hoy","今日","今天","aujourd'hui"],
  ["A1","time","isim","yarın","tomorrow","завтра","domani","mañana","明日","明天","demain"],
  ["A1","grammar","bağlaç","ve","and","и","e","y","そして","和","et"],
  ["A1","grammar","bağlaç","ama","but","но","ma","pero","でも","但是","mais"],
  ["A2","travel","kalıp cümle","İstasyon nerede?","Where is the station?","Где вокзал?","Dov'è la stazione?","¿Dónde está la estación?","駅はどこですか。","车站在哪里？","Où est la gare ?"],
  ["A2","travel","kalıp cümle","Bilet almak istiyorum.","I would like to buy a ticket.","Я хочу купить билет.","Vorrei comprare un biglietto.","Quisiera comprar un billete.","切符を買いたいです。","我想买一张票。","Je voudrais acheter un billet."],
  ["A2","food","kalıp cümle","Menüyü alabilir miyim?","May I have the menu?","Можно меню?","Posso avere il menu?","¿Me trae el menú?","メニューをください。","请给我菜单。","Puis-je avoir le menu ?"],
  ["A2","health","kalıp cümle","Yardıma ihtiyacım var.","I need help.","Мне нужна помощь.","Ho bisogno di aiuto.","Necesito ayuda.","助けが必要です。","我需要帮助。","J'ai besoin d'aide."],
  ["A2","health","isim","doktor","doctor","врач","medico","médico","医者","医生","médecin"],
  ["A2","education","isim","öğretmen","teacher","учитель","insegnante","profesor","先生","老师","professeur"],
  ["A2","work","isim","iş","work","работа","lavoro","trabajo","仕事","工作","travail"],
  ["A2","feelings","sıfat","mutlu","happy","счастливый","felice","feliz","幸せ","快乐","heureux"],
  ["A2","nature","isim","deniz","sea","море","mare","mar","海","海","mer"],
  ["A2","time","zarf","geçen hafta","last week","на прошлой неделе","la settimana scorsa","la semana pasada","先週","上周","la semaine dernière"],
  ["A2","grammar","bağlaç","çünkü","because","потому что","perché","porque","なぜなら","因为","parce que"],
  ["A2","verbs","fiil","hatırlamak","to remember","помнить","ricordare","recordar","覚える","记得","se souvenir"],
  ["B1","expressions","kalıp cümle","Bence bu iyi bir fikir.","I think this is a good idea.","Я думаю, что это хорошая идея.","Penso che sia una buona idea.","Creo que es una buena idea.","それはいい考えだと思います。","我觉得这是个好主意。","Je pense que c'est une bonne idée."],
  ["B1","grammar","bağlaç","eğer","if","если","se","si","もし","如果","si"],
  ["B1","grammar","bağlaç","ancak","however","однако","tuttavia","sin embargo","しかし","然而","cependant"],
  ["B1","verbs","fiil","karar vermek","to decide","решать","decidere","decidir","決める","决定","décider"],
  ["B1","verbs","fiil","açıklamak","to explain","объяснять","spiegare","explicar","説明する","解释","expliquer"],
  ["B1","education","kalıp cümle","Bunu tekrar açıklayabilir misin?","Could you explain it again?","Можешь объяснить ещё раз?","Puoi spiegarlo di nuovo?","¿Puedes explicarlo otra vez?","もう一度説明してくれますか。","你能再解释一次吗？","Peux-tu l'expliquer encore une fois ?"],
  ["B1","work","isim","toplantı","meeting","встреча","riunione","reunión","会議","会议","réunion"],
  ["B1","feelings","isim","endişe","worry","беспокойство","preoccupazione","preocupación","心配","担心","inquiétude"],
  ["B1","nature","isim","çevre","environment","окружающая среда","ambiente","medioambiente","環境","环境","environnement"],
  ["B2","grammar","bağlaç","buna rağmen","nevertheless","тем не менее","ciononostante","sin embargo","それにもかかわらず","尽管如此","néanmoins"],
  ["B2","verbs","fiil","karşılaştırmak","to compare","сравнивать","confrontare","comparar","比較する","比较","comparer"],
  ["B2","verbs","fiil","değerlendirmek","to evaluate","оценивать","valutare","evaluar","評価する","评估","évaluer"],
  ["B2","expressions","kalıp cümle","Bu konuya farklı açılardan bakabiliriz.","We can look at this issue from different perspectives.","Мы можем рассмотреть этот вопрос с разных точек зрения.","Possiamo guardare questo tema da diverse prospettive.","Podemos analizar este tema desde distintas perspectivas.","この問題をさまざまな視点から考えられます。","我们可以从不同的角度看这个问题。","Nous pouvons examiner cette question sous différents angles."],
  ["B2","work","isim","sorumluluk","responsibility","ответственность","responsabilità","responsabilidad","責任","责任","responsabilité"],
  ["B2","abstract","isim","deneyim","experience","опыт","esperienza","experiencia","経験","经验","expérience"],
  ["C1","grammar","bağlaç","bununla birlikte","nonetheless","тем не менее","nondimeno","no obstante","それにもかかわらず","尽管如此","toutefois"],
  ["C1","verbs","fiil","gerekçelendirmek","to justify","обосновывать","giustificare","justificar","正当化する","证明合理","justifier"],
  ["C1","abstract","isim","sürdürülebilirlik","sustainability","устойчивость","sostenibilità","sostenibilidad","持続可能性","可持续性","durabilité"],
  ["C1","abstract","kalıp cümle","Kanıtları dikkatle değerlendirmek gerekir.","It is essential to consider the evidence carefully.","Необходимо тщательно оценить доказательства.","È essenziale valutare attentamente le prove.","Es fundamental evaluar cuidadosamente las pruebas.","証拠を慎重に評価することが重要です。","仔细评估证据至关重要。","Il est essentiel d'examiner attentivement les preuves."],
  ["C1","abstract","kalıp cümle","Bu sonuçlar bağlam içinde değerlendirilmelidir.","These results should be considered in context.","Эти результаты следует рассматривать в контексте.","Questi risultati vanno considerati nel loro contesto.","Estos resultados deben considerarse en su contexto.","これらの結果は文脈の中で考えるべきです。","这些结果应放在具体背景中考虑。","Ces résultats doivent être considérés dans leur contexte."],
  ["A1","pronouns","zamir","benim","my","мой","mio","mi","私の","我的","mon"],
  ["A1","pronouns","zamir","senin","your","твой","tuo","tu","あなたの","你的","ton"],
  ["A1","pronouns","zamir","bizim","our","наш","nostro","nuestro","私たちの","我们的","notre"],
  ["A2","pronouns","zamir","birisi","someone","кто-то","qualcuno","alguien","誰か","某人","quelqu'un"],
  ["B1","pronouns","zamir","kendisi","oneself","себя","se stesso","sí mismo","自分自身","自己","soi-même"],
  ["B2","pronouns","zamir","birbirini","each other","друг друга","l'un l'altro","el uno al otro","お互い","彼此","l'un l'autre"],
  ["C1","pronouns","zamir","her biri","each one","каждый","ciascuno","cada uno","それぞれ","各自","chacun"],
  ["A1","grammar","soru sözcüğü","nerede","where","где","dove","dónde","どこ","哪里","où"],
  ["A1","grammar","soru sözcüğü","ne zaman","when","когда","quando","cuándo","いつ","什么时候","quand"],
  ["A1","grammar","soru sözcüğü","neden","why","почему","perché","por qué","なぜ","为什么","pourquoi"],
  ["A1","grammar","kalıp cümle","Bu nedir?","What is this?","Что это?","Che cos'è questo?","¿Qué es esto?","これは何ですか。","这是什么？","Qu'est-ce que c'est ?"],
  ["A1","expressions","kalıp cümle","İyiyim, teşekkürler.","I am fine, thank you.","У меня всё хорошо, спасибо.","Sto bene, grazie.","Estoy bien, gracias.","元気です、ありがとう。","我很好，谢谢。","Je vais bien, merci."],
  ["A1","expressions","kalıp cümle","Tekrar eder misiniz?","Could you repeat that?","Повторите, пожалуйста.","Può ripetere, per favore?","¿Puede repetir, por favor?","もう一度お願いします。","请再说一遍。","Pouvez-vous répéter, s'il vous plaît ?"],
  ["A2","grammar","kalıp cümle","Dün bir kitap okudum.","I read a book yesterday.","Вчера я читал книгу.","Ieri ho letto un libro.","Ayer leí un libro.","昨日、本を読みました。","昨天我读了一本书。","J'ai lu un livre hier."],
  ["A2","grammar","kalıp cümle","Yarın çalışacağım.","I will work tomorrow.","Завтра я буду работать.","Domani lavorerò.","Mañana trabajaré.","明日、働きます。","明天我会工作。","Je travaillerai demain."],
  ["A2","grammar","kalıp cümle","Biraz yüzebilirim.","I can swim a little.","Я немного умею плавать.","So nuotare un po'.","Sé nadar un poco.","少し泳げます。","我会游一点泳。","Je sais nager un peu."],
  ["A2","travel","kalıp cümle","Bu otobüs merkeze gider mi?","Does this bus go to the city centre?","Этот автобус идёт в центр?","Questo autobus va in centro?","¿Este autobús va al centro?","このバスは中心部へ行きますか。","这辆公交车去市中心吗？","Ce bus va-t-il au centre-ville ?"],
  ["A2","health","kalıp cümle","Kendimi iyi hissetmiyorum.","I do not feel well.","Я плохо себя чувствую.","Non mi sento bene.","No me encuentro bien.","気分がよくありません。","我感觉不舒服。","Je ne me sens pas bien."],
  ["B1","grammar","kalıp cümle","Zamanım olursa geleceğim.","If I have time, I will come.","Если у меня будет время, я приду.","Se avrò tempo, verrò.","Si tengo tiempo, vendré.","時間があれば、行きます。","如果有时间，我会来。","Si j'ai le temps, je viendrai."],
  ["B1","grammar","kalıp cümle","Bunu daha önce görmüştüm.","I have seen this before.","Я это уже видел.","L'ho già visto.","Ya he visto esto antes.","これを以前見たことがあります。","我以前见过这个。","J'ai déjà vu cela."],
  ["B1","work","kalıp cümle","Bu projeyi birlikte tamamlayabiliriz.","We can finish this project together.","Мы можем завершить этот проект вместе.","Possiamo completare questo progetto insieme.","Podemos terminar este proyecto juntos.","このプロジェクトを一緒に完成できます。","我们可以一起完成这个项目。","Nous pouvons terminer ce projet ensemble."],
  ["B1","feelings","kalıp cümle","Nasıl hissettiğini anlıyorum.","I understand how you feel.","Я понимаю, что ты чувствуешь.","Capisco come ti senti.","Entiendo cómo te sientes.","あなたの気持ちが分かります。","我理解你的感受。","Je comprends ce que tu ressens."],
  ["B2","grammar","kalıp cümle","Yağmur yağsa bile gideceğiz.","Even if it rains, we will go.","Мы пойдём, даже если будет дождь.","Andremo anche se piove.","Iremos aunque llueva.","雨が降っても行きます。","即使下雨，我们也会去。","Nous irons même s'il pleut."],
  ["B2","education","kalıp cümle","Bir karar vermeden önce seçenekleri karşılaştıralım.","Let's compare the options before making a decision.","Давайте сравним варианты, прежде чем принять решение.","Confrontiamo le opzioni prima di prendere una decisione.","Comparemos las opciones antes de tomar una decisión.","決める前に選択肢を比べましょう。","做决定之前，让我们比较一下选项。","Comparons les options avant de prendre une décision."],
  ["B2","expressions","kalıp cümle","Her iki görüşün de güçlü yanları var.","Both viewpoints have their strengths.","У обеих точек зрения есть сильные стороны.","Entrambi i punti di vista hanno dei punti di forza.","Ambos puntos de vista tienen sus puntos fuertes.","どちらの意見にも長所があります。","两种观点都有其优点。","Les deux points de vue ont leurs points forts."],
  ["C1","grammar","kalıp cümle","Daha önce bilseydim farklı davranırdım.","Had I known earlier, I would have acted differently.","Если бы я знал раньше, я бы поступил иначе.","Se l'avessi saputo prima, avrei agito diversamente.","Si lo hubiera sabido antes, habría actuado de otra manera.","もっと早く知っていれば、別の行動を取ったでしょう。","如果我早知道，就会采取不同的行动。","Si je l'avais su plus tôt, j'aurais agi autrement."],
  ["C1","abstract","kalıp cümle","Uzun vadeli sonuçları da hesaba katmalıyız.","We must also take the long-term consequences into account.","Мы также должны учитывать долгосрочные последствия.","Dobbiamo considerare anche le conseguenze a lungo termine.","También debemos tener en cuenta las consecuencias a largo plazo.","長期的な結果も考慮しなければなりません。","我们还必须考虑长期后果。","Nous devons également tenir compte des conséquences à long terme."],
  ["C1","work","kalıp cümle","Bu yaklaşımın sınırlılıklarını göz önünde bulundurmalıyız.","We should consider the limitations of this approach.","Мы должны учитывать ограничения этого подхода.","Dovremmo considerare i limiti di questo approccio.","Debemos considerar las limitaciones de este enfoque.","この方法の限界を考慮する必要があります。","我们应该考虑这种方法的局限性。","Nous devons tenir compte des limites de cette approche."],
  ["A1","abstract","isim","fikir","idea","идея","idea","idea","考え","想法","idée"],
  ["A2","abstract","isim","seçim","choice","выбор","scelta","elección","選択","选择","choix"],
  ["B1","abstract","isim","çaba","effort","усилие","impegno","esfuerzo","努力","努力","effort"],
  ["A2","expressions","kalıp cümle","Biraz daha yavaş konuşabilir misiniz?","Could you speak more slowly?","Не могли бы вы говорить медленнее?","Può parlare più lentamente?","¿Puede hablar más despacio?","もう少しゆっくり話してもらえますか。","请您说慢一点好吗？","Pourriez-vous parler plus lentement ?"],
  ["C1","expressions","kalıp cümle","Açıklamak için zaman ayırdığınız için teşekkür ederim.","I appreciate your taking the time to explain.","Благодарю вас за то, что нашли время объяснить.","La ringrazio per aver trovato il tempo di spiegare.","Le agradezco que se haya tomado el tiempo de explicarlo.","お時間を割いてご説明いただき、ありがとうございます。","感谢您抽出时间解释。","Je vous remercie d'avoir pris le temps de m'expliquer."],
];

const INDEX: Record<LangCode, number> = { en: 4, ru: 5, it: 6, es: 7, ja: 8, zh: 9, fr: 10 };
export function curatedEntries(lang: LangCode): CurriculumEntry[] {
  return ROWS.map((row) => ({ level: row[0], topic: row[1], pos: row[2], translation: row[3], text: row[INDEX[lang]], tier: row[2] === "kalıp cümle" ? 3 : 1 }));
}

/** A rough ordering by corpus frequency, not an official CEFR classification. */
export function estimatedLevel(rank: number): Level {
  if (rank < 550) return "A1";
  if (rank < 1500) return "A2";
  if (rank < 3000) return "B1";
  if (rank < 4800) return "B2";
  return "C1";
}

const RULES: [Topic, RegExp][] = [
  ["pronouns", /^(ben|sen|biz|siz|onlar|onun|bana|sana|kendisi|kim|ne|bu|şu)$/iu],
  ["family", /anne|baba|kardeş|aile|çocuk|arkadaş|eşim|kız kardeş|oğul|kızım|akraba/iu],
  ["home", /ev|oda|kapı|pencere|mutfak|yatak|masa|sandalye|mobilya|banyo/iu],
  ["food", /yemek|içmek|yiyecek|su|kahve|çay|ekmek|süt|peynir|meyve|sebze|restoran|kahvaltı/iu],
  ["travel", /seyahat|uçak|tren|otobüs|araba|istasyon|bilet|pasaport|yolculuk|taksi|havaalan/iu],
  ["health", /sağlık|doktor|hastane|ilaç|hasta|ağrı|vücut|diş|baş ağrısı/iu],
  ["education", /okul|öğretmen|öğrenci|öğren|ders|sınav|kitap|üniversite|eğitim/iu],
  ["work", /iş|çalış|ofis|maaş|para|banka|şirket|müşteri|toplantı|meslek/iu],
  ["feelings", /sevgi|mutlu|üzgün|kork|endişe|duygu|öfke|heyecan|aşk|yalnız/iu],
  ["nature", /doğa|deniz|dağ|nehir|ağaç|orman|hava|yağmur|güneş|hayvan|çiçek|çevre/iu],
  ["time", /zaman|sabah|akşam|gece|hafta|gün|saat|dakika|yarın|bugün|dün|yıl|aylar/iu],
  ["grammar", /^(ve|ama|ancak|çünkü|eğer|ile|veya|fakat|buna rağmen|bununla birlikte)$/iu],
  ["verbs", /(?:mak|mek)(?:\b|,|$)/iu],
];
export function estimatedTopic(translation: string, tier: number): Topic {
  if (tier === 2) return "time";
  for (const [topic, pattern] of RULES) if (pattern.test(translation)) return topic;
  return tier === 0 || tier === 3 ? "expressions" : "general";
}
