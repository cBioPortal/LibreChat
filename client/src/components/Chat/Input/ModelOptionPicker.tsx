import { memo, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, ChevronDown } from 'lucide-react';
import type { TModelSpec } from 'librechat-data-provider';
import type { ConvoGenerator } from '~/common';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import useSelectMention from '~/hooks/Input/useSelectMention';
import { useGetConversation, useLocalize } from '~/hooks';
import { useAssistantsMapContext } from '~/Providers';
import { cn, getModelOptionSpecs } from '~/utils';

interface ModelOptionPickerProps {
  index: number;
  modelSpec?: TModelSpec;
  disabled?: boolean;
  newConversation: ConvoGenerator;
}

function ModelOptionPicker({
  index,
  modelSpec,
  disabled,
  newConversation,
}: ModelOptionPickerProps) {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const assistantsMap = useAssistantsMapContext();
  const getConversation = useGetConversation(index);

  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);
  const options = useMemo(
    () => getModelOptionSpecs(modelSpecs, modelSpec),
    [modelSpecs, modelSpec],
  );

  const { onSelectSpec } = useSelectMention({
    modelSpecs,
    assistantsMap,
    endpointsConfig,
    getConversation,
    newConversation,
    returnHandlers: true,
  });

  if (!modelSpec || options.length === 0) {
    return null;
  }

  return (
    <Ariakit.MenuProvider open={isOpen} setOpen={setIsOpen} placement="top-end">
      <Ariakit.MenuButton
        disabled={disabled}
        aria-label={localize('com_ui_select_model')}
        data-testid="model-option-picker"
        className={cn(
          'flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-text-secondary',
          'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isOpen && 'bg-surface-hover',
        )}
      >
        <span className="whitespace-nowrap">{modelSpec.modelOption?.label}</span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </Ariakit.MenuButton>
      <Ariakit.Menu
        gutter={6}
        portal={true}
        unmountOnHide={true}
        className="z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-xl border border-border-light bg-surface-secondary p-1.5 shadow-lg"
      >
        {options.map((option) => {
          const selected = option.name === modelSpec.name;
          return (
            <Ariakit.MenuItem
              key={option.name}
              onClick={() => {
                if (!selected) {
                  onSelectSpec?.(option);
                }
              }}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left text-text-primary outline-none',
                'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{option.modelOption?.label}</span>
                {option.modelOption?.description && (
                  <span className="text-xs text-text-secondary">
                    {option.modelOption.description}
                  </span>
                )}
              </div>
              <Check
                className={cn('mt-0.5 h-4 w-4 shrink-0', !selected && 'invisible')}
                aria-hidden="true"
              />
            </Ariakit.MenuItem>
          );
        })}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
}

export default memo(ModelOptionPicker);
