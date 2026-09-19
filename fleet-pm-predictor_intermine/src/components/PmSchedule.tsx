'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, Loader2, Mail, Printer, XCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { LogCompletionDialog } from './LogCompletionDialog';
import { useLanguage } from './LanguageProvider';
import { formatDate, formatKm } from '@/lib/utils';
import type { ScheduledPm } from '@/lib/types';

/**
 * The formal PM schedule: every truck that's been explicitly "Scheduled"
 * (from the month browser) sits here until it's marked done or cancelled.
 * This is the printable/emailable list — separate from the live fleet
 * table, so what you print/send is a fixed plan, not a number that shifts
 * every time you re-upload a log.
 */
export function PmSchedule({ onChange }: { onChange?: () => void }) {
  const { t } = useLanguage();
  const [items, setItems] = React.useState<ScheduledPm[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loggingFor, setLoggingFor] = React.useState<ScheduledPm | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.failedToLoadSchedule);
      setItems(data.schedule);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.failedToLoadSchedule);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function cancelEntry(id: string) {
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? t.failedToCancelSchedule);
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.failedToCancelSchedule);
    }
  }

  function sendByEmail() {
    if (!items || items.length === 0) return;
    const lines = items.map(
      (i) =>
        `${i.truckId} — ${i.pmName || t.pmNamePlaceholder} — ${formatDate(i.scheduledDate)}${
          i.targetKm != null ? ` — ${formatKm(i.targetKm, 0)} km` : ''
        }`
    );
    const body = [t.scheduleEmailIntro, '', ...lines].join('\n');
    window.location.href = `mailto:?subject=${encodeURIComponent(t.scheduleEmailSubject)}&body=${encodeURIComponent(body)}`;
  }

  function afterLogged() {
    load();
    onChange?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <CalendarClock className="h-4 w-4" /> {t.pmScheduleTitle}
        </h2>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!items || items.length === 0}>
            <Printer className="h-4 w-4" /> {t.print}
          </Button>
          <Button variant="outline" size="sm" onClick={sendByEmail} disabled={!items || items.length === 0}>
            <Mail className="h-4 w-4" /> {t.sendByEmail}
          </Button>
        </div>
      </div>

      <Card className="print-area">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !items || items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t.noScheduledPms}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground print:bg-transparent">
                  <th className="px-4 py-3 font-medium">{t.colTruckId}</th>
                  <th className="px-4 py-3 font-medium">{t.colPmName}</th>
                  <th className="px-4 py-3 text-right font-medium">{t.colPmTarget}</th>
                  <th className="px-4 py-3 font-medium">{t.scheduledDateLabel}</th>
                  <th className="px-2 py-3 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60">
                    <td className="px-4 py-2 font-semibold">{item.truckId}</td>
                    <td className="px-4 py-2">{item.pmName || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{item.targetKm != null ? formatKm(item.targetKm, 0) : '—'}</td>
                    <td className="px-4 py-2">{formatDate(item.scheduledDate)}</td>
                    <td className="px-2 py-2 print:hidden">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setLoggingFor(item)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-success/10 hover:text-success"
                          title={t.markDone}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => cancelEntry(item.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          title={t.cancelSchedule}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {loggingFor && (
        <LogCompletionDialog
          truckId={loggingFor.truckId}
          defaultPmName={loggingFor.pmName}
          defaultOdometerKm={loggingFor.targetKm}
          scheduleId={loggingFor.id}
          onClose={() => setLoggingFor(null)}
          onLogged={afterLogged}
        />
      )}
    </div>
  );
}
