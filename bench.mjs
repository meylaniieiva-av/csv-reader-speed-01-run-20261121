// Benchmark for solve.js: builds a deterministic broken-CSV corpus (seeded
// PRNG, no input files needed), parses it with run(), and prints timing,
// throughput, and a determinism check (two runs must be byte-identical).
//
//   node --no-incremental-marking bench.mjs
//
// The numbers this prints are machine-dependent; they are a local sanity
// check, not the graded result. The graded comparison is the kit's local
// grader (see README.md): it runs main.ts on the practice set and scores
// the answers against the reference.

import { run } from './solve.js';

let seed = 20261121;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'café', 'Zürich', '東京', 'naïve', "O'Brien", '#42', '50%', '(none)'];

function makeCase(chars, header, eol) {
  const kinds = ['int', 'word', 'phrase', 'note'];
  const width = 12;
  let out = header ? Array.from({ length: width }, (_, i) => `col_${i + 1}`).join(',') + eol : '';
  let length = out.length;
  while (length < chars) {
    const nf = width;
    const fs = [];
    for (let f = 0; f < nf; f++) {
      const k = pick(kinds);
      let s;
      if (k === 'int') s = String(Math.floor(rnd() * 100000));
      else if (k === 'word') s = pick(WORDS);
      else if (k === 'phrase') s = pick(WORDS) + ', ' + pick(WORDS);
      else s = rnd() < 0.15 ? pick(WORDS) + eol + pick(WORDS) : pick(WORDS);
      if (s.includes(',') || s.includes('\n') || s.includes('\r') || rnd() < 0.01) {
        s = '"' + s.replaceAll('"', '""') + '"';
        if (rnd() < 0.01) s += pick(['kg', 'x', '!']);
      }
      if (rnd() < 0.004) s = pick(WORDS) + '\r' + pick(WORDS); // stray CR
      fs.push(s);
    }
    if (rnd() < 0.01) fs.length -= 1; // short row
    if (rnd() < 0.01) fs.push('extra'); // long row
    const line = fs.join(',') + eol;
    out += line;
    length += line.length;
  }
  return { text: out, header };
}

const cases = [
  makeCase(1_700_000, true, '\n'),
  makeCase(1_700_000, true, '\r\n'),
  makeCase(1_500_000, false, '\n'),
];
const totalChars = cases.reduce((s, c) => s + c.text.length, 0);
console.log(`corpus: ${cases.length} cases, ${(totalChars / 1e6).toFixed(2)} MB of CSV`);

function timed(fn) {
  const t0 = process.hrtime.bigint();
  const res = cases.map(fn);
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, res };
}

timed(run); // warm-up
const ts = [];
for (let r = 0; r < 5; r++) ts.push(timed(run).ms);
ts.sort((a, b) => a - b);
const median = ts[2];
console.log(`parse: ${ts.map((x) => x.toFixed(0)).join(', ')} ms (median ${median.toFixed(1)} ms)`);
console.log(`throughput: ${(totalChars / 1e6 / (median / 1000)).toFixed(1)} MB/s`);

const a = JSON.stringify(cases.map(run));
const b = JSON.stringify(cases.map(run));
console.log('deterministic (two runs identical):', a === b);
const first = JSON.parse(a)[0];
console.log(`case 1: ${first.rows.length} rows, ${first.errors.length} errors, columns: ${JSON.stringify(first.columns)}`);
