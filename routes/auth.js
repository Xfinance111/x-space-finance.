const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../config/email');

// ==================== HELPERS ====================
async function ensureResetColumns() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN reset_token TEXT");
    await db.query("ALTER TABLE users ADD COLUMN reset_token_expiry TEXT");
    console.log('✅ Reset token columns ready');
  } catch (e) {
    // Silently ignore if columns already exist
    if (e.message && (e.message.includes('duplicate column name') || e.message.includes('already exists') || e.message.includes('42701'))) {
      // do nothing – columns already exist
    } else {
      console.warn('⚠️ Could not add reset columns:', e.message);
    }
  }
}
(async () => { await ensureResetColumns(); })();

// ==================== REGISTER ====================
router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Register', error: req.flash('error'), success: req.flash('success') });
});

router.post('/register', async (req, res) => {
  try {
    const { first_name, last_name, email, password, confirm, country, referral } = req.body;

    if (!first_name || !last_name || !email || !password) {
      req.flash('error', 'All fields are required');
      return res.redirect('/register');
    }
    if (password !== confirm) {
      req.flash('error', 'Passwords do not match');
      return res.redirect('/register');
    }
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.redirect('/register');
    }

    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      req.flash('error', 'Email already registered');
      return res.redirect('/register');
    }

    let currency = 'GBP';
    if (country === 'US') currency = 'USD';
    else if (country === 'CA') currency = 'CAD';

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const verifyToken = crypto.randomBytes(32).toString('hex');

    await db.query(
      `INSERT INTO users (first_name, last_name, email, password, country, currency, referral_code, email_verified, email_verify_token, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, NOW())`,
      [first_name, last_name, email, hashedPassword, country || 'UK', currency, referralCode, verifyToken]
    );

    try {
      await sendVerificationEmail(email, verifyToken);
    } catch (emailErr) {
      console.error('Email send error (non-critical):', emailErr.message);
    }

    req.flash('success', 'Account created! Please check your email to verify your account.');
    res.redirect('/signin');
  } catch (error) {
    console.error('Signup error:', error);
    req.flash('error', 'Failed to create account');
    res.redirect('/register');
  }
});

// ==================== SIGN IN ====================
router.get('/signin', (req, res) => {
  res.render('auth/signin', { title: 'Sign In', error: req.flash('error'), success: req.flash('success') });
});

// POST /signin – with debug logs and session.save()
router.post('/signin', async (req, res) => {
  console.log('🔍 [signin] POST received');
  console.log('Email:', req.body.email);
  try {
    const { email, password } = req.body;
    
    // PostgreSQL uses $1 not ?
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    console.log('User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/signin');
    }
    
    // Check if user is banned
    if (user.is_banned) {
      req.flash('error', 'Your account has been banned. Please contact support.');
      return res.redirect('/signin');
    }
    
    const valid = await bcrypt.compare(password, user.password);
    console.log('Password match:', valid);
    if (!valid) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/signin');
    }

    // Set session and explicitly save
    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;
    console.log('Session userId set to:', req.session.userId);

    // Save session explicitly to ensure it's persisted
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        req.flash('error', 'Login failed – session error');
        return res.redirect('/signin');
      }
      console.log('Session saved successfully');

      // Update last_login - PostgreSQL uses NOW()
      db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]).catch(() => {});

      // Log activity (ignore errors)
      db.query(
        `INSERT INTO activity_log (user_id, action, type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [user.id, 'login', 'auth', 'User logged in']
      ).catch(() => {});

      // Redirect based on admin status
      if (user.is_admin === 1) {
        console.log('Redirecting to /admin');
        return res.redirect('/admin');
      }

      console.log('Redirecting to /dashboard');
      res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Login failed: ' + error.message);
    res.redirect('/signin');
  }
});

// POST /login – alias for /signin (with same logic)
router.post('/login', async (req, res) => {
  console.log('🔍 [login] POST received');
  console.log('Email:', req.body.email);
  try {
    const { email, password } = req.body;
    
    // PostgreSQL uses $1 not ?
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    console.log('User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/signin');
    }
    
    // Check if user is banned
    if (user.is_banned) {
      req.flash('error', 'Your account has been banned. Please contact support.');
      return res.redirect('/signin');
    }
    
    const valid = await bcrypt.compare(password, user.password);
    console.log('Password match:', valid);
    if (!valid) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/signin');
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;
    console.log('Session userId set to:', req.session.userId);

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        req.flash('error', 'Login failed – session error');
        return res.redirect('/signin');
      }
      console.log('Session saved successfully');

      db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]).catch(() => {});
      db.query(
        `INSERT INTO activity_log (user_id, action, type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [user.id, 'login', 'auth', 'User logged in']
      ).catch(() => {});

      // Redirect based on admin status
      if (user.is_admin === 1) {
        console.log('Redirecting to /admin');
        return res.redirect('/admin');
      }

      console.log('Redirecting to /dashboard');
      res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Login failed: ' + error.message);
    res.redirect('/signin');
  }
});

// ==================== LOGOUT ====================
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/signin');
  });
});

// ==================== FORGOT PASSWORD ====================
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password', error: req.flash('error'), success: req.flash('success') });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      req.flash('error', 'Email is required');
      return res.redirect('/forgot-password');
    }
    const user = await db.get('SELECT id, email FROM users WHERE email = $1', [email]);
    if (!user) {
      req.flash('error', 'No account found with that email');
      return res.redirect('/forgot-password');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000).toISOString();
    await db.query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [token, expiry, user.id]);
    try {
      await sendResetPasswordEmail(email, token);
      req.flash('success', 'Password reset link sent to your email.');
    } catch (err) {
      console.error('Reset email error:', err);
      req.flash('error', 'Failed to send reset email');
    }
    res.redirect('/forgot-password');
  } catch (error) {
    console.error('Forgot password error:', error);
    req.flash('error', 'Failed to process request');
    res.redirect('/forgot-password');
  }
});

// ==================== RESET PASSWORD ====================
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.flash('error', 'Invalid reset token');
    return res.redirect('/forgot-password');
  }
  try {
    const user = await db.get('SELECT id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()', [token]);
    if (!user) {
      req.flash('error', 'Invalid or expired reset token');
      return res.redirect('/forgot-password');
    }
    res.render('auth/reset-password', { title: 'Reset Password', token, error: req.flash('error'), success: req.flash('success') });
  } catch (error) {
    console.error('Reset page error:', error);
    req.flash('error', 'Invalid reset link');
    res.redirect('/forgot-password');
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirm } = req.body;
    if (!token || !password) {
      req.flash('error', 'All fields are required');
      return res.redirect(`/reset-password?token=${token}`);
    }
    if (password !== confirm) {
      req.flash('error', 'Passwords do not match');
      return res.redirect(`/reset-password?token=${token}`);
    }
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.redirect(`/reset-password?token=${token}`);
    }
    const user = await db.get('SELECT id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()', [token]);
    if (!user) {
      req.flash('error', 'Invalid or expired reset token');
      return res.redirect('/forgot-password');
    }
    const hashed = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2', [hashed, user.id]);
    try {
      await db.query(
        `INSERT INTO activity_log (user_id, action, type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [user.id, 'password_reset', 'security', 'Password reset']
      );
    } catch (e) {}
    req.flash('success', 'Password reset successfully. Please sign in.');
    res.redirect('/signin');
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error', 'Failed to reset password');
    res.redirect('/forgot-password');
  }
});

// ==================== EMAIL VERIFICATION ====================
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      req.flash('error', 'Invalid verification token');
      return res.redirect('/signin');
    }
    const result = await db.query('UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE email_verify_token = $1 AND email_verified = 0', [token]);
    if (result.rowCount === 0) {
      req.flash('error', 'Token expired or already used');
    } else {
      req.flash('success', 'Email verified! You can now sign in.');
    }
    res.redirect('/signin');
  } catch (error) {
    console.error('Verification error:', error);
    req.flash('error', 'Verification failed');
    res.redirect('/signin');
  }
});

// ==================== PROFILE UPDATE ====================
router.post('/profile/update', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { first_name, last_name } = req.body;
    await db.query('UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3', [first_name, last_name, userId]);
    try {
      await db.query(
        `INSERT INTO activity_log (user_id, action, type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, 'profile_update', 'profile', 'Updated profile']
      );
    } catch (logError) { /* ignore */ }
    req.flash('success', 'Profile updated successfully');
    res.redirect('/dashboard/profile');
  } catch (error) {
    console.error('Profile update error:', error);
    req.flash('error', 'Failed to update profile');
    res.redirect('/dashboard/profile');
  }
});

module.exports = router;
