import type { TModelSpec } from 'librechat-data-provider';

const isModelOption = (spec: TModelSpec) => spec.modelOption != null && !!spec.preset?.agent_id;

/** Specs offered as model choices for the same agent as `current`, or [] if fewer than two. */
export function getModelOptionSpecs(
  specs: TModelSpec[] | undefined,
  current: TModelSpec | undefined,
): TModelSpec[] {
  if (!specs || !current || !isModelOption(current)) {
    return [];
  }
  const options = specs.filter(
    (spec) => isModelOption(spec) && spec.preset.agent_id === current.preset.agent_id,
  );
  return options.length > 1 ? options : [];
}

/** Number of entries the header selector would show, counting each model-option group once. */
export function countSelectorEntries(specs: TModelSpec[] | undefined): number {
  const groups = new Set<string>();
  let count = 0;
  for (const spec of specs ?? []) {
    if (!isModelOption(spec)) {
      count += 1;
      continue;
    }
    const agentId = spec.preset.agent_id as string;
    if (!groups.has(agentId)) {
      groups.add(agentId);
      count += 1;
    }
  }
  return count;
}
