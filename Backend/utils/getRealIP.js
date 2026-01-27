const getRealIP = (req) => {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.headers['x-client-ip'] ||
         req.headers['cf-connecting-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip ||
         '127.0.0.1';
};

const getClientInfo = (req) => {
  const ip = getRealIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const forwarded = req.headers['x-forwarded-for'] || '';
  
  return {
    ip: ip.split(',')[0].trim(),
    userAgent,
    forwarded,
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'x-client-ip': req.headers['x-client-ip'],
      'cf-connecting-ip': req.headers['cf-connecting-ip']
    }
  };
};

module.exports = { getRealIP, getClientInfo };