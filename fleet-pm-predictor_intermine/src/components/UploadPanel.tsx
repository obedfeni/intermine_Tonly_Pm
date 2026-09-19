'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Link2, Loader2, UploadCloud } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { useLanguage } from './LanguageProvider';
import type { FleetRow } from '@/lib/types';

interface IngestResult {
  fleet: FleetRow[];
  rowsScanned: number;
  rowsSkipped: number;
  warnings: string[];
  algorithm: string;
}

export function UploadPanel({ onResult }: { onResult: (result: IngestResult) => void }) {
  const { t } = useLanguage();
  const [mode, setMode] = React.useState<'file' | 'sheet'>('file');
  const [isDragging, setIsDragging] = React.useState(false);
  const [sheetUrl, setSheetUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function submitFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    await runIngest(form);
  }

  async function submitSheet() {
    if (!sheetUrl.trim()) {
      toast.error(t.pasteSheetUrlFirst);
      return;
    }
    const form = new FormData();
    form.append('googleSheetUrl', sheetUrl.trim());
    await runIngest(form);
  }

  async function runIngest(form: FormData) {
    setBusy(true);
    const toastId = toast.loading(t.readingLog);
    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
      }
      toast.success(t.analyzedSummary(data.fleet.length, data.rowsScanned) + (data.rowsSkipped ? t.rowsSkipped(data.rowsSkipped) : ''), {
        id: toastId,
      });
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.warning(w));
      }
      onResult(data as IngestResult);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.somethingWentWrong, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setMode('file')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'file' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <FileSpreadsheet className="h-4 w-4" /> {t.uploadFileTab}
          </button>
          <button
            onClick={() => setMode('sheet')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'sheet' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <Link2 className="h-4 w-4" /> {t.googleSheetTab}
          </button>
        </div>

        {mode === 'file' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) submitFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <UploadCloud className="h-8 w-8 text-muted-foreground" />}
            <div className="text-sm font-medium">{t.dropZoneTitle}</div>
            <div className="text-xs text-muted-foreground">{t.dropZoneHint}</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) submitFile(file);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder={t.sheetUrlPlaceholder}
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => e.key === 'Enter' && submitSheet()}
              />
              <Button onClick={submitSheet} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.analyze}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t.sheetHint}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
