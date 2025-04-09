import express from 'express';
import ATMCardsController from '../controllers/ATMCardsController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// User routes
router.get('/', ATMCardsController.getAllCards);
router.get('/:id', ATMCardsController.getCardById);
router.post('/request', ATMCardsController.requestCard);
router.post('/:id/cancel', ATMCardsController.cancelCardRequest);
router.post('/:id/freeze', ATMCardsController.freezeCard);
router.post('/:id/unfreeze', ATMCardsController.unfreezeCard);
router.put('/:id/limits', ATMCardsController.updateCardLimits);
router.get('/:id/transactions', ATMCardsController.getCardTransactions);

router.get('/admin/all', ATMCardsController.adminGetAllCards);
router.get('/admin/:id', ATMCardsController.adminGetCardById);
router.post('/admin/:id/approve', ATMCardsController.adminApproveCardRequest);
router.post('/admin/:id/reject', ATMCardsController.adminRejectCardRequest);
router.put('/admin/:id/status', ATMCardsController.adminUpdateCardStatus);

export default router;
