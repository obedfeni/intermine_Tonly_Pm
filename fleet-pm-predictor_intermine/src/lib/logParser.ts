import * as XLSX from 'xlsx';

/**
 * Parses a charging log (xlsx/xls/csv, uploaded file or fetched CSV text)
 * into a clean, normalized array of odometer readings — one entry per
 * usable log row. This mirrors the cleaning rules built into the original
 * spreadsheet version of this tool, generalized so it keeps working if the
 * log's exact header wording changes slightly:
 *
 *  - Truck ID column is found by header (contains "vehicle" / "truck" / "id"),
 *    falling back to column C (the position in the known template).
 *  - Date column is found by header (contains "date"), falling back to column B.
 *  - Kilometers column is found by header (contains "kilomet" / "km" / "odometer"),
 *    falling back to column G.
 *  - Non-numeric km, blank rows, and shift-divider rows ("DAY SHIFT ...") are
 *    dropped.
 *  - Truck IDs are normalized: checked against a user-editable alias table
 *    first, then against a general "ET/E/T letters + digits" pattern that
 *    self-corrects missing leading zeros and stray extra letters
 *    (ET11 -> ET011, ETT009 -> ET009) without needing every typo pre-listed.
 *  - Dates are parsed from "DD/MM/YYYY" or "DD/MM/YY" text, Excel serial
 *    numbers, or native Date cells; a parsed year more than 1 year away from
 *    today is treated as unparseable (catches fat-fingered years like 2053).
 *
 * Outlier *odometer values* (typo'd digits) are deliberately NOT filtered
 * here — that's the ML engine's job (robust regression), because it needs
 * the full picture per truck to decide statistically what's an outlier.
 */

export interface RawReading {
  rowRef: number; // 1-based row number in the source sheet, for traceability
  rawTruckLabel: string;
  truckId: string | null; // null if this row isn't a recognizable truck reading
  dateRaw: string;
  date: Date | null; // null if unparseable
  odometerKm: number | null; // null if not a real number
}

export interface ParsedLog {
  readings: RawReading[]; // only rows that are usable truck+km readings
  totalRowsScanned: number;
  skippedRows: number;
  warnings: string[];
}

export interface TruckAlias {
  rawLabel: string; // exact, case-insensitive
  truckId: string;
}

const HEADER_HINTS = {
  truck: ['vehicle', 'truck', 'unit id', 'unit no', 'vehicle number', 'vehicle id'],
  date: ['date'],
  km: ['kilomet', 'odometer', ' km', 'km)', 'km '],
};

function findColumnIndex(headerRow: unknown[], hints: string[], fallbackIdx: number): number {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] ?? '').toLowerCase();
    if (hints.some((h) => cell.includes(h))) return i;
  }
  return fallbackIdx;
}

/** Normalizes a raw truck-ID-ish string to a canonical "ET###" ID, or null. */
export function normalizeTruckId(raw: string, aliases: TruckAlias[]): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;

  const alias = aliases.find((a) => a.rawLabel.toUpperCase() === trimmed);
  if (alias) return alias.truckId.toUpperCase();

  // General self-correcting pattern: one or more of the letters E/T, then digits.
  // Handles ET009 (already correct), ET11 -> ET011, ET21 -> ET021,
  // ETT009 -> ET009, ETT019 -> ET019, etc.
  const m = trimmed.match(/^[ET]{1,4}(\d{1,5})$/);
  if (!m) return null;
  const digits = m[1]!;
  const num = parseInt(digits, 10);
  if (!Number.isFinite(num)) return null;
  return `ET${String(num).padStart(3, '0')}`;
}

function excelSerialToDate(serial: number): Date {
  // Excel's epoch is 1899-12-30 (accounting for the 1900 leap-year bug).
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  return new Date(utcMs);
}

function parseDateCell(cell: unknown, referenceYear: number): Date | null {
  if (cell == null || cell === '') return null;

  let candidate: Date | null = null;

  if (cell instanceof Date) {
    candidate = cell;
  } else if (typeof cell === 'number') {
    candidate = excelSerialToDate(cell);
  } else if (typeof cell === 'string') {
    const s = cell.trim();
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m) {
      const dd = parseInt(m[1]!, 10);
      const mm = parseInt(m[2]!, 10);
      let yy = parseInt(m[3]!, 10);
      if (yy < 100) yy += 2000;
      const d = new Date(Date.UTC(yy, mm - 1, dd));
      if (!Number.isNaN(d.getTime())) candidate = d;
    } else {
      const parsed = new Date(s);
      if (!Number.isNaN(parsed.getTime())) candidate = parsed;
    }
  }

  if (!candidate) return null;
  // Typo guard: a year far from "now" (e.g. 2053, 2033, 1999) means a
  // fat-fingered entry, not a real date — treat as unparseable.
  if (Math.abs(candidate.getUTCFullYear() - referenceYear) > 1) return null;
  return candidate;
}

function looksLikeShiftDivider(rowValues: unknown[]): boolean {
  const joined = rowValues.map((v) => String(v ?? '')).join(' ').toUpperCase();
  return /\b(DAY SHIFT|NIGHT SHIFT)\b/.test(joined);
}

/** Parses an already-loaded SheetJS workbook's first sheet. */
export function parseWorkbook(
  workbook: XLSX.WorkBook,
  aliases: TruckAlias[],
  referenceDate: Date = new Date()
): ParsedLog {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { readings: [], totalRowsScanned: 0, skippedRows: 0, warnings: ['Workbook has no sheets.'] };
  }
  const sheet = workbook.Sheets[sheetName]!;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  // Find the header row: the first row that contains at least 3 non-empty cells
  // and doesn't look like a title banner.
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const nonEmpty = rows[i]!.filter((c) => c != null && String(c).trim() !== '').length;
    if (nonEmpty >= 3) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    return { readings: [], totalRowsScanned: rows.length, skippedRows: rows.length, warnings: ['Could not find a header row.'] };
  }

  const headerRow = rows[headerRowIdx]!;
  const truckColIdx = findColumnIndex(headerRow, HEADER_HINTS.truck, 2); // column C
  const dateColIdx = findColumnIndex(headerRow, HEADER_HINTS.date, 1); // column B
  const kmColIdx = findColumnIndex(headerRow, HEADER_HINTS.km, 6); // column G

  const referenceYear = referenceDate.getUTCFullYear();
  const readings: RawReading[] = [];
  let skipped = 0;
  const warnings: string[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const isEmpty = row.every((c) => c == null || String(c).trim() === '');
    if (isEmpty) continue;
    if (looksLikeShiftDivider(row)) {
      skipped++;
      continue;
    }

    const rawTruckLabel = String(row[truckColIdx] ?? '').trim();
    const dateRaw = String(row[dateColIdx] ?? '').trim();
    const kmCell = row[kmColIdx];

    if (!rawTruckLabel) {
      skipped++;
      continue;
    }

    const truckId = normalizeTruckId(rawTruckLabel, aliases);
    const odometerKm = typeof kmCell === 'number' ? kmCell : (typeof kmCell === 'string' && kmCell.trim() !== '' && !Number.isNaN(Number(kmCell)) ? Number(kmCell) : null);
    const date = parseDateCell(row[dateColIdx], referenceYear);

    if (!truckId || odometerKm == null) {
      skipped++;
      continue;
    }

    readings.push({
      rowRef: i + 1, // 1-based, matches spreadsheet row numbers
      rawTruckLabel,
      truckId,
      dateRaw,
      date,
      odometerKm,
    });
  }

  if (readings.length === 0) {
    warnings.push('No usable truck readings were found. Check that the file has Truck ID, Date, and Kilometers columns.');
  }

  return { readings, totalRowsScanned: rows.length - headerRowIdx - 1, skippedRows: skipped, warnings };
}

export function parseFileBuffer(buffer: ArrayBuffer | Buffer, aliases: TruckAlias[]): ParsedLog {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return parseWorkbook(workbook, aliases);
}

export function parseCsvText(csvText: string, aliases: TruckAlias[]): ParsedLog {
  const workbook = XLSX.read(csvText, { type: 'string' });
  return parseWorkbook(workbook, aliases);
}
