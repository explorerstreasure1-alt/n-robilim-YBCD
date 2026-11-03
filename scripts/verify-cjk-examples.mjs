import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Exact Intl.Segmenter word boundaries, unlike naive character substrings.
const root=process.cwd(), corpus='/tmp/nocta-corpus';
const attrs=/tatoeba\.org\s+#(\d+)\s+\([^)]*\)\s+&\s+#(\d+)\s+\([^)]*\)/;
const unsafe=/\b(?:fuck|shit|asshole|bastard|kill|murder|suicide|rape|gun|guns|drugs|naked)\b/i;
async function* lines(name){
  const proc=spawn('unzip',['-p',path.join(corpus,`${name}.zip`),`${name}.txt`]);
  const exited=new Promise((resolve)=>proc.on('close',resolve));
  const reader=createInterface({input:proc.stdout,crlfDelay:Infinity});
  for await(const line of reader) yield line;
  const code=await exited;
  if(code!==0) throw new Error(`unzip ${name} exited ${code}`);
}
function parse(line){
  const [en,target,attr]=line.split('\t');
  const match=attr?.match(attrs);
  return match&&en?.length>=5&&en.length<=170&&target?.length>=2&&target.length<=170&&!unsafe.test(en)
    ? {en,target,attr,id:match[1]} : null;
}
const turkish=new Map();
for await(const line of lines('tur')){
  const x=parse(line);if(x&&!turkish.has(x.id))turkish.set(x.id,[x.target,x.attr]);
}
console.log('Turkish pivot indexed:',turkish.size);
for(const [lang,archive,valid] of [['ja','jpn',/^[\u3040-\u30ff\u4e00-\u9faf]{2,7}$/u],['zh','cmn',/^[\u4e00-\u9fff]{2,5}$/u]]){
  const lex=JSON.parse(await readFile(path.join(root,`src/data/lexicon/${lang}.json`),'utf8'));
  const existing=new Set(lex.map(x=>x.w.toLowerCase()));
  const vocab=new Set(existing);
  const frequencies=(await readFile(path.join(corpus,`freq-${lang}.txt`),'utf8')).split('\n');
  for(const row of frequencies){const word=row.trim().split(/\s+/)[0]?.toLowerCase();if(word&&valid.test(word))vocab.add(word);if(vocab.size>=25000)break;}
  const segmenter=new Intl.Segmenter(lang,{granularity:'word'}), found={};
  for await(const line of lines(archive)){
    const x=parse(line);if(!x||!turkish.has(x.id)||x.target.length>150)continue;
    const [tr,trAttr]=turkish.get(x.id);if(tr.length>150)continue;
    const hits=new Set();
    for(const segment of segmenter.segment(x.target)){
      const word=segment.segment.toLowerCase();
      if(segment.isWordLike&&vocab.has(word)) hits.add(word);
    }
    for(const word of hits)if(!Object.prototype.hasOwnProperty.call(found,word))found[word]=[x.target,tr,x.attr,x.attr===trAttr?'':trAttr];
  }
  const file=path.join(corpus,`examples-exact-${lang}.json`);
  await writeFile(file,JSON.stringify(found));
  console.log(lang,'exact word boundary examples:',Object.keys(found).length,'existing vocabulary:',Object.keys(found).filter(k=>existing.has(k)).length);
}
