import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const IPDebug = () => {
  const [ipInfo, setIpInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkIP = async () => {
    setLoading(true);
    try {
      const response = await api.get('/debug-ip');
      setIpInfo(response.data);
    } catch (error) {
      console.error('Error checking IP:', error);
      setIpInfo({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkIP();
  }, []);

  if (loading) {
    return (
      <div className="alert alert-info">
        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
        Checking IP...
      </div>
    );
  }

  return (
    <div className="card mt-3">
      <div className="card-header">
        <h5 className="mb-0">🔍 IP Debug Information</h5>
      </div>
      <div className="card-body">
        {ipInfo ? (
          <div>
            <div className="row">
              <div className="col-md-6">
                <h6>Detected IP:</h6>
                <code className="bg-light p-2 rounded d-block">
                  {ipInfo.detectedIP}
                </code>
              </div>
              <div className="col-md-6">
                <h6>Language:</h6>
                <code className="bg-light p-2 rounded d-block">
                  {ipInfo.language}
                </code>
              </div>
            </div>
            
            {ipInfo.clientInfo && (
              <div className="mt-3">
                <h6>Headers Info:</h6>
                <pre className="bg-light p-3 rounded small">
                  {JSON.stringify(ipInfo.clientInfo.headers, null, 2)}
                </pre>
                
                <h6>User Agent:</h6>
                <small className="text-muted">
                  {ipInfo.clientInfo.userAgent}
                </small>
              </div>
            )}
            
            {ipInfo.error && (
              <div className="alert alert-danger mt-3">
                Error: {ipInfo.error}
              </div>
            )}
          </div>
        ) : (
          <div className="alert alert-warning">
            No IP information available
          </div>
        )}
        
        <button 
          className="btn btn-primary btn-sm mt-3" 
          onClick={checkIP}
          disabled={loading}
        >
          🔄 Refresh IP Info
        </button>
      </div>
    </div>
  );
};

export default IPDebug;