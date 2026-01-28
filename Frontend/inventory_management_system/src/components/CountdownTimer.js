import React, { useState, useEffect } from 'react';

const CountdownTimer = ({
  duration = 30,
  onComplete,
  onSkip,
  label = "Công đoạn tiếp theo",
  buttonText = "Bỏ qua đếm ngược"
}) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsRunning(false);
          onComplete && onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, timeLeft, onComplete]);

  const handleSkip = () => {
    setIsRunning(false);
    onSkip && onSkip();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = ((duration - timeLeft) / duration) * 100;

  return (
    <div className="countdown-timer" style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '30px',
      borderRadius: '15px',
      textAlign: 'center',
      zIndex: 9999,
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      minWidth: '350px'
    }}>
      <div style={{ fontSize: '18px', marginBottom: '15px', fontWeight: 'bold' }}>
        {label}
      </div>

      {/* Progress Circle */}
      <div style={{
        position: 'relative',
        width: '120px',
        height: '120px',
        margin: '0 auto 20px'
      }}>
        {/* Background circle */}
        <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke="#333"
            strokeWidth="8"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke="#28a745"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${2 * Math.PI * 50}`}
            strokeDashoffset={`${2 * Math.PI * 50 * (1 - progressPercent / 100)}`}
            style={{
              transition: 'stroke-dashoffset 1s linear'
            }}
          />
        </svg>

        {/* Time display */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#28a745'
        }}>
          {formatTime(timeLeft)}
        </div>
      </div>

      <div style={{
        fontSize: '14px',
        marginBottom: '20px',
        opacity: 0.8
      }}>
        Tự động chuyển sau {timeLeft} giây
      </div>

      <button
        onClick={handleSkip}
        className="btn btn-outline-light"
        style={{
          padding: '10px 20px',
          fontSize: '14px'
        }}
      >
        {buttonText}
      </button>

      <div style={{
        fontSize: '12px',
        marginTop: '10px',
        opacity: 0.6
      }}>
        Hoặc quét QR để chuyển ngay
      </div>
    </div>
  );
};

export default CountdownTimer;