import { logger } from '@librechat/data-schemas';
import type { TModelSpec, TModelSpecPreset } from 'librechat-data-provider';

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

/**
 * Generation params a saved-agent modelSpec preset may override.
 *
 * Precedence for the primary agent's model_parameters:
 * - allowlisted keys the preset sets: spec preset > agent record, so one agent
 *   can be offered as e.g. "Haiku, no thinking" and "Sonnet, low effort";
 * - allowlisted keys the preset omits (or sets to null): agent record wins;
 * - every other key (instructions, tools, provider, topP, ...): agent record
 *   only; the preset cannot touch them.
 */
export const MODEL_SPEC_AGENT_PARAM_KEYS = [
  'thinking',
  'thinkingBudget',
  'effort',
  'maxTokens',
  'maxOutputTokens',
  'temperature',
  'promptCache',
  'promptCacheTtl',
] as const;

/** Display/identity fields are consumed separately from the agent generation overrides. */
const recognizedPresetKeys = new Set<string>([
  'endpoint',
  'endpointType',
  'agent_id',
  'assistant_id',
  'model',
  'modelLabel',
  'userLabel',
  'greeting',
  'iconURL',
  'promptPrefix',
  'spec',
  'title',
  'presetId',
  'chatGptLabel',
  ...MODEL_SPEC_AGENT_PARAM_KEYS,
]);
const warnedPresetKeys = new Set<string>();

export type ModelSpecAgentParams = Pick<
  TModelSpecPreset,
  (typeof MODEL_SPEC_AGENT_PARAM_KEYS)[number]
>;

/**
 * Returns the allowlisted generation params (thinking, effort, maxOutputTokens,
 * ...) an admin-configured modelSpec sets for a saved agent. Gated like
 * `getModelSpecAgentModel`; values come from server config, never the request.
 * Returns `undefined` when the spec doesn't target the agent or sets none.
 */
export function getModelSpecAgentParams(
  agent: { id?: string } | null | undefined,
  modelSpec: TModelSpec | null | undefined,
): ModelSpecAgentParams | undefined {
  const preset = modelSpec?.preset;
  if (!agent?.id || !preset || preset.agent_id !== agent.id) {
    return undefined;
  }
  for (const key of Object.keys(preset)) {
    if (recognizedPresetKeys.has(key)) {
      continue;
    }
    const warningKey = JSON.stringify([modelSpec.name, key]);
    if (warnedPresetKeys.has(warningKey)) {
      continue;
    }
    warnedPresetKeys.add(warningKey);
    logger.warn(
      `[getModelSpecAgentParams] Model spec "${modelSpec.name}" dropped preset key "${key}": not allowlisted for agent overrides`,
    );
  }
  const entries = MODEL_SPEC_AGENT_PARAM_KEYS.filter((key) => preset[key] != null).map(
    (key) => [key, preset[key]] as const,
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as ModelSpecAgentParams) : undefined;
}

type ThinkingFields = { thinking?: unknown; thinkingBudget?: unknown };
type SavedModelParameters = { thinkingBudget?: unknown; additionalModelRequestFields?: unknown };

/** Drops `thinking`/`thinkingBudget` from a persisted Bedrock `additionalModelRequestFields` block */
function omitSavedThinking(fields: unknown): unknown {
  if (fields == null || typeof fields !== 'object') {
    return fields;
  }
  const { thinking: _thinking, thinkingBudget: _budget, ...rest } = fields as ThinkingFields;
  return rest;
}

/**
 * Merges a spec's model and allowlisted params over an agent's saved
 * model_parameters (see MODEL_SPEC_AGENT_PARAM_KEYS for precedence).
 * A preset output cap overrides both saved aliases. When the preset sets both,
 * maxOutputTokens wins, matching the Bedrock input parser's precedence.
 *
 * An explicit `thinking: false` also strips any saved thinking config, since a
 * persisted `additionalModelRequestFields.thinking` (e.g. `{ type: 'enabled',
 * budget_tokens }`) is merged back into the Bedrock request downstream and
 * would otherwise re-enable thinking.
 */
export function mergeSpecAgentParams<T extends object>(
  modelParameters: T | null | undefined,
  params: ModelSpecAgentParams | undefined,
  model?: string,
): T & ModelSpecAgentParams {
  const merged = { ...modelParameters, ...params, ...(model && { model }) } as T &
    ModelSpecAgentParams &
    SavedModelParameters;
  const outputCap = params?.maxOutputTokens ?? params?.maxTokens;
  if (outputCap != null) {
    if (merged.maxTokens != null) {
      merged.maxTokens = outputCap;
    }
    merged.maxOutputTokens = outputCap;
  }
  if (params?.thinking !== false) {
    return merged;
  }
  const { thinkingBudget: _budget, additionalModelRequestFields, ...rest } = merged;
  return {
    ...rest,
    ...(additionalModelRequestFields !== undefined && {
      additionalModelRequestFields: omitSavedThinking(additionalModelRequestFields),
    }),
  } as T & ModelSpecAgentParams;
}

export type RequestSpecModelResult =
  | { ok: true; model?: string; params?: ModelSpecAgentParams }
  | { ok: false; error: string };

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
  const params = getModelSpecAgentParams(agent, modelSpec);
  return { ok: true, model, ...(params && { params }) };
}

/**
 * Returns a copy of the agent running `model` with any spec `params` merged
 * over its model_parameters, leaving the original untouched.
 */
export function withAgentModel<T extends { model?: string | null; model_parameters?: object }>(
  agent: T,
  model: string,
  params?: ModelSpecAgentParams,
): T {
  return {
    ...agent,
    model,
    ...((agent.model_parameters != null || params != null) && {
      model_parameters: mergeSpecAgentParams(agent.model_parameters, params, model),
    }),
  };
}
