/**
 * Turns a normal "Anyone with the link can view" Google Sheets URL into its
 * CSV-export URL, and fetches it. Works with:
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit?usp=sharing
 *   - an already-public CSV export URL (passed through unchanged)
 *
 * No OAuth / service account needed — the sheet just needs "Anyone with the
 * link" set to Viewer (Share -> General access), which is the standard way
 * to make a Sheet readable by a server without Google credentials.
 */

export class GoogleSheetAccessError extends Error {}

export function toCsvExportUrl(sheetUrl: string): string {
  const trimmed = sheetUrl.trim();

  if (trimmed.includes('/export?format=csv') || trimmed.includes('output=csv')) {
    return trimmed;
  }

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    throw new GoogleSheetAccessError(
      "That doesn't look like a Google Sheets URL. Open the sheet, click Share -> " +
        'General access -> "Anyone with the link", then copy the URL from your browser.'
    );
  }
  const sheetId = idMatch[1];

  const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export async function fetchGoogleSheetCsv(sheetUrl: string): Promise<string> {
  const csvUrl = toCsvExportUrl(sheetUrl);
  const res = await fetch(csvUrl, { cache: 'no-store' });

  if (res.status === 401 || res.status === 403) {
    throw new GoogleSheetAccessError(
      'This Google Sheet is not publicly viewable. Open it, click Share -> General access, ' +
        'and set it to "Anyone with the link" (Viewer), then try again.'
    );
  }
  if (!res.ok) {
    throw new GoogleSheetAccessError(`Google Sheets returned an error (HTTP ${res.status}). Double-check the URL.`);
  }

  const text = await res.text();
  if (text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html')) {
    throw new GoogleSheetAccessError(
      'Google redirected to a sign-in page instead of the sheet data — this sheet is not public yet. ' +
        'Share -> General access -> "Anyone with the link".'
    );
  }
  return text;
}
