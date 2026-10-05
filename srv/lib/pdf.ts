import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * What the leave and timesheet PDFs share: fonts, colours, date formatting.
 *
 * The 14 standard PDF fonts only cover WinAnsi, so a name with characters
 * outside it would fail to encode. DejaVu Sans is embedded instead (subset,
 * so only the glyphs used end up in the file).
 */

const require = createRequire(import.meta.url);
const fontBytes = (file: string) => readFileSync(require.resolve(`dejavu-fonts-ttf/ttf/${file}`));

export const colors = {
  ink: rgb(0.12, 0.12, 0.12),
  quiet: rgb(0.42, 0.42, 0.42),
  rule: rgb(0.8, 0.8, 0.8),
};

export async function createPdf(title: string, author: string): Promise<{ doc: PDFDocument; regular: PDFFont; bold: PDFFont }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fontBytes("DejaVuSans.ttf"), { subset: true });
  const bold = await doc.embedFont(fontBytes("DejaVuSans-Bold.ttf"), { subset: true });
  doc.setTitle(title);
  doc.setAuthor(author);
  return { doc, regular, bold };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 2026-11-10 → "Tuesday, 10 November 2026" */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS.at(d.getUTCDay())}, ${d.getUTCDate()} ${MONTHS.at(d.getUTCMonth())} ${d.getUTCFullYear()}`;
}

/** 2026-11-10 → "Tue 10 Nov" */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS.at(d.getUTCDay())?.slice(0, 3)} ${d.getUTCDate()} ${MONTHS.at(d.getUTCMonth())?.slice(0, 3)}`;
}
