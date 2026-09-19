'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { StatusBadge } from './StatusBadge';
import { useLanguage } from './LanguageProvider';
import { formatDate } from '@/lib/utils';
import type { FleetRow } from '@/lib/types';

/** "2026-10" style key, computed in UTC so it matches how predictedDate is stored. */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Replaces the old "Overdue / Due soon / Healthy" day-range summary cards
 * with a month picker: pick a month (e.g. October) and see exactly which
 * trucks are predicted to need their PM that month. Overdue trucks fall
 * into the current month automatically, since computeFleetRow() sets an
 * overdue truck's predictedDate to today. Each row also has a "Schedule"
 * button that freezes the current prediction into a fixed entry on the PM
 * Schedule page (predictions keep moving as new logs come in; a schedule
 * entry doesn't, until it's marked done or cancelled).
 */
export function MonthDueBrowser({ fleet, onScheduled }: { fleet: FleetRow[]; onScheduled?: () => void }) {
  const { t, lang } = useLanguage();
  const [scheduling, setScheduling] = React.useState<string | null>(null);

  const withDates = React.useMemo(() => fleet.filter((r) => r.predictedDate), [fleet]);

  const currentMonthKey = React.useMemo(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }, []);

  const months = React.useMemo(() => {
    const keys = new Set(withDates.map((r) => monthKey(r.predictedDate!)));
    keys.add(currentMonthKey);
    return Array.from(keys).sort();
  }, [withDates, currentMonthKey]);

  const [selected, setSelected] = React.useState<string>(currentMonthKey);

  // Derived, not stored: if the fleet changes (e.g. after a re-upload) and
  // the previously-picked month no longer exists, fall back to the first
  // available month instead of syncing state back in an effect.
  const effectiveSelected = months.includes(selected) ? selected : (months[0] ?? currentMonthKey);

  const monthFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [lang]
  );

  const trucksDue = React.useMemo(
    () =>
      withDates
        .filter((r) => monthKey(r.predictedDate!) === effectiveSelected)
        .sort((a, b) => a.predictedDate!.localeCompare(b.predictedDate!)),
    [withDates, effectiveSelected]
  );

  async function schedule(row: FleetRow) {
    if (!row.predictedDate) return;
    setScheduling(row.truckId);
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckId: row.truckId,
          pmName: row.pmName,
          targetKm: row.pmTargetKm,
          scheduledDate: row.predictedDate.slice(0, 10),
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.info(t.alreadyScheduled(row.truckId));
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? t.failedToSchedule);
      toast.success(t.scheduled(row.truckId, formatDate(row.predictedDate)));
      onScheduled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.failedToSchedule);
    } finally {
      setScheduling(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t.monthBrowserTitle}</h2>
          <select
            value={effectiveSelected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {months.map((m) => {
              const parts = m.split('-').map(Number);
              const y = parts[0] ?? new Date().getUTCFullYear();
              const mo = parts[1] ?? 1;
              const label = monthFormatter.format(new Date(Date.UTC(y, mo - 1, 1)));
              return (
                <option key={m} value={m}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        {trucksDue.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.noTrucksDueThisMonth}</p>
        ) : (
          <ul className="divide-y divide-border">
            {trucksDue.map((r) => (
              <li key={r.truckId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{r.truckId}</span>
                  {r.pmName && <span className="text-muted-foreground">{r.pmName}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-muted-foreground">{formatDate(r.predictedDate)}</span>
                  <StatusBadge status={r.status} />
                  <button
                    onClick={() => schedule(r)}
                    disabled={scheduling === r.truckId}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title={t.scheduleAction}
                  >
                    {scheduling === r.truckId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                    {t.scheduleAction}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-muted-foreground">{t.ofTrucks(fleet.length)}</p>
      </CardContent>
    </Card>
  );
}
