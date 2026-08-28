import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface WebhookDeliverySettings {
  allow_private_targets: boolean;
  daily_delivery_cap: number;
}

export const webhookSettingsQueryKey = ['webhook-settings'] as const;

export function useWebhookSettings() {
  return useQuery({
    queryKey: webhookSettingsQueryKey,
    queryFn: () => api.get<WebhookDeliverySettings>('/api/admin/settings/webhooks'),
  });
}

export function useWebhookSettingsMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: webhookSettingsQueryKey });

  return {
    updateSettings: useMutation({
      mutationFn: (settings: WebhookDeliverySettings) =>
        api.put<WebhookDeliverySettings>('/api/admin/settings/webhooks', settings),
      onSuccess: invalidate,
    }),
  };
}
