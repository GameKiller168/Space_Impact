#!/usr/bin/env python3
"""Extract the Space Impact texts of every language section of a Nokia 3310 v6.39 flash image and its PPM packs.

The phone keeps one text table per language. A section is laid out as

    8 bytes    header: 00 00 00 <kind>, then the section size as a big-endian u32 (counted from the header start)
    4 bytes    language tag (ENGL, GERM, FREN, ...)
    4 bytes    flags: 08 00 00 00 for 8-bit text, 8c 00 00 00 for the UTF-8 languages (Hungarian, Romanian ...)
    n bytes    one length byte per text (n = 1333 for the 8-bit sections, a few more for the UTF-8 ones)
    1+ bytes   0xff terminator
    text       all texts back to back, without separators

A text id is the index in the length table (the same ids in every 8-bit language). The ids Space Impact uses were
found by decoding the English table of the main image and the games menu framework's data tables:

    575  Space impact (game name)        552 Continue            553 Top score          554 Instructions
    560  New game                        537 "Top score:\\n%N"    576 "Game over!\\nTOP SCORE:\\n%N"
    578  "Game over!\\nYour score:\\n%N"   579 "Game over!\\nYOU WON!"                      1332 Space Impact instructions

The instruction text is the last text of every section, so for the UTF-8 sections (whose table has extra entries and
whose first text is the language name in UCS-2) it is read backwards from the end of the section.

Usage: python3 tools/spaceimpact_extract_texts.py --flash main.fls --ppm-dir DIR [--output FILE]
The firmware itself is not stored; the output holds only the few extracted strings.
"""
import argparse, glob, hashlib, json, os, re, struct
from pathlib import Path

IDS = {'NAME': 575, 'CONTINUE': 552, 'TOP_SCORE': 553, 'INSTRUCTIONS': 554, 'NEW_GAME': 560, 'TOP_SCORE_NOTE': 537,
       'GAME_OVER_TOP': 576, 'GAME_OVER_SCORE': 578, 'YOU_WON': 579, 'GAME_OVER': 536, 'GAMES': 549}
INSTRUCTION_ID = 1332
COUNT = 1333
TAGS = set('ENGL GERM FREN ITAL DUTC SPAN PORT DANI SWED NORW FINN CROA SERB SLVE CZEC SLVA POLI ESTO TAGA INDO MALA HUNG ROMA RUSS BULG UKRA GREE TURK LATV LITH THAI VIET HEBR ARAB HIND FARS AFRI AMEN AMSP CANF BRPO'.split())
HEADER = re.compile(rb'\x00\x00\x00[\x00-\xff]\x00\x00[\x00-\xff]{2}([A-Z]{4})([\x00-\xff])\x00\x00\x00')


def sections(data):
    """Yield (header_start, tag, flag, size) for every text-table section."""
    found = []
    for m in HEADER.finditer(data):
        start = m.start()
        size = struct.unpack('>I', data[start + 4:start + 8])[0]
        if size < 0x4000 or start + size > len(data) + 8:
            continue
        found.append((start, m.group(1).decode(), data[m.end() - 4], size))
    return found


def read_section(data, start, tag, flag, size, next_start):
    """Decode one section; returns a dict with 'texts' (id -> bytes) for 8-bit sections and the instruction text."""
    tbl = start + 16
    ends = []
    if next_start is not None:
        end = next_start
        while end > start and data[end - 1] == 0xff:
            end -= 1
        ends.append(end)
    ends.append(start + size)
    utf8 = bool(flag & 0x80)
    if not utf8:
        for end in ends:
            cum = 0
            for n in range(1, 1500):
                cum += data[tbl + n - 1]
                if tbl + n + 1 + cum == end and n >= 1300:
                    lens = list(data[tbl:tbl + n])
                    pos = tbl + n + 1
                    texts = {}
                    for i, length in enumerate(lens):
                        texts[i] = data[pos:pos + length]
                        pos += length
                    return {'tag': tag, 'utf8': False, 'count': n, 'instruction': texts[n - 1], 'texts': texts}
                if tbl + n + cum > end:
                    break
        return None
    # UTF-8 sections: the table has a few more entries and the first text is the language name in UCS-2, so only the
    # last text (the instructions) is taken, read backwards from the end of the section.
    n = next((i for i in range(1300, 1400) if data[tbl + i] == 0xff and data[tbl + i - 1] != 0xff), None)
    if n is None or next_start is None:
        return None
    end = ends[0]
    last = data[tbl + n - 1]
    return {'tag': tag, 'utf8': True, 'count': n, 'instruction': data[end - last:end], 'texts': {}}


def decode(raw, utf8, codec):
    return raw.decode('utf-8', 'replace') if utf8 else raw.decode(codec, 'replace')


def extract(path, label, codecs):
    data = Path(path).read_bytes()
    found = sections(data)
    out = []
    for i, (start, tag, flag, size) in enumerate(found):
        next_start = found[i + 1][0] if i + 1 < len(found) else None
        section = read_section(data, start, tag, flag, size, next_start)
        if not section or tag not in TAGS:
            continue
        codec = codecs.get(label, 'latin-1')
        entry = {'pack': label, 'tag': tag, 'utf8': section['utf8'], 'count': section['count'],
                 'instruction': decode(section['instruction'], section['utf8'], codec)}
        if section['texts']:
            for key, ident in IDS.items():
                entry[key] = decode(section['texts'][ident], False, codec)
            entry['instruction_from_table'] = decode(section['texts'][INSTRUCTION_ID], False, codec)
        out.append(entry)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--flash', required=True)
    parser.add_argument('--ppm-dir', required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    codecs = {'MAIN': 'latin-1'}
    result = {'firmware_sha256': hashlib.sha256(Path(args.flash).read_bytes()).hexdigest(), 'sections': []}
    result['sections'] += extract(args.flash, 'MAIN', codecs)
    for path in sorted(glob.glob(os.path.join(args.ppm_dir, 'NHM5NY06.39[A-Y]'))):
        result['sections'] += extract(path, path[-1], codecs)
    text = json.dumps(result, ensure_ascii=False, indent=1)
    if args.output:
        args.output.write_text(text + '\n', encoding='utf-8')
    else:
        print(text)


if __name__ == '__main__':
    main()
