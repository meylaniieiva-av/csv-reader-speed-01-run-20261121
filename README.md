# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/meylaniieiva-av/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/meylaniieiva-av/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: it returns byte-identical answers on every tested input while parsing about 3x faster than the reference on the practice set.

## Summary

csv-reader 1.0.0 reads a CSV text one character at a time, building every field with `value += c`. This entry (`solve.js`) keeps the reference's exact broken-row semantics but works segment by segment: each unquoted field is located with `indexOf` and taken with one `slice`, each quoted field with one `indexOf` for its closing quote and one `slice` for its content. The slow paths (stray CR, CR inside quotes, unterminated quote, characters after a closing quote) run only when the input actually holds them. The driver (`main.ts`) is the house driver, unchanged.

## Measured impact (honest numbers, local machine only)

- Practice set (6 cases, 10.19 MB of CSV, 63,692 rows, 709,543 fields): parse-only, interleaved rounds against csv-reader 1.0.0, median speedup **2.74x** across 10 rounds (range 1.45x–3.61x; this VM shares its CPU, so round-to-round times vary widely). Earlier runs measured medians of 2.7x–4.7x. The claim is "about 3x on this shape of input", not a fixed constant.
- Correctness: **6/6 practice cases identical** to the kit's `practice/reference/expected.json`, confirmed by the kit's local grader (`grade-local`, `passed: 1`). A differential test against the reference (6 practice cases + 47 hand-written edge cases + 3,000 seeded fuzz cases with broken quotes, stray CRs, CRLF mixes, short/long rows and BOMs) found **0 mismatches in 3,053 checks**.
- Determinism: two runs over the same input produce byte-identical output (verified in `bench.mjs`).
- The graded result is decided by the contest's own timing heat on its hardware, not by these local numbers; they are reported here so the claim can be re-measured, not as a guarantee.

## Reproduction (from zero)

Requires Node 22.18+ (the grader runs Node 22.23.4; local checks here used Node 24.22.1, which the grader flags only as a version note, not a failure).

```sh
# 1. Get the kit for this competition
curl -sSL "https://make.fun/c/csv-reader-speed-01-run-20261121/kit" | tar xz
cd csv-reader-speed-01-run-20261121-kit

# 2. Grade this entry on the practice set, the way the server grades dev
node cli/makefun.mjs grade-local --kit . --bot <path-to-this-repo> --driver process --worktree
# Expected: "cases_passed": 6, "cases_total": 6, "passed": 1

# 3. Benchmark the parser on a deterministic synthetic corpus (no kit needed)
node --no-incremental-marking bench.mjs
# Expected: prints ms per set, MB/s, and "deterministic (two runs identical): true"
```

## Proof of concept

Local benchmark output (`bench.mjs`, 3 cases, 4.90 MB of generated broken CSV):

```text
corpus: 3 cases, 4.90 MB of CSV
parse: 108, 189, 197, 197, 408 ms (median 197.0 ms)
throughput: 24.9 MB/s
deterministic (two runs identical): true
case 1: 17231 rows, 1768 errors, columns: ["col_1",...,"col_12"]
```

Local grader output (practice instance, round 34140941):

```json
"performance": { "scores": { "cases_passed": 6, "cases_total": 6, "passed": 1 }, "passed": true }
```

## Impact (realistic)

If the graded heat reproduces the local ~3x speedup, this entry beats the house baseline at well over the margin the contest requires to qualify for a reward, and competes for the top-30 timing-heat cut. If it does not reproduce (different hardware, different draw), the entry still passes every case and takes no reward rather than failing: correctness was verified independently of speed, and no input is answered differently from the reference.

## Recommendations / further work

- The one optimisation tried and reverted: parsing quote-free records with a single native `split(',')`. Measured on the same practice set it was ~10% slower than the `indexOf` field loop (extra slice plus a redundant line scan per record), so it was removed; it is not worth revisiting without new evidence.
- A further gain would need a different strategy (for example a single-pass scan over the whole text with a compiled delimiter search), but any such change must re-pass the full differential test above before it is trusted.

## Additional information

- Environment: Linux VM, Node 24.22.1 locally (grader: Node 22.23.4), `--no-incremental-marking` as the house driver sets. Date: 22 November 2026.
- Scope: `solve.js` is the only file that changes behaviour; `main.ts` is the kit's house driver verbatim, `package.json` is `{"type": "module"}`, `bench.mjs` is a local benchmark only and is not run by the grader.
- Broken-row policy implemented (identical to csv-reader 1.0.0): BOM dropped; records end at LF/CRLF; empty lines are no records; stray CR dropped with `stray_cr`; quoted fields honour `""`, CRLF/lone-CR-as-LF inside quotes, `quote_junk` after the closing quote and `unterminated_quote` re-read as unquoted; short rows padded (`short_row`), long rows cut (`long_row`); fields stay strings.
- No network, no clock, no randomness, no dependencies: `solve.js` is a dependency-free ES module.

## Run it

```sh
node --no-incremental-marking bench.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8cx6jc10&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
