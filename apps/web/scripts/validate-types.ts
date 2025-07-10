#!/usr/bin/env tsx

/**
 * Type Validation Script
 * 
 * This script validates that Payload types are in sync with the collection definitions.
 * Run this in CI/CD to ensure types are always up-to-date.
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

async function validateTypes() {
  console.log('🔍 Validating Payload types are in sync...');
  
  const typesFile = './payload-types.ts';
  const backupFile = './payload-types.backup.ts';
  
  try {
    // Backup current types
    if (fs.existsSync(typesFile)) {
      fs.copyFileSync(typesFile, backupFile);
    }
    
    // Generate fresh types
    console.log('⚡ Generating fresh types...');
    execSync('payload generate:types', { stdio: 'inherit' });
    
    // Compare with backup
    if (fs.existsSync(backupFile)) {
      const originalContent = fs.readFileSync(backupFile, 'utf8');
      const newContent = fs.readFileSync(typesFile, 'utf8');
      
      if (originalContent !== newContent) {
        console.error('❌ Types are out of sync!');
        console.error('Run "pnpm payload:generate" to update types.');
        process.exit(1);
      }
    }
    
    console.log('✅ Types are in sync!');
    
    // Cleanup
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    
  } catch (error) {
    console.error('❌ Type validation failed:', error);
    
    // Restore backup if it exists
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, typesFile);
      fs.unlinkSync(backupFile);
    }
    
    process.exit(1);
  }
}

validateTypes();