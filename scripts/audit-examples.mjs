import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Reject substring matches: each example must contain the complete segmented word.
for (const lang of ['en','ru','it','es','ja','zh','fr']) {
  const file=path.join(process.cwd(),'src/data/examples',`${lang}.json`);
  const data=JSON.parse(await readFile(file,'utf8'));
  const segmenter=new Intl.Segmenter(lang,{granularity:'word'});
  const verified={};
  for(const [word,entry] of Object.entries(data)){
    if(!Array.isArray(entry)||!entry[0]||!entry[1]||!entry[2])continue;
    const tokens=Array.from(segmenter.segment(entry[0]),s=>s.segment.trim().toLowerCase());
    if(tokens.includes(word.toLowerCase()))verified[word]=entry;
  }
  const count=Object.keys(verified).length;
  if(count<6000)throw new Error(`${lang}: only ${count} complete-word examples`);
  if(process.argv.includes('--write'))await writeFile(file,JSON.stringify(verified));
  console.log(`${lang}: ${count} exact examples (${Object.keys(data).length-count} rejected)`);
}
