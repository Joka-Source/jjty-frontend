// jt — document ingestion helpers plus a starter document so the app is
// usable before the person brings their own.

/** Split raw text into paragraph blocks. Markdown-ish: blank-line separated,
 * headings kept as their own block, list items joined into one block. */
export function splitParagraphs(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function titleFrom(text, fallback = "untitled") {
  const first = splitParagraphs(text)[0] ?? "";
  const t = first.replace(/^#+\s*/, "").slice(0, 60).trim();
  return t || fallback;
}

export const STARTER_DOC = `a short lease, for trying jt

This agreement is made between the landlord and the tenant named on the signature page, for the flat at fourteen elm court.

The term begins on the first of the month and runs for twelve months, renewing quietly unless either side gives sixty days notice in writing.

Rent is due on the first. A five day grace period applies; after that, a late charge of two percent may be added once per month.

The deposit is one months rent, held in a protected account, and returned within fourteen days of the final inspection, less any documented repair.

The tenant keeps the flat in good order and reports leaks, faults, and failures promptly. The landlord repairs what the building owes its people: heat, water, light, and a sound roof.

Either party may end this agreement early only as the law of the jurisdiction allows. Everything else is goodwill, which both sides promise to keep in stock.`;
