// Minimal helpers shared by the scripture scripts: a zip reader and a USFM verse extractor.
import { inflateRawSync } from 'node:zlib';

/** Read one file out of a zip buffer (central directory lookup, deflate or stored). */
export function unzipFile(buf, match) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (match(name)) {
      const ln = buf.readUInt16LE(local + 26);
      const le = buf.readUInt16LE(local + 28);
      const data = buf.subarray(local + 30 + ln + le, local + 30 + ln + le + csize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('File not found in zip');
}

/** Extract plain verse text from USFM: returns Map("chapter:verse" -> text). */
export function parseUsfm(usfm) {
  const out = new Map();
  let chapter = 0;
  let verse = 0;
  let acc = '';
  const flush = () => {
    if (chapter && verse) out.set(`${chapter}:${verse}`, clean(acc));
    acc = '';
  };
  for (const line of usfm.split(/\r?\n/)) {
    const c = /^\\c (\d+)/.exec(line);
    if (c) {
      flush();
      chapter = Number(c[1]);
      verse = 0;
      continue;
    }
    let rest = line;
    const v = /^\\v (\d+) ?(.*)$/.exec(line);
    if (v) {
      flush();
      verse = Number(v[1]);
      rest = v[2];
    } else if (/^\\(s\d?|ms\d?|mr|r|d|sp|qa|cl|cp|h|toc\d|mt\d?|id|ide|rem)\b/.test(line)) {
      continue; // headings and titles are not verse text
    }
    if (verse) acc += ' ' + rest;
  }
  flush();
  return out;
}

function clean(s) {
  return s
    .replace(/\\f .*?\\f\*/g, '') // footnotes
    .replace(/\\x .*?\\x\*/g, '') // cross references
    .replace(/\\\+?w ([^|\\]*)(\|[^\\]*)?\\\+?w\*/g, '$1') // word-level markup with Strong's numbers
    .replace(/\\[a-z]+\d?\*?/g, ' ') // remaining paragraph and character markers
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?”’])/g, '$1')
    .trim();
}
