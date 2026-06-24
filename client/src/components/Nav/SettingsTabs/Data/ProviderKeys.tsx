import React, { useMemo, useState } from 'react';
import { Button, Label } from '@librechat/client';
import { EModelEndpoint, alternateName } from 'librechat-data-provider';
import type { TConfig } from 'librechat-data-provider';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';

type ProviderKeyEndpoint = {
  endpoint: string;
  config: TConfig;
};

function formatKeyStatus(
  localize: ReturnType<typeof useLocalize>,
  expiresAt?: string | null,
) {
  if (!expiresAt) {
    return localize('com_ui_provider_key_not_added');
  }

  if (expiresAt === 'never') {
    return localize('com_ui_provider_key_never_expires');
  }

  return localize('com_ui_provider_key_expires', {
    0: new Date(expiresAt).toLocaleString(),
  });
}

function getProviderLabel(endpoint: string, config: TConfig) {
  return config.modelDisplayLabel || config.name || alternateName[endpoint] || endpoint;
}

function ProviderKeyRow({
  endpoint,
  config,
  onManage,
}: ProviderKeyEndpoint & {
  onManage: (endpoint: string, config: TConfig) => void;
}) {
  const localize = useLocalize();
  const { data } = useUserKeyQuery(endpoint);
  const hasKey = !!data?.expiresAt;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-light px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate font-medium">{getProviderLabel(endpoint, config)}</div>
        <div className="text-xs text-text-secondary">
          {formatKeyStatus(localize, data?.expiresAt)}
        </div>
      </div>
      <Button variant="outline" onClick={() => onManage(endpoint, config)}>
        {hasKey ? localize('com_ui_provider_key_update') : localize('com_ui_provider_key_add')}
      </Button>
    </div>
  );
}

export function ProviderKeys() {
  const localize = useLocalize();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<TConfig | null>(null);

  const providerKeyEndpoints = useMemo<ProviderKeyEndpoint[]>(() => {
    return Object.entries(endpointsConfig ?? {})
      .filter((entry): entry is [string, TConfig] => {
        const [, config] = entry;
        return !!config?.userProvide;
      })
      .map(([endpoint, config]) => ({ endpoint, config }));
  }, [endpointsConfig]);

  const handleManage = (endpoint: string, config: TConfig) => {
    setSelectedEndpoint(endpoint);
    setSelectedConfig(config);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedEndpoint(null);
      setSelectedConfig(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>{localize('com_ui_provider_keys')}</Label>
        <p className="mt-1 text-xs text-text-secondary">
          {localize('com_ui_provider_keys_description')}
        </p>
      </div>

      {providerKeyEndpoints.length > 0 ? (
        <div className="flex flex-col gap-2">
          {providerKeyEndpoints.map(({ endpoint, config }) => (
            <ProviderKeyRow
              key={endpoint}
              endpoint={endpoint}
              config={config}
              onManage={handleManage}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          {localize('com_ui_provider_keys_empty')}
        </p>
      )}

      {selectedEndpoint && selectedConfig && (
        <SetKeyDialog
          open={!!selectedEndpoint}
          endpoint={selectedEndpoint}
          endpointType={(selectedConfig.type ?? EModelEndpoint.custom) as EModelEndpoint}
          userProvideURL={selectedConfig.userProvideURL}
          onOpenChange={handleOpenChange}
        />
      )}
    </div>
  );
}
