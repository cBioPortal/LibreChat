import { ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { Providers, getChatModelClass } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { TModelSpec } from 'librechat-data-provider';
import {
  EModelEndpoint,
  AnthropicEffort,
  tModelSpecSchema,
  bedrockInputParser,
  bedrockOutputParser,
} from 'librechat-data-provider';
import { getLLMConfig } from '../endpoints/anthropic/llm';
import {
  withAgentModel,
  mergeSpecAgentParams,
  getModelSpecAgentModel,
  getModelSpecAgentParams,
  resolveRequestSpecModel,
} from './specModel';

const spec = (preset: Record<string, unknown>): TModelSpec =>
  tModelSpecSchema.parse({
    name: 'spec',
    label: 'Spec',
    preset: { endpoint: EModelEndpoint.agents, ...preset },
  });

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

describe('getModelSpecAgentParams', () => {
  it('warns once per dropped key after config parsing without logging values', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const modelSpec = {
      ...spec({
        agent_id: 'agent_1',
        maxTokens: 4096,
        topP: 0.37,
        max_tokens: 99999,
        reasoning_effort: 'high',
        stop: ['secret-stop-value'],
      }),
      name: 'dropped-key-spec',
    };
    expect(getModelSpecAgentParams({ id: 'agent_1' }, modelSpec)).toEqual({ maxTokens: 4096 });
    expect(getModelSpecAgentParams({ id: 'agent_1' }, modelSpec)).toEqual({ maxTokens: 4096 });
    expect(modelSpec.preset).toMatchObject({
      topP: 0.37,
      max_tokens: 99999,
      reasoning_effort: 'high',
      stop: ['secret-stop-value'],
    });
    expect(warn.mock.calls).toEqual(
      ['topP', 'max_tokens', 'reasoning_effort', 'stop'].map((key) => [
        `[getModelSpecAgentParams] Model spec "dropped-key-spec" dropped preset key "${key}": not allowlisted for agent overrides`,
      ]),
    );
  });

  it.each([undefined, 'Configured prompt'])(
    'does not warn on the deployed preset with promptPrefix %s',
    (promptPrefix) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
      expect(
        getModelSpecAgentParams(
          { id: 'agent_1' },
          spec({
            agent_id: 'agent_1',
            endpoint: EModelEndpoint.agents,
            greeting: 'Welcome to cBioDBAgent',
            maxTokens: 4096,
            modelLabel: 'cBioDBAgent',
            temperature: 0,
            thinking: false,
            promptPrefix,
          }),
        ),
      ).toEqual({ maxTokens: 4096, temperature: 0, thinking: false });
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('recognizes preset display fields without forwarding them as agent parameters', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    expect(
      getModelSpecAgentParams(
        { id: 'agent_1' },
        spec({
          agent_id: 'agent_1',
          modelLabel: 'cBioNavigator',
          promptPrefix: 'Configured prompt',
          iconURL: 'https://example.com/icon.png',
          greeting: 'Welcome',
          spec: 'navigator',
          title: 'Navigator',
          chatGptLabel: 'Legacy label',
          maxTokens: 4096,
        }),
      ),
    ).toEqual({ maxTokens: 4096 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('deduplicates separately for each spec name and dropped key after config parsing', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    for (const name of ['dedupe-spec-a', 'dedupe-spec-b']) {
      const modelSpec = {
        ...spec({ agent_id: 'agent_1', topP: 0.4, stop: ['private'] }),
        name,
      };
      getModelSpecAgentParams({ id: 'agent_1' }, modelSpec);
      getModelSpecAgentParams({ id: 'agent_1' }, modelSpec);
    }
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('private');
  });

  it('cannot warn about true typos stripped by config parsing', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const modelSpec = spec({ agent_id: 'agent_1', maxTokens: 4096, maxTokenz: 99999 });
    expect(modelSpec.preset).not.toHaveProperty('maxTokenz');
    expect(getModelSpecAgentParams({ id: 'agent_1' }, modelSpec)).toEqual({ maxTokens: 4096 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns only allowlisted generation params from the spec preset', () => {
    expect(
      getModelSpecAgentParams(
        { id: 'agent_1' },
        spec({
          agent_id: 'agent_1',
          model: 'sonnet',
          thinking: false,
          thinkingBudget: 2000,
          effort: 'low',
          maxOutputTokens: 4096,
          promptCache: true,
          promptCacheTtl: '1h',
          temperature: 0.2,
          topP: 0.5,
          instructions: 'ignored',
          greeting: 'ignored',
        }),
      ),
    ).toEqual({
      thinking: false,
      thinkingBudget: 2000,
      effort: 'low',
      maxOutputTokens: 4096,
      promptCache: true,
      promptCacheTtl: '1h',
      temperature: 0.2,
    });
  });

  it('keeps falsy-but-set values', () => {
    expect(
      getModelSpecAgentParams(
        { id: 'agent_1' },
        spec({ agent_id: 'agent_1', thinking: false, temperature: 0, promptCache: false }),
      ),
    ).toEqual({ thinking: false, temperature: 0, promptCache: false });
  });

  it('ignores specs pointing at a different agent', () => {
    expect(
      getModelSpecAgentParams(
        { id: 'agent_1' },
        spec({ agent_id: 'agent_2', effort: 'low', maxTokens: 4096, promptCacheTtl: '1h' }),
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the preset sets none of the params', () => {
    expect(
      getModelSpecAgentParams({ id: 'agent_1' }, spec({ agent_id: 'agent_1', model: 'sonnet' })),
    ).toBeUndefined();
    expect(
      getModelSpecAgentParams(
        { id: 'agent_1' },
        spec({ agent_id: 'agent_1', effort: null, maxOutputTokens: undefined }),
      ),
    ).toBeUndefined();
  });

  it('handles missing agent or spec', () => {
    expect(
      getModelSpecAgentParams(undefined, spec({ agent_id: 'a', effort: 'low' })),
    ).toBeUndefined();
    expect(getModelSpecAgentParams({ id: 'a' }, null)).toBeUndefined();
    expect(
      getModelSpecAgentParams({}, spec({ agent_id: undefined, effort: 'low' })),
    ).toBeUndefined();
  });
});

describe('resolveRequestSpecModel', () => {
  const specs: TModelSpec[] = [
    { ...spec({ agent_id: 'agent_1', model: 'haiku' }), name: 'haiku-spec' },
    { ...spec({ agent_id: 'agent_1', model: 'sonnet' }), name: 'sonnet-spec' },
    { ...spec({ agent_id: 'agent_2', model: 'sonnet' }), name: 'other-agent-spec' },
    { ...spec({ agent_id: 'agent_1' }), name: 'no-model-spec' },
    {
      ...spec({ agent_id: 'agent_1', model: 'sonnet', effort: 'low', maxOutputTokens: 4096 }),
      name: 'sonnet-low-spec',
    },
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

  it('includes the spec generation params when the spec sets any', () => {
    expect(resolveRequestSpecModel({ id: 'agent_1' }, 'sonnet-low-spec', specs)).toEqual({
      ok: true,
      model: 'sonnet',
      params: { effort: 'low', maxOutputTokens: 4096 },
    });
    expect(resolveRequestSpecModel({ id: 'agent_1' }, 'sonnet-spec', specs)).not.toHaveProperty(
      'params',
    );
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

  it('merges spec params over model_parameters and pins the model', () => {
    const agent = {
      id: 'agent_1',
      model: 'haiku',
      model_parameters: { model: 'haiku', promptCache: true, effort: 'high' },
    };
    const copy = withAgentModel(agent, 'sonnet', {
      effort: AnthropicEffort.low,
      maxOutputTokens: 4096,
    });
    expect(copy.model_parameters).toEqual({
      model: 'sonnet',
      promptCache: true,
      effort: 'low',
      maxOutputTokens: 4096,
    });
    expect(agent.model_parameters).toEqual({ model: 'haiku', promptCache: true, effort: 'high' });
  });

  it('strips thinking saved in additionalModelRequestFields when params set thinking:false', () => {
    const agent = {
      id: 'agent_1',
      model: 'haiku',
      model_parameters: {
        model: 'haiku',
        additionalModelRequestFields: {
          thinking: { type: 'enabled', budget_tokens: 2000 },
          top_k: 5,
        },
      },
    };
    expect(withAgentModel(agent, 'haiku', { thinking: false }).model_parameters).toEqual({
      model: 'haiku',
      thinking: false,
      additionalModelRequestFields: { top_k: 5 },
    });
    expect(agent.model_parameters.additionalModelRequestFields.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 2000,
    });
  });

  it('creates model_parameters for spec params when the agent has none', () => {
    expect(
      withAgentModel({ id: 'agent_1', model: 'haiku' }, 'sonnet', { thinking: false }),
    ).toEqual({
      id: 'agent_1',
      model: 'sonnet',
      model_parameters: { thinking: false, model: 'sonnet' },
    });
  });
});

describe('mergeSpecAgentParams', () => {
  it.each([
    [{ maxTokens: 4096 }, { maxTokens: 8192, maxOutputTokens: 16384 }, 4096],
    [{ maxOutputTokens: 4096 }, { maxTokens: 8192 }, 4096],
    [{ maxTokens: 8192, maxOutputTokens: 4096 }, { maxTokens: 16384 }, 4096],
  ])('normalizes a preset cap over both saved aliases (%j)', (params, saved, expected) => {
    expect(mergeSpecAgentParams(saved, params)).toEqual({
      maxTokens: expected,
      maxOutputTokens: expected,
    });
  });

  const savedThinking = {
    model: 'haiku',
    thinkingBudget: 2000,
    additionalModelRequestFields: {
      thinking: { type: 'enabled', budget_tokens: 2000 },
      thinkingBudget: 2000,
      top_k: 5,
    },
  };

  it('strips saved thinking config when the spec sets thinking:false', () => {
    expect(mergeSpecAgentParams(savedThinking, { thinking: false }, 'haiku-2')).toEqual({
      model: 'haiku-2',
      thinking: false,
      additionalModelRequestFields: { top_k: 5 },
    });
    expect(savedThinking.additionalModelRequestFields.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 2000,
    });
  });

  it('keeps saved thinking config when the spec omits thinking or sets it to null', () => {
    expect(mergeSpecAgentParams(savedThinking, { maxOutputTokens: 1024 })).toEqual({
      ...savedThinking,
      maxOutputTokens: 1024,
    });
    expect(mergeSpecAgentParams(savedThinking, undefined, 'haiku')).toEqual(savedThinking);
  });

  it('handles agents without saved model_parameters', () => {
    expect(mergeSpecAgentParams(undefined, { thinking: false }, 'haiku')).toEqual({
      model: 'haiku',
      thinking: false,
    });
  });
});

/**
 * Parser-level shape check: runs merged model_parameters through
 * bedrockInputParser/bedrockOutputParser (as the Bedrock endpoint does) and
 * asserts the resulting Converse fields. Does not exercise initializeAgent.
 */
describe('merged spec params through the Bedrock parsers', () => {
  const haiku = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
  const sonnet = 'us.anthropic.claude-sonnet-5';

  const toBedrock = (modelParameters: Record<string, unknown>) =>
    bedrockOutputParser(bedrockInputParser.parse(modelParameters)) as Record<string, unknown> & {
      additionalModelRequestFields?: Record<string, unknown>;
    };

  const merged = (
    model: string,
    preset: Record<string, unknown>,
    saved: Record<string, unknown> = { promptCache: true },
  ) =>
    withAgentModel(
      { id: 'agent_1', model: 'stored', model_parameters: { model: 'stored', ...saved } },
      model,
      getModelSpecAgentParams({ id: 'agent_1' }, spec({ agent_id: 'agent_1', model, ...preset })),
    ).model_parameters as Record<string, unknown>;

  it.each([haiku, sonnet])('%s sends the preset maxTokens cap and no thinking', (model) => {
    const parameters = merged(
      model,
      { thinking: false, maxTokens: 4096 },
      {
        maxTokens: 8192,
        maxOutputTokens: 16384,
        thinking: true,
        thinkingBudget: 2000,
        additionalModelRequestFields: { thinking: { type: 'enabled', budget_tokens: 2000 } },
      },
    );
    const llmConfig = bedrockOutputParser(bedrockInputParser.parse(parameters));
    const BedrockModel = getChatModelClass(Providers.BEDROCK);
    const client = new BedrockModel({
      ...llmConfig,
      model,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const command = new ConverseStreamCommand({
      modelId: model,
      messages: [],
      ...client.invocationParams({}),
    });
    expect(command.input.inferenceConfig?.maxTokens).toBe(4096);
    expect(command.input.additionalModelRequestFields ?? {}).not.toHaveProperty('thinking');
  });

  it.each(['claude-haiku-4-5', 'claude-sonnet-5'])(
    '%s sends max_tokens 4096 with thinking disabled through the Anthropic agent client',
    (model) => {
      const parameters = merged(model, { thinking: false, maxTokens: 4096 });
      const { llmConfig } = getLLMConfig('test-api-key', { modelOptions: parameters });
      const AnthropicModel = getChatModelClass(Providers.ANTHROPIC);
      const client = new AnthropicModel(llmConfig);
      const request = client.invocationParams({});
      expect(request.max_tokens).toBe(4096);
      expect(request.thinking).toEqual({ type: 'disabled' });
    },
  );

  it.each([haiku, sonnet])('%s prefers preset maxOutputTokens when both caps are set', (model) => {
    const llmConfig = toBedrock(merged(model, { maxTokens: 8192, maxOutputTokens: 4096 }));
    expect(llmConfig.maxTokens).toBe(4096);
  });

  it.each([haiku, sonnet])('%s carries the spec TTL in the Bedrock request', (model) => {
    const parameters = merged(
      model,
      { promptCache: true, promptCacheTtl: '1h' },
      { promptCache: true, promptCacheTtl: '5m' },
    );
    const llmConfig = bedrockOutputParser(bedrockInputParser.parse(parameters));
    expect(llmConfig.promptCacheTtl).toBe('1h');
    const BedrockModel = getChatModelClass(Providers.BEDROCK);
    const client = new BedrockModel({
      ...llmConfig,
      model,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const command = new ConverseStreamCommand({
      modelId: model,
      messages: [],
      ...client.invocationParams({
        tools: [{ toolSpec: { name: 'lookup', inputSchema: { json: { type: 'object' } } } }],
      }),
    });
    expect(command.input.toolConfig?.tools).toContainEqual({
      cachePoint: { type: 'default', ttl: '1h' },
    });
  });

  it('Haiku with thinking:false sends no thinking config', () => {
    const llmConfig = toBedrock(merged(haiku, { thinking: false, maxOutputTokens: 2048 }));
    expect(llmConfig.model).toBe(haiku);
    expect(llmConfig.additionalModelRequestFields?.thinking).toBeUndefined();
    expect(llmConfig.maxTokens).toBe(2048);
  });

  it('Haiku thinking:false overrides thinking saved in additionalModelRequestFields', () => {
    const saved = {
      additionalModelRequestFields: { thinking: { type: 'enabled', budget_tokens: 2000 } },
    };
    const llmConfig = toBedrock(merged(haiku, { thinking: false }, saved));
    expect(llmConfig.additionalModelRequestFields?.thinking).toBeUndefined();
    expect(llmConfig.additionalModelRequestFields?.thinkingBudget).toBeUndefined();
  });

  it('Haiku keeps saved nested thinking when the preset omits thinking', () => {
    const saved = {
      additionalModelRequestFields: { thinking: { type: 'enabled', budget_tokens: 2000 } },
    };
    const llmConfig = toBedrock(merged(haiku, { maxOutputTokens: 8192 }, saved));
    expect(llmConfig.additionalModelRequestFields?.thinking).toEqual(
      expect.objectContaining({ type: 'enabled' }),
    );
  });

  it('Sonnet 5 with effort:low sends output_config.effort=low with adaptive thinking', () => {
    const llmConfig = toBedrock(merged(sonnet, { effort: 'low', maxOutputTokens: 8192 }));
    expect(llmConfig.model).toBe(sonnet);
    expect(llmConfig.additionalModelRequestFields?.output_config).toEqual({ effort: 'low' });
    expect(llmConfig.additionalModelRequestFields?.thinking).toEqual(
      expect.objectContaining({ type: 'adaptive' }),
    );
    expect(llmConfig.maxTokens).toBe(8192);
  });

  it('Sonnet 5 drops a saved temperature', () => {
    const llmConfig = toBedrock(
      merged(sonnet, { effort: 'low', maxOutputTokens: 8192 }, { temperature: 0.7 }),
    );
    expect(llmConfig).not.toHaveProperty('temperature');
    expect(llmConfig.additionalModelRequestFields).not.toHaveProperty('temperature');
    expect(llmConfig.additionalModelRequestFields?.output_config).toEqual({ effort: 'low' });
  });

  it('Sonnet 5 drops a preset temperature', () => {
    const llmConfig = toBedrock(merged(sonnet, { temperature: 0.3 }));
    expect(llmConfig).not.toHaveProperty('temperature');
    expect(llmConfig.additionalModelRequestFields).not.toHaveProperty('temperature');
  });

  it('Haiku 4.5 keeps saved and preset temperature', () => {
    expect(toBedrock(merged(haiku, { thinking: false }, { temperature: 0.7 })).temperature).toBe(
      0.7,
    );
    expect(toBedrock(merged(haiku, { thinking: false, temperature: 0.3 })).temperature).toBe(0.3);
  });
});
