import React, { useState } from 'react'
import { NavLink } from 'react-router-dom';
import { API_BASE_URL, NETWORK_IP, API_PORT } from '../config';
import { useLanguage } from '../contexts/LanguageContext';
import api from '../utils/api';

// QR Code component (read-only) for mobile scanning
const ProductQRCode = ({ value, size = 150 }) => {
    // Convert localhost URLs to network IP for mobile scanning
    let networkValue = value;
    if (value.includes('localhost:3002')) {
        networkValue = value.replace('localhost:3002', `${NETWORK_IP}:${API_PORT}`);
    }

    // Encode URL for QR code
    const encodedValue = encodeURIComponent(networkValue);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedValue}`;

    return (
        <div style={{ textAlign: 'center', position: 'relative', margin: '20px 0' }}>
            <img
                src={qrUrl}
                alt="QR Code"
                style={{
                    width: size,
                    height: size,
                    border: '3px solid #007bff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 8px rgba(0,123,255,0.2)',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    opacity: '1',
                    filter: 'none'
                }}
                title={`📱 Quét từ camera điện thoại (IP: ${NETWORK_IP})`}
                draggable="false"
            />
            <div style={{
                fontSize: '12px',
                color: '#666',
                marginTop: '10px',
                textAlign: 'center'
            }}>
                IP: {NETWORK_IP}:{API_PORT}
            </div>
        </div>
    );
};

export default function InsertProduct() {
    const { t, currentLanguage } = useLanguage();
    const [quantity, setQuantity] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createdProducts, setCreatedProducts] = useState([]);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setCreatedProducts([]);

        const q = parseInt(quantity, 10);
        if (!Number.isFinite(q) || q < 1) {
            setError(t('validation.quantityRequired', 'Vui lòng nhập số lượng hợp lệ'));
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await api.post('/insertproduct', { qrQuantity: q });
            const data = response.data?.data || [];
            setCreatedProducts(Array.isArray(data) ? data : []);
        } catch (err) {
            const msg = err.response?.data?.message || t('messages.somethingWentWrong');
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className='container-fluid p-5'>
            <h1 className='text-center mb-4'>{t('main.addNewProduct')}</h1>

            <div className="row justify-content-center">
                <div className="col-12 col-md-7 col-lg-5">
                    <div className="card shadow-sm">
                        <div className="card-body">
                            <form onSubmit={handleSubmit}>
                                <div className="mb-3">
                                    <label className="form-label fw-semibold">
                                        {t('form.quantity', 'Số lượng')}
                                    </label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        min={1}
                                        max={200}
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        placeholder={t('form.quantity', 'Số lượng')}
                                    />
                                    <div className="form-text">
                                        {t('form.qrQuantityHintStable', 'Tạo N sản phẩm và N mã QR cố định (mỗi mã đi theo sản phẩm suốt quy trình).')}
                                    </div>
                                </div>

                                {error && (
                                    <div className="alert alert-danger py-2">{error}</div>
                                )}

                                <div className="d-flex gap-2">
                                    <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? t('common.loading') : t('form.submit', 'Gửi')}
                                    </button>
                                    {createdProducts.length > 0 && (
                                        <button className="btn btn-outline-secondary" type="button" onClick={handlePrint}>
                                            {t('common.print', 'In QR')}
                                        </button>
                                    )}
                                    <NavLink to="/products" className='btn btn-secondary ms-auto'>
                                        {t('common.goBack', 'Quay lại danh sách')}
                                    </NavLink>
                                </div>
                            </form>
                        </div>
                    </div>

                    {createdProducts.length > 0 && (
                        <div className="mt-4">
                            <h5 className="mb-3">{t('form.qrListTitle', 'Danh sách QR đã tạo')}</h5>
                            <div className="row g-3">
                                {createdProducts.map((p) => {
                                    const stableUrl = `${API_BASE_URL}/scan-product/${p._id}?lang=${currentLanguage}`;
                                    const label = p.qrCodeIndex && p.totalQRCodes
                                        ? `QR ${p.qrCodeIndex}/${p.totalQRCodes}`
                                        : (p.ProductBarcode || p._id);
                                    return (
                                        <div className="col-12 col-sm-6 col-lg-4" key={p._id}>
                                            <div className="card h-100">
                                                <div className="card-body text-center">
                                                    <ProductQRCode value={stableUrl} size={180} />
                                                    <div className="small fw-semibold">
                                                        {t('form.autoProductName', 'Sản phẩm mới')}
                                                    </div>
                                                    <div className="small text-muted">{label}</div>
                                                    <div className="small text-muted">
                                                        {t('form.scanToSetup', 'Quét để nhập tên + số hiệu lố')}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
