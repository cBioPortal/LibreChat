const { ContentTypes, EModelEndpoint } = require('librechat-data-provider');

// Mock LLM classes before requiring the client
const mockInvoke = jest.fn();
const MockLLMConstructor = jest.fn().mockImplementation(() => ({
  invoke: mockInvoke,
}));

jest.mock('@langchain/openai', () => ({
  ...jest.requireActual('@langchain/openai'),
  ChatOpenAI: MockLLMConstructor,
}));
jest.mock('@langchain/anthropic', () => ({
  ...jest.requireActual('@langchain/anthropic'),
  ChatAnthropic: MockLLMConstructor,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  checkAccess: jest.fn(),
  initializeAgent: jest.fn(),
  createMemoryProcessor: jest.fn(),
}));

jest.mock('~/models/Agent', () => ({ loadAgent: jest.fn() }));
jest.mock('~/models/Role', () => ({ getRoleByName: jest.fn() }));
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    formatInstructionsForContext: jest.fn(),
  })),
}));

const AgentClient = require('./client');

describe('AgentClient - Context Summarization', () => {
  let client;
  let mockAgent;
  let mockReq;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAgent = {
      id: 'agent-123',
      endpoint: EModelEndpoint.openAI,
      provider: EModelEndpoint.openAI,
      model_parameters: { model: 'gpt-4' },
    };

    mockReq = {
      user: { id: 'user-123' },
      body: { endpoint: EModelEndpoint.openAI },
      config: {},
    };
  });

  describe('constructor', () => {
    it('should default contextStrategy to "discard"', () => {
      client = new AgentClient({ req: mockReq, res: {}, agent: mockAgent });
      expect(client.contextStrategy).toBe('discard');
      expect(client.shouldSummarize).toBe(false);
      expect(client.summaryModel).toBeNull();
    });

    it('should set contextStrategy to "summarize" when configured', () => {
      client = new AgentClient({
        req: mockReq,
        res: {},
        agent: mockAgent,
        contextStrategy: 'summarize',
      });
      expect(client.contextStrategy).toBe('summarize');
      expect(client.shouldSummarize).toBe(true);
    });

    it('should set summaryModel when configured', () => {
      client = new AgentClient({
        req: mockReq,
        res: {},
        agent: mockAgent,
        contextStrategy: 'summarize',
        summaryModel: 'gpt-4.1-mini',
      });
      expect(client.summaryModel).toBe('gpt-4.1-mini');
    });

    it('should not leak contextStrategy or summaryModel into this.options', () => {
      client = new AgentClient({
        req: mockReq,
        res: {},
        agent: mockAgent,
        contextStrategy: 'summarize',
        summaryModel: 'gpt-4.1-mini',
      });
      expect(client.options.contextStrategy).toBeUndefined();
      expect(client.options.summaryModel).toBeUndefined();
    });
  });

  describe('concatenateMessages', () => {
    beforeEach(() => {
      client = new AgentClient({ req: mockReq, res: {}, agent: mockAgent });
    });

    it('should concatenate simple string content messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = client.concatenateMessages(messages);
      expect(result).toBe('user:\nHello\n\nassistant:\nHi there\n\n');
    });

    it('should use name over role when available', () => {
      const messages = [{ name: 'Alice', role: 'user', content: 'Hello' }];
      const result = client.concatenateMessages(messages);
      expect(result).toBe('Alice:\nHello\n\n');
    });

    it('should handle content arrays with text parts', () => {
      const messages = [
        {
          role: 'assistant',
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'First part' },
            { type: ContentTypes.TEXT, text: 'Second part' },
          ],
        },
      ];
      const result = client.concatenateMessages(messages);
      expect(result).toContain('First part');
      expect(result).toContain('Second part');
    });

    it('should handle content arrays with tool call parts', () => {
      const messages = [
        {
          role: 'assistant',
          content: [
            {
              type: ContentTypes.TOOL_CALL,
              name: 'search',
              output: 'Found 5 results',
            },
          ],
        },
      ];
      const result = client.concatenateMessages(messages);
      expect(result).toContain('[Tool: search]');
      expect(result).toContain('Found 5 results');
    });

    it('should handle mixed content arrays', () => {
      const messages = [
        {
          role: 'assistant',
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Let me search for that.' },
            { type: ContentTypes.TOOL_CALL, name: 'web_search', output: 'Results found' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Here are the results.' },
          ],
        },
      ];
      const result = client.concatenateMessages(messages);
      expect(result).toContain('Let me search for that.');
      expect(result).toContain('[Tool: web_search] Results found');
      expect(result).toContain('Here are the results.');
    });

    it('should skip unknown content types', () => {
      const messages = [
        {
          role: 'assistant',
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Visible text' },
            { type: 'image_url', url: 'http://example.com/img.png' },
          ],
        },
      ];
      const result = client.concatenateMessages(messages);
      expect(result).toContain('Visible text');
      expect(result).not.toContain('example.com');
    });

    it('should handle null/undefined content gracefully', () => {
      const messages = [{ role: 'user', content: null }];
      const result = client.concatenateMessages(messages);
      expect(result).toBe('user:\n\n\n');
    });
  });

  describe('summarizeMessages', () => {
    beforeEach(() => {
      client = new AgentClient({
        req: mockReq,
        res: {},
        agent: mockAgent,
        contextStrategy: 'summarize',
      });
    });

    it('should return a summary message with role "user" and prefix', async () => {
      mockInvoke.mockResolvedValue({
        content: 'The user asked about AI and the assistant explained its benefits.',
      });

      const result = await client.summarizeMessages({
        messagesToRefine: [
          { role: 'user', content: 'What is AI?', tokenCount: 10 },
          { role: 'assistant', content: 'AI is artificial intelligence.', tokenCount: 15 },
        ],
        remainingContextTokens: 500,
      });

      expect(result.summaryMessage).toBeDefined();
      expect(result.summaryMessage.role).toBe('user');
      expect(result.summaryMessage.content).toBe(
        '[Previous conversation summary]\nThe user asked about AI and the assistant explained its benefits.',
      );
      expect(result.summaryTokenCount).toBeGreaterThan(0);
      expect(typeof result.summaryTokenCount).toBe('number');
    });

    it('should use SUMMARY_PROMPT when previous_summary exists', async () => {
      client.previous_summary = {
        messageId: 'msg-1',
        content: 'Previous conversation summary about AI.',
      };

      mockInvoke.mockResolvedValue({
        content: 'Updated summary including new discussion points.',
      });

      const result = await client.summarizeMessages({
        messagesToRefine: [
          { role: 'user', content: 'Tell me more about machine learning', tokenCount: 12 },
          { role: 'assistant', content: 'Machine learning is a subset of AI.', tokenCount: 15 },
        ],
        remainingContextTokens: 500,
      });

      expect(result.summaryMessage.content).toContain(
        'Updated summary including new discussion points.',
      );

      // Verify the prompt included the previous summary
      const invokeArg = mockInvoke.mock.calls[0][0];
      expect(invokeArg).toContain('Previous conversation summary about AI.');
      expect(invokeArg).toContain('Tell me more about machine learning');
    });

    it('should use ChatOpenAI for OpenAI provider', async () => {
      mockInvoke.mockResolvedValue({ content: 'Summary' });

      await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 500,
      });

      expect(MockLLMConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
      );
    });

    it('should use ChatAnthropic for Anthropic provider', async () => {
      const anthropicAgent = {
        ...mockAgent,
        provider: EModelEndpoint.anthropic,
        model_parameters: { model: 'claude-sonnet-4-20250514' },
      };
      client = new AgentClient({
        req: mockReq,
        res: {},
        agent: anthropicAgent,
        contextStrategy: 'summarize',
      });
      mockInvoke.mockResolvedValue({ content: 'Summary' });

      await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 500,
      });

      expect(MockLLMConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-20250514' }),
      );
    });

    it('should use summaryModel override when configured', async () => {
      client.summaryModel = 'gpt-4.1-mini';
      mockInvoke.mockResolvedValue({ content: 'Summary' });

      await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 500,
      });

      expect(MockLLMConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4.1-mini' }),
      );
    });

    it('should cap maxTokens at 1024 or 50% of remaining context', async () => {
      mockInvoke.mockResolvedValue({ content: 'Summary' });

      await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 200,
      });

      expect(MockLLMConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 100 }), // 50% of 200
      );
    });

    it('should cap maxTokens at 1024 for large remaining context', async () => {
      mockInvoke.mockResolvedValue({ content: 'Summary' });

      await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 10000,
      });

      expect(MockLLMConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 1024 }),
      );
    });

    it('should return empty object when messagesToRefine produces empty text', async () => {
      const result = await client.summarizeMessages({
        messagesToRefine: [],
        remainingContextTokens: 500,
      });

      expect(result).toEqual({});
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should return empty object when LLM returns empty content', async () => {
      mockInvoke.mockResolvedValue({ content: '' });

      const result = await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 500,
      });

      expect(result).toEqual({});
    });

    it('should gracefully fall back to empty object on LLM error', async () => {
      mockInvoke.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 500,
      });

      expect(result).toEqual({});
    });

    it('should handle content array responses from the LLM', async () => {
      mockInvoke.mockResolvedValue({
        content: [{ text: 'Part 1 ' }, { text: 'Part 2' }],
      });

      const result = await client.summarizeMessages({
        messagesToRefine: [{ role: 'user', content: 'Hello', tokenCount: 5 }],
        remainingContextTokens: 500,
      });

      expect(result.summaryMessage.content).toContain('Part 1 Part 2');
    });

    it('should handle content arrays in messagesToRefine', async () => {
      mockInvoke.mockResolvedValue({ content: 'Summary with tool context' });

      const result = await client.summarizeMessages({
        messagesToRefine: [
          {
            role: 'assistant',
            content: [
              { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'I searched for that.' },
              { type: ContentTypes.TOOL_CALL, name: 'search', output: 'Found results' },
            ],
            tokenCount: 20,
          },
        ],
        remainingContextTokens: 500,
      });

      expect(result.summaryMessage.content).toContain('Summary with tool context');
      const invokeArg = mockInvoke.mock.calls[0][0];
      expect(invokeArg).toContain('I searched for that.');
      expect(invokeArg).toContain('[Tool: search] Found results');
    });
  });
});
