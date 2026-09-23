import type { TModelSpec } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { getModelSpecAgentModel, resolveRequestSpecModel, withAgentModel } from './specModel';

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

describe('resolveRequestSpecModel', () => {
  const specs: TModelSpec[] = [
    { ...spec({ agent_id: 'agent_1', model: 'haiku' }), name: 'haiku-spec' },
    { ...spec({ agent_id: 'agent_1', model: 'sonnet' }), name: 'sonnet-spec' },
    { ...spec({ agent_id: 'agent_2', model: 'sonnet' }), name: 'other-agent-spec' },
    { ...spec({ agent_id: 'agent_1' }), name: 'no-model-spec' },
  ];

  it('applies no override when the request has no spec', () => {
    expect(resolveRequestSpecModel({ id: 'agent_1' }, undefined, specs)).toEqual({ ok: true });
    expect(resolveRequestSpecModel({ id: 'agent_1' }, null, specs)).toEqual({ ok: true });
  });

  it('returns the model of the named spec for the matching agent', () => {
    expect(resolveRequestSpecModel({ id: 'agent_1' }, 'sonnet-spec', specs)).toEqual({
      ok: true,
      model: 'sonnet',
    });
  });

  it('rejects unknown specs, specs for other agents, and specs without a model', () => {
    for (const name of ['missing', 'other-agent-spec', 'no-model-spec']) {
      expect(resolveRequestSpecModel({ id: 'agent_1' }, name, specs).ok).toBe(false);
    }
  });

  it('rejects non-string or empty spec values', () => {
    expect(resolveRequestSpecModel({ id: 'agent_1' }, 42, specs).ok).toBe(false);
    expect(resolveRequestSpecModel({ id: 'agent_1' }, '', specs).ok).toBe(false);
  });

  it('rejects any spec when no modelSpecs are configured', () => {
    expect(resolveRequestSpecModel({ id: 'agent_1' }, 'sonnet-spec', undefined).ok).toBe(false);
  });
});

describe('withAgentModel', () => {
  it('returns a copy with the model set, leaving the original untouched', () => {
    const agent = { id: 'agent_1', model: 'haiku', model_parameters: { promptCache: true } };
    const copy = withAgentModel(agent, 'sonnet');
    expect(copy).toEqual({
      id: 'agent_1',
      model: 'sonnet',
      model_parameters: { promptCache: true, model: 'sonnet' },
    });
    expect(agent).toEqual({
      id: 'agent_1',
      model: 'haiku',
      model_parameters: { promptCache: true },
    });
    expect(copy.model_parameters).not.toBe(agent.model_parameters);
  });

  it('does not invent model_parameters when the agent has none', () => {
    expect(withAgentModel({ id: 'agent_1', model: 'haiku' }, 'sonnet')).toEqual({
      id: 'agent_1',
      model: 'sonnet',
    });
  });
});
