const express = require('express');
const { body, validationResult } = require('express-validator');
const { catchAsync, validationErrorHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const webhookService = require('../services/webhookService');

const router = express.Router();

// It is highly recommended to implement webhook signature verification for security.
// The Evolution API should provide a secret key that you can use to validate the payload.
// See the previous version of this file for an example implementation of HMAC signature validation.

const evolutionWebhookValidation = [
  body('event').notEmpty().withMessage('Event type is required'),
  body('instance').notEmpty().withMessage('Instance name is required'),
  body('data').isObject().withMessage('Data must be an object')
];

/**
 * @swagger
 * /webhook/evolution:
 *   post:
 *     summary: Handles incoming webhooks from the Evolution API.
 *     description: This endpoint receives events from a configured Evolution API instance. It's designed to primarily handle incoming messages (`messages.upsert`).
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 example: messages.upsert
 *               instance:
 *                 type: string
 *                 example: my-instance
 *               data:
 *                 type: object
 *                 description: The webhook payload, which varies depending on the event.
 *     responses:
 *       '200':
 *         description: Webhook received and is being processed.
 *       '400':
 *         description: Bad request due to validation errors.
 *       '500':
 *         description: Internal server error during webhook processing.
 */
router.post('/evolution',
  evolutionWebhookValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    try {
      // Asynchronously process the message without making the webhook wait
      webhookService.processIncomingMessage(req.body).catch(err => {
        logger.error('Error processing webhook in background:', err);
      });

      // Immediately respond to the webhook to prevent timeouts
      res.status(200).json({
        status: 'success',
        message: 'Webhook received and is being processed.'
      });
    } catch (error) {
      logger.error('Failed to handle webhook:', error);
      // We send a 200 here to prevent the webhook provider from resending the same failed event.
      // The error is logged for internal review.
      res.status(200).json({
        status: 'error',
        message: 'Webhook received but failed to initiate processing.'
      });
    }
  })
);

module.exports = router;