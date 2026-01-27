#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing build process...\n');

async function testBuild() {
  console.log('📋 Current environment files:');
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
  
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}:`);
      const content = fs.readFileSync(file, 'utf8');
      console.log(`   ${content.trim()}`);
    } else {
      console.log(`❌ ${file}: Not found`);
    }
  }
  
  console.log('\n🔧 Testing build with production settings...');
  
  return new Promise((resolve, reject) => {
    const build = spawn('node', ['build-vercel.js'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        REACT_APP_USE_PRODUCTION: 'true'
      }
    });

    build.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Build test successful!');
        
        const buildDir = path.join(__dirname, 'build');
        if (fs.existsSync(buildDir)) {
          console.log('📁 Build directory created successfully');
          
          const indexHtml = path.join(buildDir, 'index.html');
          if (fs.existsSync(indexHtml)) {
            console.log('📄 index.html generated successfully');
          }
        }
        
        resolve();
      } else {
        console.log('\n❌ Build test failed with code:', code);
        reject(new Error(`Build failed with code ${code}`));
      }
    });
  });
}

testBuild().catch(console.error);