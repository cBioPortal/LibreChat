import type { TModelSpec } from 'librechat-data-provider';
import { countSelectorEntries, getModelOptionSpecs } from './modelOptions';

const spec = (name: string, agent_id?: string, label?: string): TModelSpec =>
  ({
    name,
    label: name,
    preset: { endpoint: 'agents', agent_id },
    ...(label ? { modelOption: { label } } : {}),
  }) as TModelSpec;

const haiku = spec('haiku', 'agent_a', 'Haiku 4.5');
const sonnet = spec('sonnet', 'agent_a', 'Sonnet 5');
const other = spec('other', 'agent_b');

describe('getModelOptionSpecs', () => {
  it('returns every model option for the current agent', () => {
    expect(getModelOptionSpecs([haiku, sonnet, other], sonnet)).toEqual([haiku, sonnet]);
  });

  it('returns [] when the current spec is not a model option', () => {
    expect(getModelOptionSpecs([haiku, sonnet, other], other)).toEqual([]);
    expect(getModelOptionSpecs([haiku, sonnet], undefined)).toEqual([]);
  });

  it('returns [] when only one option exists for the agent', () => {
    expect(getModelOptionSpecs([haiku, spec('x', 'agent_b', 'X')], haiku)).toEqual([]);
  });
});

describe('countSelectorEntries', () => {
  it('counts a model-option group once', () => {
    expect(countSelectorEntries([haiku, sonnet])).toBe(1);
    expect(countSelectorEntries([haiku, sonnet, other])).toBe(2);
  });

  it('counts plain specs individually', () => {
    expect(countSelectorEntries([other, spec('c', 'agent_c')])).toBe(2);
    expect(countSelectorEntries(undefined)).toBe(0);
  });
});
