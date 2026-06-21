#!/usr/bin/env node
/**
 * audit-feedback.js
 *
 * Audits message feedback consistency in LibreChat's MongoDB.
 *
 * Compares feedback counts in the messages collection against the
 * productfeedbacks collection and flags anomalies (missing rating field,
 * invalid rating values, etc.).
 *
 * Usage:
 *   node scripts/audit-feedback.js [options]
 *
 * Options:
 *   --uri <mongodb_uri>   MongoDB connection string (overrides env / .env file)
 *   --since <date>        Only consider messages created on or after this date
 *   --until <date>        Only consider messages created on or before this date
 *   --json                Output results as JSON instead of a formatted table
 *   --help                Show this help text and exit
 *
 * MongoDB URI resolution order:
 *   1. --uri CLI argument
 *   2. MONGO_URI environment variable
 *   3. MONGO_URI key in .env file at the project root
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const HELP = `
Usage: node scripts/audit-feedback.js [options]

Options:
  --uri <mongodb_uri>   MongoDB connection string
  --since <date>        Filter messages created on or after this date (ISO 8601)
  --until <date>        Filter messages created on or before this date (ISO 8601)
  --json                Output results as JSON
  --help                Show this help text and exit

MongoDB URI is resolved from (in order):
  1. --uri CLI argument
  2. MONGO_URI environment variable
  3. MONGO_URI in .env file at the project root

Examples:
  node scripts/audit-feedback.js
  node scripts/audit-feedback.js --uri mongodb://localhost:27017/LibreChat
  node scripts/audit-feedback.js --since 2024-01-01 --until 2024-12-31
  node scripts/audit-feedback.js --json
`.trim();

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    uri: null,
    since: null,
    until: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--uri') {
      result.uri = args[++i];
    } else if (arg === '--since') {
      result.since = args[++i];
    } else if (arg === '--until') {
      result.until = args[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// .env file parser (minimal — no external deps)
// ---------------------------------------------------------------------------

function readDotEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) {
    return vars;
  }
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Skip blank lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Resolve MongoDB URI
// ---------------------------------------------------------------------------

function resolveMongoUri(cliUri) {
  if (cliUri) {
    return cliUri;
  }
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }
  const projectRoot = path.resolve(__dirname, '..');
  const dotEnvPath = path.join(projectRoot, '.env');
  const dotEnvVars = readDotEnv(dotEnvPath);
  if (dotEnvVars.MONGO_URI) {
    return dotEnvVars.MONGO_URI;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validate date strings
// ---------------------------------------------------------------------------

function parseDate(str, label) {
  const d = new Date(str);
  if (isNaN(d.getTime())) {
    console.error(`Invalid ${label} date: "${str}". Use an ISO 8601 date, e.g. 2024-01-01`);
    process.exit(1);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Main audit logic
// ---------------------------------------------------------------------------

async function audit({ mongoUri, since, until }) {
  // Require mongoose at runtime so the script can be used without bundling
  let mongoose;
  try {
    mongoose = require('mongoose');
  } catch (e) {
    console.error('Could not require mongoose. Make sure you run this script from the LibreChat project root with dependencies installed.');
    console.error(e.message);
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Connect
  // ------------------------------------------------------------------
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  // ------------------------------------------------------------------
  // Define lightweight schemas for read-only access
  //
  // The feedback sub-schema uses Mixed so we can inspect raw stored data
  // regardless of schema enforcement, which is exactly what we need for
  // detecting malformed documents.
  // ------------------------------------------------------------------

  const feedbackSubSchema = new mongoose.Schema(
    {
      rating: mongoose.Schema.Types.Mixed,
      tag: mongoose.Schema.Types.Mixed,
      text: mongoose.Schema.Types.Mixed,
    },
    { _id: false },
  );

  const messageSchema = new mongoose.Schema(
    {
      messageId: String,
      conversationId: String,
      user: String,
      isCreatedByUser: Boolean,
      feedback: feedbackSubSchema,
      createdAt: Date,
      updatedAt: Date,
    },
    { strict: false, timestamps: false },
  );

  const productFeedbackSchema = new mongoose.Schema(
    {
      request_id: String,
      user: String,
      feedback_reason: String,
      createdAt: Date,
    },
    { strict: false, timestamps: false },
  );

  // Use existing models if already registered (idempotency within the session)
  const Message =
    mongoose.models.AuditMessage ||
    mongoose.model('AuditMessage', messageSchema, 'messages');

  const ProductFeedback =
    mongoose.models.AuditProductFeedback ||
    mongoose.model('AuditProductFeedback', productFeedbackSchema, 'productfeedbacks');

  // ------------------------------------------------------------------
  // Build date filter
  // ------------------------------------------------------------------

  const dateFilter = {};
  if (since) {
    dateFilter.$gte = since;
  }
  if (until) {
    dateFilter.$lte = until;
  }
  const baseFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

  // ------------------------------------------------------------------
  // Query: messages with feedback field present (including null/empty)
  // ------------------------------------------------------------------

  const feedbackExistsFilter = {
    ...baseFilter,
    feedback: { $exists: true, $ne: null },
  };

  // Total messages scanned
  const totalScanned = await Message.countDocuments(baseFilter);

  // Messages where feedback field exists
  const withFeedbackCount = await Message.countDocuments(feedbackExistsFilter);

  // Aggregate by rating value (valid and invalid)
  const ratingAgg = await Message.aggregate([
    { $match: feedbackExistsFilter },
    {
      $group: {
        _id: '$feedback.rating',
        count: { $sum: 1 },
      },
    },
  ]);

  let thumbsUpCount = 0;
  let thumbsDownCount = 0;
  let unknownRatingCount = 0;

  // rating values as found in the DB (may include unexpected values)
  const ratingBreakdown = {};

  for (const bucket of ratingAgg) {
    const ratingVal = bucket._id;
    ratingBreakdown[ratingVal === null || ratingVal === undefined ? '(null/undefined)' : String(ratingVal)] = bucket.count;

    if (ratingVal === 'thumbsUp') {
      thumbsUpCount += bucket.count;
    } else if (ratingVal === 'thumbsDown') {
      thumbsDownCount += bucket.count;
    } else {
      unknownRatingCount += bucket.count;
    }
  }

  // Messages where feedback exists but rating is missing or not a valid enum value
  const malformedFilter = {
    ...baseFilter,
    feedback: { $exists: true, $ne: null },
    'feedback.rating': { $not: { $in: ['thumbsUp', 'thumbsDown'] } },
  };
  const malformedCount = await Message.countDocuments(malformedFilter);

  // Sample of malformed docs for inspection
  const malformedSamples = malformedCount > 0
    ? await Message.find(malformedFilter, {
        messageId: 1,
        conversationId: 1,
        user: 1,
        feedback: 1,
        createdAt: 1,
      }).limit(5).lean()
    : [];

  // ------------------------------------------------------------------
  // Query: ProductFeedback collection
  // ------------------------------------------------------------------

  const productFeedbackFilter = Object.keys(dateFilter).length > 0
    ? { createdAt: dateFilter }
    : {};

  const productFeedbackCount = await ProductFeedback.countDocuments(productFeedbackFilter);

  const productFeedbackByReason = await ProductFeedback.aggregate([
    { $match: productFeedbackFilter },
    {
      $group: {
        _id: { $ifNull: ['$feedback_reason', '(not set)'] },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // ------------------------------------------------------------------
  // Detect anomalies
  // ------------------------------------------------------------------

  const anomalies = [];

  if (malformedCount > 0) {
    anomalies.push({
      type: 'MALFORMED_FEEDBACK',
      description: `${malformedCount} message(s) have a feedback field but are missing a valid rating ('thumbsUp' or 'thumbsDown').`,
      count: malformedCount,
    });
  }

  if (unknownRatingCount > 0) {
    anomalies.push({
      type: 'UNKNOWN_RATING_VALUE',
      description: `${unknownRatingCount} message(s) have an unrecognised feedback.rating value.`,
      count: unknownRatingCount,
    });
  }

  if (withFeedbackCount !== thumbsUpCount + thumbsDownCount + malformedCount) {
    // Sanity check: counts should reconcile
    anomalies.push({
      type: 'COUNT_MISMATCH',
      description: 'Internal count reconciliation failed — total with feedback does not equal thumbsUp + thumbsDown + malformed.',
      detail: {
        withFeedbackCount,
        thumbsUpCount,
        thumbsDownCount,
        malformedCount,
        sum: thumbsUpCount + thumbsDownCount + malformedCount,
      },
    });
  }

  // ------------------------------------------------------------------
  // Compose results
  // ------------------------------------------------------------------

  return {
    queryFilters: {
      since: since ? since.toISOString() : null,
      until: until ? until.toISOString() : null,
    },
    messages: {
      totalScanned,
      withFeedback: withFeedbackCount,
      thumbsUp: thumbsUpCount,
      thumbsDown: thumbsDownCount,
      malformed: malformedCount,
      ratingBreakdown,
    },
    productFeedback: {
      total: productFeedbackCount,
      byReason: productFeedbackByReason.reduce((acc, b) => {
        acc[b._id] = b.count;
        return acc;
      }, {}),
    },
    anomalies,
    malformedSamples: malformedSamples.map((doc) => ({
      messageId: doc.messageId,
      conversationId: doc.conversationId,
      user: doc.user,
      feedback: doc.feedback,
      createdAt: doc.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function printTable(results) {
  const { queryFilters, messages, productFeedback, anomalies, malformedSamples } = results;

  const divider = '─'.repeat(60);

  console.log('\n' + divider);
  console.log(' LibreChat Feedback Audit Report');
  console.log(divider);

  if (queryFilters.since || queryFilters.until) {
    const parts = [];
    if (queryFilters.since) {
      parts.push(`since ${queryFilters.since}`);
    }
    if (queryFilters.until) {
      parts.push(`until ${queryFilters.until}`);
    }
    console.log(` Date filter : ${parts.join(' and ')}`);
    console.log(divider);
  }

  console.log('\n[Messages Collection]');
  console.log(`  Total messages scanned     : ${messages.totalScanned.toLocaleString()}`);
  console.log(`  Messages with feedback     : ${messages.withFeedback.toLocaleString()}`);
  console.log(`    thumbsUp                 : ${messages.thumbsUp.toLocaleString()}`);
  console.log(`    thumbsDown               : ${messages.thumbsDown.toLocaleString()}`);
  console.log(`    Malformed / no rating    : ${messages.malformed.toLocaleString()}`);

  if (Object.keys(messages.ratingBreakdown).length > 0) {
    console.log('\n  Rating value breakdown (raw stored values):');
    for (const [val, count] of Object.entries(messages.ratingBreakdown)) {
      console.log(`    "${val}" : ${count.toLocaleString()}`);
    }
  }

  console.log('\n[ProductFeedback Collection]');
  console.log(`  Total product feedback     : ${productFeedback.total.toLocaleString()}`);
  if (Object.keys(productFeedback.byReason).length > 0) {
    console.log('  By feedback_reason:');
    for (const [reason, count] of Object.entries(productFeedback.byReason)) {
      console.log(`    "${reason}" : ${count.toLocaleString()}`);
    }
  }

  console.log('\n[Anomalies]');
  if (anomalies.length === 0) {
    console.log('  No anomalies detected.');
  } else {
    for (const anomaly of anomalies) {
      console.log(`  [${anomaly.type}] ${anomaly.description}`);
      if (anomaly.detail) {
        console.log(`    Detail: ${JSON.stringify(anomaly.detail)}`);
      }
    }
  }

  if (malformedSamples.length > 0) {
    console.log('\n[Malformed Feedback Samples (up to 5)]');
    for (const doc of malformedSamples) {
      console.log(`  messageId    : ${doc.messageId}`);
      console.log(`  conversationId: ${doc.conversationId}`);
      console.log(`  feedback     : ${JSON.stringify(doc.feedback)}`);
      console.log(`  createdAt    : ${doc.createdAt}`);
      console.log('  ' + '·'.repeat(40));
    }
  }

  console.log('\n' + divider + '\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }

  const mongoUri = resolveMongoUri(opts.uri);
  if (!mongoUri) {
    console.error(
      'No MongoDB URI found. Provide one via --uri, the MONGO_URI environment variable, or a .env file in the project root.',
    );
    process.exit(1);
  }

  const since = opts.since ? parseDate(opts.since, '--since') : null;
  const until = opts.until ? parseDate(opts.until, '--until') : null;

  let results;
  try {
    results = await audit({ mongoUri, since, until });
  } catch (err) {
    console.error('Audit failed:', err.message);
    process.exit(1);
  } finally {
    // Always disconnect
    try {
      const mongoose = require('mongoose');
      await mongoose.disconnect();
    } catch (_) {
      // ignore disconnect errors
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printTable(results);
  }

  // Exit with a non-zero code when anomalies are detected so the script can
  // be used in CI pipelines or alerting workflows.
  if (results.anomalies.length > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
