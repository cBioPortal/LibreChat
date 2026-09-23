import type { TModelSpec } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { getModelSpecAgentModel } from './specModel';

const spec = (preset: Record<string, unknown>): TModelSpec =>
  ({
    name: 'spec',
    label: 'Spec',
    preset: { endpoint: EModelEndpoint.agents, ...preset },
  }) as TModelSpec;

describe('getModelSpecAgentModel', () => {
  it('returns the spec model when the spec targets the agent', () => {
    expect(
      getModelSpecAgentModel({ id: 'agent_1' }, spec({ agent_id: 'agent_1', model: 'sonnet' })),
    ).toBe('sonnet');
  });

  it('ignores specs pointing at a different agent', () => {
    expect(
      getModelSpecAgentModel({ id: 'agent_1' }, spec({ agent_id: 'agent_2', model: 'sonnet' })),
    ).toBeUndefined();
  });

  it('ignores specs without a model', () => {
    expect(
      getModelSpecAgentModel({ id: 'agent_1' }, spec({ agent_id: 'agent_1' })),
    ).toBeUndefined();
    expect(
      getModelSpecAgentModel({ id: 'agent_1' }, spec({ agent_id: 'agent_1', model: '' })),
    ).toBeUndefined();
  });

  it('handles missing agent or spec', () => {
    expect(getModelSpecAgentModel(undefined, spec({ agent_id: 'a', model: 'm' }))).toBeUndefined();
    expect(getModelSpecAgentModel({ id: 'a' }, null)).toBeUndefined();
    expect(getModelSpecAgentModel({}, spec({ agent_id: undefined, model: 'm' }))).toBeUndefined();
  });
});
