import type { PDFFont, PDFPage } from "pdf-lib";
import { colors, createPdf, formatDate, formatShortDate } from "../../lib/pdf.js";
import type { DayTotal } from "./timesheet-rules.js";

/** Renders the weekly timesheet that is submitted for approval. */

export type TimesheetFormData = {
  employee: { id: string; name: string; department?: string | null; manager?: string | null };
  weekStart: string;
  weekEnd: string;
  submittedOn: string;
  entries: { workDate: string; project: string; activity: string; hours: number; description?: string | null }[];
  days: DayTotal[];
  byProject: { project: string; hours: number; billable: number }[];
  total: number;
  target: number;
};

const fmt = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(2).replace(/0$/, ""));

export async function buildTimesheetPdf(data: TimesheetFormData): Promise<Uint8Array> {
  const { doc, regular, bold } = await createPdf(`Timesheet ${data.weekStart}`, data.employee.name);
  const { ink, quiet, rule } = colors;
  const left = 48;
  let page = doc.addPage([595.28, 841.89]);
  const width = page.getWidth() - 2 * left;
  let y = page.getHeight() - 60;

  const text = (s: string, x: number, size = 10, font: PDFFont = regular, color = ink) => page.drawText(s, { x, y, size, font, color });
  const hr = () => page.drawLine({ start: { x: left, y }, end: { x: left + width, y }, thickness: 0.75, color: rule });
  const ensure = (needed: number) => {
    if (y - needed > 60) return;
    page = doc.addPage([595.28, 841.89]);
    y = page.getHeight() - 60;
  };
  const section = (title: string) => {
    ensure(60);
    y -= 24;
    text(title, left, 12, bold);
    y -= 8;
    hr();
    y -= 16;
  };

  text("WEEKLY TIMESHEET", left, 18, bold);
  y -= 22;
  text(`${formatDate(data.weekStart)} – ${formatDate(data.weekEnd)}`, left, 10.5, regular, quiet);
  y -= 16;
  text(`${data.employee.name} (${data.employee.id})${data.employee.department ? ` · ${data.employee.department}` : ""}` +
    `${data.employee.manager ? ` · Manager: ${data.employee.manager}` : ""}`, left, 10, regular, quiet);

  // Bookings, one row each.
  section("Bookings");
  const cols = [left, left + 84, left + 214, left + 314, left + width - 40];
  const header = ["Date", "Project", "Activity", "Description", "Hours"];
  header.forEach((h, i) => text(h, cols[i], 9, bold, quiet));
  y -= 14;
  for (const e of data.entries) {
    ensure(16);
    text(formatShortDate(e.workDate), cols[0], 9.5);
    text(e.project.slice(0, 22), cols[1], 9.5);
    text(e.activity.slice(0, 18), cols[2], 9.5);
    text((e.description ?? "").slice(0, 26), cols[3], 9.5, regular, quiet);
    text(fmt(e.hours), cols[4], 9.5);
    y -= 15;
  }

  // Daily totals against target.
  section("Days");
  for (const d of data.days) {
    ensure(16);
    text(formatShortDate(d.date), left, 10);
    text(`${fmt(d.hours)} h`, left + 120, 10);
    const status = d.note ?? (d.missing > 0 ? `${fmt(d.missing)} h missing` : "complete");
    text(status, left + 200, 10, regular, d.missing > 0 && !d.note ? ink : quiet);
    y -= 16;
  }

  section("Summary");
  for (const p of data.byProject) {
    ensure(16);
    text(p.project, left, 10);
    text(`${fmt(p.hours)} h`, left + 260, 10);
    text(`${fmt(p.billable)} h billable`, left + 330, 10, regular, quiet);
    y -= 16;
  }
  y -= 4;
  text("Total", left, 10.5, bold);
  text(`${fmt(data.total)} h of ${fmt(data.target)} h`, left + 260, 10.5, bold);

  y -= 48;
  ensure(90);
  signatures(page, regular, bold, left, width, y);

  page.drawText(`Submitted on ${formatDate(data.submittedOn)} by the HR assistant at the employee's request.`, {
    x: left,
    y: 36,
    size: 8.5,
    font: regular,
    color: quiet,
  });

  return doc.save();
}

function signatures(page: PDFPage, regular: PDFFont, bold: PDFFont, left: number, width: number, y: number) {
  const { ink, quiet, rule } = colors;
  const gap = 24;
  const boxWidth = (width - gap) / 2;
  ["Employee", "Manager"].forEach((title, i) => {
    const x = left + i * (boxWidth + gap);
    page.drawText(title, { x, y, size: 10.5, font: bold, color: ink });
    page.drawLine({ start: { x, y: y - 44 }, end: { x: x + boxWidth, y: y - 44 }, thickness: 0.75, color: rule });
    page.drawText("Signature / Date", { x, y: y - 58, size: 9, font: regular, color: quiet });
  });
}
