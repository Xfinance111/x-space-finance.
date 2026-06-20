const cron = require('node-cron');
const db = require('../config/database');
const forexService = require('./forexService');

class CronJobs {
  constructor() {
    this.jobs = [];
  }

  // Initialize all cron jobs
  init() {
    // Job 1: Daily ROI distribution (8:00 AM)
    this.jobs.push(
      cron.schedule('0 8 * * *', () => {
        this.distributeDailyROI();
      })
    );

    // Job 2: Mature investments (8:05 AM)
    this.jobs.push(
      cron.schedule('5 8 * * *', () => {
        this.matureInvestments();
      })
    );

    // Job 3: Referral bonus crediting (every hour)
    this.jobs.push(
      cron.schedule('0 * * * *', () => {
        this.creditReferralBonuses();
      })
    );

    // Job 4: Update forex rates cache (every 30 minutes)
    this.jobs.push(
      cron.schedule('*/30 * * * *', () => {
        this.refreshForexRates();
      })
    );

    // Job 5: Clean old activity logs (every Sunday at 2:00 AM)
    this.jobs.push(
      cron.schedule('0 2 * * 0', () => {
        this.cleanActivityLogs();
      })
    );

    // Job 6: Send daily balance summary emails (7:00 AM)
    this.jobs.push(
      cron.schedule('0 7 * * *', () => {
        this.sendDailySummaries();
      })
    );

    // Job 7: Check for inactive users (monthly)
    this.jobs.push(
      cron.schedule('0 3 1 * *', () => {
        this.checkInactiveUsers();
      })
    );

    console.log('✅ All cron jobs initialized');
  }

  // 1. Daily ROI distribution
  async distributeDailyROI() {
    console.log('📈 Running daily ROI distribution...', new Date().toISOString());
    
    try {
      // Get all active investments
      const investments = await db.all(`
        SELECT i.*, p.roi_percent, p.duration_days, p.interest_type
        FROM investments i
        JOIN plans p ON i.plan_id = p.id
        WHERE i.status = 'active' AND date(i.end_date) > date('now')
      `);

      for (const inv of investments) {
        // Calculate daily ROI
        let dailyProfit;
        if (inv.interest_type === 'compound') {
          // Compound interest: daily rate = (1 + annual_rate)^(1/365) - 1
          const monthlyRate = inv.roi_percent / 100;
          const dailyRate = Math.pow(1 + monthlyRate, 1 / 30) - 1;
          dailyProfit = inv.amount * dailyRate;
        } else {
          // Simple interest: daily profit = (total_roi / duration_days)
          const totalROI = inv.amount * (inv.roi_percent / 100) * (inv.duration_days / 30);
          dailyProfit = totalROI / inv.duration_days;
        }

        if (dailyProfit > 0) {
          // Add to user balance
          await db.run(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [dailyProfit, inv.user_id]
          );

          // Record transaction
          await db.run(`
            INSERT INTO transactions (user_id, type, amount, balance_after, description, created_at)
            VALUES (?, 'roi', ?, (
              SELECT balance FROM users WHERE id = ?
            ), ?, datetime('now'))
          `, [inv.user_id, dailyProfit, inv.user_id, `Daily ROI from ${inv.plan_id} investment`]);

          // Update investment current value (if you have that field)
          await db.run(
            'UPDATE investments SET current_value = current_value + ? WHERE id = ?',
            [dailyProfit, inv.id]
          );
        }
      }

      console.log(`✅ Distributed daily ROI to ${investments.length} investments`);
    } catch (error) {
      console.error('❌ Daily ROI distribution failed:', error);
    }
  }

  // 2. Mature investments
  async matureInvestments() {
    console.log('🔒 Maturing investments...', new Date().toISOString());
    
    try {
      const result = await db.run(`
        UPDATE investments 
        SET status = 'matured' 
        WHERE status = 'active' AND date(end_date) <= date('now')
      `);

      console.log(`✅ Matured ${result.changes || 0} investments`);
    } catch (error) {
      console.error('❌ Investment maturation failed:', error);
    }
  }

  // 3. Credit referral bonuses after 7 days
  async creditReferralBonuses() {
    console.log('💰 Crediting referral bonuses...', new Date().toISOString());
    
    try {
      const earnings = await db.all(`
        SELECT * FROM referral_earnings 
        WHERE status = 'pending' 
        AND julianday('now') - julianday(created_at) >= 7
      `);

      for (const earning of earnings) {
        // Credit to referrer
        await db.run(
          'UPDATE users SET balance = balance + ? WHERE id = ?',
          [earning.amount, earning.referrer_id]
        );

        // Mark as credited
        await db.run(
          'UPDATE referral_earnings SET status = "credited", credited_at = datetime("now") WHERE id = ?',
          [earning.id]
        );

        // Record transaction
        await db.run(`
          INSERT INTO transactions (user_id, type, amount, balance_after, description, created_at)
          VALUES (?, 'referral', ?, (
            SELECT balance FROM users WHERE id = ?
          ), ?, datetime('now'))
        `, [earning.referrer_id, earning.amount, earning.referrer_id, `Referral bonus from user #${earning.referred_id}`]);
      }

      console.log(`✅ Credited ${earnings.length} referral bonuses`);
    } catch (error) {
      console.error('❌ Referral bonus crediting failed:', error);
    }
  }

  // 4. Refresh forex rates cache
  async refreshForexRates() {
    console.log('💱 Refreshing forex rates...', new Date().toISOString());
    
    try {
      const rates = await forexService.getLatestRates('USD');
      console.log('✅ Forex rates updated:', rates.date);
    } catch (error) {
      console.error('❌ Forex refresh failed:', error);
    }
  }

  // 5. Clean old activity logs (keep last 90 days)
  async cleanActivityLogs() {
    console.log('🧹 Cleaning old activity logs...', new Date().toISOString());
    
    try {
      const result = await db.run(`
        DELETE FROM activity_log 
        WHERE created_at < datetime('now', '-90 days')
      `);
      
      console.log(`✅ Deleted ${result.changes || 0} old activity logs`);
    } catch (error) {
      console.error('❌ Log cleanup failed:', error);
    }
  }

  // 6. Send daily balance summary emails
  async sendDailySummaries() {
    console.log('📧 Sending daily summaries...', new Date().toISOString());
    
    try {
      // Get users who opted in for email notifications
      const users = await db.all(`
        SELECT id, email, first_name 
        FROM users 
        WHERE email_notifications = 1 AND is_banned = 0
      `);

      // This would integrate with your email service
      // For now, just log
      console.log(`📧 Would send summaries to ${users.length} users`);
    } catch (error) {
      console.error('❌ Summary emails failed:', error);
    }
  }

  // 7. Check inactive users (no login in 6 months)
  async checkInactiveUsers() {
    console.log('👤 Checking inactive users...', new Date().toISOString());
    
    try {
      const users = await db.all(`
        SELECT id, email, first_name, last_login 
        FROM users 
        WHERE last_login < datetime('now', '-6 months')
        AND is_banned = 0
      `);

      for (const user of users) {
        // Log inactivity
        await db.run(`
          INSERT INTO activity_log (user_id, action, ip, details, created_at)
          VALUES (?, 'inactive_check', 'system', ?, datetime('now'))
        `, [user.id, `No login for 6+ months (last: ${user.last_login})`]);
      }

      console.log(`✅ Checked ${users.length} inactive users`);
    } catch (error) {
      console.error('❌ Inactive user check failed:', error);
    }
  }

  // Stop all cron jobs
  stopAll() {
    this.jobs.forEach(job => job.stop());
    console.log('🛑 All cron jobs stopped');
  }
}

module.exports = new CronJobs();