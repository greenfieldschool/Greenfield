import { createHash } from "crypto";

// Reads bank statements (CSV) and bank email alerts, and works out which child and which invoice each credit is for.
//
// Parents write two things in the transfer description:
//     <admission number> <payment ID>      e.g.  GRE/2026/447 SF
// The payment ID is a fee-type code ("SF" = School fees, set on each revenue category) or an invoice number
// (INV-2026-00012). Banks mangle descriptions (slashes dropped, spaces removed, upper-cased), so everything is
// compared as plain upper-case words: "gre/2026/447", "GRE 2026 447" and "GRE2026447" are the same admission number.
//
// Pure functions, no database: the pages load the students, codes and open invoices and pass them in.

export type BankLineInput = {
  txnDate: string | null; // YYYY-MM-DD
  amount: number;
  narration: string;
  bankReference: string | null;
  source: "statement" | "email";
};

export type MatchStudent = { id: string; admissionNumber: string | null; name: string };
export type MatchCategory = { id: string; name: string; code: string };
export type MatchInvoice = {
  id: string;
  invoiceNo: string | null;
  studentId: string | null;
  issueDate: string;
  balance: number;
  categoryIds: string[];
};
export type MatchContext = { students: MatchStudent[]; categories: MatchCategory[]; invoices: MatchInvoice[] };

export type MatchResult = {
  studentId: string | null;
  invoiceId: string | null;
  categoryId: string | null;
  /** auto = sure enough to record without a person; review = needs a look; none = nothing recognised */
  level: "auto" | "review" | "none";
  note: string;
};

const money = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function words(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** "INV-2026-00012", "INV 2026 12", "INV202600012" -> "INV-2026-00012"; null if the text is not an invoice number. */
function invoiceKey(year: string, serial: string) {
  return `INV-${year}-${serial.padStart(5, "0")}`;
}

function findInvoiceNumbers(ws: string[]): string[] {
  const found = new Set<string>();
  for (let i = 0; i < ws.length; i += 1) {
    const w = ws[i];
    if (w === "INV" && /^\d{4}$/.test(ws[i + 1] ?? "") && /^\d{1,6}$/.test(ws[i + 2] ?? "")) {
      found.add(invoiceKey(ws[i + 1], ws[i + 2]));
    }
    const joined = w.match(/^INV(\d{4})(\d{5,6})$/);
    if (joined) found.add(invoiceKey(joined[1], joined[2]));
    // INV followed by "2026" and the serial glued together ("INV 202600012")
    if (w === "INV" && /^\d{9,10}$/.test(ws[i + 1] ?? "")) found.add(invoiceKey(ws[i + 1].slice(0, 4), ws[i + 1].slice(4)));
  }
  return Array.from(found);
}

function normaliseInvoiceNo(no: string | null) {
  if (!no) return null;
  const m = words(no);
  const hits = findInvoiceNumbers(m);
  return hits[0] ?? no.trim().toUpperCase();
}

/** Admission numbers named in the description, as student ids (a word run like GRE 2026 447, or GRE2026447, or GRE2026447SF). */
function findStudents(ws: string[], ctx: MatchContext): string[] {
  const byJoined = new Map<string, string>();
  const byFirst = new Map<string, Array<{ id: string; tokens: string[] }>>();
  for (const s of ctx.students) {
    if (!s.admissionNumber) continue;
    const tokens = words(s.admissionNumber);
    if (!tokens.length) continue;
    byJoined.set(tokens.join(""), s.id);
    const list = byFirst.get(tokens[0]) ?? [];
    list.push({ id: s.id, tokens });
    byFirst.set(tokens[0], list);
  }
  const codes = ctx.categories.map((c) => c.code.toUpperCase());

  const found = new Set<string>();
  for (let i = 0; i < ws.length; i += 1) {
    const w = ws[i];
    // whole admission number in one word, optionally with a payment code stuck on the end
    const direct = byJoined.get(w);
    if (direct) found.add(direct);
    for (const code of codes) {
      if (w.length > code.length && w.endsWith(code)) {
        const head = byJoined.get(w.slice(0, -code.length));
        if (head) found.add(head);
      }
    }
    // admission number split over several words
    for (const cand of byFirst.get(w) ?? []) {
      if (cand.tokens.length > 1 && cand.tokens.every((t, k) => ws[i + k] === t)) found.add(cand.id);
    }
  }
  return Array.from(found);
}

function findCategories(ws: string[], ctx: MatchContext): MatchCategory[] {
  const present = new Set(ws);
  const hits: MatchCategory[] = [];
  for (const c of ctx.categories) {
    const code = c.code.toUpperCase();
    if (present.has(code)) hits.push(c);
    // code stuck on the end of an admission number ("GRE2026447SF")
    else if (ws.some((w) => w.length > code.length && w.endsWith(code) && /\d/.test(w.slice(0, -code.length)))) hits.push(c);
  }
  return hits;
}

export function matchLine(line: BankLineInput, ctx: MatchContext): MatchResult {
  const ws = words(line.narration);
  const invoiceNos = findInvoiceNumbers(ws);
  const studentIds = findStudents(ws, ctx);
  const categories = findCategories(ws, ctx);
  const studentName = (id: string | null) => ctx.students.find((s) => s.id === id)?.name ?? "this child";
  const categoryName = (id: string | null) => ctx.categories.find((c) => c.id === id)?.name ?? "that item";

  // 1. An invoice number points at one exact invoice.
  if (invoiceNos.length) {
    const invoiceByNo = new Map(ctx.invoices.map((i) => [normaliseInvoiceNo(i.invoiceNo), i] as const));
    const inv = invoiceNos.map((n) => invoiceByNo.get(n)).find(Boolean);
    if (!inv) {
      return {
        studentId: studentIds.length === 1 ? studentIds[0] : null,
        invoiceId: null,
        categoryId: null,
        level: "review",
        note: `Invoice ${invoiceNos[0]} was not found, or has nothing left to pay.`
      };
    }
    const studentId = inv.studentId;
    if (studentIds.length === 1 && studentId && studentIds[0] !== studentId) {
      return {
        studentId: studentIds[0],
        invoiceId: null,
        categoryId: null,
        level: "review",
        note: `The admission number is ${studentName(studentIds[0])}'s, but ${inv.invoiceNo} belongs to ${studentName(studentId)}.`
      };
    }
    if (line.amount > inv.balance + 0.005) {
      return {
        studentId,
        invoiceId: inv.id,
        categoryId: null,
        level: "review",
        note: `${money(line.amount)} is more than the ${money(inv.balance)} still owed on ${inv.invoiceNo}.`
      };
    }
    return { studentId, invoiceId: inv.id, categoryId: null, level: "auto", note: `Invoice ${inv.invoiceNo} for ${studentName(studentId)}.` };
  }

  // 2. Two or more children named: a shared payment, split by hand.
  if (studentIds.length > 1) {
    return {
      studentId: null,
      invoiceId: null,
      categoryId: null,
      level: "review",
      note: `More than one admission number in the description (${studentIds.map(studentName).join(", ")}). Split this payment by hand.`
    };
  }

  // 3. One child named.
  if (studentIds.length === 1) {
    const studentId = studentIds[0];
    const open = ctx.invoices
      .filter((i) => i.studentId === studentId && i.balance > 0.005)
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate));

    if (categories.length) {
      const wanted = new Set(categories.map((c) => c.id));
      const candidates = open
        .filter((i) => i.categoryIds.some((c) => wanted.has(c)))
        .sort((a, b) => {
          const aAll = categories.every((c) => a.categoryIds.includes(c.id));
          const bAll = categories.every((c) => b.categoryIds.includes(c.id));
          return Number(bAll) - Number(aAll) || a.issueDate.localeCompare(b.issueDate);
        });
      const itemNames = categories.map((c) => c.name).join(" + ");
      if (!candidates.length) {
        return {
          studentId,
          invoiceId: null,
          categoryId: categories[0].id,
          level: "review",
          note: `${studentName(studentId)} has no unpaid invoice with ${itemNames}.`
        };
      }
      const inv = candidates[0];
      if (line.amount > inv.balance + 0.005) {
        return {
          studentId,
          invoiceId: inv.id,
          categoryId: categories[0].id,
          level: "review",
          note: `${money(line.amount)} is more than the ${money(inv.balance)} still owed on ${inv.invoiceNo} (${itemNames}).`
        };
      }
      return {
        studentId,
        invoiceId: inv.id,
        categoryId: categories[0].id,
        level: "auto",
        note: `${itemNames} for ${studentName(studentId)}${candidates.length > 1 ? `, on the oldest of ${candidates.length} unpaid invoices` : ""}.`
      };
    }

    // Admission number but no payment ID: suggest, never record by itself.
    if (open.length === 1) {
      return {
        studentId,
        invoiceId: open[0].id,
        categoryId: null,
        level: "review",
        note: `No payment ID in the description. ${studentName(studentId)} has one unpaid invoice (${open[0].invoiceNo}); confirm to record.`
      };
    }
    return {
      studentId,
      invoiceId: null,
      categoryId: null,
      level: "review",
      note: open.length
        ? `No payment ID in the description, and ${studentName(studentId)} has ${open.length} unpaid invoices. Pick one.`
        : `${studentName(studentId)} has no unpaid invoice. Record it as money paid in advance, or ignore it.`
    };
  }

  // 4. A payment ID but no child.
  if (categories.length) {
    return {
      studentId: null,
      invoiceId: null,
      categoryId: categories[0].id,
      level: "review",
      note: `Found the payment ID for ${categoryName(categories[0].id)} but no admission number.`
    };
  }

  return { studentId: null, invoiceId: null, categoryId: null, level: "none", note: "No admission number or payment ID in the description." };
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------------------------

export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t) || /\bDR\b/i.test(t);
  const cleaned = t.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 30/10/2026, 30-10-26, 2026-10-30, 30 Oct 2026, 30-OCT-2026 (day first, as Nigerian banks write it). */
export function parseDate(raw: string): string | null {
  const t = raw.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, Number(m[2]), Number(m[1]));
  }
  m = t.match(/^(\d{1,2})[\s\-/.]*([A-Za-z]{3,4})[a-z]*[\s\-/.,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, MONTHS[m[2].toLowerCase()], Number(m[1]));
  }
  return null;
}

function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const counts = ["\t", ";", ","].map((d) => [d, sample.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

type Columns = { date: number; narration: number; credit: number; debit: number; amount: number; type: number; reference: number };

function headerColumns(cells: string[]): Columns | null {
  const cols: Columns = { date: -1, narration: -1, credit: -1, debit: -1, amount: -1, type: -1, reference: -1 };
  cells.forEach((raw, i) => {
    const h = raw.trim().toLowerCase();
    if (!h) return;
    if (cols.date < 0 && /(date)/.test(h) && !/value|update/.test(h)) cols.date = i;
    else if (cols.narration < 0 && /(narration|description|details|remark|particular|memo)/.test(h)) cols.narration = i;
    else if (cols.credit < 0 && /(^credit|credit amount|deposit|money in|^cr$|inflow|paid in)/.test(h)) cols.credit = i;
    else if (cols.debit < 0 && /(^debit|debit amount|withdraw|money out|^dr$|outflow|paid out)/.test(h)) cols.debit = i;
    else if (cols.type < 0 && /(^type$|dr\/cr|cr\/dr|transaction type|indicator)/.test(h)) cols.type = i;
    else if (cols.reference < 0 && /(reference|ref no|ref\.|session id|transaction id|txn id|trans id)/.test(h)) cols.reference = i;
    else if (cols.amount < 0 && /^(amount|transaction amount|value)$/.test(h)) cols.amount = i;
  });
  const found = [cols.date, cols.narration, cols.credit, cols.amount].filter((c) => c >= 0).length;
  return cols.narration >= 0 && (cols.credit >= 0 || cols.amount >= 0) && found >= 2 ? cols : null;
}

export type ParseResult = { lines: BankLineInput[]; skipped: number; warning: string | null };

/** Parses a bank statement exported as CSV (or pasted from Excel). Only credits become lines. */
export function parseStatement(text: string): ParseResult {
  const clean = text.replace(/^﻿/, "");
  const rows = splitDelimited(clean, detectDelimiter(clean));
  if (!rows.length) return { lines: [], skipped: 0, warning: "Nothing to read. Paste the statement rows or choose a CSV file." };

  let headerIndex = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
    cols = headerColumns(rows[i]);
    if (cols) {
      headerIndex = i;
      break;
    }
  }

  const lines: BankLineInput[] = [];
  let skipped = 0;

  if (cols) {
    for (const r of rows.slice(headerIndex + 1)) {
      const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
      const narration = cell(cols.narration);
      if (!narration) continue;
      let amount: number | null = null;
      if (cols.credit >= 0) {
        const c = parseAmount(cell(cols.credit));
        amount = c && c > 0 ? c : null;
      }
      if (amount === null && cols.amount >= 0 && cols.debit < 0) {
        const a = parseAmount(cell(cols.amount));
        if (a !== null && a !== 0) {
          if (cols.type >= 0) {
            const type = cell(cols.type).toLowerCase();
            amount = /^(cr|credit|c)\b/.test(type) ? Math.abs(a) : null;
          } else {
            amount = a > 0 ? a : null; // unsigned or positive = money in; negative = money out
          }
        }
      }
      if (amount === null) {
        skipped += 1;
        continue;
      }
      lines.push({
        txnDate: parseDate(cell(cols.date)),
        amount,
        narration,
        bankReference: cell(cols.reference) || null,
        source: "statement"
      });
    }
    return { lines, skipped, warning: lines.length ? null : "No money-received rows were found in this statement." };
  }

  // No header row: take each row's date, biggest-text cell as the description, and a positive amount as a credit.
  for (const r of rows) {
    const dateCell = r.find((c) => parseDate(c));
    const narration = [...r].filter((c) => !parseDate(c)).sort((a, b) => b.trim().length - a.trim().length)[0]?.trim() ?? "";
    const amounts = r
      .filter((c) => !parseDate(c) && c.trim() !== narration && /^[\s₦NGNngn\d.,()-]+$/.test(c))
      .map((c) => parseAmount(c))
      .filter((n): n is number => n !== null);
    const amount = amounts.find((n) => n > 0);
    if (!narration || !amount || /^[\d.,\s₦-]+$/.test(narration)) {
      skipped += 1;
      continue;
    }
    lines.push({ txnDate: dateCell ? parseDate(dateCell) : null, amount, narration, bankReference: null, source: "statement" });
  }
  return {
    lines,
    skipped,
    warning: lines.length
      ? "No header row was found, so each row's description and first positive amount were used. Check the matches below."
      : "Could not find a date, description and amount in these rows. Export the statement as CSV with its column headings."
  };
}

/** Reads one bank email alert. Returns no line for debits and for text without an amount. */
export function parseEmailAlert(text: string): ParseResult {
  const body = text.replace(/\r/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  if (!body) return { lines: [], skipped: 0, warning: "Paste the text of the bank alert email." };

  const isDebit = /\bdebit(ed)?\b|\bDR\b|\bwithdraw/i.test(body) && !/\bcredit(ed)?\b|\bCR\b|\bdeposit|received|inflow/i.test(body);
  if (isDebit) return { lines: [], skipped: 1, warning: "That alert is for money leaving the account, so it was skipped." };

  const amountMatch =
    body.match(/(?:credit(?:ed)?\s*amount|amount(?:\s*credited)?|amount|credit)\s*[:\-]?\s*(?:NGN|N|₦|NGN\.)?\s*([\d,]+(?:\.\d{1,2})?)/i) ??
    body.match(/(?:NGN|₦|\bN)\s?([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
  if (!amount || amount <= 0) return { lines: [], skipped: 1, warning: "No amount was found in that alert." };

  const label = (names: string) => {
    const m = body.match(new RegExp(`(?:${names})\\s*[:\\-]\\s*([^\\n]+)`, "i"));
    return m ? m[1].trim() : null;
  };
  const narration = label("narration|description|remarks?|details|transaction narration|purpose|sender'?s? narration") ?? body.replace(/\s+/g, " ").slice(0, 400);
  const date = label("date|value date|transaction date|time");
  const reference = label("reference|ref(?:erence)? no|session id|transaction id|txn id");

  return {
    lines: [
      {
        txnDate: date ? parseDate(date) : null,
        amount,
        narration: narration.replace(/\s+/g, " ").trim(),
        bankReference: reference,
        source: "email"
      }
    ],
    skipped: 0,
    warning: null
  };
}

/** Same line -> same fingerprint, so importing a statement twice never doubles a payment. `occurrence` tells apart identical lines in one file. */
export function lineFingerprint(line: BankLineInput, occurrence = 0, extra = ""): string {
  const key = [line.txnDate ?? "", line.amount.toFixed(2), words(line.narration).join(" "), line.bankReference ?? "", occurrence, extra].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

/** Fingerprints for a list of lines, counting repeats of the same line within the list. */
export function fingerprintAll(lines: BankLineInput[], extra = ""): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = lineFingerprint(l, 0, extra);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : lineFingerprint(l, n, extra);
  });
}

export { normaliseInvoiceNo };
