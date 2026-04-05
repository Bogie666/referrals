const express = require('express');
const router  = express.Router();

const MAIN_SITE = 'https://lexairconditioning.com/referral';

router.get('/', (req, res) => {
  const slug = req.query.r ? '?r=' + req.query.r : '';
  res.redirect(301, MAIN_SITE + slug);
});

module.exports = router;
