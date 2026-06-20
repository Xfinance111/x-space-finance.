const express = require('express');
const router = express.Router();
const db = require('../config/database');
const forexService = require('../services/forexService');
const { rateLimits } = require('../config/rateLimiter');
const { isAuthenticated, isAdmin, logActivity } = require('../middleware/security');

// ==================== APPLY RATE LIMITERS ====================
// Base generous limit on all API routes
router.use(rateLimits.generous);

// ==================== PUBLIC API ENDPOINTS ====================

// Get live forex rates
router.get('/forex/rates', rateLimits.moderate, async (req, res) => {
  try {
    const base = req.query.base || 'USD';
    const rates = await forexService.getLatestRates(base);
    res.json({
      success: true,
      data: rates,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Forex API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch forex rates' });
  }
});

// Get major forex pairs
router.get('/forex/pairs', rateLimits.public, async (req, res) => {
  try {
    const pairs = await forexService.getMajorPairs();
    res.json({
      success: true,
      data: pairs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Forex pairs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch forex pairs' });
  }
});

// Convert currency
router.get('/forex/convert', rateLimits.strict, async (req, res) => {
  try {
    const { amount, from, to } = req.query;
    
    if (!amount || !from || !to) {
      return res.status(400).json({ success: false, error: 'Missing required parameters: amount, from, to' });
    }
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive number' });
    }
    
    if (parsedAmount > 10000000) {
      return res.status(400).json({ success: false, error: 'Amount exceeds maximum limit' });
    }
    
    const converted = await forexService.convert(parsedAmount, from.toUpperCase(), to.toUpperCase());
    const rate = await forexService.getLatestRates(from.toUpperCase());
    const exchangeRate = rate.rates?.[to.toUpperCase()] || null;
    
    res.json({
      success: true,
      data: {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        amount: parsedAmount,
        converted: converted,
        rate: exchangeRate,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Convert error:', error);
    res.status(500).json({ success: false, error: 'Conversion failed' });
  }
});

// Get all active investment plans
router.get('/plans', rateLimits.public, async (req, res) => {
  try {
    const plans = await db.all(`
      SELECT id, name, duration_days, roi_percent, interest_type, 
             min_amount, max_amount, is_active
      FROM plans 
      WHERE is_active = 1 
      ORDER BY duration_days ASC
    `);
    
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Plans API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

// Get platform stats
router.get('/stats', rateLimits.public, async (req, res) => {
  try {
    // Cache stats for 5 minutes to reduce database load
    const cacheKey = 'platform_stats';
    const cached = global.statsCache;
    
    if (cached && Date.now() - cached.time < 300000) {
      return res.json({ success: true, data: cached.data, cached: true });
    }
    
    const totalUsers = await db.get('SELECT COUNT(*) as count FROM users WHERE is_banned = 0');
    const totalInvested = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM investments WHERE status = "active"');
    const totalPaid = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type IN ("roi", "profit")');
    
    const statsData = {
      total_users: totalUsers?.count || 0,
      total_invested: Number(totalInvested?.total || 0),
      total_paid: Number(totalPaid?.total || 0),
      active_plans: 4
    };
    
    global.statsCache = { data: statsData, time: Date.now() };
    
    res.json({
      success: true,
      data: statsData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// ==================== AUTHENTICATED API ENDPOINTS ====================

// Get user dashboard data
router.get('/user/dashboard', isAuthenticated, rateLimits.moderate, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const user = await db.get('SELECT balance, currency FROM users WHERE id = ?', [userId]);
    
    const activeInvestments = await db.all(`
      SELECT i.*, p.name as plan_name, p.roi_percent, p.interest_type
      FROM investments i
      JOIN plans p ON i.plan_id = p.id
      WHERE i.user_id = ? AND i.status = 'active'
    `, [userId]);
    
    const pendingDeposits = await db.all(`
      SELECT * FROM deposits 
      WHERE user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 5
    `, [userId]);
    
    const pendingWithdrawals = await db.all(`
      SELECT * FROM withdrawals 
      WHERE user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 5
    `, [userId]);
    
    const recentTransactions = await db.all(`
      SELECT * FROM transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);
    
    res.json({
      success: true,
      data: {
        balance: user?.balance || 0,
        currency: user?.currency || 'USD',
        active_investments: activeInvestments,
        pending_deposits: pendingDeposits,
        pending_withdrawals: pendingWithdrawals,
        recent_transactions: recentTransactions
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('User dashboard API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// Get user investment performance chart data
router.get('/user/performance', isAuthenticated, rateLimits.moderate, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const roiHistory = await db.all(`
      SELECT date(created_at) as date, SUM(amount) as total
      FROM transactions
      WHERE user_id = ? AND type = 'roi'
      AND created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `, [userId]);
    
    const investments = await db.all(`
      SELECT amount, COALESCE(current_value, amount) as current_value, start_date, end_date
      FROM investments
      WHERE user_id = ? AND status = 'active'
    `, [userId]);
    
    res.json({
      success: true,
      data: {
        roi_history: roiHistory,
        total_invested: investments.reduce((sum, inv) => sum + inv.amount, 0),
        total_current: investments.reduce((sum, inv) => sum + inv.current_value, 0),
        active_investments_count: investments.length
      }
    });
  } catch (error) {
    console.error('Performance API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch performance data' });
  }
});

// Get user referral stats
router.get('/user/referrals', isAuthenticated, rateLimits.moderate, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const referrals = await db.all(`
      SELECT id, first_name, last_name, email, created_at
      FROM users
      WHERE referred_by = (SELECT referral_code FROM users WHERE id = ?)
      LIMIT 50
    `, [userId]);
    
    const earnings = await db.all(`
      SELECT * FROM referral_earnings
      WHERE referrer_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `, [userId]);
    
    const totalEarned = earnings.reduce((sum, e) => sum + e.amount, 0);
    const pendingEarned = earnings.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);
    
    const user = await db.get('SELECT referral_code FROM users WHERE id = ?', [userId]);
    
    res.json({
      success: true,
      data: {
        referrals: referrals,
        total_referrals: referrals.length,
        total_earned: totalEarned,
        pending_earned: pendingEarned,
        referral_code: user?.referral_code,
        earnings_history: earnings.slice(0, 20)
      }
    });
  } catch (error) {
    console.error('Referral API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch referral data' });
  }
});

// ==================== ADMIN API ENDPOINTS ====================

// Get platform analytics (admin only)
router.get('/admin/analytics', isAuthenticated, isAdmin, rateLimits.strict, async (req, res) => {
  try {
    const userGrowth = await db.all(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);
    
    const depositVolume = await db.all(`
      SELECT date(created_at) as date, COALESCE(SUM(amount), 0) as total
      FROM deposits
      WHERE status = 'approved' AND created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);
    
    const withdrawalVolume = await db.all(`
      SELECT date(created_at) as date, COALESCE(SUM(amount), 0) as total
      FROM withdrawals
      WHERE status = 'completed' AND created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);
    
    const roiPaid = await db.all(`
      SELECT date(created_at) as date, COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE type = 'roi' AND created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);
    
    await logActivity(req, 'Admin accessed analytics API');
    
    res.json({
      success: true,
      data: {
        user_growth: userGrowth,
        deposit_volume: depositVolume,
        withdrawal_volume: withdrawalVolume,
        roi_paid: roiPaid
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// Get all users with filters (admin only)
router.get('/admin/users', isAuthenticated, isAdmin, rateLimits.strict, async (req, res) => {
  try {
    const { search, kyc_status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit > 100 || parsedLimit < 1) {
      return res.status(400).json({ success: false, error: 'Limit must be between 1 and 100' });
    }
    
    let query = `
      SELECT id, first_name, last_name, email, balance, currency, 
             kyc_status, is_admin, is_banned, created_at, last_login
      FROM users
      WHERE 1=1
    `;
    const params = [];
    
    if (search && search.trim()) {
      query += ` AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (kyc_status && kyc_status !== 'all') {
      query += ` AND kyc_status = ?`;
      params.push(kyc_status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parsedLimit, offset);
    
    const users = await db.all(query, params);
    
    let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
    const countParams = [];
    
    if (search && search.trim()) {
      countQuery += ` AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (kyc_status && kyc_status !== 'all') {
      countQuery += ` AND kyc_status = ?`;
      countParams.push(kyc_status);
    }
    
    const total = await db.get(countQuery, countParams);
    
    await logActivity(req, `Admin accessed users API (page ${page})`);
    
    res.json({
      success: true,
      data: {
        users: users,
        pagination: {
          page: parseInt(page),
          limit: parsedLimit,
          total: total?.total || 0,
          pages: Math.ceil((total?.total || 0) / parsedLimit)
        }
      }
    });
  } catch (error) {
    console.error('Admin users API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    version: process.version
  });
});

// ==================== RATE LIMITER ERROR HANDLER ====================
router.use((err, req, res, next) => {
  if (err.code === 'ER_TOO_MANY_REQUESTS' || (err.message && err.message.includes('rate limit'))) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: 60
    });
  }
  next(err);
});

// ==================== CHAT ====================
router.post('/chat/send', async (req, res) => {
  try {
    const { name, email, topic, message, sender } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // ✅ Use '?' placeholders – the helper converts them to '$1' for PostgreSQL
    await db.run(
      `INSERT INTO chat_messages (name, email, topic, message, sender, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [name || null, email || null, topic || null, message, sender || 'user']
    );

    let reply = '';
    switch (topic) {
      case 'investment':
        reply = 'Thank you for your investment inquiry. Please check our plans page.';
        break;
      case 'platform':
        reply = 'Our platform offers fixed-duration plans with transparent returns.';
        break;
      case 'account':
        reply = 'Account setup is easy! Visit the signup page to create your account.';
        break;
      case 'security':
        reply = 'We take security seriously. Visit our security page for details.';
        break;
      default:
        reply = 'Thank you for your message. Our team will respond shortly.';
    }

    // Save bot reply
    await db.run(
      `INSERT INTO chat_messages (name, email, topic, message, sender, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ['XSpaceBot', null, topic, reply, 'bot']
    );

    res.json({ success: true, reply });

  } catch (error) {
    console.error('Chat save error:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

module.exports = router;