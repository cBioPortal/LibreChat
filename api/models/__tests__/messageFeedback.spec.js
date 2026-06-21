/**
 * Unit tests for message feedback flow.
 *
 * Tests that feedback (thumbs up / thumbs down) is correctly stored, updated,
 * and cleared via the updateMessage function, following the same
 * MongoMemoryServer pattern used in api/models/Message.spec.js.
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { messageSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { saveMessage, updateMessage } = require('../Message');

// Required to silence the Config/app module that is imported transitively.
jest.mock('~/server/services/Config/app');

/** @type {import('mongoose').Model<import('@librechat/data-schemas').IMessage>} */
let Message;

describe('Message Feedback Flow', () => {
  let mongoServer;
  let mockReq;
  let conversationId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Message.deleteMany({});

    conversationId = uuidv4();

    mockReq = {
      user: { id: 'user123' },
      body: {},
      config: {
        interfaceConfig: {
          temporaryChatRetention: 24,
        },
      },
    };

    // Pre-save a base message that feedback tests will operate on.
    await saveMessage(mockReq, {
      messageId: 'msg-feedback-test',
      conversationId,
      text: 'Assistant response',
      user: 'user123',
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Thumbs up
  // ---------------------------------------------------------------------------
  it('should store thumbs up feedback on a message', async () => {
    const result = await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsUp' },
    });

    expect(result.feedback).toBeDefined();
    expect(result.feedback.rating).toBe('thumbsUp');

    // Verify persistence in the database.
    const dbMsg = await Message.findOne({
      messageId: 'msg-feedback-test',
      user: 'user123',
    }).lean();
    expect(dbMsg.feedback.rating).toBe('thumbsUp');
  });

  // ---------------------------------------------------------------------------
  // 2. Thumbs down
  // ---------------------------------------------------------------------------
  it('should store thumbs down feedback on a message', async () => {
    const result = await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsDown' },
    });

    expect(result.feedback).toBeDefined();
    expect(result.feedback.rating).toBe('thumbsDown');

    const dbMsg = await Message.findOne({
      messageId: 'msg-feedback-test',
      user: 'user123',
    }).lean();
    expect(dbMsg.feedback.rating).toBe('thumbsDown');
  });

  // ---------------------------------------------------------------------------
  // 3. Clearing feedback (setting to null)
  // ---------------------------------------------------------------------------
  it('should clear feedback when null is provided', async () => {
    // First set feedback so there is something to clear.
    await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsUp' },
    });

    // Now clear it via the same pattern used in the route handler:
    //   feedback: feedback || null  where feedback is falsy/undefined.
    const result = await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: null,
    });

    // The returned object should have feedback as null / undefined / falsy.
    expect(result.feedback == null).toBe(true);

    // Verify the database reflects the cleared state.
    const dbMsg = await Message.findOne({
      messageId: 'msg-feedback-test',
      user: 'user123',
    }).lean();
    expect(dbMsg.feedback == null).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Feedback with a tag
  // ---------------------------------------------------------------------------
  it('should store a tag alongside the feedback rating', async () => {
    const result = await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsDown', tag: 'incorrect' },
    });

    expect(result.feedback).toBeDefined();
    expect(result.feedback.rating).toBe('thumbsDown');
    expect(result.feedback.tag).toBe('incorrect');

    const dbMsg = await Message.findOne({
      messageId: 'msg-feedback-test',
      user: 'user123',
    }).lean();
    expect(dbMsg.feedback.tag).toBe('incorrect');
  });

  // ---------------------------------------------------------------------------
  // 5. Feedback with text
  // ---------------------------------------------------------------------------
  it('should store text alongside the feedback rating', async () => {
    const feedbackText = 'This answer was not helpful for my use case.';
    const result = await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsDown', text: feedbackText },
    });

    expect(result.feedback).toBeDefined();
    expect(result.feedback.rating).toBe('thumbsDown');
    expect(result.feedback.text).toBe(feedbackText);

    const dbMsg = await Message.findOne({
      messageId: 'msg-feedback-test',
      user: 'user123',
    }).lean();
    expect(dbMsg.feedback.text).toBe(feedbackText);
  });

  // ---------------------------------------------------------------------------
  // 6. Non-existent message
  // ---------------------------------------------------------------------------
  it('should throw when submitting feedback to a non-existent message', async () => {
    await expect(
      updateMessage(mockReq, {
        messageId: 'does-not-exist',
        feedback: { rating: 'thumbsUp' },
      }),
    ).rejects.toThrow('Message not found or user not authorized.');
  });

  // ---------------------------------------------------------------------------
  // 7. Updating existing feedback (thumbsUp -> thumbsDown)
  // ---------------------------------------------------------------------------
  it('should overwrite existing feedback when a new rating is submitted', async () => {
    // Set initial thumbsUp feedback.
    await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsUp' },
    });

    // Now switch to thumbsDown with additional context.
    const result = await updateMessage(mockReq, {
      messageId: 'msg-feedback-test',
      feedback: { rating: 'thumbsDown', tag: 'wrong', text: 'Changed my mind.' },
    });

    expect(result.feedback.rating).toBe('thumbsDown');
    expect(result.feedback.tag).toBe('wrong');
    expect(result.feedback.text).toBe('Changed my mind.');

    // The database should reflect the latest value only.
    const dbMsg = await Message.findOne({
      messageId: 'msg-feedback-test',
      user: 'user123',
    }).lean();
    expect(dbMsg.feedback.rating).toBe('thumbsDown');
    expect(dbMsg.feedback.tag).toBe('wrong');
    expect(dbMsg.feedback.text).toBe('Changed my mind.');
  });
});
