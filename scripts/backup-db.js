#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'xspacefinance.db');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFilename = `xspacefinance-backup-${timestamp}.db`;
const backupPath = path.join(BACKUP_DIR, backupFilename);

async function backupDatabase() {
  console.log('💾 Starting database backup...');
  
  try {
    // Check if source database exists
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(`Database file not found: ${DB_PATH}`);
    }

    // Copy database file
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`✅ Database backed up to: ${backupPath}`);

    // Get file size
    const stats = fs.statSync(backupPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📦 Backup size: ${fileSizeMB} MB`);

    // Keep only last 30 backups
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('xspacefinance-backup-') && f.endsWith('.db'))
      .sort()
      .reverse();

    if (backups.length > 30) {
      const toDelete = backups.slice(30);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
        console.log(`🗑️ Deleted old backup: ${file}`);
      }
    }

    console.log('🎉 Backup completed successfully!');
    
    // Optional: Upload to cloud storage (S3, etc.)
    // await uploadToS3(backupPath);
    
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    process.exit(1);
  }
}

// Run backup
backupDatabase();