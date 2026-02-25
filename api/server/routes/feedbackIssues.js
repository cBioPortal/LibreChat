const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

const REASON_LABELS = {
  incorrect: 'bug',
  unfaithful: 'bug',
  safety_or_legal_concern: 'safety',
  style_tone_conciseness: 'enhancement',
  other: 'feedback',
};

function formatIssueBody(payload) {
  const {
    feedback_reason,
    feedback_details,
    feedback_suggested_fix,
    conversation,
    user,
    timestamp,
    request_id,
  } = payload;

  const messages = (conversation?.last_n_messages || [])
    .map((m) => `**${m.is_user ? 'User' : 'Assistant'}** (${m.timestamp}):\n${m.text}`)
    .join('\n\n---\n\n');

  const lines = [
    '## Feedback Report',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| **Reason** | ${feedback_reason} |`,
    `| **Reported by** | ${user?.username || 'unknown'} |`,
    `| **Timestamp** | ${timestamp} |`,
    `| **Request ID** | \`${request_id}\` |`,
    `| **Conversation** | \`${conversation?.conversation_id || 'N/A'}\` |`,
    `| **Message** | \`${conversation?.message_id || 'N/A'}\` |`,
    '',
    '### Issue Details',
    '',
    feedback_details?.trim() || '_No details provided_',
    '',
    '### Suggested Fix',
    '',
    feedback_suggested_fix?.trim() || '_No suggestion provided_',
  ];

  if (messages) {
    lines.push(
      '',
      `### Conversation Context (last ${conversation.last_n_messages.length} messages)`,
      '',
      messages,
    );
  }

  return lines.join('\n');
}

router.post('/', async (req, res) => {
  const githubToken = process.env.GITHUB_FEEDBACK_TOKEN;
  const githubRepo = process.env.GITHUB_FEEDBACK_REPO;

  if (!githubToken || !githubRepo) {
    return res.status(501).json({
      error: 'Product feedback is not configured. Set GITHUB_FEEDBACK_TOKEN and GITHUB_FEEDBACK_REPO.',
    });
  }

  const { feedback_reason, feedback_title } = req.body;

  if (!feedback_reason || !feedback_title) {
    return res.status(400).json({
      error: 'feedback_reason and feedback_title are required',
    });
  }

  const issueBody = formatIssueBody(req.body);
  const reasonLabel = REASON_LABELS[feedback_reason] || 'feedback';

  try {
    const response = await fetch(
      `https://api.github.com/repos/${githubRepo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title: `[Feedback] ${feedback_title}`,
          body: issueBody,
          labels: [reasonLabel, 'user-feedback'],
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      logger.error('[feedbackIssues] GitHub API error:', { status: response.status, data });
      return res.status(502).json({
        error: 'Failed to create GitHub issue',
        details: data.message || 'Unknown GitHub API error',
      });
    }

    logger.info('[feedbackIssues] Issue created:', { issue_number: data.number, url: data.html_url });

    return res.json({
      issue_url: data.html_url,
      issue_number: data.number,
    });
  } catch (error) {
    logger.error('[feedbackIssues] Failed to reach GitHub API:', error);
    return res.status(502).json({
      error: 'Failed to reach GitHub API',
      message: error.message,
    });
  }
});

module.exports = router;
