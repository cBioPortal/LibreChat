/**
 * Unit tests for the product feedback (POST /api/feedback/issues) flow.
 *
 * Tests that ProductFeedback records are correctly created and persisted in
 * MongoDB, following the same MongoMemoryServer pattern used by
 * api/models/Message.spec.js and api/models/__tests__/messageFeedback.spec.js.
 *
 * All tests run against an in-memory MongoDB instance - no real MongoDB or
 * librechat.yaml configuration is required.
 */

'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { productFeedbackSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');

/** @type {import('mongoose').Model} */
let ProductFeedback;

/** Minimum valid payload satisfying all required fields in the compiled schema. */
const makeValidPayload = (overrides = {}) => ({
  request_id: uuidv4(),
  user: 'user-abc123',
  username: 'testuser',
  feedback_reason: 'incorrect',
  feedback_title: 'Something was wrong',
  ...overrides,
});

describe('ProductFeedback Model', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    ProductFeedback = mongoose.models.ProductFeedback || mongoose.model('ProductFeedback', productFeedbackSchema);
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await ProductFeedback.deleteMany({});
  });

  it('should create and persist a ProductFeedback record with required fields', async () => {
    const payload = makeValidPayload();
    const record = await ProductFeedback.create(payload);
    expect(record._id).toBeDefined();
    const persisted = await ProductFeedback.findById(record._id).lean();
    expect(persisted).not.toBeNull();
    expect(persisted.request_id).toBe(payload.request_id);
    expect(persisted.user).toBe(payload.user);
    expect(persisted.feedback_reason).toBe(payload.feedback_reason);
    expect(persisted.feedback_title).toBe(payload.feedback_title);
  });

  it('should return a record that exposes _id and request_id', async () => {
    const requestId = uuidv4();
    const payload = makeValidPayload({ request_id: requestId });
    const record = await ProductFeedback.create(payload);
    expect(record._id.toString()).toMatch(/^[a-f0-9]{24}$/i);
    expect(record.request_id).toBe(requestId);
  });

  it('should reject a record that is missing feedback_reason', async () => {
    const payload = makeValidPayload();
    delete payload.feedback_reason;
    await expect(ProductFeedback.create(payload)).rejects.toThrow();
  });

  it('should reject a record that is missing feedback_title', async () => {
    const payload = makeValidPayload();
    delete payload.feedback_title;
    await expect(ProductFeedback.create(payload)).rejects.toThrow();
  });

  it('should reject a record that is missing user', async () => {
    const payload = makeValidPayload();
    delete payload.user;
    await expect(ProductFeedback.create(payload)).rejects.toThrow();
  });

  it('should reject a record that is missing request_id', async () => {
    const payload = makeValidPayload();
    delete payload.request_id;
    await expect(ProductFeedback.create(payload)).rejects.toThrow();
  });

  it('should reject a record with an invalid feedback_reason enum value', async () => {
    const payload = makeValidPayload({ feedback_reason: 'not_a_valid_reason' });
    await expect(ProductFeedback.create(payload)).rejects.toThrow();
  });

  it('should store user and username exactly as provided', async () => {
    const payload = makeValidPayload({ user: 'user-xyz-789', username: 'alice' });
    const record = await ProductFeedback.create(payload);
    const persisted = await ProductFeedback.findById(record._id).lean();
    expect(persisted.user).toBe('user-xyz-789');
    expect(persisted.username).toBe('alice');
  });

  it('should preserve a caller-supplied request_id without modification', async () => {
    const customRequestId = 'custom-req-id-' + uuidv4();
    const payload = makeValidPayload({ request_id: customRequestId });
    const record = await ProductFeedback.create(payload);
    expect(record.request_id).toBe(customRequestId);
    const persisted = await ProductFeedback.findById(record._id).lean();
    expect(persisted.request_id).toBe(customRequestId);
  });

  it('should reject a second record with the same request_id', async () => {
    const sharedRequestId = uuidv4();
    await ProductFeedback.create(makeValidPayload({ request_id: sharedRequestId }));
    await expect(
      ProductFeedback.create(makeValidPayload({ request_id: sharedRequestId })),
    ).rejects.toThrow();
  });

  it('should store all optional fields: conversation, metadata, and contact', async () => {
    const conversation = {
      conversation_id: uuidv4(),
      message_id: uuidv4(),
      last_n_messages: [
        { timestamp: new Date().toISOString(), is_user: true, text: 'Hi' },
        { timestamp: new Date().toISOString(), is_user: false, text: 'Hello!' },
      ],
    };
    const metadata = {
      librechat_version: '0.7.0',
      client: 'web',
      endpoint: 'openAI',
      model: 'gpt-4o',
      agent_id: 'agent-001',
    };
    const contact = { email: 'tester@example.com' };
    const payload = makeValidPayload({
      feedback_details: 'The answer missed the key point.',
      feedback_suggested_fix: 'Include the referenced documentation.',
      conversation,
      metadata,
      contact,
    });
    const record = await ProductFeedback.create(payload);
    const persisted = await ProductFeedback.findById(record._id).lean();
    expect(persisted.feedback_details).toBe('The answer missed the key point.');
    expect(persisted.feedback_suggested_fix).toBe('Include the referenced documentation.');
    expect(persisted.conversation.conversation_id).toBe(conversation.conversation_id);
    expect(persisted.conversation.message_id).toBe(conversation.message_id);
    expect(persisted.conversation.last_n_messages).toHaveLength(2);
    expect(persisted.conversation.last_n_messages[0].is_user).toBe(true);
    expect(persisted.metadata.librechat_version).toBe('0.7.0');
    expect(persisted.metadata.client).toBe('web');
    expect(persisted.metadata.endpoint).toBe('openAI');
    expect(persisted.metadata.model).toBe('gpt-4o');
    expect(persisted.metadata.agent_id).toBe('agent-001');
    expect(persisted.contact.email).toBe('tester@example.com');
  });

  it('should add createdAt and updatedAt timestamps automatically', async () => {
    const before = new Date();
    const record = await ProductFeedback.create(makeValidPayload());
    const after = new Date();
    const persisted = await ProductFeedback.findById(record._id).lean();
    expect(persisted.createdAt).toBeDefined();
    expect(persisted.updatedAt).toBeDefined();
    expect(new Date(persisted.createdAt).getTime()).toBeGreaterThanOrEqual(before.getTime() - 50);
    expect(new Date(persisted.createdAt).getTime()).toBeLessThanOrEqual(after.getTime() + 50);
  });

  it.each([
    'incorrect',
    'unfaithful',
    'safety_or_legal_concern',
    'style_tone_conciseness',
    'other',
  ])('should accept feedback_reason = %s', async (reason) => {
    const payload = makeValidPayload({ feedback_reason: reason, request_id: uuidv4() });
    const record = await ProductFeedback.create(payload);
    expect(record.feedback_reason).toBe(reason);
  });

  it('should allow multiple records from different users in the same collection', async () => {
    await ProductFeedback.create(
      makeValidPayload({ user: 'user-111', username: 'alice', request_id: uuidv4() }),
    );
    await ProductFeedback.create(
      makeValidPayload({ user: 'user-222', username: 'bob', request_id: uuidv4() }),
    );
    const aliceRecords = await ProductFeedback.find({ user: 'user-111' }).lean();
    const bobRecords = await ProductFeedback.find({ user: 'user-222' }).lean();
    expect(aliceRecords).toHaveLength(1);
    expect(aliceRecords[0].username).toBe('alice');
    expect(bobRecords).toHaveLength(1);
    expect(bobRecords[0].username).toBe('bob');
  });
});
