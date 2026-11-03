#!/usr/bin/env python3
"""Build attributed Tatoeba examples using shared English sentence IDs.

Input: /tmp/nocta-corpus/{tur,fra,spa,ita,rus,jpn,cmn}.zip
Output: src/data/examples/{en,fr,es,it,ru,ja,zh}.json
Every stored example retains the original Tatoeba owner/ID attribution from
both source pairs. Cross-language Turkish examples use English as a pivot and
should be treated as illustrative, not professionally verified translations.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = Path(os.environ.get('NOCTA_CORPUS_DIR', '/tmp/nocta-corpus'))
OUTPUT = ROOT / 'src' / 'data' / 'examples'
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCES = {'en':'tur', 'fr':'fra', 'es':'spa', 'it':'ita', 'ru':'rus', 'ja':'jpn', 'zh':'cmn'}
ATTR = re.compile(r'tatoeba\.org\s+#(\d+)\s+\([^)]*\)\s+&\s+#(\d+)\s+\([^)]*\)')
TOKENS = re.compile(r"[^\W\d_]+(?:['’\-][^\W\d_]+)*", re.UNICODE)
UNSAFE = re.compile(r'\b(?:fuck|shit|asshole|bastard|kill|murder|suicide|rape|gun|guns|drugs|naked)\b', re.I)
CANDIDATES = '--candidates' in sys.argv
VALID = {
    'en': re.compile(r'^[a-z]{2,16}$'),
    'fr': re.compile(r'^[a-zàâçéèêëîïôûùüÿœæ]{2,18}$'),
    'es': re.compile(r'^[a-záéíóúüñ]{2,18}$'),
    'it': re.compile(r'^[a-zàèéìíîòóùú]{2,18}$'),
    'ru': re.compile(r'^[а-яё]{2,18}$'),
    'ja': re.compile(r'^[\u3040-\u30ff\u4e00-\u9faf]{2,7}$'),
    'zh': re.compile(r'^[\u4e00-\u9fff]{2,5}$'),
}


def archive_lines(name):
    proc = subprocess.Popen(['unzip', '-p', str(CORPUS / f'{name}.zip'), f'{name}.txt'], stdout=subprocess.PIPE, text=True, encoding='utf8', errors='replace')
    assert proc.stdout is not None
    try:
        yield from proc.stdout
    finally:
        proc.stdout.close()
        if proc.wait() != 0:
            raise RuntimeError(f'cannot extract {name}')


def parts(line):
    fields = line.rstrip('\r\n').split('\t')
    if len(fields) < 3:
        return None
    en, target, attribution = fields[:3]
    match = ATTR.search(attribution)
    if not match or not (5 <= len(en) <= 170 and 2 <= len(target) <= 170) or UNSAFE.search(en):
        return None
    return en, target, attribution, match.group(1)


def build_trie(words):
    root = {}
    for word in words:
        node = root
        for char in word:
            node = node.setdefault(char, {})
        node[''] = word
    return root


def east_asian_words(text, trie):
    found = set()
    text = text.lower()
    for i in range(len(text)):
        node = trie
        for char in text[i:i + 7]:
            node = node.get(char)
            if node is None:
                break
            if '' in node:
                found.add(node[''])
    return found


def main():
    turkish = {}
    for row in archive_lines('tur'):
        item = parts(row)
        if not item:
            continue
        en, tr, attr, eng_id = item
        if eng_id not in turkish:
            turkish[eng_id] = (tr, attr)
    print(f'Turkish pairs indexed: {len(turkish)}', flush=True)

    for lang, archive in SOURCES.items():
        lex = json.loads((ROOT / 'src/data/lexicon' / f'{lang}.json').read_text(encoding='utf8'))
        existing = {item['w'].lower() for item in lex}
        vocab = set(existing)
        if CANDIDATES:
            for row in (CORPUS / f'freq-{lang}.txt').read_text(encoding='utf8').splitlines():
                word = row.split()[0].lower() if row.split() else ''
                if VALID[lang].fullmatch(word):
                    vocab.add(word)
                if len(vocab) >= 25000:
                    break
        found = {}
        trie = build_trie(vocab) if lang in ('ja', 'zh') else None
        for row in archive_lines(archive):
            item = parts(row)
            if not item:
                continue
            en, target, attr, eng_id = item
            if eng_id not in turkish:
                continue
            tr, tr_attr = turkish[eng_id]
            sentence = en if lang == 'en' else target
            if len(sentence) > 150 or len(tr) > 150:
                continue
            if trie is not None:
                hits = east_asian_words(sentence, trie)
            else:
                hits = {token.lower() for token in TOKENS.findall(sentence)} & vocab
            for word in hits:
                if word not in found:
                    found[word] = [sentence, tr, attr, tr_attr if attr != tr_attr else '']
        file = (CORPUS / f'examples-candidates-{lang}.json') if CANDIDATES else (OUTPUT / f'{lang}.json')
        file.write_text(json.dumps(found, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
        print(f'{lang}: {len(existing.intersection(found))} existing, {len(found)} / {len(vocab)} total contextual words ({file.stat().st_size // 1024} KB)', flush=True)


if __name__ == '__main__':
    main()
