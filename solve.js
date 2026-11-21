// Fast CSV reader: a drop-in replacement for csv-reader 1.0.0.
//
// It returns exactly what csv-reader 1.0.0's readCsv returns for the same
// {text, header} input: {columns, rows, errors}. The reference reads the text
// once, left to right, one character at a time, building every field with
// `value += c`. This module keeps the same left-to-right semantics but works
// segment by segment: each unquoted field is located with indexOf (comma /
// line feed) and taken with one slice, each quoted field with one indexOf for
// its closing quote and one slice for its content. The slow paths (a stray CR
// inside an unquoted field, a CR inside a quoted field, an unterminated
// quote, characters after a closing quote) run only when the input actually
// holds them, so ordinary well-formed rows cost a few indexOf scans and a
// slice each.
//
// Broken-row policy, identical to the reference:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote and each CRLF or lone CR inside it
//     read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after
//     it is read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's
//     short_row or long_row when it ends: line the 1-based line its record
//     starts on, counting every LF, CRLF and lone CR inside quotes, and row
//     its record's index in rows, null for the header.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next, so two runs on the same input return identical answers.

// How a field ended: 0 = comma (the record goes on), 1 = line break,
// 2 = end of the text (the record ends).
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;
  // Whether the text holds any CR at all: when it does not, no segment
  // can hold a stray CR or a CR inside quotes, so those scans are skipped.
  const hasCR = text.indexOf('\r') !== -1;
  // The next LF at or after pos, or n when there is none left; stale (below
  // pos) after a field that crossed a line, recomputed on demand. An
  // unquoted field never crosses a line, so one lookup serves every
  // unquoted field of the line.
  let lineEnd = -1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, appending what it keeps onto
  // `value`. The field ends at the first comma, line break or end of text
  // in front of it. Returns {value, ended, added}; `added` counts the
  // characters kept by this scan (not the prefix `value` arrived with).
  // A CR inside the segment is a stray_cr (dropped, one error each), except
  // a CR that is the segment's last character before a LF: that is a CRLF
  // line break, not an error. The segment holds no LF and no comma by
  // construction, so every CR in it is one of those two cases.
  function readUnquoted(value) {
    if (lineEnd < pos) {
      lineEnd = text.indexOf('\n', pos);
      if (lineEnd === -1) lineEnd = n;
    }
    const cIdx = text.indexOf(',', pos);
    let end;
    let ended;
    if (cIdx !== -1 && cIdx < lineEnd) {
      end = cIdx;
      ended = COMMA;
    } else {
      end = lineEnd;
      ended = lineEnd === n ? END : LINE_BREAK;
    }
    const seg = text.slice(pos, end);
    const r = hasCR ? seg.indexOf('\r') : -1;
    if (r === -1) {
      pos = end;
      if (ended === COMMA) {
        pos += 1;
        return { value: value + seg, ended, added: seg.length };
      }
      if (ended === LINE_BREAK) {
        pos += 1;
        line += 1;
        return { value: value + seg, ended, added: seg.length };
      }
      return { value: value + seg, ended, added: seg.length };
    }
    const parts = seg.split('\r');
    const trailingCRLF = ended === LINE_BREAK && seg.charCodeAt(seg.length - 1) === 13;
    const strayCount = parts.length - 1 - (trailingCRLF ? 1 : 0);
    for (let i = 0; i < strayCount; i++) error('stray_cr');
    const kept = parts.join('');
    pos = end;
    if (ended === COMMA) {
      pos += 1;
      return { value: value + kept, ended, added: kept.length };
    }
    if (ended === LINE_BREAK) {
      pos += 1;
      line += 1;
      return { value: value + kept, ended, added: kept.length };
    }
    return { value: value + kept, ended, added: kept.length };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let segStart = pos;
    let parts = null; // raw segments plus one '"' per doubled quote
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q));
        parts.push('"');
        pos = q + 2;
        segStart = pos;
        continue;
      }
      // Closing quote at q: the content is the raw segments joined.
      const raw = parts === null ? text.slice(segStart, q) : parts.join('') + text.slice(segStart, q);
      let value;
      if (!hasCR || raw.indexOf('\r') === -1) {
        value = raw;
        let i = raw.indexOf('\n');
        while (i !== -1) {
          line += 1;
          i = raw.indexOf('\n', i + 1);
        }
      } else {
        // Each CRLF or lone CR inside quotes is one LF; every LF, CRLF
        // and lone CR counts one line.
        value = '';
        let last = 0;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw.charCodeAt(i);
          if (ch === 13) {
            value += raw.slice(last, i) + '\n';
            line += 1;
            if (raw.charCodeAt(i + 1) === 10) i += 1;
            last = i + 1;
          } else if (ch === 10) {
            value += raw.slice(last, i) + '\n';
            line += 1;
            last = i + 1;
          }
        }
        value += raw.slice(last);
      }
      pos = q + 1;
      if (pos >= n) return { value, ended: END };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) error('quote_junk');
      return junk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
