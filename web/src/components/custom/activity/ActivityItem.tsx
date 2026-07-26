import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatActivityAbsoluteTime, formatActivityClock, formatActivityRelativeTime } from '@/lib/activity-format';
import { cn } from '@/lib/utils';
import type { ActivityItem as ActivityItemType, ActivitySeverity } from '@/types';

const severityAccentIcon: Partial<Record<ActivitySeverity, LucideIcon>> = {
  warning: AlertTriangle,
  error: CircleAlert,
};

const severityMarkerClass: Record<ActivitySeverity, string> = {
  debug: 'bg-muted-foreground/40',
  info: 'bg-sky-500/80',
  warning: 'text-amber-500',
  error: 'text-rose-500',
};

function activitySummary(item: ActivityItemType, t: TFunction) {
  if (item.payload_version !== 1 || !item.payload.summary_key) return t('activity.unknownSummary');
  return t(item.payload.summary_key, {
    ...item.payload.summary_args,
    defaultValue: t('activity.unknownSummary'),
  });
}

const namedActorTypes = new Set(['admin', 'client', 'system', 'security']);

// 摘要文案通常已经点名了操作方和实体，重复渲染同一个名字只会制造噪音。
function actorLabel(item: ActivityItemType, summary: string, t: TFunction) {
  const typeLabel = namedActorTypes.has(item.actor.type) ? t(`activity.actor.${item.actor.type}`) : '';
  const name = item.actor.name || item.actor.id;
  const echoesCategory = item.actor.type === item.category;
  if (!name || summary.includes(name)) {
    return echoesCategory ? '' : typeLabel;
  }
  return echoesCategory || !typeLabel ? name : `${typeLabel} ${name}`;
}

function activityReferences(item: ActivityItemType, summary: string, omitSubjectId?: string) {
  const subjects = [
    ...item.clients.map((subject) => ({ id: subject.client_id, label: subject.display_name || subject.hostname || subject.client_id })),
    ...item.tunnels.map((subject) => ({ id: subject.tunnel_id, label: subject.name || subject.tunnel_id })),
  ];
  const seen = new Set<string>();
  const references: string[] = [];
  for (const subject of subjects) {
    if (!subject.label || subject.id === omitSubjectId || seen.has(subject.label) || summary.includes(subject.label)) continue;
    seen.add(subject.label);
    references.push(subject.label);
  }
  return references;
}

export function ActivityItem({ item, omitSubjectId }: { item: ActivityItemType; omitSubjectId?: string }) {
  const { t } = useTranslation();
  const summary = activitySummary(item, t);
  const AccentIcon = severityAccentIcon[item.severity];
  const reason = item.payload.reason_code
    ? t(`activity.reason.${item.payload.reason_code}`, { defaultValue: '' })
    : '';
  const actor = actorLabel(item, summary, t);
  const references = activityReferences(item, summary, omitSubjectId);

  return (
    <article className="group relative grid grid-cols-[2.75rem_1rem_minmax(0,1fr)] items-start gap-x-2.5 px-3 py-2.5 transition-colors hover:bg-muted/30 sm:px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <time className="cursor-default pt-px text-right text-xs leading-5 tabular-nums text-muted-foreground/80" dateTime={item.occurred_at}>
            {formatActivityClock(item.occurred_at)}
          </time>
        </TooltipTrigger>
        <TooltipContent>
          {formatActivityAbsoluteTime(item.occurred_at)} · {formatActivityRelativeTime(item.occurred_at)}
        </TooltipContent>
      </Tooltip>
      <div className="relative h-5">
        <span className="absolute bottom-[-0.75rem] left-1/2 top-[-0.75rem] w-px -translate-x-1/2 bg-muted-foreground/20" aria-hidden />
        {AccentIcon ? (
          <AccentIcon className={cn('absolute left-1/2 top-0.5 size-4 -translate-x-1/2', severityMarkerClass[item.severity])} strokeWidth={2.25} />
        ) : (
          <span className={cn('absolute left-1/2 top-1.5 size-2.5 -translate-x-1/2 rounded-full', severityMarkerClass[item.severity])} />
        )}
        <span className="sr-only">{t(`activity.severity.${item.severity}`)}</span>
      </div>
      <div className="min-w-0">
        <p className={cn('pr-10 text-sm leading-5 text-foreground', AccentIcon && 'font-medium')}>{summary}</p>
        {reason ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{reason}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-4 text-muted-foreground/70">
          <span>{t(`activity.category.${item.category}`)}</span>
          {actor ? (
            <>
              <span aria-hidden className="text-border">·</span>
              <span className="truncate">{actor}</span>
            </>
          ) : null}
          {references.map((reference) => (
            <span key={reference} className="max-w-48 truncate rounded bg-muted/70 px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
              {reference}
            </span>
          ))}
        </div>
      </div>
      <span className="absolute right-3 top-2.5 text-[11px] leading-5 tabular-nums text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 sm:right-4">
        #{String(item.id).padStart(4, '0')}
      </span>
    </article>
  );
}
