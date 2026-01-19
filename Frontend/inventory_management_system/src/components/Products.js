import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

// Get network IP for QR codes (change this to your machine's IP)
const NETWORK_IP = '192.168.0.104'; // Change this to your actual IP address
const API_PORT = 3001;

// QR Code component using online service - Read only for mobile scanning
const QRCode = ({ value, size = 120 }) => {
    // Convert localhost URLs to network IP for mobile scanning
    let networkValue = value;
    if (value.includes('localhost:3001')) {
        networkValue = value.replace('localhost:3001', `${NETWORK_IP}:${API_PORT}`);
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

    useEffect(() => {
        getProducts();
    }, [])

    const [productData, setProductData] = useState([]);

    const getProducts = async (e) => {

        try {
            const res = await fetch("http://localhost:3001/products", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            const data = await res.json();

            if (res.status === 201) {
                console.log("Data Retrieved.");
                setProductData(data);
            }
            else {
                console.log("Something went wrong. Please try again.");
            }
        } catch (err) {
            console.log(err);
        }
    }

    const deleteProduct = async (id) => {

        const response = await fetch(`http://localhost:3001/deleteproduct/${id}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const deletedata = await response.json();
        console.log(deletedata);

        if (response.status === 422 || !deletedata) {
            console.log("Error");
        } else {
            console.log("Product deleted");
            getProducts();
        }

    }

    return (
        <>


            <div className='container-fluid p-5'>
                <h1>Danh sách mặt hàng</h1>
                <div className='d-flex justify-content-between align-items-center mb-3'>
                    <div className='add_button'>
                        <NavLink to="/insertproduct" className='btn btn-primary fs-5'> + Thêm mặt hàng mới</NavLink>
                    </div>
                    <button onClick={getProducts} className='btn btn-outline-secondary fs-6' title="Làm mới dữ liệu">
                        🔄 Làm mới
                    </button>
                </div>
                <div className="alert alert-info mb-3" style={{ fontSize: '14px' }}>
                    <strong>Hướng dẫn quét QR:</strong> Chỉ sử dụng camera điện thoại để quét QR code và cập nhật ngày giao/nhận tự động. Đảm bảo điện thoại cùng mạng với máy tính. Quy trình: Ngày giao → Ngày nhận → Hoàn thành.
                    <br /><strong>Lưu ý:</strong> Nếu IP không đúng, hãy thay đổi NETWORK_IP trong code thành địa chỉ IP thực của máy bạn (ví dụ: 192.168.1.105).
                </div>
                <div className="overflow-auto mt-3" style={{ maxHeight: "40rem" }}>
                    <table className="table table-striped table-hover mt-3 fs-6" style={{ minWidth: '1400px' }}>
                        <thead>
                            <tr className="tr_color">
                                <th scope="col">#</th>
                                <th scope="col">Ngày tạo</th>
                                <th scope="col">Tên hàng</th>
                                <th scope="col">Số hiệu lố</th>
                                <th scope="col">Ngày giao</th>
                                <th scope="col">Ngày nhận</th>
                                <th scope="col">Ngày cập nhật</th>
                                {/* <th scope="col">Người quét giao</th> */}
                                {/* <th scope="col">Người quét nhận</th> */}
                                <th scope="col">QR Code</th>
                                {/* <th scope="col">Update</th>
                                <th scope="col">Delete</th> */}
                            </tr>
                        </thead>
                        <tbody>

                            {
                                productData.map((element, id) => {
                                    // Format date function
                                    const formatDate = (dateString) => {
                                        if (!dateString) return '-';
                                        const date = new Date(dateString);
                                        return date.toLocaleDateString('vi-VN');
                                    };

                                    // Determine QR code content
                                    const getQRContent = () => {
                                        if (!element.ProductDeliveryDate) {
                                            // Show delivery QR if no delivery date
                                            return {
                                                url: `http://localhost:3001/update-delivery/${element._id}`,
                                                label: 'Quét để cập nhật ngày giao'
                                            };
                                        } else if (!element.ProductReceivedDate) {
                                            // Show received QR if delivery date exists but no received date
                                            return {
                                                url: `http://localhost:3001/update-received/${element._id}`,
                                                label: 'Quét để cập nhật ngày nhận'
                                            };
                                        }
                                        return null; // No QR needed
                                    };

                                    const qrContent = getQRContent();

                                    return (
                                        <>
                                            <tr>
                                                <th scope="row">{id + 1}</th>
                                                <td>{formatDate(element.ProductCreatedDate)}</td>
                                                <td>{element.ProductName}</td>
                                                <td>{element.ProductBarcode}</td>
                                                <td>
                                                    {formatDate(element.ProductDeliveryDate)}
                                                    <div style={{ fontSize: '12px', maxWidth: '120px' }}>
                                                    {element.DeliveryScannedBy ? (
                                                        <span style={{ color: '#28a745', fontWeight: '500' }}>
                                                            {element.DeliveryScannedBy}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#6c757d' }}>Chưa quét</span>
                                                    )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {formatDate(element.ProductReceivedDate)}
                                                    <div style={{ fontSize: '12px', maxWidth: '120px' }}>
                                                    {element.ReceivedScannedBy ? (
                                                        <span style={{ color: '#007bff', fontWeight: '500' }}>
                                                            {element.ReceivedScannedBy}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#6c757d' }}>Chưa quét</span>
                                                    )}
                                                    </div>
                                                </td>
                                                <td>{formatDate(element.ProductUpdatedDate)}</td>
                                                <td style={{ minWidth: '140px' }}>
                                                    {qrContent ? (
                                                        <div style={{ textAlign: 'center' }}>
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
                                                        <div style={{ textAlign: 'center', padding: '20px' }}>
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
                                                                Hoàn thành
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

            </div>

        </>
    )
}
