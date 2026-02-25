const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

router.post('/', async (req, res) => {
  const serviceUrl = process.env.FEEDBACK_ISSUE_SERVICE_URL;
  const authToken = process.env.FEEDBACK_ISSUE_SERVICE_AUTH_TOKEN;

  if (!serviceUrl) {
    return res.status(501).json({
      error: 'Product feedback service is not configured',
    });
  }

  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Issue creation service error:', { status: response.status, errorText });
      return res.status(response.status).json({
        error: 'Issue creation service error',
        details: errorText,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    logger.error('Failed to reach issue creation service:', error);
    return res.status(502).json({
      error: 'Failed to reach issue creation service',
      message: error.message,
    });
  }
});

module.exports = router;
