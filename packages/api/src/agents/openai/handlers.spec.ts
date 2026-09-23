import type { Response as ServerResponse } from 'express';
import type { OpenAIResponseContext } from './types';
import {
  sendFinalChunk,
  buildCompletionUsage,
  OpenAIModelEndHandler,
  createOpenAIStreamTracker,
  createCompletionUsageTotals,
} from './handlers';

describe('OpenAI-compatible agent stream handlers', () => {
  const context: OpenAIResponseContext = {
    requestId: 'chatcmpl-test',
    created: 1778317637,
    model: 'anthropic/claude-sonnet-4.6',
  };

  it('preserves reasoning token usage from model end metadata', () => {
    const tracker = createOpenAIStreamTracker();
    const write = jest.fn();
    const handler = new OpenAIModelEndHandler({
      context,
      tracker,
      res: { write } as unknown as ServerResponse,
    });

    handler.handle('on_chat_model_end', {
      output: {
        usage_metadata: {
          input_tokens: 64,
          output_tokens: 3315,
          output_token_details: {
            reasoning: 641,
          },
        },
      },
    });

    expect(tracker.usage).toEqual({
      promptTokens: 64,
      completionTokens: 3315,
      reasoningTokens: 641,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it('includes reasoning token details in the final streamed usage chunk', () => {
    const tracker = createOpenAIStreamTracker();
    tracker.usage.promptTokens = 64;
    tracker.usage.completionTokens = 3315;
    tracker.usage.reasoningTokens = 641;

    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
      },
    } as unknown as ServerResponse;

    sendFinalChunk({ context, tracker, res });

    const finalChunk = JSON.parse(writes[0].replace(/^data: /, '').trim());
    expect(finalChunk.usage).toEqual({
      prompt_tokens: 64,
      completion_tokens: 3315,
      total_tokens: 3379,
      completion_tokens_details: {
        reasoning_tokens: 641,
      },
    });
  });

  const endUsage = (usage_metadata: Record<string, unknown>) => {
    const tracker = createOpenAIStreamTracker();
    const handler = new OpenAIModelEndHandler({
      context,
      tracker,
      res: { write: jest.fn() } as unknown as ServerResponse,
    });
    handler.handle('on_chat_model_end', { output: { usage_metadata } });
    return tracker.usage;
  };

  it('counts Bedrock cache tokens (reported outside input_tokens) in prompt tokens', () => {
    expect(
      endUsage({
        input_tokens: 6,
        output_tokens: 506,
        total_tokens: 43602,
        provider: 'bedrock',
        input_token_details: { cache_read: 40000, cache_creation: 3090 },
      }),
    ).toMatchObject({
      promptTokens: 43096,
      completionTokens: 506,
      cacheReadTokens: 40000,
      cacheCreationTokens: 3090,
    });
  });

  it('does not double count Anthropic cache tokens already inside input_tokens', () => {
    expect(
      endUsage({
        input_tokens: 43096,
        output_tokens: 506,
        total_tokens: 43602,
        provider: 'anthropic',
        input_token_details: { cache_read: 40000, cache_creation: 3090 },
      }),
    ).toMatchObject({ promptTokens: 43096, cacheReadTokens: 40000, cacheCreationTokens: 3090 });
  });

  it('exposes cache reads and writes as prompt_tokens_details', () => {
    const totals = createCompletionUsageTotals();
    Object.assign(totals, {
      promptTokens: 43096,
      completionTokens: 506,
      cacheReadTokens: 40000,
      cacheCreationTokens: 3090,
    });
    expect(buildCompletionUsage(totals)).toEqual({
      prompt_tokens: 43096,
      completion_tokens: 506,
      total_tokens: 43602,
      prompt_tokens_details: { cached_tokens: 40000, cache_creation_tokens: 3090 },
    });
  });

  it('omits prompt_tokens_details when nothing was cached', () => {
    const totals = createCompletionUsageTotals();
    totals.promptTokens = 10;
    expect(buildCompletionUsage(totals)).not.toHaveProperty('prompt_tokens_details');
  });
});
