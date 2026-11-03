import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Full Tatoeba Japanese + Turkish links, with contributor attribution.
const root=process.cwd(), dir='/tmp/nocta-corpus';
async function* lines(file){
  const proc=spawn('bzcat',[path.join(dir,file)]);
  const exited=new Promise(resolve=>proc.on('close',resolve));
  const input=createInterface({input:proc.stdout,crlfDelay:Infinity});
  for await(const line of input) yield line;
  if(await exited!==0) throw new Error(`Cannot decompress ${file}`);
}
const englishTurkish=new Map();
for await(const line of lines('tur-eng_links.tsv.bz2')){
  const [tur,eng]=line.split('\t');if(!tur||!eng)continue;
  const values=englishTurkish.get(eng)??[];
  if(values.length<4&&!values.includes(tur)){values.push(tur);englishTurkish.set(eng,values);}
}
const pairs=new Map();
function add(jp,tur){const values=pairs.get(jp)??[];if(values.length<8&&!values.includes(tur)){values.push(tur);pairs.set(jp,values)}}
for await(const line of lines('jpn-tur_links.tsv.bz2')){const [jp,tur]=line.split('\t');if(jp&&tur)add(jp,tur)}
for await(const line of lines('jpn-eng_links.tsv.bz2')){
  const [jp,eng]=line.split('\t');for(const tur of englishTurkish.get(eng)??[])add(jp,tur);
}
console.log('Japanese sentences linked to Turkish:',pairs.size);
const wanted=new Set(Array.from(pairs.values()).flat());
const turkish=new Map();
const unsafe=/\b(?:siktir|sikmek|amk|orospu|tecavüz|intihar)\b/iu;
for await(const line of lines('tur_sentences_detailed.tsv.bz2')){
  const [id,,text,author]=line.split('\t');
  if(wanted.has(id)&&text&&text.length<=150&&author&&author!=='\\N'&&!unsafe.test(text))turkish.set(id,{text,author});
}
console.log('Attributed Turkish sentences:',turkish.size);
const existing=JSON.parse(await readFile(path.join(root,'src/data/lexicon/ja.json'),'utf8'));
const existingWords=new Set(existing.map(x=>x.w.toLowerCase()));
const vocab=new Set(existingWords);
for(const line of (await readFile(path.join(dir,'freq-ja.txt'),'utf8')).split('\n')){
  const word=line.trim().split(/\s+/)[0]?.toLowerCase();
  if(word&&/^[\u3040-\u30ff\u4e00-\u9faf]{2,7}$/u.test(word))vocab.add(word);
  if(vocab.size>=25000)break;
}
const segmenter=new Intl.Segmenter('ja',{granularity:'word'}),found={};
for await(const line of lines('jpn_sentences_detailed.tsv.bz2')){
  const [id,,sentence,author]=line.split('\t');
  if(!pairs.has(id)||!sentence||sentence.length<3||sentence.length>150||!author||author==='\\N')continue;
  const trId=pairs.get(id).find(candidate=>turkish.has(candidate));
  if(!trId)continue;
  const tr=turkish.get(trId);
  const words=new Set();
  for(const segment of segmenter.segment(sentence)){
    const word=segment.segment.toLowerCase();
    if(segment.isWordLike&&vocab.has(word))words.add(word);
  }
  const original=`CC BY 2.0 FR · Tatoeba #${id} (${author})`;
  const translated=`CC BY 2.0 FR · Tatoeba #${trId} (${tr.author})`;
  for(const word of words){
    if(!Object.prototype.hasOwnProperty.call(found,word)||sentence.length<found[word][0].length)
      found[word]=[sentence,tr.text,original,translated];
  }
}
await writeFile(path.join(dir,'examples-exact-ja-full.json'),JSON.stringify(found));
console.log('Japanese exact examples:',Object.keys(found).length,'among existing words:',Object.keys(found).filter(w=>existingWords.has(w)).length);
