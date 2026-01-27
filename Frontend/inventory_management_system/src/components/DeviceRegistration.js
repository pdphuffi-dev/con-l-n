import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { API_BASE_URL } from '../config';

const DeviceRegistration = () => {
  const { t, currentLanguage } = useLanguage();
  
  const registrationUrl = `${API_BASE_URL}/register-device-form?lang=${currentLanguage}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(registrationUrl)}`;

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="mb-0">📱 {t('users.addNewUser')}</h5>
      </div>
      <div className="card-body text-center">
        <p className="mb-3">
          {t('users.deviceRegistrationInstructions', 'Quét QR code để đăng ký thiết bị mới với Device ID duy nhất')}
        </p>
        
        <img 
          src={qrUrl} 
          alt="Device Registration QR"
          className="border rounded mb-3"
          style={{ maxWidth: '200px' }}
        />
        
        <div className="alert alert-info">
          <small>
            <strong>Device ID</strong> được tạo từ IP + User Agent + Browser settings<br/>
            Đảm bảo mỗi thiết bị có ID duy nhất, không bị trùng lặp
          </small>
        </div>
        
        <div className="mt-3">
          <a 
            href={registrationUrl}
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-outline-primary btn-sm"
          >
            🔗 {t('common.open', 'Mở')} Registration Form
          </a>
        </div>
      </div>
    </div>
  );
};

export default DeviceRegistration;