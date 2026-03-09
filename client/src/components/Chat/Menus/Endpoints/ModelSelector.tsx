import React, { useMemo } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { Constants, getConfigDefaults, isAgentsEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import type { ModelSelectorProps } from '~/common';
import {
  renderModelSpecs,
  renderEndpoints,
  renderSearchResults,
  renderCustomGroups,
} from './components';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { ModelSelectorChatProvider, useModelSelectorChatContext } from './ModelSelectorChatContext';
import { getSelectedIcon, getDisplayValue } from './utils';
import SpecIcon from './components/SpecIcon';
import { CustomMenu as Menu } from './CustomMenu';
import DialogManager from './DialogManager';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function AgentButtonSelector({
  specs,
  selectedSpec,
  endpointsConfig,
  onSelect,
}: {
  specs: TModelSpec[];
  selectedSpec: string | null;
  endpointsConfig: any;
  onSelect: (spec: TModelSpec) => void;
}) {
  return (
    <div className="relative inline-flex flex-row items-center gap-1.5">
      {specs.map((spec) => {
        const isSelected = selectedSpec === spec.name;
        return (
          <button
            key={spec.name}
            type="button"
            onClick={() => onSelect(spec)}
            className={cn(
              'my-1 flex h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors duration-200',
              isSelected
                ? 'border-text-primary bg-surface-active-alt font-semibold text-text-primary'
                : 'border-border-light bg-presentation text-text-secondary hover:bg-surface-active-alt hover:text-text-primary',
            )}
            aria-pressed={isSelected}
          >
            {(spec.showIconInHeader !== false) && (
              <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
                <SpecIcon currentSpec={spec} endpointsConfig={endpointsConfig} />
              </div>
            )}
            <span className="truncate">{spec.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ModelSelectorContent() {
  const localize = useLocalize();

  const {
    // LibreChat
    agentsMap,
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    // State
    searchValue,
    searchResults,
    selectedValues,
    // Functions
    setSearchValue,
    setSelectedValues,
    handleSelectSpec,
    // Dialog
    keyDialogOpen,
    onOpenChange,
    keyDialogEndpoint,
  } = useModelSelectorContext();

  const { conversation } = useModelSelectorChatContext();

  // Check if all model specs are agent endpoints — if so, use button selector
  const allAgentSpecs = useMemo(() => {
    if (!modelSpecs || modelSpecs.length === 0) return false;
    return modelSpecs.every(
      (spec) => spec.preset?.endpoint && isAgentsEndpoint(spec.preset.endpoint),
    );
  }, [modelSpecs]);

  // Hide agent buttons once a conversation has started
  const conversationId = conversation?.conversationId;
  const isNewConversation = !conversationId || conversationId === Constants.NEW_CONVO;

  if (allAgentSpecs && modelSpecs && isNewConversation) {
    return (
      <AgentButtonSelector
        specs={modelSpecs}
        selectedSpec={selectedValues.modelSpec}
        endpointsConfig={endpointsConfig}
        onSelect={handleSelectSpec}
      />
    );
  }

  if (allAgentSpecs && modelSpecs && !isNewConversation) {
    return null;
  }

  const selectedIcon = getSelectedIcon({
    mappedEndpoints: mappedEndpoints ?? [],
    selectedValues,
    modelSpecs,
    endpointsConfig,
  });
  const selectedDisplayValue = getDisplayValue({
    localize,
    agentsMap,
    modelSpecs,
    selectedValues,
    mappedEndpoints,
  });

  const trigger = (
    <TooltipAnchor
      aria-label={localize('com_ui_select_model')}
      description={localize('com_ui_select_model')}
      render={
        <button
          className="my-1 flex h-10 w-full max-w-[70vw] items-center justify-center gap-2 rounded-xl border border-border-light bg-presentation px-3 py-2 text-sm text-text-primary hover:bg-surface-active-alt"
          aria-label={localize('com_ui_select_model')}
        >
          {selectedIcon && React.isValidElement(selectedIcon) && (
            <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
              {selectedIcon}
            </div>
          )}
          <span className="flex-grow truncate text-left">{selectedDisplayValue}</span>
        </button>
      }
    />
  );

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-2">
      <Menu
        values={selectedValues}
        onValuesChange={(values: Record<string, any>) => {
          setSelectedValues({
            endpoint: values.endpoint || '',
            model: values.model || '',
            modelSpec: values.modelSpec || '',
          });
        }}
        onSearch={(value) => setSearchValue(value)}
        combobox={<input id="model-search" placeholder=" " />}
        comboboxLabel={localize('com_endpoint_search_models')}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(searchResults, localize, searchValue)
        ) : (
          <>
            {/* Render ungrouped modelSpecs (no group field) */}
            {renderModelSpecs(
              modelSpecs?.filter((spec) => !spec.group) || [],
              selectedValues.modelSpec || '',
            )}
            {/* Render endpoints (will include grouped specs matching endpoint names) */}
            {renderEndpoints(mappedEndpoints ?? [])}
            {/* Render custom groups (specs with group field not matching any endpoint) */}
            {renderCustomGroups(modelSpecs || [], mappedEndpoints ?? [])}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        onOpenChange={onOpenChange}
        endpointsConfig={endpointsConfig || {}}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
      />
    </div>
  );
}

export default function ModelSelector({ startupConfig }: ModelSelectorProps) {
  const interfaceConfig = startupConfig?.interface ?? getConfigDefaults().interface;
  const modelSpecs = startupConfig?.modelSpecs?.list ?? [];

  // Hide the selector when modelSelect is false and there are no model specs to show
  if (interfaceConfig.modelSelect === false && modelSpecs.length === 0) {
    return null;
  }

  return (
    <ModelSelectorChatProvider>
      <ModelSelectorProvider startupConfig={startupConfig}>
        <ModelSelectorContent />
      </ModelSelectorProvider>
    </ModelSelectorChatProvider>
  );
}
