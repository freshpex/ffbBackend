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
router.post('/:id/transactions', ATMCardsController.createCardTransaction);
router.post('/:id/fund', ATMCardsController.fundCardFromBalance);
router.post('/:id/iterate', ATMCardsController.iterateVirtualCard);

export default router;
