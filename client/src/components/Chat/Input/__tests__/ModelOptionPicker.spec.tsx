import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TModelSpec } from 'librechat-data-provider';
import ModelOptionPicker from '../ModelOptionPicker';

const mockOnSelectSpec = jest.fn();

const spec = (name: string, agent_id: string, modelOption?: TModelSpec['modelOption']) =>
  ({ name, label: name, preset: { endpoint: 'agents', agent_id }, modelOption }) as TModelSpec;

const mockHaiku = spec('haiku', 'agent_a', { label: 'Haiku 4.5', description: 'Fast' });
const mockSonnet = spec('sonnet', 'agent_a', { label: 'Sonnet 5', description: 'Deeper' });
const mockOther = spec('other', 'agent_b');

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: { modelSpecs: { list: [mockHaiku, mockSonnet, mockOther] } },
  }),
  useGetEndpointsQuery: () => ({ data: {} }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useGetConversation: () => () => null,
}));

jest.mock('~/hooks/Input/useSelectMention', () => ({
  __esModule: true,
  default: () => ({ onSelectSpec: mockOnSelectSpec }),
}));

jest.mock('~/Providers', () => ({
  useAssistantsMapContext: () => ({}),
}));

const renderPicker = (modelSpec?: TModelSpec, disabled = false) =>
  render(
    <ModelOptionPicker
      index={0}
      modelSpec={modelSpec}
      disabled={disabled}
      newConversation={jest.fn()}
    />,
  );

describe('ModelOptionPicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the current model label', () => {
    renderPicker(mockHaiku);
    expect(screen.getByTestId('model-option-picker')).toHaveTextContent('Haiku 4.5');
  });

  it('renders nothing for specs without model options', () => {
    renderPicker(mockOther);
    expect(screen.queryByTestId('model-option-picker')).toBeNull();
    renderPicker(undefined);
    expect(screen.queryByTestId('model-option-picker')).toBeNull();
  });

  it('lists the agent model options and switches spec on select', async () => {
    const user = userEvent.setup();
    renderPicker(mockHaiku);

    await user.click(screen.getByTestId('model-option-picker'));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Sonnet 5');
    expect(items[1]).toHaveTextContent('Deeper');

    await user.click(items[1]);
    expect(mockOnSelectSpec).toHaveBeenCalledWith(mockSonnet);
  });

  it('does not reselect the current model', async () => {
    const user = userEvent.setup();
    renderPicker(mockHaiku);
    await user.click(screen.getByTestId('model-option-picker'));
    await user.click(screen.getAllByRole('menuitem')[0]);
    expect(mockOnSelectSpec).not.toHaveBeenCalled();
  });

  it('is disabled while a response is streaming', () => {
    renderPicker(mockHaiku, true);
    expect(screen.getByTestId('model-option-picker')).toBeDisabled();
  });
});
