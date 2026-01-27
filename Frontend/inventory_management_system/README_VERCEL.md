# Vercel Deployment Guide

## Quick Deploy

### Option 1: Vercel CLI (Recommended)
```bash
cd Frontend/inventory_management_system

# Install Vercel CLI (if not installed)
npm install -g vercel

# Login
vercel login

# Deploy preview
npm run deploy:preview

# Deploy production
npm run deploy:vercel
```

### Option 2: Git Integration
1. Push code to GitHub/GitLab
2. Go to [vercel.com](https://vercel.com)
3. Import repository
4. Configure settings (see below)

## Vercel Configuration

### Build Settings
- **Framework Preset**: Create React App
- **Build Command**: `npm run build`
- **Output Directory**: `build`
- **Install Command**: `npm install`
- **Root Directory**: `Frontend/inventory_management_system` (if deploying from monorepo)

### Environment Variables
Add in Vercel Dashboard → Settings → Environment Variables:
```
REACT_APP_USE_PRODUCTION = true
```

## Project Structure

```
Frontend/inventory_management_system/
├── vercel.json          # Vercel configuration
├── .vercelignore        # Files to ignore
├── package.json         # Build scripts
├── src/
│   ├── config.js        # API configuration
│   └── ...
└── build/               # Output directory
```

## Troubleshooting

### Build Fails
1. **Check build logs** in Vercel Dashboard
2. **Test local build**:
   ```bash
   REACT_APP_USE_PRODUCTION=true npm run build
   ```
3. **Common issues**:
   - Missing dependencies
   - Environment variables not set
   - Build script errors

### API Not Working
1. **Check API Status** indicator in app
2. **Verify CORS** on backend for Vercel domain
3. **Check Network tab** in browser DevTools

### Environment Variables Not Loading
1. **Redeploy** after adding env vars
2. **Check spelling** of variable names
3. **Ensure** variables start with `REACT_APP_`

## Deployment URLs

### Automatic URLs
- **Production**: `https://your-project.vercel.app`
- **Preview**: `https://your-project-git-branch.vercel.app`

### Custom Domain
1. Vercel Dashboard → Domains
2. Add your domain
3. Configure DNS

## Performance Optimization

### Automatic by Vercel
- ✅ CDN distribution
- ✅ HTTPS/SSL
- ✅ Compression (gzip/brotli)
- ✅ Image optimization
- ✅ Static asset caching

### Manual Optimizations
- Bundle analysis: `npm run build -- --analyze`
- Code splitting already enabled in React
- Service worker for offline support

## Monitoring

### Vercel Analytics
- Enable in Dashboard → Analytics
- Monitor performance metrics
- Track user behavior

### Error Monitoring
- Check Function Logs
- Monitor build times
- Track deployment frequency

---

**Next Steps:**
1. Fix any build errors locally first
2. Deploy preview to test
3. Deploy to production when ready