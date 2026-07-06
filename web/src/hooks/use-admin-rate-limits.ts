import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ClientAuthRateLimitsResponse,
  ResetRateLimitResponse,
} from '@/types';

export const clientAuthRateLimitsQueryKey = ['client-auth-rate-limits'];

export function useClientAuthRateLimits() {
  return useQuery({
    queryKey: clientAuthRateLimitsQueryKey,
    queryFn: () => api.get<ClientAuthRateLimitsResponse>('/api/admin/rate-limits/client-auth'),
    refetchInterval: 10_000,
  });
}

export function useClientAuthRateLimitMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: clientAuthRateLimitsQueryKey });

  return {
    resetIP: useMutation({
      mutationFn: (ip: string) =>
        api.delete<ResetRateLimitResponse>('/api/admin/rate-limits/client-auth', { ip }),
      onSuccess: invalidate,
    }),
  };
}
