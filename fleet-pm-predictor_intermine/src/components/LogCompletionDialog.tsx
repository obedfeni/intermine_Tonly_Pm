'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { useLanguage } from './LanguageProvider';
import type { PmCompletion } from '@/lib/types';

/**
 * Small modal form for logging a PM as actually done — truck, PM name,
 * and the odometer reading at that moment, all typed in by the user (this
 * is never derived from the prediction). If scheduleId is passed, the API
 * closes out that scheduled entry; otherwise it auto-closes whichever
 * schedule entry (if any) is currently open for this truck.
 */
export function LogCompletionDialog({
  truckId,
  defaultPmName,
  defaultOdometerKm,
  scheduleId,
  onClose,
  onLogged,
}: {
  truckId: string;
  defaultPmName?: string | null;
  defaultOdometerKm?: number | null;
  scheduleId?: string | null;
  onClose: () => void;
  onLogged?: (completion: PmCompletion) => void;
}) {
  const { t } = useLanguage();
  const [pmName, setPmName] = React.useState(defaultPmName ?? '');
  const [odometerKm, setOdometerKm] = React.useState(defaultOdometerKm != null ? String(defaultOdometerKm) : '');
  const [completedDate, setCompletedDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const km = Number(odometerKm);
    if (!Number.isFinite(km) || km < 0) {
      toast.error(t.invalidOdometer);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/trucks/${truckId}/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pmName: pmName || null,
          odometerKm: km,
          completedDate,
          notes: notes || null,
          scheduleId: scheduleId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.failedToLogPm);
      toast.success(t.pmLogged(truckId));
      onLogged?.(data.completion as PmCompletion);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.failedToLogPm);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <Card className="relative w-full max-w-sm animate-slide-up">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {t.logPmCompletionTitle(truckId)}
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label={t.close}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Field label={t.pmNameFieldLabel}>
              <Input value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder={t.pmNamePlaceholder} />
            </Field>
            <Field label={t.odometerAtPmLabel}>
              <Input
                type="number"
                inputMode="decimal"
                required
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
                placeholder={t.kmPlaceholder}
              />
            </Field>
            <Field label={t.completedDateLabel}>
              <Input type="date" required value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} />
            </Field>
            <Field label={t.notesFieldLabel}>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPlaceholder} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                {t.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {t.savePmLog}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
