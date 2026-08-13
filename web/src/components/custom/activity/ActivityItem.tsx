import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatActivityAbsoluteTime, formatActivityClock, formatActivityRelativeTime } from '@/lib/activity-format';
import { cn } from '@/lib/utils';
import type {
  ActivityClientSubject,
  ActivityItem as ActivityItemType,
  ActivitySeverity,
} from '@/types';

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

interface ActivityReference {
  key: string;
  relation: string;
  name: string;
}

function readableClientName(item: ActivityItemType, clientId: string, t: TFunction) {
  const subject = item.clients.find((candidate) => candidate.client_id === clientId);
  return subject?.display_name?.trim() || subject?.hostname?.trim() || t('activity.unknownClient');
}

function readableTunnelName(item: ActivityItemType, tunnelId: string, t: TFunction) {
  const subject = item.tunnels.find((candidate) => candidate.tunnel_id === tunnelId);
  return subject?.name?.trim() || t('activity.unknownTunnel');
}

function activitySummary(item: ActivityItemType, t: TFunction) {
  if (item.payload_version !== 1 || !item.payload.summary_key) return t('activity.unknownSummary');
  const args = { ...item.payload.summary_args };
  if (args.client_name && item.clients.some((subject) => subject.client_id === args.client_name)) {
    args.client_name = readableClientName(item, args.client_name, t);
  }
  if (args.tunnel_name && item.tunnels.some((subject) => subject.tunnel_id === args.tunnel_name)) {
    args.tunnel_name = readableTunnelName(item, args.tunnel_name, t);
  }
  return t(item.payload.summary_key, {
    ...args,
    defaultValue: t('activity.unknownSummary'),
  });
}

const namedActorTypes = new Set(['admin', 'user', 'client', 'system', 'security']);

// 摘要文案通常已经点名了操作方，第三行只补充没有表达过的信息。
function actorLabel(item: ActivityItemType, summary: string, t: TFunction) {
  const typeLabel = namedActorTypes.has(item.actor.type) ? t(`activity.actor.${item.actor.type}`) : '';
  const rawName = item.actor.name?.trim();
  const name = rawName && rawName !== item.actor.id ? rawName : '';
  const echoesCategory = item.actor.type === item.category;
  if (!name || summary.includes(name)) {
    return echoesCategory ? '' : typeLabel;
  }
  return echoesCategory || !typeLabel ? name : `${typeLabel} ${name}`;
}

const clientRelationPriority: Record<ActivityClientSubject['relation'], number> = {
  target: 0,
  ingress: 1,
  owner: 2,
  peer: 3,
  subject: 4,
  related: 5,
};

function clientRelationLabel(item: ActivityItemType, subject: ActivityClientSubject, t: TFunction) {
  if (item.category === 'tunnel' && item.action === 'migrated' && subject.relation === 'related') {
    return t('activity.relation.client.previousTarget');
  }
  return t(`activity.relation.client.${subject.relation}`);
}

function clientReferences(item: ActivityItemType, summary: string, omitSubjectId: string | undefined, t: TFunction) {
  const references: ActivityReference[] = [];
  const seen = new Set<string>();
  const subjects = [...item.clients].sort(
    (left, right) => clientRelationPriority[left.relation] - clientRelationPriority[right.relation],
  );
  for (const subject of subjects) {
    if (subject.client_id === omitSubjectId || seen.has(subject.client_id)) continue;
    seen.add(subject.client_id);
    const name = subject.display_name?.trim() || subject.hostname?.trim() || t('activity.unknownClient');
    if (summary.includes(name)) continue;
    references.push({
      key: `client:${subject.client_id}`,
      relation: clientRelationLabel(item, subject, t),
      name,
    });
  }
  return references;
}

function tunnelReferences(item: ActivityItemType, summary: string, omitSubjectId: string | undefined, t: TFunction) {
  const references: ActivityReference[] = [];
  const seen = new Set<string>();
  for (const subject of item.tunnels) {
    if (subject.tunnel_id === omitSubjectId || seen.has(subject.tunnel_id)) continue;
    seen.add(subject.tunnel_id);
    const name = subject.name?.trim() || t('activity.unknownTunnel');
    if (summary.includes(name)) continue;
    references.push({
      key: `tunnel:${subject.tunnel_id}`,
      relation: t(`activity.relation.tunnel.${subject.relation}`),
      name,
    });
  }
  return references;
}

function activityReferences(item: ActivityItemType, summary: string, omitSubjectId: string | undefined, t: TFunction) {
  return [
    ...clientReferences(item, summary, omitSubjectId, t),
    ...tunnelReferences(item, summary, omitSubjectId, t),
  ];
}

export function ActivityItem({ item, omitSubjectId }: { item: ActivityItemType; omitSubjectId?: string }) {
  const { t } = useTranslation();
  const summary = activitySummary(item, t);
  const AccentIcon = severityAccentIcon[item.severity];
  const reason = item.payload.reason_code
    ? t(`activity.reason.${item.payload.reason_code}`, { defaultValue: '' })
    : '';
  const actor = actorLabel(item, summary, t);
  const references = activityReferences(item, summary, omitSubjectId, t);
  const hasMetadata = Boolean(actor) || references.length > 0;

  return (
    <article className="relative grid grid-cols-[5rem_1rem_minmax(0,1fr)] items-start gap-x-2 px-3 py-3 transition-colors hover:bg-muted/30 sm:px-4">
      <div className="flex min-w-0 flex-col items-end gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <time className="cursor-default text-right text-xs leading-5 tabular-nums text-muted-foreground/80" dateTime={item.occurred_at}>
              {formatActivityClock(item.occurred_at)}
            </time>
          </TooltipTrigger>
          <TooltipContent>
            {formatActivityAbsoluteTime(item.occurred_at)} · {formatActivityRelativeTime(item.occurred_at)}
          </TooltipContent>
        </Tooltip>
        <Badge variant="secondary">{t(`activity.category.${item.category}`)}</Badge>
      </div>
      <div className="relative min-h-5 self-stretch">
        <span className="absolute bottom-[-0.75rem] left-1/2 top-[-0.75rem] w-px -translate-x-1/2 bg-muted-foreground/20" aria-hidden />
        {AccentIcon ? (
          <AccentIcon className={cn('absolute left-1/2 top-0.5 size-4 -translate-x-1/2', severityMarkerClass[item.severity])} strokeWidth={2.25} />
        ) : (
          <span className={cn('absolute left-1/2 top-1.5 size-2.5 -translate-x-1/2 rounded-full', severityMarkerClass[item.severity])} />
        )}
        <span className="sr-only">{t(`activity.severity.${item.severity}`)}</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-foreground">{summary}</p>
        {reason ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{reason}</p> : null}
        {hasMetadata ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
            {actor ? <span>{t('activity.metadata.actor', { actor })}</span> : null}
            {references.map((reference) => (
              <span key={reference.key} className="min-w-0">
                {reference.relation}{t('activity.metadata.separator')}<span className="font-medium text-foreground/75">{reference.name}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
