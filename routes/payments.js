// routes/payments.js — ESM
import express from 'express';
const router = express.Router();

router.post('/checkout', (req, res) => {
  res.json({ ok: true, note: 'Stripe integration pending' });
});

export default router;
