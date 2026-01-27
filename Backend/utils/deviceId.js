const crypto = require('crypto');
const { getRealIP } = require('./getRealIP');

const generateDeviceId = (req) => {
  const ip = getRealIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  const fingerprint = `${ip}-${userAgent}-${acceptLanguage}-${acceptEncoding}`;
  
  return crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .substring(0, 16);
};

const getDeviceInfo = (req) => {
  const ip = getRealIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const deviceId = generateDeviceId(req);
  
  const deviceInfo = {
    deviceId,
    ip,
    userAgent,
    timestamp: new Date(),
    browser: getBrowserInfo(userAgent),
    os: getOSInfo(userAgent)
  };
  
  return deviceInfo;
};

const getBrowserInfo = (userAgent) => {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
};

const getOSInfo = (userAgent) => {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  return 'Unknown';
};

const isValidDeviceId = (deviceId) => {
  return deviceId && typeof deviceId === 'string' && deviceId.length === 16;
};

module.exports = {
  generateDeviceId,
  getDeviceInfo,
  getBrowserInfo,
  getOSInfo,
  isValidDeviceId
};