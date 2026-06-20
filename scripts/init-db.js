#!/usr/bin/env node

require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/database');

async function initDatabase() {
  console.log('🚀 Starting database initialization...\n');

  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to database');

    // Run migrations
    await db.migrate();
    console.log('✅ Migrations completed');

    // Seed default data
    await db.seed();
    console.log('✅ Seed data inserted');

    // Create admin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@xspacefinance.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    
    const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', [adminEmail]);
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const referralCode = 'ADMIN' + crypto.randomBytes(4).toString('hex').toUpperCase();
      
      await db.run(`
        INSERT INTO users (
          first_name, last_name, email, password, country, currency, 
          is_admin, email_verified, referral_code, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, ['Admin', 'User', adminEmail, hashedPassword, 'US', 'USD', 1, 1, referralCode]);
      
      console.log('✅ Admin user created:', adminEmail);
      console.log('   Password:', adminPassword);
    } else {
      console.log('✅ Admin user already exists');
    }

    // Verify tables were created
    const tables = [
      'users', 'plans', 'investments', 'deposits', 
      'withdrawals', 'transactions', 'referral_earnings', 
      'activity_log', 'notifications', 'login_attempts', 'settings'
    ];

    console.log('\n📊 Verifying database tables:');
    for (const table of tables) {
      const count = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ✅ ${table}: ${count.count} records`);
    }

    console.log('\n🎉 Database initialization completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run: npm start');
    console.log('   2. Visit: http://localhost:3000');
    console.log('   3. Login with admin credentials above');
    console.log('   4. Complete your site configuration\n');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the initialization
initDatabase();