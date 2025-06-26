const crypto = require('crypto');
const logger = require('../utils/logger');
const { catchAsync } = require('./errorHandler');

/**
 * Middleware to verify the HMAC-SHA256 signature of webhooks from the Evolution API.
 */
const verifyEvolutionSignature = catchAsync(async (req, res, next) => {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;

  if (!secret) {
    logger.error('EVOLUTION_WEBHOOK_SECRET is not set. Webhook cannot be secured.');
    return res.status(500).send('Webhook secret is not configured on the server.');
  }

  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    logger.warn('Received webhook without x-hub-signature-256 header.');
    return res.status(403).send('Forbidden: No signature provided.');
  }

  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    return res.status(403).send('Forbidden: Invalid signature format.');
  }

  const receivedHash = signatureParts[1];

  const calculatedHash = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');

  if (calculatedHash !== receivedHash) {
    logger.warn('Invalid webhook signature.', { received: receivedHash, calculated: calculatedHash });
    return res.status(403).send('Forbidden: Invalid signature.');
  }

  next();
});

module.exports = {
  verifyEvolutionSignature,
}; 