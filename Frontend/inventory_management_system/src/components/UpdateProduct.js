import React, { useEffect, useState } from 'react'
import { NavLink, useParams, useNavigate } from 'react-router-dom';

export default function UpdateProduct() {
    const [productName, setProductName] = useState("");
    const [productBarcode, setProductBarcode] = useState();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate("");

    const setName = (e) => {
        setProductName(e.target.value);
      };

      const setBarcode = (e) => {
        const value = e.target.value.slice(0, 12);
        setProductBarcode(value);
    };

    const {id} = useParams("");

    useEffect(() => {
        const getProduct = async () => {
          try {
            const res = await fetch(`http://localhost:3001/products/${id}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json"
              }
            });
      
            const data = await res.json();
      
            if (res.status === 201) {
              console.log("Data Retrieved.");
              setProductName(data.ProductName);
              setProductBarcode(data.ProductBarcode);
            } else {
              console.log("Something went wrong. Please try again.");
            }
          } catch (err) {
            console.log(err);
          }
        };
      
        getProduct();
    }, [id]);

    const updateProduct = async (e) => {
        e.preventDefault();

        if (!productName || !productBarcode) {
            setError("*Làm ơn nhập đầy đủ thông tin.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await fetch(`http://localhost:3001/updateproduct/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ "ProductName": productName, "ProductBarcode": productBarcode })
            });

            await response.json();

            if (response.status === 201) {
                alert("Data Updated");
                navigate('/products');
            }
            else {
                setError("Something went wrong. Please try again.");
            }
        } catch (err) {
            setError("An error occurred. Please try again later.");
            console.log(err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className='container-fluid p-5'>
             <h1 className='text-center mb-5'>Cập nhật thông tin sản phẩm</h1>

            <div className="mt-4 row justify-content-center">
                <div className="col-lg-5 col-md-5 col-12 fs-4 mb-4">
                    <label htmlFor="product_name" className="form-label fw-bold">Tên hàng</label>
                    <input type="text" onChange={setName} value={productName} className="form-control fs-5" id="product_name" placeholder="Nhập tên hàng" required />
                </div>
                <div className="col-lg-5 col-md-5 col-12 fs-4 mb-4">
                    <label htmlFor="product_barcode" className="form-label fw-bold">Số hiệu lố</label>
                    <input type="number" onChange={setBarcode} value={productBarcode} maxLength={12} className="form-control fs-5" id="product_barcode" placeholder="Nhập số hiệu lố" required />
                </div>
            </div>

            <div className='d-flex justify-content-center mt-4'>
                <NavLink to="/products" className='btn btn-secondary me-4 fs-4 px-4 py-2'>Huỷ bỏ</NavLink>
                <button type="submit" onClick={updateProduct} className="btn btn-primary fs-4 px-4 py-2" disabled={loading}>
                    {loading ? 'Đang cập nhật...' : 'Cập nhật'}
                </button>
            </div>

            <div className="text-center mt-4">
                {error && <div className="text-danger fs-5 fw-bold">{error}</div>}
            </div>
        </div>
    )
}
