import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';
import { WEBHOOK_VARIABLES, webhookVariableSample, type WebhookTargetKind } from './webhook-prototype-data';

export interface WebhookJsonEditorHandle {
  focus: () => void;
  format: () => boolean;
  insert: (value: string) => void;
}

interface WebhookJsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
  targetKind: WebhookTargetKind;
}

function webhookVariableCompletion(targetKind: WebhookTargetKind) {
  return (context: CompletionContext) => {
    const variable = context.matchBefore(/{{[\w.]*$/);
    if (!variable && !context.explicit) return null;
    return {
      from: variable?.from ?? context.pos,
      options: WEBHOOK_VARIABLES
        .filter((entry) => entry.availableFor.includes(targetKind))
        .map((entry) => ({
          label: `{{${entry.key}}}`,
          apply: `{{${entry.key}}}`,
          type: 'variable',
          detail: webhookVariableSample(entry, targetKind),
          boost: entry.group === 'event' ? 2 : 1,
        })),
    };
  };
}

const webhookEditorTheme = EditorView.theme({
  '&': {
    minHeight: '240px',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: '12px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    minHeight: '240px',
    maxHeight: '420px',
    overflow: 'auto',
    fontFamily: 'JetBrains Mono Variable, JetBrains Mono, monospace',
  },
  '.cm-content': {
    minHeight: '240px',
    padding: '10px 0',
    caretColor: 'var(--foreground)',
  },
  '.cm-line': { padding: '0 12px 0 8px' },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)',
    color: 'var(--muted-foreground)',
    border: 'none',
    paddingLeft: '4px',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 60%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 20%, transparent) !important',
  },
  '.cm-tooltip': {
    zIndex: '70',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--destructive)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--destructive)' },
}, { dark: false });

export const WebhookJsonEditor = forwardRef<WebhookJsonEditorHandle, WebhookJsonEditorProps>(
  function WebhookJsonEditor({ value, onChange, invalid = false, className, targetKind }, forwardedRef) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const valueRef = useRef(value);
    onChangeRef.current = onChange;
    valueRef.current = value;

    useEffect(() => {
      if (!hostRef.current) return;
      const state = EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          json(),
          linter(jsonParseLinter()),
          lintGutter(),
          autocompletion({ override: [webhookVariableCompletion(targetKind)] }),
          EditorView.lineWrapping,
          webhookEditorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      });
      const view = new EditorView({ state, parent: hostRef.current });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, [targetKind]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }, [value]);

    useImperativeHandle(forwardedRef, () => ({
      focus: () => viewRef.current?.focus(),
      format: () => {
        const view = viewRef.current;
        if (!view) return false;
        try {
          const current = view.state.doc.toString();
          const formatted = JSON.stringify(JSON.parse(current), null, 2);
          view.dispatch({ changes: { from: 0, to: current.length, insert: formatted } });
          return true;
        } catch {
          return false;
        }
      },
      insert: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const selection = view.state.selection.main;
        const cursor = selection.from + text.length;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: cursor },
          scrollIntoView: true,
        });
        view.focus();
      },
    }), []);

    return (
      <div
        ref={hostRef}
        data-invalid={invalid || undefined}
        className={cn(
          'overflow-hidden rounded-lg border border-input bg-input/20 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:bg-input/10',
          className,
        )}
      />
    );
  },
);
