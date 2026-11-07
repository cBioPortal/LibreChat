import { BarChart3, Timer } from 'lucide-react';
import type { TModelSpec } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';

export default function LimitBadge() {
  const { conversation } = useChatContext();
  const { data: startupConfig } = useGetStartupConfig();

  const currentSpec = startupConfig?.modelSpecs?.list?.find(
    (spec: TModelSpec) =>
      spec.name === conversation?.spec || spec.preset?.agent_id === conversation?.agent_id,
  );
  const limitBadge = currentSpec?.limitBadge;

  if (!limitBadge?.messages && !limitBadge?.tokens) {
    return null;
  }

  return (
    <div className="mt-3 flex w-full justify-center px-4">
      <div
        className="inline-flex max-w-full items-center gap-3 rounded-full border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-secondary"
        aria-label={[limitBadge.messages, limitBadge.tokens].filter(Boolean).join(', ')}
      >
        {limitBadge.messages && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{limitBadge.messages}</span>
          </span>
        )}
        {limitBadge.messages && limitBadge.tokens && (
          <span className="text-text-secondary" aria-hidden="true">
            &middot;
          </span>
        )}
        {limitBadge.tokens && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{limitBadge.tokens}</span>
          </span>
        )}
      </div>
    </div>
  );
}
