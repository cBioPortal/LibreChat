const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { ProductFeedback } = require('~/db/models');

const router = express.Router();
router.use(requireJwtAuth);

router.post('/', async (req, res) => {
  const { feedback_reason, feedback_title, feedback_details, feedback_suggested_fix, conversation, metadata, contact } = req.body;

  const request_id = req.body.request_id || uuidv4();

  try {
    const record = await ProductFeedback.create({
      request_id,
      user: req.user.id,
      username: req.user.username || req.user.name || 'unknown',
      feedback_reason,
      feedback_title,
      feedback_details,
      feedback_suggested_fix,
      conversation,
      metadata,
      contact,
    });

    logger.info('[feedbackIssues] Feedback saved:', { request_id, id: record._id });

    return res.json({
      id: record._id.toString(),
      request_id,
    });
  } catch (error) {
    logger.error('[feedbackIssues] Failed to save feedback:', error);
    return res.status(500).json({
      error: 'Failed to save feedback',
      message: error.message,
    });
  }
});

module.exports = router;
