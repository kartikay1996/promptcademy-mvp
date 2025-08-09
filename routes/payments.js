const express = require('express'); const router = express.Router();
// TODO: integrate Stripe
router.post('/checkout', (req,res)=> res.json({ ok:true, note:'Stripe integration pending' }));
module.exports = router;