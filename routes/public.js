const express = require('express');
const router = express.Router();

// Home page
router.get('/', (req, res) => {
  res.render('home', { title: 'XSpaceFinance' });
});

// About page
router.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

// Plans page
router.get('/plans', (req, res) => {
  res.render('plans', { title: 'Investment Plans' });
});

// Calculator page
router.get('/calculator', (req, res) => {
  res.render('calculator', { title: 'ROI Calculator' });
});

// Legal pages
router.get('/terms', (req, res) => {
  res.render('terms', { title: 'Terms of Service' });
});

router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
});

router.get('/risk', (req, res) => {
  res.render('risk', { title: 'Risk Disclosure' });
});

router.get('/cookies', (req, res) => {
  res.render('cookies', { title: 'Cookie Policy' });
});

// Also support hyphenated versions
router.get('/terms-of-service', (req, res) => {
  res.render('terms', { title: 'Terms of Service' });
});

router.get('/privacy-policy', (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
});

router.get('/risk-disclosure', (req, res) => {
  res.render('risk', { title: 'Risk Disclosure' });
});

router.get('/cookie-policy', (req, res) => {
  res.render('cookies', { title: 'Cookie Policy' });
});

module.exports = router;