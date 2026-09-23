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
