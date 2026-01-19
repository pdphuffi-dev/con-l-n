const express = require('express');
const router = express.Router();
const products = require('../Models/Products');
const users = require('../Models/User');

//Inserting(Creating) Data:
router.post("/insertproduct", async (req, res) => {
    const { ProductName, ProductBarcode } = req.body;

    try {
        const pre = await products.findOne({ ProductBarcode: ProductBarcode })
        console.log(pre);

        if (pre) {
            res.status(422).json("Product is already added.")
        }
        else {
            const addProduct = new products({
                ProductName,
                ProductBarcode,
                DeliveryScannedBy: null,
                ReceivedScannedBy: null
            })

            await addProduct.save();
            res.status(201).json(addProduct)
            console.log(addProduct)
        }
    }
    catch (err) {
        console.log(err)
    }
})

//Getting(Reading) Data:
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
        console.log(getProducts);
        res.status(201).json(getProducts);
    }
    catch (err) {
        console.log(err);
    }
})

//Getting(Reading) individual Data:
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

//Editing(Updating) Data:
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
        console.log("Data Updated");
        res.status(201).json(updateProducts);
    }
    catch (err) {
        console.log(err);
    }
})

//Deleting Data:
router.delete('/deleteproduct/:id', async (req, res) => {

    try {
        const deleteProduct = await products.findByIdAndDelete(req.params.id);
        console.log("Data Deleted");
        res.status(201).json(deleteProduct);
    }
    catch (err) {
        console.log(err);
    }
})

// Update delivery date via QR scan
router.put('/update-delivery/:id', async (req, res) => {
    const clientIP = req.ip ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    try {
        // Find user by IP
        const scannedUser = await users.findOne({ DeviceIP: clientIP });
        const scannedBy = scannedUser ? `${scannedUser.UserName} (${scannedUser.EmployeeCode})` : `IP: ${clientIP}`;

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            {
                ProductDeliveryDate: new Date(),
                ProductUpdatedDate: new Date(),
                DeliveryScannedBy: scannedBy
            },
            { new: true }
        );
        console.log("Delivery date updated by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'delivery',
            scannedBy: scannedBy,
            timestamp: new Date()
        });

        res.status(201).json(updateProducts);
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to update delivery date" });
    }
})

// Update received date via QR scan
router.put('/update-received/:id', async (req, res) => {
    const clientIP = req.ip ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    try {
        // Find user by IP
        const scannedUser = await users.findOne({ DeviceIP: clientIP });
        const scannedBy = scannedUser ? `${scannedUser.UserName} (${scannedUser.EmployeeCode})` : `IP: ${clientIP}`;

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            {
                ProductReceivedDate: new Date(),
                ProductUpdatedDate: new Date(),
                ReceivedScannedBy: scannedBy
            },
            { new: true }
        );
        console.log("Received date updated by:", scannedBy);

        // Emit socket event to update all connected clients
        const io = req.app.get('io');
        io.emit('productUpdated', {
            productId: req.params.id,
            type: 'received',
            scannedBy: scannedBy,
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
    const clientIP = req.ip ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    try {
        // Find user by IP
        const scannedUser = await users.findOne({ DeviceIP: clientIP });
        const scannedBy = scannedUser ? `${scannedUser.UserName} (${scannedUser.EmployeeCode})` : `IP: ${clientIP}`;

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            {
                ProductDeliveryDate: new Date(),
                ProductUpdatedDate: new Date(),
                DeliveryScannedBy: scannedBy
            },
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

        const userInfo = scannedUser ?
            `<div class="user-info" style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <strong>Người thực hiện:</strong> ${scannedUser.UserName}<br>
                <strong>Mã NV:</strong> ${scannedUser.EmployeeCode}
            </div>` : '';

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
                    <div class="message">Có lỗi xảy ra khi cập nhật ngày giao. Vui lòng thử lại.</div>
                </body>
            </html>
        `);
    }
})

router.get('/update-received/:id', async (req, res) => {
    const clientIP = req.ip ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    try {
        // Find user by IP
        const scannedUser = await users.findOne({ DeviceIP: clientIP });
        const scannedBy = scannedUser ? `${scannedUser.UserName} (${scannedUser.EmployeeCode})` : `IP: ${clientIP}`;

        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            {
                ProductReceivedDate: new Date(),
                ProductUpdatedDate: new Date(),
                ReceivedScannedBy: scannedBy
            },
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

        const userInfo = scannedUser ?
            `<div class="user-info" style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <strong>Người thực hiện:</strong> ${scannedUser.UserName}<br>
                <strong>Mã NV:</strong> ${scannedUser.EmployeeCode}
            </div>` : '';

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

// User Routes

//Inserting(Creating) User:
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

//Getting(Reading) Users:
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

//Getting(Reading) individual User:
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

//Editing(Updating) User:
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

//Deleting User:
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
    const clientIP = req.ip ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

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
    const clientIP = req.ip ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

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
        name: "Phong Cho"
    });
})


module.exports = router;