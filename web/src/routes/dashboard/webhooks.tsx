import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { Plus, Webhook as WebhookIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

import { ActivityWebhookManager } from "@/components/custom/activity/ActivityWebhookManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToggleWebhook, useWebhookCatalog, useWebhooks } from "@/hooks/use-webhooks";
import { requireConsoleAuth } from "@/lib/auth";
import { formatShortTime } from "@/lib/format";
import { dashboardRoute } from "@/routes/dashboard";
import type { ActivityWebhookConfig } from "@/types/webhook";

export const dashboardWebhooksRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/webhooks",
  beforeLoad: requireConsoleAuth,
  component: WebhooksPage,
});

function WebhooksPage() {
  const { t, i18n } = useTranslation();
  const { data: catalog } = useWebhookCatalog();
  const { data: webhooks = [], isLoading } = useWebhooks();
  const toggleWebhook = useToggleWebhook();
  const [editing, setEditing] = useState<ActivityWebhookConfig | "new" | null>(
    null,
  );

  const toggleEnabled = async (item: ActivityWebhookConfig, enabled: boolean) => {
    try {
      await toggleWebhook.mutateAsync({ webhookId: item.id, enabled });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">
            {t("webhooks.pageTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("webhooks.pageDescription")}
          </p>
        </div>
        <Button onClick={() => setEditing("new")} disabled={!catalog}>
          <Plus data-icon="inline-start" />
          {t("webhooks.manager.newWebhook")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : webhooks.length === 0 ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WebhookIcon />
            </EmptyMedia>
            <EmptyTitle>{t("webhooks.manager.emptySelection")}</EmptyTitle>
            <EmptyDescription>
              {t("webhooks.manager.emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-background/90">
          {webhooks.map((item) => {
            const calledAt = formatShortTime(
              item.lastCalledAt,
              i18n.resolvedLanguage ?? "zh-CN",
            );
            return (
              <div
                key={item.id}
                className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5"
              >
                <button
                  type="button"
                  className="min-w-0 rounded-md text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => setEditing(item)}
                >
                  <span className="block truncate font-medium">
                    {item.name || t("webhooks.manager.webhookFallback")}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                      {t(`webhooks.health.${item.lastStatus}`)}
                    </Badge>
                    {calledAt ? (
                      <span className="truncate">{calledAt}</span>
                    ) : null}
                  </span>
                </button>
                <div className="flex items-center gap-3 sm:justify-end">
                  <Switch
                    checked={item.enabled}
                    disabled={toggleWebhook.isPending}
                    onCheckedChange={(enabled) => void toggleEnabled(item, enabled)}
                    aria-label={t(
                      `webhooks.status.${item.enabled ? "enabled" : "disabled"}`,
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ActivityWebhookManager
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        onOpenChange={(nextOpen: boolean) => {
          if (!nextOpen) setEditing(null);
        }}
        editWebhook={editing}
      />
    </div>
  );
}
