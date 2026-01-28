import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import io from 'socket.io-client'
import { NETWORK_IP, API_PORT, API_BASE_URL, WS_URL } from '../config'
import { useLanguage } from '../contexts/LanguageContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNotification } from '../hooks/useNotification'
import api from '../utils/api'
import Notification from './Notification'
import IPDebug from './IPDebug'
import IPTestQR from './IPTestQR'

// QR Code component using online service - Read only for mobile scanning
const QRCode = ({ value, size = 120 }) => {
    // Convert localhost URLs to network IP for mobile scanning
    let networkValue = value;
    if (value.includes('localhost:3002')) {
        networkValue = value.replace('localhost:3002', `${NETWORK_IP}:${API_PORT}`);
    }

    // Encode URL for QR code
    const encodedValue = encodeURIComponent(networkValue);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedValue}`;

    return (
        <div style={{ textAlign: 'center', position: 'relative' }}>
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
                    pointerEvents: 'none', // Prevent any click events
                    opacity: '1',
                    filter: 'none'
                }}
                title={`📱 Quét từ camera điện thoại (IP: ${NETWORK_IP})`}
                draggable="false"
            />
            {/* Invisible overlay to prevent any interaction */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: size,
                height: size,
                borderRadius: '8px',
                pointerEvents: 'none',
                backgroundColor: 'transparent'
            }} />
            {/* IP Address display */}
            <div style={{
                fontSize: '10px',
                color: '#666',
                marginTop: '5px',
                textAlign: 'center'
            }}>
                IP: {NETWORK_IP}:{API_PORT}
            </div>
        </div>
    );
};

export default function Products() {
    const { t, currentLanguage } = useLanguage();
    const { notification, showNotification, hideNotification } = useNotification();
    useDocumentTitle('nav.products', 'Sản phẩm');

    const [productData, setProductData] = useState([]);
    const [socket, setSocket] = useState(null);
    const [receivingProduct, setReceivingProduct] = useState(null);
    const [receivedQuantity, setReceivedQuantity] = useState("");

    useEffect(() => {
        getProducts();

        // Connect to Socket.IO server
        const newSocket = io(WS_URL);
        setSocket(newSocket);

        // Listen for product updates
        newSocket.on('productUpdated', (data) => {
            console.log('Product updated via socket:', data);
            // Refresh product list when any product is updated
            getProducts();
        });

        // Listen for language changes to refresh data
        const handleLanguageChange = () => {
            getProducts();
        };

        window.addEventListener('languageChanged', handleLanguageChange);

        // Cleanup on unmount
        return () => {
            newSocket.disconnect();
            window.removeEventListener('languageChanged', handleLanguageChange);
        };
    }, []);

    const getProducts = async (e) => {
        try {
            const response = await api.get('/products');

            if (response.status === 201) {
                // Handle both old format (direct array) and new format (with message)
                const data = response.data.data || response.data;
                setProductData(data);

                // Show backend success message if available
                if (response.data.message) {
                    showNotification(response.data.message, 'success');
                }
            }
        } catch (err) {
            console.error('Error fetching products:', err);

            // Show backend error message if available, otherwise show generic message
            const errorMessage = err.response?.data?.message || t('messages.somethingWentWrong');
            showNotification(errorMessage, 'error');
        }
    }

    const deleteProduct = async (id) => {
        try {
            const response = await api.delete(`/deleteproduct/${id}`);
            
            // Show backend success message if available
            const successMessage = response.data.message || t('messages.productDeleted');
            showNotification(successMessage, 'success');
            
            getProducts();
        } catch (err) {
            console.error('Error deleting product:', err);
            
            // Show backend error message if available, otherwise show generic message
            const errorMessage = err.response?.data?.message || t('messages.error');
            showNotification(errorMessage, 'error');
        }
    }

    return (
        <>
            <Notification
                notification={notification}
                onClose={hideNotification}
            />

            <div className='container-fluid p-5'>
                <h1 className="main-title" style={{ textAlign: 'center' }}>
                  {t('main.title')}
                </h1>
                <div className='d-flex justify-content-between align-items-center mb-3'>
                    <div className='add_button'>
                        <NavLink to="/insertproduct" className='btn btn-primary fs-5'>
                          + {t('main.addNewProduct')}
                        </NavLink>
                    </div>
                    <button onClick={getProducts} className='btn btn-outline-secondary fs-6' title={t('main.refresh')}>
                        🔄 {t('main.refresh')}
                    </button>
                </div>
                <div className="alert alert-info mb-3" style={{ fontSize: '14px' }}>
                    <strong>{t('main.qrInstructions')}</strong>
                    <br /><strong>{t('main.ipNote')}</strong>
                </div>
                <div className="overflow-auto mt-3" style={{ maxHeight: "40rem" }}>
                    <table className="table table-striped table-hover mt-3 fs-6" style={{ minWidth: '1800px' }}>
                        <thead>
                            <tr className="tr_color">
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.stt')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.createdDate')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.productName')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.lotNumber')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.deliveryInfo')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.receivedInfo')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.assemblingInfo')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.warehousingInfo')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.updatedDate')}</th>
                                <th scope="col" style={{ textAlign: 'center' }}>{t('table.qrCode')}</th>
                            </tr>
                        </thead>
                        <tbody>

                            {
                                productData.map((element, id) => {
                                    // Format date function
                                    const formatDate = (dateString) => {
                                        if (!dateString) return '-';
                                        const date = new Date(dateString);
                                        return date.toLocaleString('vi-VN', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit'
                                        });
                                    };

                                    // Determine QR code content based on workflow
                                    const getQRContent = () => {
                                        if (!element.ProductDeliveryDate) {
                                            // Step 1: Delivery
                                            return {
                                                url: `${API_BASE_URL}/deliver-product/${element._id}?lang=${currentLanguage}`,
                                                label: t('table.scanToDelivery')
                                            };
                                        } else if (!element.ProductReceivedDate) {
                                            // Step 2: Receive
                                            return {
                                                url: `${API_BASE_URL}/receive-product/${element._id}?lang=${currentLanguage}`,
                                                label: t('table.scanToReceive')
                                            };
                                        } else if (!element.ProductAssemblingDate) {
                                            // Step 3: Assembling
                                            return {
                                                url: `${API_BASE_URL}/assemble-product/${element._id}?lang=${currentLanguage}`,
                                                label: t('table.scanToAssemble')
                                            };
                                        } else if (!element.ProductWarehousingDate) {
                                            // Step 4: Warehousing
                                            return {
                                                url: `${API_BASE_URL}/warehouse-product/${element._id}?lang=${currentLanguage}`,
                                                label: t('table.scanToWarehouse')
                                            };
                                        }
                                        return null; // Workflow completed
                                    };

                                    const qrContent = getQRContent();

                                    return (
                                        <>
                                            <tr>
                                                <th scope="row" style={{ textAlign: 'center' }}>{id + 1}</th>
                                                <td style={{ textAlign: 'center' }}>{formatDate(element.ProductCreatedDate)}</td>
                                                <td style={{ textAlign: 'center' }}>{element.ProductName}</td>
                                                <td style={{ textAlign: 'center' }}>{element.ProductBarcode}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div>{element.ShippingQuantity || '-'}</div>
                                                    <div>{formatDate(element.ProductDeliveryDate)}</div>
                                                    <div style={{ fontSize: '12px', marginTop: '5px', maxWidth: '120px', margin: '5px auto 0' }}>
                                                    {element.DeliveryScannedBy ? (
                                                        <span style={{ color: '#28a745', fontWeight: '500' }}>
                                                            {element.DeliveryScannedBy}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#6c757d' }}>{t('table.notScanned')}</span>
                                                    )}
                                                    </div>
                                                </td>
                                                {/* <td style={{ textAlign: 'center' }}>
                                                    {element.ShippingQuantity || '-'}
                                                </td> */}
                                                <td style={{ textAlign: 'center' }}>
                                                    <div>{element.ReceivedQuantity || '-'}</div>
                                                    <div>{formatDate(element.ProductReceivedDate)}</div>
                                                    <div style={{ fontSize: '12px', marginTop: '5px', maxWidth: '120px', margin: '5px auto 0' }}>
                                                    {element.ReceivedScannedBy ? (
                                                        <span style={{ color: '#0737e3', fontWeight: '500' }}>
                                                            {element.ReceivedScannedBy}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#6c757d' }}>{t('table.notScanned')}</span>
                                                    )}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div>{element.AssemblingQuantity || '-'}</div>
                                                    <div>{formatDate(element.ProductAssemblingDate)}</div>
                                                    <div style={{ fontSize: '12px', marginTop: '5px', maxWidth: '120px', margin: '5px auto 0' }}>
                                                    {element.AssemblingScannedBy ? (
                                                        <span style={{ color: '#ffc107', fontWeight: '500' }}>
                                                            {element.AssemblingScannedBy}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#6c757d' }}>{t('table.notScanned')}</span>
                                                    )}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div>{element.WarehousingQuantity || '-'}</div>
                                                    <div>{formatDate(element.ProductWarehousingDate)}</div>
                                                    <div style={{ fontSize: '12px', marginTop: '5px', maxWidth: '120px', margin: '5px auto 0' }}>
                                                    {element.WarehousingScannedBy ? (
                                                        <span style={{ color: '#6f42c1', fontWeight: '500' }}>
                                                            {element.WarehousingScannedBy}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#6c757d' }}>{t('table.notScanned')}</span>
                                                    )}
                                                    </div>
                                                </td>
                                                {/* <td style={{ textAlign: 'center' }}>
                                                    {element.ReceivedQuantity || '-'}
                                                </td> */}
                                                <td style={{ textAlign: 'center' }}>{formatDate(element.ProductUpdatedDate)}</td>
                                                <td style={{ minWidth: '140px', textAlign: 'center', verticalAlign: 'middle' }}>
                                                    {qrContent ? (
                                                        <div>
                                                            <QRCode
                                                                value={qrContent.url}
                                                                size={100}
                                                            />
                                                            <div style={{
                                                                fontSize: '11px',
                                                                marginTop: '8px',
                                                                color: '#495057',
                                                                fontWeight: '500',
                                                                lineHeight: '1.2'
                                                            }}>
                                                                {qrContent.label}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ padding: '20px' }}>
                                                            <span style={{
                                                                color: '#28a745',
                                                                fontSize: '24px',
                                                                fontWeight: 'bold'
                                                            }}>✓</span>
                                                            <div style={{
                                                                fontSize: '12px',
                                                                color: '#28a745',
                                                                marginTop: '5px',
                                                                fontWeight: '500'
                                                            }}>
                                                                    {t('table.completed')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* <td><NavLink to={`/updateproduct/${element._id}`} className="btn btn-primary"><i className="fa-solid fa-pen-to-square"></i></NavLink></td>
                                                <td><button className="btn btn-danger" onClick={() => deleteProduct(element._id)}><i class="fa-solid fa-trash"></i></button></td> */}

                                            </tr>
                                        </>
                                    )
                                })
                            }

                        </tbody>
                    </table>
                </div>

                {/* {process.env.NODE_ENV === 'development' && (
                    <div className="row">
                        <div className="col-md-8">
                            <IPDebug />
                        </div>
                        <div className="col-md-4">
                            <IPTestQR />
                        </div>
                    </div>
                )} */}

            </div>

        </>
    )
}
