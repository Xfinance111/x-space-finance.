// migrate.js – run this once to add the realized column
const db = require('./config/database');

(async () => {
  try {
    await db.run('ALTER TABLE users ADD COLUMN realized DECIMAL(15,2) DEFAULT 0');
    console.log('✅ Realized column added successfully');
  } catch (e) {
    if (e.message && (e.message.includes('duplicate column name') || e.message.includes('already exists'))) {
      console.log('✅ Column already exists');
    } else {
      console.error('❌ Error:', e.message);
    }
  }
  process.exit(0);
})();
