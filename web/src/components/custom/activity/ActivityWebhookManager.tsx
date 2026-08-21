import { useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  AlignLeft,
  Braces,
  Check,
  CheckCircle2,
  CircleOff,
  Clock3,
  Copy,
  FileJson2,
  Plus,
  RotateCw,
  Search,
  Send,
  Server,
  Trash2,
  Waypoints,
  Webhook,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { WebhookJsonEditor, type WebhookJsonEditorHandle } from '@/components/custom/webhooks/WebhookJsonEditor';
import {
  DEFAULT_CLIENT_WEBHOOK_BODY,
  DEFAULT_TUNNEL_WEBHOOK_BODY,
  EMPTY_WEBHOOK,
  WEBHOOK_CLIENT_OPTIONS,
  WEBHOOK_EVENT_OPTIONS,
  WEBHOOK_INVOCATIONS,
  WEBHOOK_PROTOTYPES,
  WEBHOOK_TUNNEL_OPTIONS,
  WEBHOOK_VARIABLES,
  webhookVariableSample,
  type WebhookEventGroup,
  type WebhookEventKey,
  type WebhookInvocation,
  type WebhookMethod,
  type WebhookPrototype,
  type WebhookTargetKind,
} from '@/components/custom/webhooks/webhook-prototype-data';

const GROUP_ICONS: Record<WebhookEventGroup, typeof Server> = {
  client: Server,
  tunnel: Waypoints,
};

const GROUP_ACCENTS: Record<WebhookEventGroup, string> = {
  client: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  tunnel: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function eventLabelKey(eventKey: WebhookEventKey) {
  return `webhooks.events.${eventKey}` as const;
}

function eventCategory(eventKey: WebhookEventKey) {
  return eventKey.split('.')[0];
}

function insertAtSelection(
  value: string,
  token: string,
  control: HTMLInputElement | HTMLTextAreaElement | null,
  onChange: (value: string) => void,
) {
  const start = control?.selectionStart ?? value.length;
  const end = control?.selectionEnd ?? value.length;
  const nextPosition = start + token.length;
  onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
  window.requestAnimationFrame(() => {
    control?.focus();
    control?.setSelectionRange(nextPosition, nextPosition);
  });
}

function renderTemplate(value: string, values: Record<string, string>, encode = false) {
  return value.replace(/{{\s*([^}]+?)\s*}}/g, (_, key: string) => {
    const replacement = values[key] ?? `{{${key}}}`;
    return encode ? encodeURIComponent(replacement) : replacement;
  });
}

function renderJsonBody(body: string, values: Record<string, string>) {
  const parsed: unknown = JSON.parse(body);
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') return renderTemplate(value, values);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
    }
    return value;
  };
  return JSON.stringify(visit(parsed), null, 2);
}

function isValidJson(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function formatShortTime(value: string | null, locale: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function ActivityWebhookManager({ showAdminScopeNote = false }: { showAdminScopeNote?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [webhooks, setWebhooks] = useState<WebhookPrototype[]>(() => structuredClone(WEBHOOK_PROTOTYPES));
  const [selectedId, setSelectedId] = useState(WEBHOOK_PROTOTYPES[0].id);
  const [activeTab, setActiveTab] = useState<'configuration' | 'deliveries'>('configuration');
  const selected = webhooks.find((item) => item.id === selectedId) ?? null;

  const updateSelected = <Key extends keyof WebhookPrototype>(key: Key, value: WebhookPrototype[Key]) => {
    setWebhooks((current) => current.map((item) => item.id === selectedId ? { ...item, [key]: value } : item));
  };

  const addWebhook = () => {
    const id = `wh_draft_${Date.now()}`;
    setWebhooks((current) => [...current, { ...structuredClone(EMPTY_WEBHOOK), id }]);
    setSelectedId(id);
    setActiveTab('configuration');
  };

  const validate = () => {
    if (!selected?.name.trim() || !selected.url.trim() || selected.events.length === 0) {
      toast.error(t('webhooks.toast.validation'));
      return false;
    }
    if (selected.targetMode === 'selected' && selected.targetIds.length === 0) {
      toast.error(t('webhooks.target.selectionRequired'));
      return false;
    }
    if (selected.method === 'POST' && !isValidJson(selected.body)) {
      toast.error(t('webhooks.toast.invalidJson'));
      return false;
    }
    return true;
  };

  const save = () => {
    if (validate()) toast.success(t('webhooks.toast.saved'));
  };

  const test = () => {
    if (validate()) toast.success(t('webhooks.toast.tested'));
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Webhook data-icon="inline-start" />
          {t('webhooks.manager.open')}
          <Badge variant="secondary" className="ml-1">{webhooks.length}</Badge>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
        <SheetHeader className="border-b pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{t('webhooks.manager.title')}</SheetTitle>
            <Badge variant="secondary">{t('webhooks.prototypeBadge')}</Badge>
            <Badge variant="outline">{t('webhooks.spaceOnly')}</Badge>
          </div>
          <SheetDescription>{t('webhooks.manager.description')}</SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[240px_minmax(0,1fr)] md:overflow-hidden">
          <aside className="border-b bg-muted/15 md:overflow-y-auto md:border-r md:border-b-0">
            <div className="sticky top-0 z-10 border-b bg-background/95 p-3 backdrop-blur">
              <div className="mb-2">
                <div className="text-sm font-medium">{t('webhooks.manager.listTitle')}</div>
                <div className="text-xs text-muted-foreground">{t('webhooks.manager.configured', { count: webhooks.length })}</div>
              </div>
              <Button className="w-full" size="sm" onClick={addWebhook}>
                <Plus data-icon="inline-start" />
                {t('webhooks.manager.newWebhook')}
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto p-2 md:flex-col md:overflow-x-visible">
              {webhooks.map((item) => {
                const calledAt = formatShortTime(item.lastCalledAt, i18n.resolvedLanguage ?? 'zh-CN');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'min-w-56 rounded-lg border bg-background p-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-w-0',
                      selectedId === item.id && 'border-primary/40 bg-primary/5 ring-1 ring-primary/10',
                      !item.enabled && 'opacity-65',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {item.name || t('webhooks.manager.webhookFallback')}
                      </span>
                      <span className={cn('mt-1 size-2 shrink-0 rounded-full', item.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant={item.method === 'POST' ? 'default' : 'outline'}>{item.method}</Badge>
                      <Badge variant="outline">
                        {item.targetMode === 'all'
                          ? t(`webhooks.target.${item.targetKind === 'client' ? 'allClients' : 'allTunnels'}`)
                          : t('webhooks.manager.targetSelected', { count: item.targetIds.length })}
                      </Badge>
                      <Badge variant="secondary">{t('webhooks.manager.eventCount', { count: item.events.length })}</Badge>
                    </div>
                    <div className="mt-2 truncate text-[11px] text-muted-foreground">
                      {calledAt ?? t('webhooks.status.idle')} · {t('webhooks.manager.calls24h', { count: item.calls24h })}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 md:overflow-y-auto">
            {selected ? (
              <div className="flex min-h-full flex-col">
                <div className="border-b bg-background px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{selected.name || t('webhooks.manager.webhookFallback')}</div>
                      <code className="text-[11px] text-muted-foreground">{selected.id}</code>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={test}>
                        <Send data-icon="inline-start" />
                        {t('webhooks.editor.test')}
                      </Button>
                      <Button size="sm" onClick={save}>
                        <Check data-icon="inline-start" />
                        {t('webhooks.editor.save')}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-2 text-xs text-sky-700 dark:text-sky-300">
                    {showAdminScopeNote ? t('webhooks.manager.adminScope') : t('webhooks.manager.ownScope')}
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex-1 gap-0">
                  <div className="border-b px-4 pt-2">
                    <TabsList variant="line">
                      <TabsTrigger value="configuration">{t('webhooks.manager.configuration')}</TabsTrigger>
                      <TabsTrigger value="deliveries">
                        {t('webhooks.manager.deliveries')}
                        <Badge variant="secondary" className="ml-1">{WEBHOOK_INVOCATIONS.filter((item) => item.webhookId === selected.id).length}</Badge>
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="configuration" className="p-4 sm:p-5">
                    <WebhookConfiguration key={selected.id} webhook={selected} onUpdate={updateSelected} />
                  </TabsContent>
                  <TabsContent value="deliveries" className="p-4 sm:p-5">
                    <WebhookDeliveryLog webhookId={selected.id} />
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="flex min-h-80 items-center justify-center p-8 text-sm text-muted-foreground">
                {t('webhooks.manager.emptySelection')}
              </div>
            )}
          </main>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WebhookConfiguration({
  webhook,
  onUpdate,
}: {
  webhook: WebhookPrototype;
  onUpdate: <Key extends keyof WebhookPrototype>(key: Key, value: WebhookPrototype[Key]) => void;
}) {
  const { t } = useTranslation();
  const [sampleEvent, setSampleEvent] = useState<WebhookEventKey>(webhook.events[0] ?? 'client.online');
  const [pendingTargetKind, setPendingTargetKind] = useState<WebhookTargetKind | null>(null);
  const bodyValid = webhook.method === 'GET' || isValidJson(webhook.body);

  const updateHeader = (headerId: string, field: 'key' | 'value', value: string) => {
    onUpdate('headers', webhook.headers.map((header) => header.id === headerId ? { ...header, [field]: value } : header));
  };

  const requestTargetKindChange = (targetKind: WebhookTargetKind) => {
    if (targetKind !== webhook.targetKind) setPendingTargetKind(targetKind);
  };

  const confirmTargetKindChange = () => {
    const targetKind = pendingTargetKind;
    if (!targetKind) return;
    const events: WebhookEventKey[] = targetKind === 'client'
      ? ['client.online', 'client.offline']
      : ['tunnel.runtime_changed', 'tunnel.runtime_error', 'tunnel.runtime_recovered', 'p2p.failed', 'p2p.fallback'];
    onUpdate('targetKind', targetKind);
    onUpdate('targetMode', 'all');
    onUpdate('targetIds', []);
    onUpdate('events', events);
    onUpdate('body', targetKind === 'client' ? DEFAULT_CLIENT_WEBHOOK_BODY : DEFAULT_TUNNEL_WEBHOOK_BODY);
    setSampleEvent(events[0]);
    setPendingTargetKind(null);
  };

  return (
    <motion.div
      key={webhook.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex flex-col gap-5"
    >
      <EditorSection title={t('webhooks.basic.title')} description={t('webhooks.basic.description')}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`webhook-name-${webhook.id}`}>{t('webhooks.basic.name')}</FieldLabel>
            <Input
              id={`webhook-name-${webhook.id}`}
              value={webhook.name}
              onChange={(event) => onUpdate('name', event.target.value)}
              placeholder={t('webhooks.basic.namePlaceholder')}
            />
          </Field>
          <Field orientation="horizontal" className="rounded-lg border bg-muted/15 p-3">
            <FieldContent>
              <FieldTitle>{t('webhooks.basic.enabled')}</FieldTitle>
              <FieldDescription>{t('webhooks.basic.enabledDescription')}</FieldDescription>
            </FieldContent>
            <Switch checked={webhook.enabled} onCheckedChange={(value) => onUpdate('enabled', value)} />
          </Field>
        </FieldGroup>
      </EditorSection>

      <ListeningTargetSection webhook={webhook} onUpdate={onUpdate} onTargetKindChange={requestTargetKindChange} />

      <EditorSection
        title={t('webhooks.events.title')}
        description={t('webhooks.events.description')}
        action={<Badge variant="secondary">{t('webhooks.events.selected', { count: webhook.events.length })}</Badge>}
      >
        <div className="rounded-lg border bg-muted/10 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            {(() => {
              const Icon = GROUP_ICONS[webhook.targetKind];
              return <span className={cn('flex size-7 items-center justify-center rounded-md', GROUP_ACCENTS[webhook.targetKind])}><Icon className="size-3.5" /></span>;
            })()}
            <span className="text-sm font-medium">{t(`webhooks.events.group.${webhook.targetKind}`)}</span>
          </div>
          <FieldGroup data-slot="checkbox-group" className="grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENT_OPTIONS.filter((option) => option.group === webhook.targetKind).map((option) => (
              <FieldLabel key={option.key} className="cursor-pointer">
                <Field orientation="horizontal">
                  <Checkbox
                    checked={webhook.events.includes(option.key)}
                    onCheckedChange={(checked) => onUpdate('events', checked
                      ? [...new Set([...webhook.events, option.key])]
                      : webhook.events.filter((eventKey) => eventKey !== option.key))}
                  />
                  <FieldContent>
                    <div className="flex items-center gap-1.5">
                      <FieldTitle>{t(eventLabelKey(option.key))}</FieldTitle>
                      {option.key.startsWith('p2p.') ? <Badge variant="outline">P2P</Badge> : null}
                    </div>
                    <code className="text-[10px] text-muted-foreground">{option.key}</code>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </FieldGroup>
        </div>
      </EditorSection>

      <EditorSection title={t('webhooks.request.title')} description={t('webhooks.request.description')}>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <FieldGroup>
            <Field>
              <FieldLabel>{t('webhooks.request.method')}</FieldLabel>
              <ToggleGroup
                type="single"
                value={webhook.method}
                onValueChange={(value) => value && onUpdate('method', value as WebhookMethod)}
                variant="outline"
                spacing={0}
              >
                <ToggleGroupItem value="GET" className="px-6">GET</ToggleGroupItem>
                <ToggleGroupItem value="POST" className="px-6">POST</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>{t('webhooks.request.methodDescription')}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('webhooks.request.url')}</FieldLabel>
              <TemplatedInput
                value={webhook.url}
                targetKind={webhook.targetKind}
                onChange={(value) => onUpdate('url', value)}
              />
              <FieldDescription>{t('webhooks.request.urlDescription')}</FieldDescription>
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>{t('webhooks.request.headers')}</FieldLabel>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdate('headers', [...webhook.headers, { id: `header-${Date.now()}`, key: '', value: '' }])}
                >
                  <Plus data-icon="inline-start" />
                  {t('webhooks.request.addHeader')}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {webhook.headers.map((header) => (
                  <div key={header.id} className="grid gap-2 sm:grid-cols-[minmax(120px,0.65fr)_minmax(180px,1.35fr)_auto]">
                    <Input
                      value={header.key}
                      onChange={(event) => updateHeader(header.id, 'key', event.target.value)}
                      placeholder={t('webhooks.request.headerName')}
                      className="font-mono text-xs"
                    />
                    <TemplatedInput
                      value={header.value}
                      targetKind={webhook.targetKind}
                      onChange={(value) => updateHeader(header.id, 'value', value)}
                      placeholder={t('webhooks.request.headerValue')}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onUpdate('headers', webhook.headers.filter((item) => item.id !== header.id))}
                      aria-label={t('webhooks.request.removeHeader')}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {webhook.headers.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t('webhooks.request.emptyHeaders')}</div>
                ) : null}
              </div>
            </Field>

            {webhook.method === 'POST' ? (
              <Field data-invalid={!bodyValid}>
                <FieldLabel>{t('webhooks.request.body')}</FieldLabel>
                <JsonBodyEditor
                  value={webhook.body}
                  targetKind={webhook.targetKind}
                  invalid={!bodyValid}
                  onChange={(value) => onUpdate('body', value)}
                />
                <FieldDescription>{t('webhooks.request.bodyDescription')}</FieldDescription>
                {!bodyValid ? <FieldError>{t('webhooks.toast.invalidJson')}</FieldError> : null}
              </Field>
            ) : (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-sm text-sky-700 dark:text-sky-300">
                {t('webhooks.request.getOnly')}
              </div>
            )}
          </FieldGroup>

          <RequestPreview webhook={webhook} sampleEvent={sampleEvent} onSampleEventChange={setSampleEvent} />
        </div>
      </EditorSection>

      <AlertDialog open={pendingTargetKind !== null} onOpenChange={(nextOpen) => !nextOpen && setPendingTargetKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('webhooks.target.changeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('webhooks.target.changeDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTargetKindChange}>{t('webhooks.target.changeConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function ListeningTargetSection({
  webhook,
  onUpdate,
  onTargetKindChange,
}: {
  webhook: WebhookPrototype;
  onUpdate: <Key extends keyof WebhookPrototype>(key: Key, value: WebhookPrototype[Key]) => void;
  onTargetKindChange: (targetKind: WebhookTargetKind) => void;
}) {
  const { t } = useTranslation();
  const targets = webhook.targetKind === 'client' ? WEBHOOK_CLIENT_OPTIONS : WEBHOOK_TUNNEL_OPTIONS;
  const toggleTarget = (targetId: string, checked: boolean) => {
    onUpdate('targetIds', checked
      ? [...new Set([...webhook.targetIds, targetId])]
      : webhook.targetIds.filter((id) => id !== targetId));
  };

  return (
    <EditorSection title={t('webhooks.target.title')} description={t('webhooks.target.description')}>
      <FieldGroup>
        <Field>
          <FieldLabel>{t('webhooks.target.kind')}</FieldLabel>
          <ToggleGroup
            type="single"
            value={webhook.targetKind}
            onValueChange={(value) => value && onTargetKindChange(value as WebhookTargetKind)}
            variant="outline"
            spacing={2}
            className="grid w-full grid-cols-2"
          >
            <ToggleGroupItem value="client" className="h-auto min-h-16 justify-start px-3 py-2 text-left whitespace-normal">
              <Server />
              <span>
                <span className="block text-sm font-medium">{t('webhooks.target.client')}</span>
                <span className="block text-[11px] font-normal leading-relaxed text-muted-foreground">{t('webhooks.target.clientDescription')}</span>
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="tunnel" className="h-auto min-h-16 justify-start px-3 py-2 text-left whitespace-normal">
              <Waypoints />
              <span>
                <span className="block text-sm font-medium">{t('webhooks.target.tunnel')}</span>
                <span className="block text-[11px] font-normal leading-relaxed text-muted-foreground">{t('webhooks.target.tunnelDescription')}</span>
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel>{t('webhooks.target.range')}</FieldLabel>
            {webhook.targetMode === 'selected' ? <Badge variant="secondary">{t('webhooks.target.selectedCount', { count: webhook.targetIds.length })}</Badge> : null}
          </div>
          <ToggleGroup
            type="single"
            value={webhook.targetMode}
            onValueChange={(value) => {
              if (!value) return;
              onUpdate('targetMode', value as WebhookPrototype['targetMode']);
              if (value === 'all') onUpdate('targetIds', []);
            }}
            variant="outline"
            spacing={0}
          >
            <ToggleGroupItem value="all" className="px-5">{t('webhooks.target.all')}</ToggleGroupItem>
            <ToggleGroupItem value="selected" className="px-5">{t('webhooks.target.selected')}</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        {webhook.targetMode === 'all' ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              {t(`webhooks.target.${webhook.targetKind === 'client' ? 'allClients' : 'allTunnels'}`)}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(`webhooks.target.${webhook.targetKind === 'client' ? 'allClientsDescription' : 'allTunnelsDescription'}`)}
            </p>
          </div>
        ) : (
          <Field data-invalid={webhook.targetIds.length === 0}>
            <FieldLabel>{t(`webhooks.target.${webhook.targetKind === 'client' ? 'selectedClients' : 'selectedTunnels'}`)}</FieldLabel>
            <FieldGroup data-slot="checkbox-group" className="grid gap-2 sm:grid-cols-2">
              {targets.map((target) => (
                <FieldLabel key={target.id} className="cursor-pointer">
                  <Field orientation="horizontal">
                    <Checkbox
                      checked={webhook.targetIds.includes(target.id)}
                      onCheckedChange={(checked) => toggleTarget(target.id, checked === true)}
                    />
                    <FieldContent>
                      <FieldTitle>{target.name}</FieldTitle>
                      <code className="text-[10px] leading-relaxed text-muted-foreground">{target.detail}</code>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              ))}
            </FieldGroup>
            {webhook.targetIds.length === 0 ? <FieldError>{t('webhooks.target.selectionRequired')}</FieldError> : null}
          </Field>
        )}
      </FieldGroup>
    </EditorSection>
  );
}

function EditorSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <header className="flex items-start justify-between gap-3 border-b bg-muted/15 px-3.5 py-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {action}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function TemplatedInput({ value, onChange, targetKind, ...props }: Omit<React.ComponentProps<typeof InputGroupInput>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  targetKind: WebhookTargetKind;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <InputGroup>
      <InputGroupInput
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono text-xs"
        {...props}
      />
      <VariablePicker
        targetKind={targetKind}
        onSelect={(key) => insertAtSelection(value, `{{${key}}}`, inputRef.current, onChange)}
      />
    </InputGroup>
  );
}

function JsonBodyEditor({ value, onChange, invalid, targetKind }: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  targetKind: WebhookTargetKind;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<WebhookJsonEditorHandle>(null);

  const formatJson = () => {
    if (!editorRef.current?.format()) toast.error(t('webhooks.toast.invalidJson'));
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-2.5 py-2">
        <div className={cn(
          'flex items-center gap-1.5 text-xs',
          invalid ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
        )}>
          {invalid ? <CircleOff className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          {t(`webhooks.preview.${invalid ? 'invalidJson' : 'validJson'}`)}
        </div>
        <div className="flex items-center gap-1.5">
          <VariablePicker
            standalone
            targetKind={targetKind}
            onSelect={(key) => editorRef.current?.insert(`{{${key}}}`)}
          />
          <Button type="button" variant="outline" size="sm" onClick={formatJson}>
            <AlignLeft data-icon="inline-start" />
            {t('webhooks.editor.formatJson')}
          </Button>
        </div>
      </div>
      <WebhookJsonEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        invalid={invalid}
        targetKind={targetKind}
        className="rounded-none border-0 bg-transparent focus-within:ring-0"
      />
    </div>
  );
}

function VariablePicker({ onSelect, targetKind, standalone = false }: {
  onSelect: (key: string) => void;
  targetKind: WebhookTargetKind;
  standalone?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const groups = ['event', 'client', 'tunnel', 'p2p', 'webhook'] as const;
  const filtered = WEBHOOK_VARIABLES.filter((variable) => (
    variable.availableFor.includes(targetKind)
    && variable.key.toLowerCase().includes(query.trim().toLowerCase())
  ));

  return (
    <Popover>
      <PopoverTrigger asChild>
        {standalone ? (
          <Button type="button" variant="outline" size="sm">
            <Braces data-icon="inline-start" />
            {t('webhooks.variables.title')}
          </Button>
        ) : (
          <InputGroupButton type="button" size="icon-xs" aria-label={t('webhooks.variables.title')}><Braces /></InputGroupButton>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <PopoverHeader className="border-b p-3">
          <PopoverTitle>{t('webhooks.variables.title')}</PopoverTitle>
          <PopoverDescription>{t('webhooks.variables.description')}</PopoverDescription>
        </PopoverHeader>
        <div className="p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('webhooks.variables.searchPlaceholder')} className="h-7 pl-8 text-xs" />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {groups.map((group) => {
              const variables = filtered.filter((variable) => variable.group === group);
              if (variables.length === 0) return null;
              return (
                <section key={group} className="mb-2 last:mb-0">
                  <h3 className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t(`webhooks.variables.group.${group}`)}</h3>
                  {variables.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => onSelect(variable.key)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <code className="text-xs">{`{{${variable.key}}}`}</code>
                      <span className="max-w-28 truncate text-[10px] text-muted-foreground">{webhookVariableSample(variable, targetKind)}</span>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
          <p className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">{t('webhooks.variables.jsonHint')}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RequestPreview({
  webhook,
  sampleEvent,
  onSampleEventChange,
}: {
  webhook: WebhookPrototype;
  sampleEvent: WebhookEventKey;
  onSampleEventChange: (event: WebhookEventKey) => void;
}) {
  const { t } = useTranslation();
  const values = useMemo(() => ({
    ...Object.fromEntries(WEBHOOK_VARIABLES.map((variable) => [variable.key, webhookVariableSample(variable, webhook.targetKind)])),
    'event.type': sampleEvent,
    'event.category': eventCategory(sampleEvent),
    'event.severity': sampleEvent.includes('failed') || sampleEvent.includes('error') ? 'error' : 'info',
    'webhook.id': webhook.id,
    'webhook.name': webhook.name || 'Webhook',
  }), [sampleEvent, webhook.id, webhook.name, webhook.targetKind]);
  const renderedUrl = renderTemplate(webhook.url, values, true);
  const renderedHeaders = webhook.headers.filter((header) => header.key.trim()).map((header) => ({
    key: header.key,
    value: renderTemplate(header.value, values),
  }));
  let renderedBody = '';
  let bodyError = false;
  if (webhook.method === 'POST') {
    try {
      renderedBody = renderJsonBody(webhook.body, values);
    } catch {
      bodyError = true;
      renderedBody = webhook.body;
    }
  }

  return (
    <aside className="rounded-xl border bg-muted/10 p-3 xl:sticky xl:top-3">
      <div className="mb-3 flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileJson2 className="size-4" /></span>
        <div>
          <h3 className="text-sm font-medium">{t('webhooks.preview.title')}</h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('webhooks.preview.description')}</p>
        </div>
      </div>
      <Select value={sampleEvent} onValueChange={(value) => onSampleEventChange(value as WebhookEventKey)}>
        <SelectTrigger className="mb-3 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {WEBHOOK_EVENT_OPTIONS.filter((option) => option.group === webhook.targetKind).map((option) => (
              <SelectItem key={option.key} value={option.key}>{t(eventLabelKey(option.key))}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="flex flex-col gap-3">
        <PreviewBlock title={t('webhooks.preview.url')}>
          <div className="flex items-start gap-2"><Badge variant={webhook.method === 'POST' ? 'default' : 'outline'}>{webhook.method}</Badge><code className="break-all text-[10px] leading-relaxed">{renderedUrl}</code></div>
        </PreviewBlock>
        <PreviewBlock title={t('webhooks.preview.headers')}>
          {renderedHeaders.length > 0 ? renderedHeaders.map((header, index) => (
            <div key={`${header.key}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 font-mono text-[10px]"><span className="text-sky-600 dark:text-sky-400">{header.key}</span><span className="break-all">{maskSecret(header.key, header.value)}</span></div>
          )) : <span className="text-xs text-muted-foreground">{t('webhooks.preview.noHeaders')}</span>}
        </PreviewBlock>
        <PreviewBlock title={t('webhooks.preview.body')}>
          {webhook.method === 'GET' ? <span className="text-xs text-muted-foreground">{t('webhooks.preview.noBody')}</span> : (
            <>
              <div className={cn('mb-1.5 flex items-center gap-1 text-[11px]', bodyError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                {bodyError ? <CircleOff className="size-3" /> : <CheckCircle2 className="size-3" />}
                {t(`webhooks.preview.${bodyError ? 'invalidJson' : 'validJson'}`)}
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">{renderedBody}</pre>
            </>
          )}
        </PreviewBlock>
      </div>
    </aside>
  );
}

function PreviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4><div className="rounded-lg border bg-background p-2">{children}</div></section>;
}

function WebhookDeliveryLog({ webhookId }: { webhookId: string }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<WebhookInvocation | null>(null);
  const invocations = WEBHOOK_INVOCATIONS.filter((item) => item.webhookId === webhookId);

  return (
    <>
      <div className="mb-3">
        <h2 className="text-sm font-medium">{t('webhooks.deliveries.title')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('webhooks.deliveries.description')}</p>
      </div>
      {invocations.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>{t('webhooks.deliveries.event')}</TableHead><TableHead>{t('webhooks.deliveries.result')}</TableHead><TableHead>{t('webhooks.deliveries.response')}</TableHead><TableHead>{t('webhooks.deliveries.duration')}</TableHead><TableHead>{t('webhooks.deliveries.time')}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {invocations.map((invocation) => (
                <TableRow key={invocation.id}>
                  <TableCell><div className="font-medium">{t(eventLabelKey(invocation.event))}</div><code className="text-[10px] text-muted-foreground">{invocation.event}</code></TableCell>
                  <TableCell><Badge variant={invocation.status === 'success' ? 'secondary' : 'destructive'}>{t(`webhooks.status.${invocation.status}`)}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{invocation.statusCode ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{invocation.durationMs} ms</TableCell>
                  <TableCell className="text-xs">{formatShortTime(invocation.occurredAt, i18n.resolvedLanguage ?? 'zh-CN')}</TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelected(invocation)}>{t('webhooks.deliveries.details')}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground"><Clock3 className="size-6" />{t('webhooks.deliveries.empty')}</div>
      )}
      <DeliveryDialog invocation={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

function DeliveryDialog({ invocation, onOpenChange }: { invocation: WebhookInvocation | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={Boolean(invocation)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t('webhooks.detail.title')}</DialogTitle><DialogDescription>{t('webhooks.detail.description')}</DialogDescription></DialogHeader>
        {invocation ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label={t('webhooks.deliveries.result')} value={t(`webhooks.status.${invocation.status}`)} />
              <Metric label={t('webhooks.deliveries.response')} value={String(invocation.statusCode ?? '—')} />
              <Metric label={t('webhooks.deliveries.duration')} value={`${invocation.durationMs} ms`} />
              <Metric label={t('webhooks.deliveries.attempt')} value={t('webhooks.deliveries.attemptValue', { count: invocation.attempt })} />
            </div>
            {invocation.error ? <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-sm text-destructive">{invocation.error}</div> : null}
            <CodeBlock label={t('webhooks.detail.requestUrl')} value={invocation.requestUrl} />
            <CodeBlock label={t('webhooks.detail.requestHeaders')} value={JSON.stringify(invocation.requestHeaders, null, 2)} />
            <CodeBlock label={t('webhooks.detail.requestBody')} value={prettyJson(invocation.requestBody) || '—'} />
            <CodeBlock label={t('webhooks.detail.responseHeaders')} value={JSON.stringify(invocation.responseHeaders, null, 2)} />
            <CodeBlock label={t('webhooks.detail.responseBody')} value={prettyJson(invocation.responseBody) || '—'} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => { if (invocation) void navigator.clipboard?.writeText(invocation.id); toast.success(t('webhooks.toast.copied')); }}><Copy data-icon="inline-start" />{t('webhooks.detail.copyId')}</Button>
          <Button onClick={() => toast.success(t('webhooks.toast.replayed'))}><RotateCw data-icon="inline-start" />{t('webhooks.detail.replay')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/15 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return <div><div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed">{value}</pre></div>;
}

function prettyJson(value: string | null) {
  if (!value) return '';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function maskSecret(key: string, value: string) {
  return /authorization|token|secret|api[-_]?key/i.test(key) ? value.replace(/(^\S+\s+)?(.{0,4}).*$/, '$1$2••••••••') : value;
}
