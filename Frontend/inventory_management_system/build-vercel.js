#!/usr/bin/env node

process.env.REACT_APP_USE_PRODUCTION = 'true';

const { spawn } = require('child_process');

console.log('🚀 Building for Vercel with production settings...');
console.log('Environment variables:');
console.log('  REACT_APP_USE_PRODUCTION:', process.env.REACT_APP_USE_PRODUCTION);

const build = spawn('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    REACT_APP_USE_PRODUCTION: 'true'
  }
});

build.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Build completed successfully');
  } else {
    console.log('❌ Build failed with code:', code);
    process.exit(code);
  }
});