import { Badge } from './ui/badge';
import { useLanguage } from './LanguageProvider';
import { STATUS_META, type StatusCode } from '@/lib/types';
import type { Translation } from '@/lib/i18n';
import { AlertTriangle, CheckCircle2, Circle, Clock, HelpCircle } from 'lucide-react';

const ICONS: Record<StatusCode, React.ReactNode> = {
  ENTER_TARGET: <Circle className="h-3 w-3" />,
  NO_DATA: <HelpCircle className="h-3 w-3" />,
  CHECK_LOG: <AlertTriangle className="h-3 w-3" />,
  INSUFFICIENT_DATA: <HelpCircle className="h-3 w-3" />,
  OVERDUE: <AlertTriangle className="h-3 w-3" />,
  DUE_SOON: <Clock className="h-3 w-3" />,
  DUE_MEDIUM: <Clock className="h-3 w-3" />,
  DUE_LATER: <Clock className="h-3 w-3" />,
  OK: <CheckCircle2 className="h-3 w-3" />,
};

const STATUS_LABEL_KEY: Record<StatusCode, keyof Translation> = {
  ENTER_TARGET: 'statusEnterTarget',
  NO_DATA: 'statusNoData',
  CHECK_LOG: 'statusCheckLog',
  INSUFFICIENT_DATA: 'statusInsufficientData',
  OVERDUE: 'statusOverdue',
  DUE_SOON: 'statusDueSoon',
  DUE_MEDIUM: 'statusDueMedium',
  DUE_LATER: 'statusDueLater',
  OK: 'statusOk',
};

export function StatusBadge({ status }: { status: StatusCode }) {
  const { t } = useLanguage();
  const meta = STATUS_META[status];
  const label = t[STATUS_LABEL_KEY[status]] as string;
  return (
    <Badge color={meta.color}>
      {ICONS[status]}
      {label}
    </Badge>
  );
}
