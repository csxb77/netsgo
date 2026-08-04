import { useMemo } from 'react';
import { Activity, ArrowDown, LoaderCircle, ScanLine, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ActivityItem } from './ActivityItem';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivity } from '@/hooks/use-activity';
import type { ActivityReadScope } from '@/lib/api';
import { activityDayKey, formatActivityDay } from '@/lib/activity-format';
import type { ActivityItem as ActivityItemType, ActivityQuery } from '@/types';

function TimelineSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid grid-cols-[2.75rem_1rem_minmax(0,1fr)] items-start gap-x-2.5 px-3 py-2.5 sm:px-4">
          <Skeleton className="mt-0.5 h-4 w-full" />
          <div className="flex h-5 justify-center"><Skeleton className="mt-1.5 size-2.5 rounded-full" /></div>
          <div className="space-y-1.5 py-0.5">
            <Skeleton className="h-3.5 w-[45%]" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineState({ icon: Icon, title, description, action }: {
  icon: typeof Activity;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ActivityTimeline({
  readScope,
  query,
  compact = false,
}: {
  readScope: ActivityReadScope;
  query: ActivityQuery;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const activity = useActivity(readScope, query);

  const groups = useMemo(() => {
    const byDay = new Map<string, ActivityItemType[]>();
    for (const item of activity.items) {
      const key = activityDayKey(item.occurred_at);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
    return [...byDay.entries()];
  }, [activity.items]);

  if (activity.isLoading) {
    return <TimelineSkeleton rows={compact ? 4 : 8} />;
  }
  if (activity.isError) {
    return (
      <TimelineState
        icon={TriangleAlert}
        title={t('activity.loadFailed')}
        description={t('activity.loadFailedHelp')}
        action={<Button variant="outline" size="sm" onClick={() => activity.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }
  if (activity.items.length === 0) {
    return (
      <TimelineState
        icon={ScanLine}
        title={t('activity.emptyTitle')}
        description={t('activity.emptyDescription')}
      />
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {groups.map(([day, items]) => (
        <section key={day}>
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/40 bg-card/85 px-3 py-1.5 backdrop-blur-sm sm:px-4">
            <span className="text-xs font-medium text-muted-foreground">{formatActivityDay(items[0].occurred_at)}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground/60">{t('activity.eventCount', { count: items.length })}</span>
          </header>
          <div className="divide-y divide-border/40">
            {items.map((item) => <ActivityItem key={item.id} item={item} omitSubjectId={query.scopeId} />)}
          </div>
        </section>
      ))}
      {compact ? null : (
        <div className="flex justify-center px-4 py-3">
          {activity.hasNextPage ? (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal" disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
              {activity.isFetchingNextPage ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDown className="size-3.5" />}
              {activity.isFetchingNextPage ? t('activity.loadingOlder') : t('activity.loadOlder')}
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground/50">{t('activity.endOfRecord')}</span>
          )}
        </div>
      )}
    </div>
  );
}
