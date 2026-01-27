# Vercel Deployment Instructions

## 🚀 Quick Deploy

### Step 1: Test Build Local

```bash
cd Frontend/inventory_management_system
npm run test:build
```

### Step 2: Deploy to Vercel

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy preview (test)
npm run deploy:preview

# Deploy production
npm run deploy:vercel
```

## 🔧 Configuration Files

### vercel.json

- ✅ Framework: Create React App
- ✅ Build Command: `npm run build:vercel`
- ✅ Environment: `REACT_APP_USE_PRODUCTION=true`
- ✅ SPA routing support

### .vercelignore

- ✅ Excludes unnecessary files
- ✅ Reduces deployment size
- ✅ Faster builds

## 📋 Deployment Checklist

### Before Deploy:

- [ ] Test build locally: `npm run test:build`
- [ ] Verify API_BASE_URL in console
- [ ] Check all components work
- [ ] Test language switching

### After Deploy:

- [ ] Check deployment URL works
- [ ] Verify API calls go to production backend
- [ ] Test QR codes from mobile
- [ ] Test all features work

## 🛠️ Troubleshooting

### Build Fails

```bash
# Test local build first
npm run test:build

# Check for errors in:
# - Missing dependencies
# - Environment variables
# - Import/export issues
```

### API Not Working

1. Check CORS settings on backend
2. Verify Vercel domain in backend CORS
3. Check Network tab in DevTools

### Environment Variables

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Add: `REACT_APP_USE_PRODUCTION = true`
3. Redeploy after adding variables

## 📱 Domain Configuration

### Custom Domain (Optional)

1. Vercel Dashboard → Domains
2. Add your domain
3. Configure DNS records:
   ```
   Type: CNAME
   Name: www (or @)
   Value: cname.vercel-dns.com
   ```

## 🔍 Monitoring

### Check Deployment

- Vercel Dashboard → Deployments
- View build logs
- Monitor performance

### Analytics

- Enable Vercel Analytics
- Monitor page views
- Track performance metrics

---

## Commands Summary

```bash
# Local testing
npm run test:build

# Deploy preview
npm run deploy:preview

# Deploy production  
npm run deploy:vercel

# Check deployment
vercel ls

# View logs
vercel logs
```
