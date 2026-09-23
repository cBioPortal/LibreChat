import type { TModelSpec } from 'librechat-data-provider';

/**
 * Returns the model an admin-configured modelSpec pins for a saved agent, so a
 * single agent can be offered under several specs (e.g. Haiku vs Sonnet).
 * Only honored when the spec's `preset.agent_id` matches the agent; the model
 * always comes from server config, never from the request body.
 */
export function getModelSpecAgentModel(
  agent: { id?: string } | null | undefined,
  modelSpec: TModelSpec | null | undefined,
): string | undefined {
  const preset = modelSpec?.preset;
  if (!agent?.id || !preset || preset.agent_id !== agent.id) {
    return undefined;
  }
  const model = preset.model;
  return typeof model === 'string' && model.length > 0 ? model : undefined;
}

export type RequestSpecModelResult = { ok: true; model?: string } | { ok: false; error: string };

/**
 * Resolves the optional `spec` field of an API request to the model that spec
 * pins for the requested agent. Absent spec → no override; an unknown spec or
 * one that doesn't target this agent is rejected rather than silently ignored.
 */
export function resolveRequestSpecModel(
  agent: { id?: string } | null | undefined,
  specName: unknown,
  modelSpecs: TModelSpec[] | null | undefined,
): RequestSpecModelResult {
  if (specName === undefined || specName === null) {
    return { ok: true };
  }
  if (typeof specName !== 'string' || specName.length === 0) {
    return { ok: false, error: 'spec must be a non-empty string' };
  }
  const modelSpec = modelSpecs?.find((candidate) => candidate.name === specName);
  if (!modelSpec) {
    return { ok: false, error: `Unknown model spec: ${specName}` };
  }
  const model = getModelSpecAgentModel(agent, modelSpec);
  if (!model) {
    return {
      ok: false,
      error: `Model spec "${specName}" does not select a model for agent ${agent?.id ?? ''}`,
    };
  }
  return { ok: true, model };
}

/** Returns a copy of the agent running `model`, leaving the original untouched. */
export function withAgentModel<T extends { model?: string | null; model_parameters?: object }>(
  agent: T,
  model: string,
): T {
  return {
    ...agent,
    model,
    ...(agent.model_parameters != null && {
      model_parameters: { ...agent.model_parameters, model },
    }),
  };
}
