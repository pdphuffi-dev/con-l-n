const { t } = require('../translations');

const generateHTML = (language, templateType, data = {}) => {
  const translate = (key, fallback) => t(language, key, fallback);

  const baseStyles = `
    <style>
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 20px;
        background-color: #f8f9fa;
        max-width: 400px;
        margin: 0 auto;
      }
      .container {
        background: white;
        padding: 30px;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }
      .form-group {
        margin-bottom: 20px;
        text-align: left;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: bold;
        color: #333;
      }
      input {
        width: 100%;
        padding: 12px;
        border: 2px solid #ddd;
        border-radius: 5px;
        font-size: 16px;
        box-sizing: border-box;
      }
      input:focus {
        border-color: #007bff;
        outline: none;
      }
      .button {
        background-color: #007bff;
        color: white;
        padding: 12px 24px;
        border: none;
        border-radius: 5px;
        font-size: 16px;
        cursor: pointer;
        width: 100%;
        margin-top: 10px;
      }
      .button:hover {
        background-color: #0056b3;
      }
      .button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
      }
      .success { color: #28a745; font-size: 20px; margin-bottom: 15px; }
      .error { color: #dc3545; font-size: 14px; margin-top: 10px; }
      .product-info {
        background-color: #e9ecef;
        padding: 15px;
        border-radius: 5px;
        margin-bottom: 20px;
        font-size: 14px;
      }
    </style>
  `;

  switch (templateType) {
    case 'deliveryForm':
      return `
        <html>
          <head>
            <title>${translate('deliveryQuantity')} - ${data.productName}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${baseStyles}
          </head>
          <body>
            <div class="container">
              <div class="success">🚛</div>
              <h2>${translate('form.deliveryQuantity')}</h2>
              <div class="product-info">
                <strong>${data.productName}</strong><br>
                ${translate('table.lotNumber')}: ${data.productBarcode}
              </div>
              <form id="deliverForm">
                <div class="form-group">
                  <label for="quantity">${translate('form.deliveryQuantity')}:</label>
                  <input type="number" id="quantity" name="quantity" min="0" required placeholder="${translate('form.deliveryQuantity')}">
                </div>
                <button type="submit" class="button" id="submitBtn">${translate('form.submit')}</button>
              </form>
              <div id="message"></div>
            </div>
            <script>
              const form = document.getElementById('deliverForm');
              const submitBtn = document.getElementById('submitBtn');
              const messageDiv = document.getElementById('message');

              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const quantity = document.getElementById('quantity').value;

                if (!quantity || quantity < 0) {
                  messageDiv.innerHTML = '<div class="error">${translate('validation.quantityRequired')}</div>';
                  return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = '${translate('common.loading')}';

                try {
                  const response = await fetch('/update-delivery/${data.productId}?quantity=' + quantity, {
                    method: 'GET'
                  });

                  if (response.ok) {
                    messageDiv.innerHTML = '<div style="color: #28a745; font-size: 16px; margin-top: 15px;">✅ ${translate('success.productDelivered')}</div>';
                    setTimeout(() => {
                      window.close();
                    }, 2000);
                  } else {
                    throw new Error('${translate('error.serverError')}');
                  }
                } catch (error) {
                  messageDiv.innerHTML = '<div class="error">${translate('error.serverError')}</div>';
                  submitBtn.disabled = false;
                  submitBtn.textContent = '${translate('form.submit')}';
                }
              });
            </script>
          </body>
        </html>
      `;

    case 'receiveForm':
      return `
        <html>
          <head>
            <title>${translate('form.receivedQuantity')} - ${data.productName}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${baseStyles}
          </head>
          <body>
            <div class="container">
              <div class="success">📦</div>
              <h2>${translate('form.receivedQuantity')}</h2>
              <div class="product-info">
                <strong>${data.productName}</strong><br>
                ${translate('table.lotNumber')}: ${data.productBarcode}<br>
                ${translate('form.deliveryQuantity')}: ${data.shippingQuantity || translate('common.noData')}
              </div>
              <form id="receiveForm">
                <div class="form-group">
                  <label for="quantity">${translate('form.receivedQuantity')}:</label>
                  <input type="number" id="quantity" name="quantity" min="0" required placeholder="${translate('form.receivedQuantity')}">
                </div>
                <button type="submit" class="button" id="submitBtn">${translate('form.submit')}</button>
              </form>
              <div id="message"></div>
            </div>
            <script>
              const form = document.getElementById('receiveForm');
              const submitBtn = document.getElementById('submitBtn');
              const messageDiv = document.getElementById('message');

              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const quantity = document.getElementById('quantity').value;

                if (!quantity || quantity < 0) {
                  messageDiv.innerHTML = '<div class="error">${translate('validation.quantityRequired')}</div>';
                  return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = '${translate('common.loading')}';

                try {
                  const response = await fetch(window.location.origin + '/update-received/${data.productId}?quantity=' + quantity, {
                    method: 'GET'
                  });

                  if (response.ok) {
                    messageDiv.innerHTML = '<div style="color: #28a745; font-size: 16px; margin-top: 15px;">✅ ${translate('success.productReceived')}</div>';
                    setTimeout(() => {
                      window.close();
                    }, 2000);
                  } else {
                    throw new Error('${translate('error.serverError')}');
                  }
                } catch (error) {
                  messageDiv.innerHTML = '<div class="error">${translate('error.serverError')}</div>';
                  submitBtn.disabled = false;
                  submitBtn.textContent = '${translate('form.submit')}';
                }
              });
            </script>
          </body>
        </html>
      `;

    case 'successPage':
      return `
        <html>
          <head>
            <title>${translate('common.success')}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f0f8ff;
              }
              .success {
                color: #28a745;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .message {
                font-size: 18px;
                color: #333;
                margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="success">✅</div>
            <div class="message">${data.message}</div>
            ${data.userInfo || ''}
          </body>
        </html>
      `;

    case 'createProductForm':
      return `
        <html>
          <head>
            <title>${translate('main.addNewProduct')}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${baseStyles}
            <style>
              body {
                background-color: #eff4ef;
              }
              .logo {
                color: #007bff;
                font-size: 24px;
                margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">📦</div>
              <h2>${translate('main.addNewProduct')}</h2>
              <form id="createProductForm">
                <div class="form-group">
                  <label for="productName">${translate('form.productName')}:</label>
                  <input type="text" id="productName" name="productName" required placeholder="${translate('form.productName')}">
                </div>
                <div class="form-group">
                  <label for="productBarcode">${translate('form.lotNumber')}:</label>
                  <input type="text" id="productBarcode" name="productBarcode" required placeholder="${translate('form.lotNumber')}" maxlength="20">
                </div>
                <button type="submit" class="button" id="submitBtn">${translate('form.submit')}</button>
              </form>
              <div id="message"></div>
            </div>

            <script>
              const form = document.getElementById('createProductForm');
              const submitBtn = document.getElementById('submitBtn');
              const messageDiv = document.getElementById('message');

              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const productName = document.getElementById('productName').value.trim();
                const productBarcode = document.getElementById('productBarcode').value.trim();

                if (!productName || !productBarcode) {
                  messageDiv.innerHTML = '<div class="error">${translate('validation.allFieldsRequired')}</div>';
                  return;
                }

                if (productBarcode.length > 20) {
                  messageDiv.innerHTML = '<div class="error">${translate('validation.lotNumberTooLong')}</div>';
                  return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = '${translate('common.loading')}';

                try {
                  const response = await fetch('/insertproduct', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Accept-Language': '${language}',
                      'X-Language': '${language}'
                    },
                    body: JSON.stringify({
                      ProductName: productName,
                      ProductBarcode: productBarcode
                    })
                  });

                  const data = await response.json();

                  if (response.status === 201) {
                    const successMessage = data.message || '${translate('success.productCreated')}';
                    messageDiv.innerHTML = '<div style="color: #28a745; font-size: 16px; margin-top: 15px;">✅ ' + successMessage + '</div>';
                    form.reset();
                    setTimeout(() => {
                      window.close();
                    }, 2000);
                  } else if (response.status === 422) {
                    const errorMessage = data.message || '${translate('error.duplicateEntry')}';
                    messageDiv.innerHTML = '<div class="error">' + errorMessage + '</div>';
                  } else {
                    const errorMessage = data.message || '${translate('error.serverError')}';
                    messageDiv.innerHTML = '<div class="error">' + errorMessage + '</div>';
                  }
                } catch (error) {
                  messageDiv.innerHTML = '<div class="error">${translate('error.serverError')}</div>';
                } finally {
                  submitBtn.disabled = false;
                  submitBtn.textContent = '${translate('form.submit')}';
                }
              });
            </script>
          </body>
        </html>
      `;

    case 'deviceRegistrationForm':
      return `
        <html>
          <head>
            <title>${translate('users.addNewUser')}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${baseStyles}
            <style>
              body {
                background-color: #e3f2fd;
              }
              .device-info {
                background-color: #f1f8e9;
                padding: 15px;
                border-radius: 5px;
                margin-bottom: 20px;
                font-size: 12px;
                font-family: monospace;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">👤</div>
              <h2>${translate('users.addNewUser')}</h2>
              
              <div class="device-info">
                <strong>Device ID:</strong> ${data.deviceId}<br>
                <strong>IP:</strong> ${data.ip}<br>
                <strong>Browser:</strong> ${data.browser}<br>
                <strong>OS:</strong> ${data.os}
              </div>
              
              <form id="registerForm">
                <div class="form-group">
                  <label for="userName">${translate('users.userName')}:</label>
                  <input type="text" id="userName" name="userName" required placeholder="${translate('users.userName')}">
                </div>
                <div class="form-group">
                  <label for="employeeCode">${translate('form.employeeCode', 'Mã nhân viên')}:</label>
                  <input type="text" id="employeeCode" name="employeeCode" required placeholder="${translate('form.employeeCode', 'Mã nhân viên')}">
                </div>
                <button type="submit" class="button" id="submitBtn">${translate('form.submit')}</button>
              </form>
              <div id="message"></div>
            </div>

            <script>
              const form = document.getElementById('registerForm');
              const submitBtn = document.getElementById('submitBtn');
              const messageDiv = document.getElementById('message');

              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const userName = document.getElementById('userName').value.trim();
                const employeeCode = document.getElementById('employeeCode').value.trim();

                if (!userName || !employeeCode) {
                  messageDiv.innerHTML = '<div class="error">${translate('validation.allFieldsRequired')}</div>';
                  return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = '${translate('common.loading')}';

                try {
                  const response = await fetch('/register-device', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Accept-Language': '${language}',
                      'X-Language': '${language}'
                    },
                    body: JSON.stringify({
                      userName: userName,
                      employeeCode: employeeCode
                    })
                  });

                  const data = await response.json();

                  if (response.ok) {
                    messageDiv.innerHTML = '<div style="color: #28a745; font-size: 16px; margin-top: 15px;">✅ ' + data.message + '</div>';
                    form.reset();
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  } else {
                    messageDiv.innerHTML = '<div class="error">' + data.message + '</div>';
                  }
                } catch (error) {
                  messageDiv.innerHTML = '<div class="error">${translate('error.serverError')}</div>';
                } finally {
                  submitBtn.disabled = false;
                  submitBtn.textContent = '${translate('form.submit')}';
                }
              });
            </script>
          </body>
        </html>
      `;

    case 'errorPage':
      return `
        <html>
          <head>
            <title>${translate('messages.error')}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #ffebee;
              }
              .error {
                color: #dc3545;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .message {
                font-size: 18px;
                color: #333;
                margin-bottom: 30px;
              }
            </style>
          </head>
          <body>
            <div class="error">❌</div>
            <div class="message">${data.message}</div>
          </body>
        </html>
      `;

    default:
      return `
        <html>
          <head>
            <title>Template not found</title>
            <meta charset="UTF-8">
          </head>
          <body>
            <h1>Template not found</h1>
          </body>
        </html>
      `;
  }
};

module.exports = { generateHTML };