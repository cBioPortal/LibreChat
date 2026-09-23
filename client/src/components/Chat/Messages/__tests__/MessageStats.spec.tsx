import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import MessageStats, { formatDuration } from '../MessageStats';

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: {
      modelSpecs: {
        list: [
          {
            name: 'sonnet',
            label: 'Sonnet',
            preset: { endpoint: 'agents', agent_id: 'a', model: 'us.anthropic.claude-sonnet-5' },
            modelOption: { label: 'Sonnet 5' },
          },
        ],
      },
    },
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

const makeMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'm2',
    conversationId: 'c1',
    parentMessageId: 'm1',
    isCreatedByUser: false,
    text: '',
    content: [
      { type: 'tool_call', tool_call: {} },
      { type: 'tool_call', tool_call: {} },
      { type: 'text', text: 'done' },
    ],
    metadata: {
      usage: { input: 6, output: 813, cacheWrite: 5183, cacheRead: 159851 },
      stats: { durationMs: 15503, model: 'us.anthropic.claude-sonnet-5', calls: 3 },
    },
    ...overrides,
  }) as unknown as TMessage;

describe('formatDuration', () => {
  it('formats ms, seconds and minutes', () => {
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(15503)).toBe('15.5 s');
    expect(formatDuration(95000)).toBe('1 m 35 s');
  });
});

describe('MessageStats', () => {
  it('shows model, time, tokens and call counts', async () => {
    const user = userEvent.setup();
    render(<MessageStats message={makeMessage()} />);
    await user.click(screen.getByTestId('message-stats-button'));
    const stats = within(screen.getByTestId('message-stats'));
    expect(stats.getByText('Sonnet 5')).toBeInTheDocument();
    expect(stats.getByText('15.5 s')).toBeInTheDocument();
    expect(stats.getByText(/165,040/)).toBeInTheDocument();
    expect(stats.getByText('com_ui_tokens_from_cache')).toBeInTheDocument();
    expect(stats.getByText('159,851')).toBeInTheDocument();
    expect(stats.getByText('813')).toBeInTheDocument();
    expect(stats.getByText('3')).toBeInTheDocument();
    expect(stats.getByText('2')).toBeInTheDocument();
    expect(stats.queryByText('com_ui_cost')).toBeNull();
  });

  it('falls back to the raw model id and shows usage-only messages', async () => {
    const user = userEvent.setup();
    render(
      <MessageStats
        message={makeMessage({
          content: [],
          metadata: {
            usage: { input: 10, output: 5, cacheWrite: 0, cacheRead: 0, cost: 0.0123 },
            stats: { durationMs: 900, model: 'other-model' },
          },
        } as Partial<TMessage>)}
      />,
    );
    await user.click(screen.getByTestId('message-stats-button'));
    const stats = within(screen.getByTestId('message-stats'));
    expect(stats.getByText('other-model')).toBeInTheDocument();
    expect(stats.getByText('com_ui_cost')).toBeInTheDocument();
    expect(stats.queryByText('com_ui_tool_calls')).toBeNull();
  });

  it('renders nothing for user messages or responses without stats', () => {
    const { container, rerender } = render(
      <MessageStats message={makeMessage({ isCreatedByUser: true })} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<MessageStats message={makeMessage({ metadata: undefined })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
