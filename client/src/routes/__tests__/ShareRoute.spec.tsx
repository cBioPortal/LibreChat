import { render, screen } from '@testing-library/react';
import ShareRoute from '../ShareRoute';

jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: undefined }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: {
      mcpApps: { enabled: true, legacyHtmlEnabled: false },
    },
    isSuccess: true,
    error: null,
  }),
}));
jest.mock('~/components/Share/ShareView', () => ({
  __esModule: true,
  default: function ShareViewProbe() {
    const { useMCPAppsHost } = jest.requireActual('~/Providers');
    const { policy, userId } = useMCPAppsHost();
    return <div data-testid="probe">{`${policy.enabled}:${userId}`}</div>;
  },
}));

describe('ShareRoute', () => {
  it('publishes the MCP Apps policy to shared views, including anonymous viewers', () => {
    render(<ShareRoute />);
    expect(screen.getByTestId('probe').textContent).toBe('true:shared-viewer');
  });
});
