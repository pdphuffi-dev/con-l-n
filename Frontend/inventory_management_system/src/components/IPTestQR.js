import React from 'react';
import { API_BASE_URL } from '../config';

const IPTestQR = () => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${API_BASE_URL}/my-ip`)}`;

  return (
    <div className="card mt-3">
      <div className="card-header">
        <h5 className="mb-0">📱 Test IP Detection</h5>
      </div>
      <div className="card-body text-center">
        <p>Scan this QR code from your mobile device to check IP detection:</p>
        <img 
          src={qrUrl} 
          alt="IP Test QR Code"
          className="border rounded"
          style={{ maxWidth: '150px' }}
        />
        <div className="mt-2">
          <small className="text-muted">
            QR Code URL: {API_BASE_URL}/my-ip
          </small>
        </div>
        <div className="mt-3">
          <a 
            href={`${API_BASE_URL}/my-ip`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-outline-primary btn-sm"
          >
            🔗 Open IP Test Page
          </a>
        </div>
      </div>
    </div>
  );
};

export default IPTestQR;