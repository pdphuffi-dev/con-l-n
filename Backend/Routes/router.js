const express = require('express');
const router = express.Router();
const products = require('../Models/Products');
const users = require('../Models/User');
const { generateHTML } = require('../utils/htmlTemplates');
const { getRealIP, getClientInfo } = require('../utils/getRealIP');
const { generateDeviceId, getDeviceInfo, isValidDeviceId } = require('../utils/deviceId');
const { validateWorkflowTiming, getNextWorkflowStep, updateWorkflowStatus } = require('../utils/workflowValidator');
const { WorkflowConfig } = require('../Models/WorkflowConfig');

router.post("/insertproduct", async (req, res) => {
    const { ProductName, ProductBarcode } = req.body;

    try {
        const pre = await products.findOne({ ProductBarcode: ProductBarcode })
        console.log(pre);

        if (pre) {
            res.status(422).json({ message: req.t('error.duplicateEntry') })
        }
        else {
            const addProduct = new products({
                ProductName,
                ProductBarcode,
                DeliveryScannedBy: null,
                ReceivedScannedBy: null
            })

            await addProduct.save();
            res.status(201).json({ message: req.t('success.productCreated'), data: addProduct })
            console.log(addProduct)
        }
    }
    catch (err) {
        console.log(err)
    }
})

router.get('/products', async (req, res) => {
    try {
        const { sortBy, order } = req.query;

        // Default sort: newest first
        let sortOptions = { ProductCreatedDate: -1 };

        // If sortBy is provided, use it
        if (sortBy) {
            const sortOrder = order === 'asc' ? 1 : -1;
            sortOptions = { [sortBy]: sortOrder };
        }

        const getProducts = await products.find({}).sort(sortOptions);
        console.log(`${req.t('success.dataRetrieved')} (${req.language})`);
        
        res.status(201).json({
            message: req.t('success.dataRetrieved'),
            data: getProducts,
            language: req.language
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            message: req.t('error.serverError'),
            error: err.message,
            language: req.language
        });
    }
})

router.get('/products/:id', async (req, res) => {

    try {
        const getProduct = await products.findById(req.params.id);
        console.log(getProduct);
        res.status(201).json(getProduct);
    }
    catch (err) {
        console.log(err);
    }
})

router.put('/updateproduct/:id', async (req, res) => {
    const { ProductName, ProductBarcode, ProductDeliveryDate, ProductReceivedDate } = req.body;

    try {
        const updateData = {
            ProductName,
            ProductBarcode,
            ProductUpdatedDate: new Date()
        };

        // Chỉ thêm các trường ngày nếu chúng được cung cấp
        if (ProductDeliveryDate !== undefined) {
            updateData.ProductDeliveryDate = ProductDeliveryDate ? new Date(ProductDeliveryDate) : null;
            // Reset thông tin người quét nếu xóa ngày giao
            if (!ProductDeliveryDate) {
                updateData.DeliveryScannedBy = null;
            }
        }
        if (ProductReceivedDate !== undefined) {
            updateData.ProductReceivedDate = ProductReceivedDate ? new Date(ProductReceivedDate) : null;
            // Reset thông tin người quét nếu xóa ngày nhận
            if (!ProductReceivedDate) {
                updateData.ReceivedScannedBy = null;
            }
        }

        const updateProducts = await products.findByIdAndUpdate(req.params.id, updateData, { new: true });
        console.log(req.t('success.productUpdated'));
        res.status(201).json({ message: req.t('success.productUpdated'), data: updateProducts });
    }
    catch (err) {
        console.log(err);
    }
})

router.delete('/deleteproduct/:id', async (req, res) => {

    try {
        const deleteProduct = await products.findByIdAndDelete(req.params.id);
        console.log(req.t('success.productDeleted'));
        res.status(201).json({ message: req.t('success.productDeleted'), data: deleteProduct });
    }
    catch (err) {
        console.log(err);
    }
})

// Update delivery date via QR scan
router.put('/update-delivery/:id', async (req, res) => {
    const { quantity } = req.body;
    const clientIP = getRealIP(req);

    try {
        // Find user by IP
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });
        const scannedBy = scannedUser ? `${scannedUser.UserName} (${scannedUser.EmployeeCode})` : `Device: ${deviceId.substring(0, 8)}`;

        const updateData = {
            ProductDeliveryDate: new Date(),
            ProductUpdatedDate: new Date(),
            DeliveryScannedBy: scannedBy,
            WorkflowStatus: 'delivered'
        };

        // Add ShippingQuantity if provided
        if (quantity !== undefined) {
            updateData.ShippingQuantity = parseInt(quantity);
        }

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        console.log("Delivery date updated by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        console.log('📡 Emitting productUpdated event (PUT delivery):', {
            productId: req.params.id,
            type: 'delivery',
            scannedBy: scannedBy,
            product: updateProducts
        });
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'delivery',
            scannedBy: scannedBy,
            product: updateProducts,
            timestamp: new Date()
        });

        res.status(201).json(updateProducts);
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to update delivery date" });
    }
})

router.get('/create-product-form', async (req, res) => {
    try {
        const html = generateHTML(req.language, 'createProductForm', {});
        res.status(200).send(html);
    } catch (error) {
        console.error('Error generating create product form:', error);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
});

router.get('/deliver-product/:id', async (req, res) => {
    try {
        // Check if user is registered first
        const clientIP = getRealIP(req);
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/deliver-product/${req.params.id}?lang=${req.language}`,
                actionType: 'delivery'
            });
            return res.status(200).send(html);
        }

        const product = await products.findById(req.params.id);
        if (!product) {
            return res.status(404).send(`
                <html>
                    <head>
                        <title>${req.t('error.productNotFound')}</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #ffebee; }
                            .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
                            .message { font-size: 18px; color: #333; margin-bottom: 30px; }
                        </style>
                    </head>
                    <body>
                        <div class="error">❌</div>
                        <div class="message">${req.t('error.productNotFound')}</div>
                    </body>
                </html>
            `);
        }

        const html = generateHTML(req.language, 'deliveryForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            productId: req.params.id,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode
        });
        
        res.status(200).send(html);
    }
    catch (err) {
        console.log(err);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
});

router.get('/receive-product/:id', async (req, res) => {
    try {
        // Check if user is registered first
        const clientIP = getRealIP(req);
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/receive-product/${req.params.id}?lang=${req.language}`,
                actionType: 'receive'
            });
            return res.status(200).send(html);
        }

        const product = await products.findById(req.params.id);
        if (!product) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.productNotFound')
            });
            return res.status(404).send(errorHtml);
        }

        const html = generateHTML(req.language, 'receiveForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            shippingQuantity: product.ShippingQuantity,
            productId: req.params.id,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode
        });
        
        res.status(200).send(html);
    }
    catch (err) {
        console.log(err);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
});

router.get('/assemble-product/:id', async (req, res) => {
    try {
        // Check if user is registered first
        const clientIP = getRealIP(req);
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/assemble-product/${req.params.id}?lang=${req.language}`,
                actionType: 'assembling'
            });
            return res.status(200).send(html);
        }

        const product = await products.findById(req.params.id);
        if (!product) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.productNotFound')
            });
            return res.status(404).send(errorHtml);
        }

        // Validate workflow timing
        const validation = await validateWorkflowTiming(product, 'assembling');
        if (!validation.isValid) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: validation.message
            });
            return res.status(400).send(errorHtml);
        }

        const html = generateHTML(req.language, 'assemblingForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            receivedQuantity: product.ReceivedQuantity,
            productId: req.params.id,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode
        });
        
        res.status(200).send(html);
    }
    catch (err) {
        console.log(err);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
});

router.get('/warehouse-product/:id', async (req, res) => {
    try {
        // Check if user is registered first
        const clientIP = getRealIP(req);
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/warehouse-product/${req.params.id}?lang=${req.language}`,
                actionType: 'warehousing'
            });
            return res.status(200).send(html);
        }

        const product = await products.findById(req.params.id);
        if (!product) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.productNotFound')
            });
            return res.status(404).send(errorHtml);
        }

        // Validate workflow timing
        const validation = await validateWorkflowTiming(product, 'warehousing');
        if (!validation.isValid) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: validation.message
            });
            return res.status(400).send(errorHtml);
        }

        const html = generateHTML(req.language, 'warehousingForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            assemblingQuantity: product.AssemblingQuantity,
            productId: req.params.id,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode
        });
        
        res.status(200).send(html);
    }
    catch (err) {
        console.log(err);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
});

// Update received date via QR scan
router.put('/update-received/:id', async (req, res) => {
    const { ReceivedQuantity } = req.body;
    const clientIP = getRealIP(req);

    try {
        // Find user by IP
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });
        const scannedBy = scannedUser ? `${scannedUser.UserName} (${scannedUser.EmployeeCode})` : `Device: ${deviceId.substring(0, 8)}`;

        const updateData = {
            ProductReceivedDate: new Date(),
            ProductUpdatedDate: new Date(),
            ReceivedScannedBy: scannedBy,
            WorkflowStatus: 'received'
        };

        // Add ReceivedQuantity if provided
        if (ReceivedQuantity !== undefined) {
            updateData.ReceivedQuantity = ReceivedQuantity;
        }

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        console.log("Received date updated by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        console.log('📡 Emitting productUpdated event (PUT received):', {
            productId: req.params.id,
            type: 'received',
            scannedBy: scannedBy,
            product: updateProducts
        });
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'received',
            scannedBy: scannedBy,
            product: updateProducts,
            timestamp: new Date()
        });

        res.status(201).json(updateProducts);
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to update received date" });
    }
})

// GET routes for QR code scanning (browsers make GET requests when scanning QR codes)
router.get('/update-delivery/:id', async (req, res) => {
    const { quantity } = req.query;
    const clientIP = getRealIP(req);

    try {
        // Find user by IP - require user to be registered
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show error page
            return res.status(403).send(`
                <html>
                    <head>
                        <title>${req.t('auth.userNotRegistered')}</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                text-align: center;
                                padding: 50px;
                                background-color: #fff3cd;
                            }
                            .warning {
                                color: #856404;
                                font-size: 24px;
                                margin-bottom: 20px;
                            }
                            .message {
                                font-size: 18px;
                                color: #333;
                                margin-bottom: 30px;
                            }
                            .register-link {
                                background-color: #007bff;
                                color: white;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 5px;
                                font-size: 16px;
                                display: inline-block;
                            }
                            .register-link:hover {
                                background-color: #0056b3;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="warning">⚠️</div>
                        <div class="message">${req.t('auth.deliveryRequiresRegistration')}</div>
                        <a href="/register-device-form?lang=${req.language}" class="register-link">${req.t('auth.registerAndContinue')}</a>
                    </body>
                </html>
            `);
        }

        const scannedBy = `${scannedUser.UserName} (${scannedUser.EmployeeCode})`;

        const updateData = {
            ProductDeliveryDate: new Date(),
            ProductUpdatedDate: new Date(),
            DeliveryScannedBy: scannedBy,
            WorkflowStatus: 'delivered'
        };

        // Add ShippingQuantity if provided
        if (quantity !== undefined) {
            updateData.ShippingQuantity = parseInt(quantity);
        }

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        console.log("Delivery date updated via QR scan by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'delivery',
            scannedBy: scannedBy,
            timestamp: new Date()
        });

        const userInfo = `<div class="user-info" style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <strong>Người thực hiện:</strong> ${scannedUser.UserName}<br>
                <strong>Mã NV:</strong> ${scannedUser.EmployeeCode}
            </div>`;

        res.status(200).send(`
            <html>
                <head>
                    <title>Cập nhật ngày giao</title>
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
                        .user-info {
                            font-size: 14px;
                            color: #495057;
                        }
                        .button {
                            background-color: #007bff;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-size: 16px;
                            display: inline-block;
                        }
                        .button:hover {
                            background-color: #0056b3;
                        }
                    </style>
                </head>
                <body>
                    <div class="success">✅</div>
                    <div class="message">Ngày giao đã được cập nhật thành công!</div>
                    ${userInfo}
                </body>
            </html>
        `);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(`
            <html>
                <head>
                    <title>Lỗi cập nhật</title>
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
                        .button {
                            background-color: #cc224a;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-size: 16px;
                            display: inline-block;
                        }
                        .button:hover {
                            background-color: #c82333;
                        }
                    </style>
                </head>
                <body>
                    <div class="error">❌</div>
                    <div class="message">Có lỗi xảy ra khi cập nhật ngày giao. Vui lòng thử lại.</div>
                </body>
            </html>
        `);
    }
})

router.get('/update-received/:id', async (req, res) => {
    const { quantity } = req.query;
    const clientIP = getRealIP(req);

    try {
        // Find user by IP - require user to be registered
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show error page
            return res.status(403).send(`
                <html>
                    <head>
                        <title>${req.t('auth.userNotRegistered')}</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                text-align: center;
                                padding: 50px;
                                background-color: #fff3cd;
                            }
                            .warning {
                                color: #856404;
                                font-size: 24px;
                                margin-bottom: 20px;
                            }
                            .message {
                                font-size: 18px;
                                color: #333;
                                margin-bottom: 30px;
                            }
                            .register-link {
                                background-color: #007bff;
                                color: white;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 5px;
                                font-size: 16px;
                                display: inline-block;
                            }
                            .register-link:hover {
                                background-color: #0056b3;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="warning">⚠️</div>
                        <div class="message">${req.t('auth.receiveRequiresRegistration')}</div>
                        <a href="/register-device-form?lang=${req.language}" class="register-link">${req.t('auth.registerAndContinue')}</a>
                    </body>
                </html>
            `);
        }

        const scannedBy = `${scannedUser.UserName} (${scannedUser.EmployeeCode})`;

        const updateData = {
            ProductReceivedDate: new Date(),
            ProductUpdatedDate: new Date(),
            ReceivedScannedBy: scannedBy
        };

        // Add ReceivedQuantity if provided
        if (quantity !== undefined) {
            updateData.ReceivedQuantity = parseInt(quantity);
        }

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        console.log("Received date updated via QR scan by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'received',
            scannedBy: scannedBy,
            timestamp: new Date()
        });

        const userInfo = `<div class="user-info" style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <strong>Người thực hiện:</strong> ${scannedUser.UserName}<br>
                <strong>Mã NV:</strong> ${scannedUser.EmployeeCode}
            </div>`;

        res.status(200).send(`
            <html>
                <head>
                    <title>Cập nhật ngày nhận</title>
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
                        .user-info {
                            font-size: 14px;
                            color: #495057;
                        }
                        .button {
                            background-color: #007bff;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-size: 16px;
                            display: inline-block;
                        }
                        .button:hover {
                            background-color: #0056b3;
                        }
                    </style>
                </head>
                <body>
                    <div class="success">✅</div>
                    <div class="message">Ngày nhận đã được cập nhật thành công!</div>
                    ${userInfo}
                </body>
            </html>
        `);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(`
            <html>
                <head>
                    <title>Lỗi cập nhật</title>
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
                        .button {
                            background-color: #dc3545;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-size: 16px;
                            display: inline-block;
                        }
                        .button:hover {
                            background-color: #c82333;
                        }
                    </style>
                </head>
                <body>
                    <div class="error">❌</div>
                    <div class="message">Có lỗi xảy ra khi cập nhật ngày nhận. Vui lòng thử lại.</div>
                </body>
            </html>
        `);
    }
})

router.get('/update-assembling/:id', async (req, res) => {
    const { quantity } = req.query;
    const clientIP = getRealIP(req);

    try {
        // Find user by IP - require user to be registered
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show error page
            return res.status(403).send(`
                <html>
                    <head>
                        <title>${req.t('auth.userNotRegistered')}</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                text-align: center;
                                padding: 50px;
                                background-color: #fff3cd;
                            }
                            .warning {
                                color: #856404;
                                font-size: 24px;
                                margin-bottom: 20px;
                            }
                            .message {
                                font-size: 18px;
                                color: #333;
                                margin-bottom: 30px;
                            }
                            .register-link {
                                background-color: #007bff;
                                color: white;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 5px;
                                font-size: 16px;
                                display: inline-block;
                            }
                            .register-link:hover {
                                background-color: #0056b3;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="warning">⚠️</div>
                        <div class="message">Bạn cần đăng ký làm người dùng để có thể quét sản phẩm lắp ráp</div>
                        <a href="/register-device-form?lang=${req.language}" class="register-link">${req.t('auth.registerAndContinue')}</a>
                    </body>
                </html>
            `);
        }

        const product = await products.findById(req.params.id);
        if (!product) {
            return res.status(404).send('Không tìm thấy sản phẩm');
        }

        // Validate workflow timing
        const validation = await validateWorkflowTiming(product, 'assembling');
        if (!validation.isValid) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Chưa đủ thời gian</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                text-align: center;
                                padding: 50px;
                                background-color: #fff3cd;
                            }
                            .warning {
                                color: #856404;
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
                        <div class="warning">⏰</div>
                        <div class="message">${validation.message}</div>
                    </body>
                </html>
            `);
        }

        const scannedBy = `${scannedUser.UserName} (${scannedUser.EmployeeCode})`;

        const updateData = {
            ProductAssemblingDate: new Date(),
            ProductUpdatedDate: new Date(),
            AssemblingScannedBy: scannedBy,
            WorkflowStatus: updateWorkflowStatus({...product.toObject(), ProductAssemblingDate: new Date()})
        };

        // Add AssemblingQuantity if provided
        if (quantity !== undefined) {
            updateData.AssemblingQuantity = parseInt(quantity);
        }

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        console.log("Assembling date updated via QR scan by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'assembling',
            scannedBy: scannedBy,
            timestamp: new Date()
        });

        const userInfo = `<div class="user-info" style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <strong>Người thực hiện:</strong> ${scannedUser.UserName}<br>
                <strong>Mã NV:</strong> ${scannedUser.EmployeeCode}
            </div>`;

        res.status(200).send(`
            <html>
                <head>
                    <title>Cập nhật lắp ráp</title>
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
                        .user-info {
                            font-size: 14px;
                            color: #495057;
                        }
                    </style>
                </head>
                <body>
                    <div class="success">✅</div>
                    <div class="message">Lắp ráp đã được cập nhật thành công!</div>
                    ${userInfo}
                </body>
            </html>
        `);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(`
            <html>
                <head>
                    <title>Lỗi cập nhật</title>
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
                    <div class="message">Có lỗi xảy ra khi cập nhật lắp ráp. Vui lòng thử lại.</div>
                </body>
            </html>
        `);
    }
})

router.get('/update-warehousing/:id', async (req, res) => {
    const { quantity } = req.query;
    const clientIP = getRealIP(req);

    try {
        // Find user by IP - require user to be registered
        const deviceId = generateDeviceId(req);
        const scannedUser = await users.findOne({ 
            $or: [
                { DeviceId: deviceId },
                { DeviceIP: clientIP }
            ]
        });

        if (!scannedUser) {
            // User not registered - show error page
            return res.status(403).send(`
                <html>
                    <head>
                        <title>${req.t('auth.userNotRegistered')}</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                text-align: center;
                                padding: 50px;
                                background-color: #fff3cd;
                            }
                            .warning {
                                color: #856404;
                                font-size: 24px;
                                margin-bottom: 20px;
                            }
                            .message {
                                font-size: 18px;
                                color: #333;
                                margin-bottom: 30px;
                            }
                            .register-link {
                                background-color: #007bff;
                                color: white;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 5px;
                                font-size: 16px;
                                display: inline-block;
                            }
                            .register-link:hover {
                                background-color: #0056b3;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="warning">⚠️</div>
                        <div class="message">Bạn cần đăng ký làm người dùng để có thể quét sản phẩm nhập kho</div>
                        <a href="/register-device-form?lang=${req.language}" class="register-link">${req.t('auth.registerAndContinue')}</a>
                    </body>
                </html>
            `);
        }

        const product = await products.findById(req.params.id);
        if (!product) {
            return res.status(404).send('Không tìm thấy sản phẩm');
        }

        // Validate workflow timing
        const validation = await validateWorkflowTiming(product, 'warehousing');
        if (!validation.isValid) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Chưa đủ thời gian</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                text-align: center;
                                padding: 50px;
                                background-color: #fff3cd;
                            }
                            .warning {
                                color: #856404;
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
                        <div class="warning">⏰</div>
                        <div class="message">${validation.message}</div>
                    </body>
                </html>
            `);
        }

        const scannedBy = `${scannedUser.UserName} (${scannedUser.EmployeeCode})`;

        const updateData = {
            ProductWarehousingDate: new Date(),
            ProductUpdatedDate: new Date(),
            WarehousingScannedBy: scannedBy,
            WorkflowStatus: 'completed'
        };

        // Add WarehousingQuantity if provided
        if (quantity !== undefined) {
            updateData.WarehousingQuantity = parseInt(quantity);
        }

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        console.log("Warehousing date updated via QR scan by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'warehousing',
            scannedBy: scannedBy,
            timestamp: new Date()
        });

        const userInfo = `<div class="user-info" style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <strong>Người thực hiện:</strong> ${scannedUser.UserName}<br>
                <strong>Mã NV:</strong> ${scannedUser.EmployeeCode}
            </div>`;

        res.status(200).send(`
            <html>
                <head>
                    <title>Cập nhật nhập kho</title>
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
                        .user-info {
                            font-size: 14px;
                            color: #495057;
                        }
                        .completed {
                            background-color: #d4edda;
                            border: 2px solid #c3e6cb;
                            padding: 15px;
                            border-radius: 8px;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="success">✅</div>
                    <div class="message">Nhập kho đã được cập nhật thành công!</div>
                    <div class="completed">
                        <strong>🎉 QUY TRÌNH HOÀN TẤT 🎉</strong><br>
                        Sản phẩm đã hoàn thành tất cả các bước trong quy trình
                    </div>
                    ${userInfo}
                </body>
            </html>
        `);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(`
            <html>
                <head>
                    <title>Lỗi cập nhật</title>
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
                    <div class="message">Có lỗi xảy ra khi cập nhật nhập kho. Vui lòng thử lại.</div>
                </body>
            </html>
        `);
    }
})

router.post("/insertuser", async (req, res) => {
    const { UserName, EmployeeCode, DeviceIP } = req.body;

    try {
        // Check if EmployeeCode already exists
        const existingEmployee = await users.findOne({ EmployeeCode: EmployeeCode })
        console.log(existingEmployee);

        if (existingEmployee) {
            return res.status(422).json("Mã số nhân viên đã tồn tại.")
        }

        // Check if DeviceIP already exists (if provided)
        if (DeviceIP) {
            const existingIP = await users.findOne({ DeviceIP: DeviceIP })
            console.log(existingIP);

            if (existingIP) {
                return res.status(422).json("IP thiết bị này đã được sử dụng bởi nhân viên khác.")
            }
        }

        const addUser = new users({ UserName, EmployeeCode, DeviceIP })

        await addUser.save();
        res.status(201).json(addUser)
        console.log(addUser)
    }
    catch (err) {
        console.log(err)
        res.status(500).json("Có lỗi xảy ra khi thêm nhân viên.")
    }
})

router.get('/users', async (req, res) => {

    try {
        const { sortBy, order } = req.query;

        // Default sort: newest first
        let sortOptions = { CreatedDate: -1 };

        // If sortBy is provided, use it
        if (sortBy) {
            const sortOrder = order === 'asc' ? 1 : -1;
            sortOptions = { [sortBy]: sortOrder };
        }

        const getUsers = await users.find({}).sort(sortOptions);
        console.log(getUsers);
        res.status(201).json(getUsers);
    }
    catch (err) {
        console.log(err);
    }
})

router.get('/users/:id', async (req, res) => {

    try {
        const getUser = await users.findById(req.params.id);
        console.log(getUser);
        res.status(201).json(getUser);
    }
    catch (err) {
        console.log(err);
    }
})

router.put('/updateuser/:id', async (req, res) => {
    const { UserName, EmployeeCode, DeviceIP } = req.body;

    try {
        // Check if EmployeeCode already exists for another user
        if (EmployeeCode) {
            const existingEmployee = await users.findOne({
                EmployeeCode: EmployeeCode,
                _id: { $ne: req.params.id } // Exclude current user
            });

            if (existingEmployee) {
                return res.status(422).json("Mã số nhân viên đã tồn tại.")
            }
        }

        // Check if DeviceIP already exists for another user
        if (DeviceIP) {
            const existingIP = await users.findOne({
                DeviceIP: DeviceIP,
                _id: { $ne: req.params.id } // Exclude current user
            });

            if (existingIP) {
                return res.status(422).json("IP thiết bị này đã được sử dụng bởi nhân viên khác.")
            }
        }

        const updateData = {
            UserName,
            EmployeeCode,
            UpdatedDate: new Date()
        };

        // Chỉ thêm DeviceIP nếu được cung cấp
        if (DeviceIP !== undefined) {
            updateData.DeviceIP = DeviceIP;
        }

        const updateUser = await users.findByIdAndUpdate(req.params.id, updateData, { new: true });
        console.log("User Updated");
        res.status(201).json(updateUser);
    }
    catch (err) {
        console.log(err);
        res.status(500).json("Có lỗi xảy ra khi cập nhật nhân viên.");
    }
})

router.delete('/deleteuser/:id', async (req, res) => {

    try {
        const deleteUser = await users.findByIdAndDelete(req.params.id);
        console.log("User Deleted");
        res.status(201).json(deleteUser);
    }
    catch (err) {
        console.log(err);
    }
})

// Update user IP via QR scan
router.put('/update-user-ip/:id', async (req, res) => {
    const clientIP = getRealIP(req);

    try {
        // Check if another user already uses this IP
        const existingUser = await users.findOne({
            DeviceIP: clientIP,
            _id: { $ne: req.params.id } // Exclude current user
        });

        if (existingUser) {
            return res.status(422).json({
                error: "IP thiết bị này đã được sử dụng bởi nhân viên khác.",
                existingUser: `${existingUser.UserName} (${existingUser.EmployeeCode})`
            });
        }

        const updateUser = await users.findByIdAndUpdate(
            req.params.id,
            {
                DeviceIP: clientIP,
                UpdatedDate: new Date(),
                LastLoginDate: new Date()
            },
            { new: true }
        );
        console.log("User IP updated via QR scan");

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('userUpdated', {
            userId: req.params.id,
            deviceIP: clientIP,
            timestamp: new Date()
        });

        res.status(201).json(updateUser);
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to update user IP" });
    }
})

// GET route for QR IP capture - returns HTML page
router.get('/capture-user-ip/:id', async (req, res) => {
    const clientIP = getRealIP(req);

    try {
        // Check if another user already uses this IP
        const existingUser = await users.findOne({
            DeviceIP: clientIP,
            _id: { $ne: req.params.id } // Exclude current user
        });

        if (existingUser) {
            return res.status(200).send(`
                <html>
                    <head>
                        <title>IP đã được sử dụng</title>
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
                                margin-bottom: 10px;
                            }
                            .existing-user {
                                font-size: 16px;
                                color: #666;
                                margin-bottom: 30px;
                                font-weight: bold;
                                background-color: #f8d7da;
                                padding: 15px;
                                border-radius: 5px;
                            }
                            .button {
                                background-color: #dc3545;
                                color: white;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 5px;
                                font-size: 16px;
                                display: inline-block;
                            }
                            .button:hover {
                                background-color: #c82333;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error">❌</div>
                        <div class="message">IP thiết bị này đã được sử dụng bởi nhân viên khác!</div>
                        <div class="existing-user">Nhân viên hiện tại: ${existingUser.UserName} (${existingUser.EmployeeCode})</div>
                    </body>
                </html>
            `);
        }

        const updateUser = await users.findByIdAndUpdate(
            req.params.id,
            {
                DeviceIP: clientIP,
                UpdatedDate: new Date(),
                LastLoginDate: new Date()
            },
            { new: true }
        );
        console.log("User IP captured via QR scan");

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('userUpdated', {
            userId: req.params.id,
            deviceIP: clientIP,
            timestamp: new Date()
        });

        res.status(200).send(`
            <html>
                <head>
                    <title>IP thiết bị đã được lưu</title>
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
                            margin-bottom: 10px;
                        }
                        .ip-info {
                            font-size: 16px;
                            color: #666;
                            margin-bottom: 30px;
                            font-family: monospace;
                            background-color: #e9ecef;
                            padding: 10px;
                            border-radius: 5px;
                            display: inline-block;
                        }
                        .button {
                            background-color: #007bff;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-size: 16px;
                            display: inline-block;
                        }
                        .button:hover {
                            background-color: #0056b3;
                        }
                    </style>
                </head>
                <body>
                    <div class="success">✅</div>
                    <div class="message">IP thiết bị đã được lưu thành công!</div>
                    <div class="ip-info">IP: ${clientIP}</div>
                </body>
            </html>
        `);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(`
            <html>
                <head>
                    <title>Lỗi lưu IP</title>
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
                        .button {
                            background-color: #dc3545;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-size: 16px;
                            display: inline-block;
                        }
                        .button:hover {
                            background-color: #c82333;
                        }
                    </style>
                </head>
                <body>
                    <div class="error">❌</div>
                    <div class="message">Có lỗi xảy ra khi lưu IP thiết bị. Vui lòng thử lại.</div>
                </body>
            </html>
        `);
    }
})

router.get('/', async (req, res) => {
    res.status(201).json({
        name: "Phong"
    });
})

router.get('/debug-ip', async (req, res) => {
    const clientInfo = getClientInfo(req);
    res.status(200).json({
        message: 'IP Debug Information',
        clientInfo,
        detectedIP: getRealIP(req),
        language: req.language
    });
})

router.get('/my-ip', async (req, res) => {
    const realIP = getRealIP(req);
    const deviceInfo = getDeviceInfo(req);
    
    res.status(200).send(`
        <html>
            <head>
                <title>Device Information</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 20px;
                        background-color: #f8f9fa;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        max-width: 500px;
                        margin: 0 auto;
                    }
                    .device-id {
                        font-size: 20px;
                        font-weight: bold;
                        color: #28a745;
                        margin: 20px 0;
                        padding: 15px;
                        background-color: #d4edda;
                        border-radius: 5px;
                        font-family: monospace;
                        word-break: break-all;
                    }
                    .ip-display {
                        font-size: 18px;
                        font-weight: bold;
                        color: #007bff;
                        margin: 15px 0;
                        padding: 12px;
                        background-color: #e9ecef;
                        border-radius: 5px;
                        font-family: monospace;
                    }
                    .info {
                        font-size: 14px;
                        color: #666;
                        margin-top: 20px;
                        text-align: left;
                    }
                    .device-info {
                        background-color: #f8f9fa;
                        padding: 15px;
                        border-radius: 5px;
                        margin: 15px 0;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>📱 Device Information</h2>
                    
                    <div class="device-id">
                        <strong>Device ID:</strong><br>
                        ${deviceInfo.deviceId}
                    </div>
                    
                    <div class="ip-display">
                        <strong>IP Address:</strong> ${realIP}
                    </div>
                    
                    <div class="device-info">
                        <strong>Browser:</strong> ${deviceInfo.browser}<br>
                        <strong>OS:</strong> ${deviceInfo.os}<br>
                        <strong>Timestamp:</strong> ${deviceInfo.timestamp.toLocaleString()}
                    </div>
                    
                    <div class="info">
                        <strong>Headers received:</strong><br>
                        X-Forwarded-For: ${req.headers['x-forwarded-for'] || 'Not set'}<br>
                        X-Real-IP: ${req.headers['x-real-ip'] || 'Not set'}<br>
                        X-Client-IP: ${req.headers['x-client-ip'] || 'Not set'}<br><br>
                        
                        <strong>Device ID</strong> is generated from IP + User Agent + Browser settings.<br>
                        This ensures each device has a unique identifier.
                    </div>
                </div>
            </body>
        </html>
    `);
})

router.get('/register-device-form', async (req, res) => {
    try {
        const deviceInfo = getDeviceInfo(req);
        const html = generateHTML(req.language, 'deviceRegistrationForm', deviceInfo);
        res.status(200).send(html);
    } catch (error) {
        console.error('Error generating device registration form:', error);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
})

router.post('/register-device', async (req, res) => {
    try {
        const deviceInfo = getDeviceInfo(req);
        const { userName, employeeCode } = req.body;
        
        if (!userName || !employeeCode) {
            return res.status(400).json({
                message: req.t('validation.allFieldsRequired'),
                language: req.language
            });
        }
        
        const existingUser = await users.findOne({
            $or: [
                { EmployeeCode: employeeCode },
                { DeviceId: deviceInfo.deviceId }
            ]
        });
        
        if (existingUser) {
            if (existingUser.EmployeeCode === employeeCode) {
                existingUser.DeviceId = deviceInfo.deviceId;
                existingUser.DeviceIP = deviceInfo.ip;
                existingUser.DeviceInfo = {
                    browser: deviceInfo.browser,
                    os: deviceInfo.os,
                    userAgent: deviceInfo.userAgent,
                    lastSeen: new Date()
                };
                existingUser.UpdatedDate = new Date();
                existingUser.LastLoginDate = new Date();
                
                await existingUser.save();
                
                return res.status(200).json({
                    message: req.t('success.userUpdated'),
                    user: existingUser,
                    deviceInfo,
                    language: req.language
                });
            } else {
                return res.status(422).json({
                    message: req.t('error.duplicateEntry'),
                    language: req.language
                });
            }
        }
        
        const newUser = new users({
            UserName: userName,
            EmployeeCode: employeeCode,
            DeviceId: deviceInfo.deviceId,
            DeviceIP: deviceInfo.ip,
            DeviceInfo: {
                browser: deviceInfo.browser,
                os: deviceInfo.os,
                userAgent: deviceInfo.userAgent,
                lastSeen: new Date()
            }
        });
        
        await newUser.save();
        
        res.status(201).json({
            message: req.t('success.userCreated'),
            user: newUser,
            deviceInfo,
            language: req.language
        });
        
    } catch (error) {
        console.error('Error registering device:', error);
        res.status(500).json({
            message: req.t('error.serverError'),
            error: error.message,
            language: req.language
        });
    }
})

// Workflow configuration endpoints
router.get('/workflow-config', async (req, res) => {
    try {
        const configs = await WorkflowConfig.find({}).sort({ stepName: 1 });
        res.status(200).json({
            message: req.t('success.dataRetrieved'),
            data: configs,
            language: req.language
        });
    } catch (error) {
        console.error('Error fetching workflow config:', error);
        res.status(500).json({
            message: req.t('error.serverError'),
            error: error.message,
            language: req.language
        });
    }
});

router.put('/workflow-config/:stepName', async (req, res) => {
    try {
        const { stepName } = req.params;
        const { minimumMinutes, description, isActive } = req.body;

        const updateData = {
            updatedDate: new Date()
        };

        if (minimumMinutes !== undefined) {
            updateData.minimumMinutes = Math.max(0, parseInt(minimumMinutes));
        }
        if (description !== undefined) {
            updateData.description = description;
        }
        if (isActive !== undefined) {
            updateData.isActive = Boolean(isActive);
        }

        const updatedConfig = await WorkflowConfig.findOneAndUpdate(
            { stepName: stepName },
            updateData,
            { new: true }
        );

        if (!updatedConfig) {
            return res.status(404).json({
                message: 'Workflow configuration not found',
                language: req.language
            });
        }

        res.status(200).json({
            message: req.t('success.dataUpdated') || 'Configuration updated successfully',
            data: updatedConfig,
            language: req.language
        });
    } catch (error) {
        console.error('Error updating workflow config:', error);
        res.status(500).json({
            message: req.t('error.serverError'),
            error: error.message,
            language: req.language
        });
    }
});

router.get('/workflow-admin', async (req, res) => {
    try {
        const configs = await WorkflowConfig.find({}).sort({ stepName: 1 });
        
        const configRows = configs.map(config => `
            <tr>
                <td>${config.stepName}</td>
                <td>${config.description}</td>
                <td>
                    <input type="number" id="${config.stepName}_minutes" value="${config.minimumMinutes}" min="0" style="width: 80px;">
                </td>
                <td>
                    <input type="checkbox" id="${config.stepName}_active" ${config.isActive ? 'checked' : ''}>
                </td>
                <td>
                    <button onclick="updateConfig('${config.stepName}')" class="btn-update">Cập nhật</button>
                </td>
            </tr>
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Cấu hình Workflow</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 20px;
                            background-color: #f8f9fa;
                        }
                        .container {
                            max-width: 1000px;
                            margin: 0 auto;
                            background: white;
                            padding: 30px;
                            border-radius: 10px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                        }
                        th, td {
                            border: 1px solid #ddd;
                            padding: 12px;
                            text-align: left;
                        }
                        th {
                            background-color: #f8f9fa;
                            font-weight: bold;
                        }
                        .btn-update {
                            background-color: #007bff;
                            color: white;
                            padding: 6px 12px;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                        }
                        .btn-update:hover {
                            background-color: #0056b3;
                        }
                        .message {
                            padding: 10px;
                            margin: 10px 0;
                            border-radius: 4px;
                            display: none;
                        }
                        .success {
                            background-color: #d4edda;
                            color: #155724;
                            border: 1px solid #c3e6cb;
                        }
                        .error {
                            background-color: #f8d7da;
                            color: #721c24;
                            border: 1px solid #f5c6cb;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🔧 Cấu hình Workflow</h1>
                        <p>Quản lý thời gian tối thiểu giữa các bước trong quy trình sản xuất</p>
                        
                        <div id="message" class="message"></div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Bước</th>
                                    <th>Mô tả</th>
                                    <th>Thời gian tối thiểu (phút)</th>
                                    <th>Kích hoạt</th>
                                    <th>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${configRows}
                            </tbody>
                        </table>
                        
                        <div style="margin-top: 20px; padding: 15px; background-color: #e9ecef; border-radius: 5px;">
                            <h4>📝 Hướng dẫn:</h4>
                            <ul>
                                <li><strong>delivery_to_receive:</strong> Thời gian từ khi giao hàng đến khi có thể nhận hàng</li>
                                <li><strong>receive_to_assembling:</strong> Thời gian từ khi nhận hàng đến khi có thể lắp ráp</li>
                                <li><strong>assembling_to_warehousing:</strong> Thời gian từ khi lắp ráp đến khi có thể nhập kho</li>
                            </ul>
                        </div>
                    </div>

                    <script>
                        async function updateConfig(stepName) {
                            const minutes = document.getElementById(stepName + '_minutes').value;
                            const isActive = document.getElementById(stepName + '_active').checked;
                            
                            try {
                                const response = await fetch('/workflow-config/' + stepName, {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Accept-Language': '${req.language}',
                                        'X-Language': '${req.language}'
                                    },
                                    body: JSON.stringify({
                                        minimumMinutes: parseInt(minutes),
                                        isActive: isActive
                                    })
                                });

                                const data = await response.json();
                                const messageDiv = document.getElementById('message');
                                
                                if (response.ok) {
                                    messageDiv.className = 'message success';
                                    messageDiv.textContent = data.message || 'Cập nhật thành công!';
                                } else {
                                    messageDiv.className = 'message error';
                                    messageDiv.textContent = data.message || 'Có lỗi xảy ra!';
                                }
                                
                                messageDiv.style.display = 'block';
                                setTimeout(() => {
                                    messageDiv.style.display = 'none';
                                }, 3000);
                                
                            } catch (error) {
                                const messageDiv = document.getElementById('message');
                                messageDiv.className = 'message error';
                                messageDiv.textContent = 'Có lỗi xảy ra khi cập nhật!';
                                messageDiv.style.display = 'block';
                                setTimeout(() => {
                                    messageDiv.style.display = 'none';
                                }, 3000);
                            }
                        }
                    </script>
                </body>
            </html>
        `;
        
        res.status(200).send(html);
    } catch (error) {
        console.error('Error generating workflow admin page:', error);
        res.status(500).send(`
            <html>
                <head>
                    <title>Lỗi</title>
                    <meta charset="UTF-8">
                </head>
                <body>
                    <h1>Có lỗi xảy ra khi tải trang cấu hình</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `);
    }
});

module.exports = router;