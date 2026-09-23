import { memo, useMemo, useRef } from 'react';
import * as Ariakit from '@ariakit/react';
import { Info } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TResponseStats, TResponseUsage } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { cn, formatCost } from '~/utils';
import { useLocalize } from '~/hooks';

const numberFormat = new Intl.NumberFormat();

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} m ${Math.round(seconds % 60)} s`;
}

function Row({ label, value, sub = false }: { label: string; value: string; sub?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6',
        sub && 'pl-3 text-xs text-text-secondary',
      )}
    >
      <dt className={cn('whitespace-nowrap', !sub && 'text-text-secondary')}>{label}</dt>
      <dd className={cn('whitespace-nowrap text-right tabular-nums', !sub && 'text-text-primary')}>
        {value}
      </dd>
    </div>
  );
}

function MessageStats({ message, className }: { message: TMessage; className?: string }) {
  const localize = useLocalize();
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const popover = Ariakit.usePopoverStore({ placement: 'top' });
  const { data: startupConfig } = useGetStartupConfig();

  const usage = message.metadata?.usage as TResponseUsage | undefined;
  const stats = message.metadata?.stats as TResponseStats | undefined;

  const modelLabel = useMemo(() => {
    if (!stats?.model) {
      return undefined;
    }
    const spec = startupConfig?.modelSpecs?.list?.find(
      (s) => s.modelOption != null && s.preset?.model === stats.model,
    );
    return spec?.modelOption?.label ?? stats.model;
  }, [stats?.model, startupConfig?.modelSpecs?.list]);

  const toolCalls = useMemo(
    () => (message.content ?? []).filter((part) => part?.type === ContentTypes.TOOL_CALL).length,
    [message.content],
  );

  if (message.isCreatedByUser || (!usage && !stats)) {
    return null;
  }

  const totalInput = usage ? usage.input + usage.cacheRead + usage.cacheWrite : 0;

  return (
    <>
      <Ariakit.PopoverDisclosure
        ref={disclosureRef}
        store={popover}
        type="button"
        title={localize('com_ui_response_details')}
        aria-label={localize('com_ui_response_details')}
        data-testid="message-stats-button"
        className={cn(
          'hover-button rounded-lg p-1.5 text-text-secondary-alt',
          'hover:bg-surface-hover hover:text-text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white',
          className,
        )}
      >
        <Info size={19} aria-hidden="true" />
      </Ariakit.PopoverDisclosure>
      <Ariakit.Popover
        store={popover}
        gutter={8}
        portal
        unmountOnHide
        finalFocus={disclosureRef}
        aria-label={localize('com_ui_response_details')}
        className="z-[200] min-w-64 rounded-xl border border-border-medium bg-surface-secondary p-3 text-sm shadow-lg focus:outline-none"
      >
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          {localize('com_ui_response_details')}
        </div>
        <dl className="flex flex-col gap-1.5" data-testid="message-stats">
          {modelLabel && <Row label={localize('com_ui_model')} value={modelLabel} />}
          {stats?.durationMs != null && (
            <Row
              label={localize('com_ui_response_time')}
              value={formatDuration(stats.durationMs)}
            />
          )}
          {usage && (
            <>
              <Row
                label={localize('com_ui_input_tokens')}
                value={numberFormat.format(totalInput)}
              />
              {usage.cacheRead > 0 && (
                <Row
                  sub
                  label={localize('com_ui_tokens_from_cache')}
                  value={numberFormat.format(usage.cacheRead)}
                />
              )}
              <Row
                label={localize('com_ui_output_tokens')}
                value={numberFormat.format(usage.output)}
              />
            </>
          )}
          {stats?.calls != null && stats.calls > 0 && (
            <Row label={localize('com_ui_model_calls')} value={String(stats.calls)} />
          )}
          {toolCalls > 0 && <Row label={localize('com_ui_tool_calls')} value={String(toolCalls)} />}
          {usage?.cost != null && (
            <Row label={localize('com_ui_cost')} value={formatCost(usage.cost)} />
          )}
        </dl>
      </Ariakit.Popover>
    </>
  );
}

export default memo(MessageStats);
