const nodemailer = require('nodemailer');
const db = require('../config/database');

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initEmail();
  }

  // Initialize email transporter
  initEmail() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log('✅ Email service initialized');
    } else {
      console.log('⚠️ Email service not configured - emails will be logged only');
    }
  }

  // Send email
  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      console.log(`📧 Email would be sent to ${to}: ${subject}`);
      console.log(`Body: ${text || html.substring(0, 200)}...`);
      return { success: true, simulated: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || `"${process.env.SITE_NAME || 'XSpaceFinance'}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text: text || html.replace(/<[^>]*>/g, ''),
        html,
      });
      console.log(`✅ Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email send failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Create in-app notification
  async createNotification(userId, title, message) {
    try {
      const result = await db.run(`
        INSERT INTO notifications (user_id, title, message, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `, [userId, title, message]);
      
      console.log(`🔔 Notification created for user ${userId}: ${title}`);
      return { success: true, id: result.lastID };
    } catch (error) {
      console.error('❌ Notification creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== SPECIFIC NOTIFICATIONS ====================

  // Welcome email (after registration)
  async sendWelcomeEmail(user) {
    const subject = `Welcome to ${process.env.SITE_NAME || 'XSpaceFinance'}!`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome ${user.first_name}!</h2>
        <p>Thank you for joining ${process.env.SITE_NAME || 'XSpaceFinance'}.</p>
        <p>Your account has been created successfully. Here's what you can do next:</p>
        <ul>
          <li>Complete your KYC verification to enable withdrawals</li>
          <li>Make your first deposit to start earning</li>
          <li>Explore our investment plans</li>
        </ul>
        <p>Your referral code: <strong style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${user.referral_code}</strong></p>
        <p>Share this code with friends and earn 20% of their first deposit!</p>
        <a href="${process.env.BASE_URL}/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Go to Dashboard</a>
        <hr style="margin: 24px 0; border-color: #e5e7eb;">
        <p style="font-size: 12px; color: #6b7280;">${process.env.BASE_URL}</p>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Welcome to XSpaceFinance!', 'Complete your KYC and make your first deposit to start earning.');
  }

  // Email verification
  async sendVerificationEmail(user, token) {
    const verifyUrl = `${process.env.BASE_URL}/verify-email?token=${token}`;
    const subject = 'Verify your email address';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Verify Your Email</h2>
        <p>Hi ${user.first_name},</p>
        <p>Please click the button below to verify your email address:</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">Verify Email</a>
        <p>Or copy this link: <span style="word-break: break-all;">${verifyUrl}</span></p>
        <p>This link expires in 24 hours.</p>
        <hr style="margin: 24px 0; border-color: #e5e7eb;">
        <p style="font-size: 12px; color: #6b7280;">If you didn't create an account, please ignore this email.</p>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
  }

  // Deposit notification
  async notifyDepositSubmitted(user, deposit) {
    const subject = `Deposit Submitted - ${deposit.amount} ${user.currency}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Deposit Submitted</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your deposit of <strong>${deposit.amount} ${user.currency}</strong> via ${deposit.method} has been submitted and is pending review.</p>
        <p>Our team will review your deposit within 24-48 hours.</p>
        <a href="${process.env.BASE_URL}/dashboard/deposits" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">View Deposit Status</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Deposit Submitted', `Your deposit of ${deposit.amount} ${user.currency} is pending review.`);
  }

  async notifyDepositApproved(user, deposit) {
    const subject = `Deposit Approved - ${deposit.amount} ${user.currency}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Deposit Approved!</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your deposit of <strong>${deposit.amount} ${user.currency}</strong> has been approved and credited to your account.</p>
        <p>Your new balance is <strong>${user.balance} ${user.currency}</strong>.</p>
        <a href="${process.env.BASE_URL}/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Go to Dashboard</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Deposit Approved', `Your deposit of ${deposit.amount} ${user.currency} has been approved.`);
  }

  async notifyDepositRejected(user, deposit, reason) {
    const subject = `Deposit Rejected - ${deposit.amount} ${user.currency}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Deposit Rejected</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your deposit of <strong>${deposit.amount} ${user.currency}</strong> has been rejected.</p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
        <p>Please submit a new deposit with correct information.</p>
        <a href="${process.env.BASE_URL}/dashboard/deposits" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Submit New Deposit</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Deposit Rejected', `Your deposit of ${deposit.amount} ${user.currency} was rejected.`);
  }

  // Withdrawal notifications
  async notifyWithdrawalSubmitted(user, withdrawal) {
    await this.createNotification(user.id, 'Withdrawal Submitted', `Your withdrawal request of ${withdrawal.amount} ${user.currency} is pending review.`);
  }

  async notifyWithdrawalCompleted(user, withdrawal) {
    const subject = `Withdrawal Completed - ${withdrawal.amount} ${user.currency}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Withdrawal Completed</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your withdrawal of <strong>${withdrawal.amount} ${user.currency}</strong> has been processed and sent to your ${withdrawal.method} wallet.</p>
        <p>Transaction hash: ${withdrawal.tx_hash || 'Processing'}</p>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Withdrawal Completed', `Your withdrawal of ${withdrawal.amount} ${user.currency} has been processed.`);
  }

  async notifyWithdrawalRejected(user, withdrawal, reason) {
    await this.createNotification(user.id, 'Withdrawal Rejected', `Your withdrawal of ${withdrawal.amount} ${user.currency} was rejected. Reason: ${reason || 'Not specified'}`);
  }

  // Investment notifications
  async notifyInvestmentCreated(user, investment, plan) {
    const subject = `Investment Created - ${plan.name} Plan`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Investment Created!</h2>
        <p>Hi ${user.first_name},</p>
        <p>You have successfully invested <strong>${investment.amount} ${user.currency}</strong> in the <strong>${plan.name}</strong> plan.</p>
        <p>Your investment will mature on ${new Date(investment.end_date).toLocaleDateString()}.</p>
        <a href="${process.env.BASE_URL}/dashboard/investments" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">View Your Investments</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Investment Created', `You invested ${investment.amount} ${user.currency} in the ${plan.name} plan.`);
  }

  async notifyInvestmentMatured(user, investment, plan) {
    const subject = `Investment Matured - ${plan.name} Plan`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Investment Matured!</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your ${plan.name} investment of ${investment.amount} ${user.currency} has matured.</p>
        <p>You can withdraw your funds or reinvest in a new plan.</p>
        <a href="${process.env.BASE_URL}/dashboard/withdrawals" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Withdraw Funds</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Investment Matured', `Your ${plan.name} investment has matured. You can now withdraw your funds.`);
  }

  // KYC notifications
  async notifyKYCSubmitted(user) {
    await this.createNotification(user.id, 'KYC Submitted', 'Your KYC documents have been submitted and are pending review.');
  }

  async notifyKYCApproved(user) {
    const subject = 'KYC Approved';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>KYC Approved!</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your identity verification has been approved. You can now make withdrawals.</p>
        <a href="${process.env.BASE_URL}/dashboard/withdrawals" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Request Withdrawal</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'KYC Approved', 'Your identity has been verified. You can now make withdrawals.');
  }

  async notifyKYCRejected(user, reason) {
    await this.createNotification(user.id, 'KYC Rejected', `Your KYC was rejected. Reason: ${reason || 'Please resubmit with clear documents'}`);
  }

  // Daily ROI summary
  async sendDailyROISummary(user, dailyProfit, totalBalance) {
    if (!user.email_notifications) return;
    
    const subject = `Daily ROI Summary - ${new Date().toLocaleDateString()}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Daily ROI Summary</h2>
        <p>Hi ${user.first_name},</p>
        <p>Today's earnings: <strong style="color: #10b981;">+${dailyProfit} ${user.currency}</strong></p>
        <p>Your current balance: <strong>${totalBalance} ${user.currency}</strong></p>
        <a href="${process.env.BASE_URL}/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">View Dashboard</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
  }

  // Referral bonus notification
  async notifyReferralBonus(user, amount, referredUser) {
    const subject = `Referral Bonus Credited - ${amount} ${user.currency}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Referral Bonus Credited!</h2>
        <p>Hi ${user.first_name},</p>
        <p>You've earned <strong style="color: #10b981;">${amount} ${user.currency}</strong> from your referral (${referredUser.email}).</p>
        <p>Share your referral code with more friends to earn more!</p>
        <a href="${process.env.BASE_URL}/dashboard/profile" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">View Referral Stats</a>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Referral Bonus Credited', `You earned ${amount} ${user.currency} from a referral.`);
  }

  // Security notifications
  async notifyLoginAlert(user, ip, device) {
    if (!user.email_notifications) return;
    
    const subject = 'New Login to Your Account';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Login Detected</h2>
        <p>Hi ${user.first_name},</p>
        <p>A new login was detected on your account:</p>
        <ul>
          <li>IP Address: ${ip}</li>
          <li>Device: ${device || 'Unknown'}</li>
          <li>Time: ${new Date().toLocaleString()}</li>
        </ul>
        <p>If this wasn't you, please contact support immediately.</p>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
  }

  async notifyPasswordChanged(user) {
    const subject = 'Password Changed';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Changed</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your account password was changed successfully.</p>
        <p>If you didn't make this change, please contact support immediately.</p>
      </div>
    `;
    
    await this.sendEmail(user.email, subject, html);
    await this.createNotification(user.id, 'Password Changed', 'Your account password was updated successfully.');
  }
}

module.exports = new NotificationService();