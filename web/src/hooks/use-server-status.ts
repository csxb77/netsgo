import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { scopedConsoleSnapshotPath } from '@/lib/api';
import { scopedQueryKey, type ResourceScope } from '@/lib/resource-scope';
import type { ConsoleSnapshot, ServerStatus } from '@/types';

interface UseServerStatusOptions {
  enabled?: boolean;
  refetchOnMount?: boolean | 'always';
  staleTime?: number;
}

/**
 * Resource screens read the safe bootstrap metadata from their scoped console
 * snapshot. The unscoped status endpoint is retained only for administrator
 * system views.
 */
export function useServerStatus(scope: ResourceScope | null = null, options: UseServerStatusOptions = {}) {
  return useQuery({
    queryKey: scope ? scopedQueryKey(scope, 'server-status') : ['server-status'],
    queryFn: async (): Promise<ServerStatus | undefined> => {
      if (!scope) return api.get<ServerStatus>('/api/status');
      const snapshot = await api.get<ConsoleSnapshot>(scopedConsoleSnapshotPath(scope));
      return snapshot.server_status;
    },
    enabled: options.enabled ?? true,
    refetchOnMount: options.refetchOnMount,
    staleTime: options.staleTime ?? Infinity,
  });
}
