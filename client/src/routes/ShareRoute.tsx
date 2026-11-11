import type { ReactNode } from 'react';
import { AuthContextProvider } from '~/hooks/AuthContext';
import { MCPAppsPolicyProvider } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import ShareView from '~/components/Share/ShareView';

/** Shared views are read-only, so an anonymous viewer only needs a stable cache key. */
const ANONYMOUS_VIEWER_ID = 'shared-viewer';

function ShareMCPAppsHost({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const { data: config, isSuccess, error } = useGetStartupConfig();

  return (
    <MCPAppsPolicyProvider
      startupConfig={config}
      ready={isSuccess && error == null}
      userId={user?.id ?? ANONYMOUS_VIEWER_ID}
    >
      {children}
    </MCPAppsPolicyProvider>
  );
}

export default function ShareRoute() {
  return (
    <AuthContextProvider authConfig={{ loginRedirect: '/login', optional: true }}>
      <ShareMCPAppsHost>
        <ShareView />
      </ShareMCPAppsHost>
    </AuthContextProvider>
  );
}
