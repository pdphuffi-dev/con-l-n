import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import io from 'socket.io-client'
import { NETWORK_IP, API_PORT, API_BASE_URL, WS_URL } from '../config'
import { useLanguage } from '../contexts/LanguageContext'
import DeviceRegistration from './DeviceRegistration'

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

export default function Users() {

    const [userData, setUserData] = useState([]);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        getUsers();

        // Connect to Socket.IO server
        const newSocket = io(WS_URL);
        setSocket(newSocket);

        // Listen for user updates (when IP is captured)
        newSocket.on('userUpdated', (data) => {
            console.log('User updated via socket:', data);
            // Refresh user list when any user is updated
            getUsers();
        });

        // Cleanup on unmount
        return () => {
            newSocket.disconnect();
        };
    }, []);

    const getUsers = async (e) => {

        try {
            const res = await fetch(`${API_BASE_URL}/users`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            const data = await res.json();

            if (res.status === 201) {
                console.log("Users Retrieved.");
                setUserData(data);
            }
            else {
                console.log("Something went wrong. Please try again.");
            }
        } catch (err) {
            console.log(err);
        }
    }

    const deleteUser = async (id) => {

        const response = await fetch(`${API_BASE_URL}/deleteuser/${id}`, {
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
            console.log("User deleted");
            getUsers();
        }

    }

    return (
        <>

            <div className='container-fluid p-5'>
                <h1>Danh sách người dùng</h1>
                <div className='d-flex justify-content-between align-items-center mb-3'>
                    <div className='add_button'>
                        <NavLink to="/insertuser" className='btn btn-primary fs-5'> + Thêm người dùng mới</NavLink>
                    </div>
                    <button onClick={getUsers} className='btn btn-outline-secondary fs-6' title="Làm mới dữ liệu">
                        🔄 Làm mới
                    </button>
                </div>
                <div className="alert alert-info mb-3" style={{ fontSize: '14px' }}>
                    <strong>Hướng dẫn quét QR:</strong> Sử dụng camera điện thoại để quét mã QR và lưu IP thiết bị. Đảm bảo điện thoại cùng mạng với máy tính.
                    <br /><strong>Lưu ý:</strong> Nếu IP không đúng, hãy thay đổi NETWORK_IP trong code thành địa chỉ IP thực của máy bạn (ví dụ: 192.168.1.105).
                </div>
                <div className="overflow-auto mt-3" style={{ maxHeight: "40rem" }}>
                    <table className="table table-striped table-hover mt-3 fs-6" style={{ minWidth: '1000px' }}>
                        <thead>
                            <tr className="tr_color">
                                <th scope="col" style={{ textAlign: 'center' }}>STT</th>
                                <th scope="col" style={{ textAlign: 'center' }}>Ngày tạo</th>
                                <th scope="col" style={{ textAlign: 'center' }}>Tên người dùng</th>
                                <th scope="col" style={{ textAlign: 'center' }}>Mã số nhân viên</th>
                                <th scope="col" style={{ textAlign: 'center' }}>IP thiết bị</th>
                                <th scope="col" style={{ textAlign: 'center' }}>Lần đăng nhập cuối</th>
                                <th scope="col" style={{ textAlign: 'center' }}>QR Code</th>
                                {/* <th scope="col">Update</th>
                                <th scope="col">Delete</th> */}
                            </tr>
                        </thead>
                        <tbody>

                            {
                                userData.map((element, id) => {
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

                                    return (
                                        <>
                                            <tr>
                                                <th scope="row" style={{ textAlign: 'center' }}>{id + 1}</th>
                                                <td style={{ textAlign: 'center' }}>{formatDate(element.CreatedDate)}</td>
                                                <td style={{ textAlign: 'center' }}>{element.UserName}</td>
                                                <td style={{ textAlign: 'center' }}>{element.EmployeeCode}</td>
                                                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                                                    {element.DeviceIP || <span style={{ color: '#d61e1e' }}>Chưa có IP</span>}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>{formatDate(element.LastLoginDate)}</td>
                                                <td style={{ minWidth: '140px', textAlign: 'center', verticalAlign: 'middle' }}>
                                                    <QRCode
                                                        value={`${API_BASE_URL}/capture-user-ip/${element._id}`}
                                                        size={100}
                                                    />
                                                    <div style={{
                                                        fontSize: '11px',
                                                        marginTop: '8px',
                                                        color: '#495057',
                                                        fontWeight: '500',
                                                        lineHeight: '1.2'
                                                    }}>
                                                        Quét để lưu IP
                                                    </div>
                                                </td>

                                                {/* <td><NavLink to={`/updateuser/${element._id}`} className="btn btn-primary"><i className="fa-solid fa-pen-to-square"></i></NavLink></td>
                                                <td><button className="btn btn-danger" onClick={() => deleteUser(element._id)}><i class="fa-solid fa-trash"></i></button></td> */}

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