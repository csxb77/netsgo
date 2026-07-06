import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { RotateCcw, ShieldOff, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { adminRoute } from '../admin';
import { useClientAuthRateLimitMutations, useClientAuthRateLimits } from '@/hooks/use-admin-rate-limits';
import { formatTimestamp, formatUptime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RateLimitEntry } from '@/types';

export const adminAccessControlRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/access-control',
  component: AdminAccessControlPage,
});

function AdminAccessControlPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useClientAuthRateLimits();
  const mutations = useClientAuthRateLimitMutations();
  const [resettingIP, setResettingIP] = useState<string | null>(null);

  const resetClientAuthRateLimit = async (ip: string) => {
    setResettingIP(ip);
    try {
      await mutations.resetIP.mutateAsync(ip);
      toast.success(t('admin.clientAuthRateLimitCleared', { ip }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    } finally {
      setResettingIP(null);
    }
  };

  return (
    <div className="pb-10">
      <ClientAuthRateLimitsSection
        entries={data?.entries ?? []}
        isLoading={isLoading}
        resettingIP={resettingIP}
        onReset={resetClientAuthRateLimit}
      />
    </div>
  );
}

function ClientAuthRateLimitsSection({
  entries,
  isLoading,
  resettingIP,
  onReset,
}: {
  entries: RateLimitEntry[];
  isLoading: boolean;
  resettingIP: string | null;
  onReset: (ip: string) => void;
}) {
  const { t } = useTranslation();
  const limitedCount = entries.filter((entry) => entry.limited).length;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-background/90">
      <div className="grid gap-4 border-b border-border/50 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{t('admin.clientAuthRateLimits')}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('admin.clientAuthRateLimitsDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={limitedCount > 0 ? 'destructive' : 'secondary'}>
            {t('admin.clientAuthRateLimitedCount', { count: limitedCount })}
          </Badge>
          <Badge variant="outline">
            {t('admin.clientAuthRateLimitEntryCount', { count: entries.length })}
          </Badge>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <ShieldOff className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('admin.noClientAuthRateLimits')}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t('admin.noClientAuthRateLimitsDescription')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="border-b border-border/50 bg-muted/30 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t('admin.ipAddress')}</th>
                <th className="px-4 py-2.5 font-medium">{t('admin.limitStatus')}</th>
                <th className="px-4 py-2.5 font-medium">{t('admin.windowRequests')}</th>
                <th className="px-4 py-2.5 font-medium">{t('admin.failureCounter')}</th>
                <th className="px-4 py-2.5 font-medium">{t('admin.retryAfter')}</th>
                <th className="px-4 py-2.5 font-medium">{t('admin.lastActivity')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {entries.map((entry) => {
                const resetPending = resettingIP === entry.ip;
                return (
                  <tr key={entry.ip} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{entry.ip}</td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.limited ? 'destructive' : 'secondary'}>
                        {rateLimitStatusLabel(entry, t)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.request_count} / {entry.max_requests}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.failure_count} / {entry.max_failures}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.limited ? formatUptime(entry.retry_after_seconds) : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatTimestamp(entry.last_activity)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={resetPending || resettingIP !== null}
                        onClick={() => onReset(entry.ip)}
                        title={t('admin.clearClientAuthRateLimit')}
                        aria-label={t('admin.clearClientAuthRateLimit')}
                      >
                        {resetPending ? <RotateCcw className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function rateLimitStatusLabel(entry: RateLimitEntry, t: ReturnType<typeof useTranslation>['t']) {
  if (!entry.limited) {
    return t('admin.clientAuthRateLimitCounting');
  }
  if (entry.reason === 'lockout') {
    return t('admin.clientAuthRateLimitLockout');
  }
  if (entry.reason === 'window') {
    return t('admin.clientAuthRateLimitWindow');
  }
  return t('admin.clientAuthRateLimitLimited');
}
