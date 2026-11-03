import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),dir='/tmp/nocta-corpus';
const lex=JSON.parse(await readFile(path.join(root,'src/data/lexicon/ja.json'),'utf8'));
const existing=new Set(lex.map(x=>x.w.toLowerCase())),vocab=new Set(existing);
for(const row of (await readFile(path.join(dir,'freq-ja.txt'),'utf8')).split('\n')){
 const word=row.trim().split(/\s+/)[0]?.toLowerCase();if(word&&/^[\u3040-\u30ff\u4e00-\u9faf]{2,7}$/u.test(word))vocab.add(word);
}
const linked=JSON.parse(await readFile(path.join(dir,'examples-exact-ja-full.json'),'utf8'));
const found={},segmenter=new Intl.Segmenter('ja',{granularity:'word'});
const proc=spawn('bzcat',[path.join(dir,'jpn_sentences_detailed.tsv.bz2')]);
const done=new Promise(resolve=>proc.on('close',resolve));
const reader=createInterface({input:proc.stdout,crlfDelay:Infinity});
for await(const line of reader){
 const [id,,sentence,author]=line.split('\t');
 if(!id||!sentence||sentence.length<3||sentence.length>140||!author||author==='\\N'||/(殺|自殺|麻薬|暴力|裸)/u.test(sentence))continue;
 const words=new Set();
 for(const s of segmenter.segment(sentence)){const word=s.segment.toLowerCase();if(s.isWordLike&&vocab.has(word)&&!Object.prototype.hasOwnProperty.call(linked,word))words.add(word)}
 for(const word of words){if(!found[word]||sentence.length<found[word][0].length)found[word]=[sentence,`CC BY 2.0 FR · Tatoeba #${id} (${author})`];}
}
if(await done!==0)throw new Error('Cannot read Japanese source');
await writeFile(path.join(dir,'examples-unlinked-ja.json'),JSON.stringify(found));
const linkedExisting=Array.from(existing).filter(w=>Object.prototype.hasOwnProperty.call(linked,w)).length;
const unlinkedExisting=Array.from(existing).filter(w=>Object.prototype.hasOwnProperty.call(found,w)).length;
console.log('Japanese existing:',existing.size,'attributed direct/pivot:',linkedExisting,'additional sourced sentences:',unlinkedExisting,'total coverage:',linkedExisting+unlinkedExisting);
console.log('Japanese candidate coverage:',Object.keys(linked).length+Object.keys(found).length);
