const express = require('express');
const router = express.Router();
const products = require('../Models/Products');
const users = require('../Models/User');
const { generateHTML } = require('../utils/htmlTemplates');
const { getRealIP, getClientInfo } = require('../utils/getRealIP');
const { generateDeviceId, getDeviceInfo, isValidDeviceId } = require('../utils/deviceId');
const { validateWorkflowTiming, getNextWorkflowStep, updateWorkflowStatus } = require('../utils/workflowValidator');
const { WorkflowConfig } = require('../Models/WorkflowConfig');
const crypto = require('crypto');

// Auto-flow helper:
// - auto=1  -> luôn bật auto
// - auto=0  -> tắt auto
// - không truyền auto -> mặc định BẬT auto (phù hợp quét QR ngoài hiện trường)
const isAutoFlow = (req) => {
    const q = String(req.query.auto || '');
    if (q === '1') return true;
    if (q === '0') return false;
    return true;
};

const generateProductCode = () => {
    // Example: P + 10 hex chars => 11 chars (easy to print/scan)
    return `P${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
};

const generateUniqueProductCodes = async (count) => {
    // Batch-generate codes and ensure uniqueness against DB
    const makeSet = (n) => {
        const set = new Set();
        while (set.size < n) set.add(generateProductCode());
        return [...set];
    };

    let codes = makeSet(count);
    for (let attempt = 0; attempt < 5; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        const conflicts = await products.find({ ProductCode: { $in: codes } }).select('ProductCode');
        if (!conflicts || conflicts.length === 0) return codes;

        const conflictSet = new Set(conflicts.map((d) => d.ProductCode));
        const next = [];
        const used = new Set();
        for (const c of codes) {
            let val = c;
            if (conflictSet.has(val) || used.has(val)) {
                // regenerate until unique in this batch
                do {
                    val = generateProductCode();
                } while (used.has(val));
            }
            used.add(val);
            next.push(val);
        }
        codes = next;
    }
    throw new Error('Failed to generate unique ProductCode');
};

router.post("/insertproduct", async (req, res) => {
    const { ProductName, ProductBarcode, qrQuantity = 1 } = req.body;

    try {
        const MAX_QR = 200;
        const qrCount = Math.min(Math.max(parseInt(qrQuantity, 10) || 1, 1), MAX_QR); // 1..200
        const createdProducts = [];

        const isQuantityOnly = !ProductName && !ProductBarcode;

        // Generate compact lot number (<= ~18 chars with suffix)
        const pad2 = (n) => String(n).padStart(2, '0');
        const generateBaseBarcode = () => {
            const d = new Date();
            const stamp =
                String(d.getFullYear()).slice(2) +
                pad2(d.getMonth() + 1) +
                pad2(d.getDate()) +
                pad2(d.getHours()) +
                pad2(d.getMinutes()) +
                pad2(d.getSeconds());
            const rand = Math.floor(Math.random() * 90) + 10; // 2 digits
            return `B${stamp}${rand}`;
        };

        let baseBarcode = ProductBarcode;
        let baseName = ProductName;

        if (isQuantityOnly) {
            baseName = req.t('form.autoProductName', 'Sản phẩm');
            // Try to avoid collisions
            for (let attempt = 0; attempt < 5; attempt++) {
                const candidate = generateBaseBarcode();
                // eslint-disable-next-line no-await-in-loop
                const exists = await products.findOne({ ProductBarcode: candidate });
                if (!exists) {
                    baseBarcode = candidate;
                    break;
                }
            }
            if (!baseBarcode) {
                return res.status(500).json({ message: req.t('error.serverError'), error: 'Failed to generate unique barcode' });
            }
        } else {
            // If explicit barcode exists -> duplicate
            const pre = await products.findOne({ ProductBarcode: baseBarcode });
            if (pre) {
                return res.status(422).json({ message: req.t('error.duplicateEntry') });
            }
        }

        const productCodes = await generateUniqueProductCodes(qrCount);

        // Create master product (QR #1)
        const masterProduct = new products({
            ProductName: baseName,
            ProductBarcode: baseBarcode,
            ProductCode: productCodes[0],
            DeliveryScannedBy: null,
            ReceivedScannedBy: null,
            qrCodeIndex: 1,
            isMasterQR: true,
            totalQRCodes: qrCount,
            needsSetup: isQuantityOnly
        });

        await masterProduct.save();
        createdProducts.push(masterProduct);
        console.log('Created master product:', masterProduct._id);

        // Create additional QR products if needed
        for (let i = 2; i <= qrCount; i++) {
            const additionalBarcode = isQuantityOnly
                ? `${baseBarcode}Q${i}` // keep it compact
                : `${baseBarcode}-QR${i}`; // keep old behavior when user supplies lot number

            const additionalProduct = new products({
                ProductName: baseName,
                ProductBarcode: additionalBarcode,
                ProductCode: productCodes[i - 1],
                DeliveryScannedBy: null,
                ReceivedScannedBy: null,
                parentProductId: masterProduct._id,
                qrCodeIndex: i,
                isMasterQR: false,
                totalQRCodes: qrCount,
                needsSetup: isQuantityOnly
            });

            // eslint-disable-next-line no-await-in-loop
            await additionalProduct.save();
            createdProducts.push(additionalProduct);
            console.log(`Created additional product ${i}:`, additionalProduct._id);
        }

        res.status(201).json({
            message: req.t('success.productCreated'),
            data: createdProducts,
            qrCount: qrCount,
            masterProductId: masterProduct._id
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ message: req.t('error.serverError'), error: err.message });
    }
})

// Scan by ProductCode (stable code, different from lot number)
router.get('/scan/:code', async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        if (!code) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.invalidData', 'Mã không hợp lệ')
            });
            return res.status(400).send(errorHtml);
        }

        const product = await products.findOne({ ProductCode: code });
        if (!product) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.productNotFound')
            });
            return res.status(404).send(errorHtml);
        }

        // If this product was created via quantity-only, require setup first
        const lang = req.language || 'vi';
        const auto = isAutoFlow(req);
        if (product.needsSetup) {
            return res.redirect(302, `/setup-product/${product._id}?lang=${lang}${auto ? '&auto=1' : ''}`);
        }

        const nextStep = getNextWorkflowStep(product);
        if (!nextStep) {
            const doneHtml = generateHTML(req.language, 'successPage', {
                message: req.t('workflow.workflowCompleted', 'Quy trình đã hoàn tất')
            });
            return res.status(200).send(doneHtml);
        }

        const redirectMap = {
            delivery: `/deliver-product/${product._id}?lang=${lang}${auto ? '&auto=1' : ''}`,
            receive: `/receive-product/${product._id}?lang=${lang}${auto ? '&auto=1' : ''}`,
            assembling: `/assemble-product/${product._id}?lang=${lang}${auto ? '&auto=1' : ''}`,
            warehousing: `/warehouse-product/${product._id}?lang=${lang}${auto ? '&auto=1' : ''}`,
        };

        const redirectUrl = redirectMap[nextStep] || `/deliver-product/${product._id}?lang=${lang}${auto ? '&auto=1' : ''}`;
        return res.redirect(302, redirectUrl);
    } catch (error) {
        console.error('Error scanning product code:', error);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        return res.status(500).send(errorHtml);
    }
});

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

        // Get the scanned product
        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).json({ error: "Product not found" });
        }

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

        // Update the scanned product
        const updateProducts = await products.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        // If this product has multiple QR codes, update workflow status for related products
        if (scannedProduct.totalQRCodes > 1) {
            const relatedProductsQuery = scannedProduct.isMasterQR
                ? { parentProductId: scannedProduct._id }
                : { $or: [
                    { _id: scannedProduct.parentProductId },
                    { parentProductId: scannedProduct.parentProductId }
                ]};

            // Update all related products to allow them to proceed to next step
            await products.updateMany(
                relatedProductsQuery,
                {
                    WorkflowStatus: 'delivered',
                    ProductUpdatedDate: new Date()
                }
            );
        }

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

// Quantity-only form (creates N products + N stable QRs)
router.get('/create-product-quantity-form', async (req, res) => {
    try {
        const html = generateHTML(req.language, 'createProductQuantityOnlyForm', {});
        res.status(200).send(html);
    } catch (error) {
        console.error('Error generating create product quantity form:', error);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        res.status(500).send(errorHtml);
    }
});

// Setup product info after creating via quantity-only (scan QR -> fill name + lot number)
router.get('/setup-product/:id', async (req, res) => {
    try {
        const product = await products.findById(req.params.id);
        if (!product) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.productNotFound')
            });
            return res.status(404).send(errorHtml);
        }

        const html = generateHTML(req.language, 'setupProductForm', {
            productId: req.params.id,
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            productCode: product.ProductCode,
            qrCodeIndex: product.qrCodeIndex || 1,
            totalQRCodes: product.totalQRCodes || 1,
            needsSetup: !!product.needsSetup
        });
        return res.status(200).send(html);
    } catch (error) {
        console.error('Error generating setup product form:', error);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        return res.status(500).send(errorHtml);
    }
});

router.post('/setup-product/:id', async (req, res) => {
    try {
        const { ProductName, ProductBarcode } = req.body || {};
        const name = (ProductName || '').trim();
        const baseBarcode = (ProductBarcode || '').trim();

        if (!name || !baseBarcode) {
            return res.status(400).json({ message: req.t('validation.allFieldsRequired') });
        }

        if (baseBarcode.length > 20) {
            return res.status(400).json({ message: req.t('validation.lotNumberTooLong') });
        }

        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).json({ message: req.t('error.productNotFound') });
        }

        // Disallow changing identity once workflow started
        const started = !!(scannedProduct.ProductDeliveryDate || scannedProduct.ProductReceivedDate || scannedProduct.ProductAssemblingDate || scannedProduct.ProductWarehousingDate);
        if (started) {
            return res.status(400).json({ message: req.t('error.invalidData', 'Sản phẩm đã bắt đầu quy trình, không thể thay đổi thông tin') });
        }

        const masterId = scannedProduct.isMasterQR ? scannedProduct._id : (scannedProduct.parentProductId || scannedProduct._id);
        const groupProducts = await products.find({
            $or: [{ _id: masterId }, { parentProductId: masterId }]
        }).sort({ qrCodeIndex: 1 });

        const groupIds = groupProducts.map(p => p._id);
        const total = (groupProducts[0]?.totalQRCodes) || groupProducts.length || 1;
        const digitsMax = String(total).length;
        const baseMaxLen = 20 - (1 + digitsMax); // base + 'Q' + digits

        if (total > 1 && baseBarcode.length > baseMaxLen) {
            return res.status(400).json({
                message: req.t('validation.lotNumberTooLong', `Số hiệu lố quá dài. Với ${total} QR, tối đa ${baseMaxLen} ký tự.`)
            });
        }

        // Candidate barcodes for full group (ensure unique outside group)
        const candidateBarcodes = groupProducts.map((p) => {
            const idx = p.qrCodeIndex || 1;
            return idx === 1 ? baseBarcode : `${baseBarcode}Q${idx}`;
        });

        const conflicts = await products.find({
            _id: { $nin: groupIds },
            ProductBarcode: { $in: candidateBarcodes }
        }).select('_id ProductBarcode');

        if (conflicts.length > 0) {
            return res.status(422).json({ message: req.t('error.duplicateEntry') });
        }

        const now = new Date();
        const bulkOps = groupProducts.map((p) => {
            const idx = p.qrCodeIndex || 1;
            return {
                updateOne: {
                    filter: { _id: p._id },
                    update: {
                        $set: {
                            ProductName: name,
                            ProductBarcode: idx === 1 ? baseBarcode : `${baseBarcode}Q${idx}`,
                            needsSetup: false,
                            ProductUpdatedDate: now
                        }
                    }
                }
            };
        });

        await products.bulkWrite(bulkOps);

        const updated = await products.find({ _id: { $in: groupIds } }).sort({ qrCodeIndex: 1 });
        return res.status(200).json({
            message: req.t('success.productUpdated', 'Cập nhật thông tin sản phẩm thành công'),
            data: updated,
            masterProductId: masterId
        });
    } catch (error) {
        console.error('Error setting up product:', error);
        return res.status(500).json({ message: req.t('error.serverError'), error: error.message });
    }
});

// Stable QR scan endpoint: one QR per product, never changes.
// Scanning will redirect to the appropriate next workflow step form.
router.get('/scan-product/:id', async (req, res) => {
    try {
        const product = await products.findById(req.params.id);
        if (!product) {
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: req.t('error.productNotFound')
            });
            return res.status(404).send(errorHtml);
        }

        // If this product was created via quantity-only, require setup first
        const lang = req.language || 'vi';
        const auto = isAutoFlow(req);
        if (product.needsSetup) {
            return res.redirect(302, `/setup-product/${req.params.id}?lang=${lang}${auto ? '&auto=1' : ''}`);
        }

        const nextStep = getNextWorkflowStep(product);
        if (!nextStep) {
            const doneHtml = generateHTML(req.language, 'successPage', {
                message: req.t('workflow.workflowCompleted', 'Quy trình đã hoàn tất')
            });
            return res.status(200).send(doneHtml);
        }

        // lang/auto already computed above
        const redirectMap = {
            delivery: `/deliver-product/${req.params.id}?lang=${lang}${auto ? '&auto=1' : ''}`,
            receive: `/receive-product/${req.params.id}?lang=${lang}${auto ? '&auto=1' : ''}`,
            assembling: `/assemble-product/${req.params.id}?lang=${lang}${auto ? '&auto=1' : ''}`,
            warehousing: `/warehouse-product/${req.params.id}?lang=${lang}${auto ? '&auto=1' : ''}`,
        };

        const redirectUrl = redirectMap[nextStep] || `/deliver-product/${req.params.id}?lang=${lang}${auto ? '&auto=1' : ''}`;
        return res.redirect(302, redirectUrl);
    } catch (error) {
        console.error('Error scanning product:', error);
        const errorHtml = generateHTML(req.language, 'errorPage', {
            message: req.t('error.serverError')
        });
        return res.status(500).send(errorHtml);
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

        const auto = isAutoFlow(req);
        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/deliver-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
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

        const nextUrl = `/receive-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`;
        const html = generateHTML(req.language, 'deliveryForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            productId: req.params.id,
            productCode: product.ProductCode,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode,
            autoFlow: auto,
            nextUrl
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

        const auto = isAutoFlow(req);
        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/receive-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
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

        // Validate workflow timing before allowing "receive"
        const validation = await validateWorkflowTiming(product, 'receive');
        if (!validation.isValid) {
            // Auto-flow: always show countdown when waiting time remains
            // Manual: show countdown only when <= 1 minute to avoid long waits on screen
            const shouldShowCountdown = (auto && validation.remainingSeconds > 0) ||
                (validation.remainingMinutes <= 1 && validation.remainingMinutes > 0);
            if (shouldShowCountdown) {
                const html = generateHTML(req.language, 'countdownPage', {
                    message: `${req.t('workflow.waitReceive', 'Chờ thời gian nhận hàng')} - ${scannedUser.UserName}`,
                    remainingSeconds: validation.remainingSeconds,
                    totalSeconds: validation.remainingSeconds,
                    productName: `${product.ProductName} (${product.ProductBarcode})`,
                    nextStep: req.t('workflow.stepReceive', 'Nhận đánh bóng'),
                    minimumMinutes: String(validation.minimumMinutes || 1),
                    nextUrl: `/receive-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
                    autoRedirect: auto
                });
                return res.status(200).send(html);
            }
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: validation.message
            });
            return res.status(400).send(errorHtml);
        }

        const nextUrl = `/assemble-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`;
        const html = generateHTML(req.language, 'receiveForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            shippingQuantity: product.ShippingQuantity,
            productId: req.params.id,
            productCode: product.ProductCode,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode,
            autoFlow: auto,
            nextUrl
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

        const auto = isAutoFlow(req);
        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/assemble-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
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
            const shouldShowCountdown = (auto && validation.remainingSeconds > 0) ||
                (validation.remainingMinutes <= 1 && validation.remainingMinutes > 0);
            if (shouldShowCountdown) {
                const html = generateHTML(req.language, 'countdownPage', {
                    message: `${req.t('workflow.waitAssembling', 'Chờ thời gian lắp ráp')} - ${scannedUser.UserName}`,
                    remainingSeconds: validation.remainingSeconds,
                    totalSeconds: validation.remainingSeconds,
                    productName: `${product.ProductName} (${product.ProductBarcode})`,
                    nextStep: req.t('workflow.stepAssembling', 'Lắp ráp'),
                    minimumMinutes: String(validation.minimumMinutes || 1),
                    nextUrl: `/assemble-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
                    autoRedirect: auto
                });
                return res.status(200).send(html);
            }
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: validation.message
            });
            return res.status(400).send(errorHtml);
        }

        const nextUrl = `/warehouse-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`;
        const html = generateHTML(req.language, 'assemblingForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            receivedQuantity: product.ReceivedQuantity,
            productId: req.params.id,
            productCode: product.ProductCode,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode,
            autoFlow: auto,
            nextUrl
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

        const auto = isAutoFlow(req);
        if (!scannedUser) {
            // User not registered - show registration form
            const deviceInfo = getDeviceInfo(req);
            const html = generateHTML(req.language, 'userRegistrationRequired', {
                deviceInfo,
                redirectUrl: `/warehouse-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
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
            const shouldShowCountdown = (auto && validation.remainingSeconds > 0) ||
                (validation.remainingMinutes <= 1 && validation.remainingMinutes > 0);
            if (shouldShowCountdown) {
                const html = generateHTML(req.language, 'countdownPage', {
                    message: `${req.t('workflow.waitWarehousing', 'Chờ thời gian nhập kho')} - ${scannedUser.UserName}`,
                    remainingSeconds: validation.remainingSeconds,
                    totalSeconds: validation.remainingSeconds,
                    productName: `${product.ProductName} (${product.ProductBarcode})`,
                    nextStep: req.t('workflow.stepWarehousing', 'Nhập kho'),
                    minimumMinutes: String(validation.minimumMinutes || 1),
                    nextUrl: `/warehouse-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`,
                    autoRedirect: auto
                });
                return res.status(200).send(html);
            }
            const errorHtml = generateHTML(req.language, 'errorPage', {
                message: validation.message
            });
            return res.status(400).send(errorHtml);
        }

        const nextUrl = `/scan-product/${req.params.id}?lang=${req.language}${auto ? '&auto=1' : ''}`;
        const html = generateHTML(req.language, 'warehousingForm', {
            productName: product.ProductName,
            productBarcode: product.ProductBarcode,
            assemblingQuantity: product.AssemblingQuantity,
            productId: req.params.id,
            productCode: product.ProductCode,
            userName: scannedUser.UserName,
            employeeCode: scannedUser.EmployeeCode,
            autoFlow: auto,
            nextUrl
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

        // Get the scanned product
        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Validate workflow timing before allowing "receive"
        const validation = await validateWorkflowTiming(scannedProduct, 'receive');
        if (!validation.isValid) {
            return res.status(400).json({ message: validation.message });
        }

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

        // If this product has multiple QR codes, update workflow status for related products
        if (scannedProduct.totalQRCodes > 1) {
            const relatedProductsQuery = scannedProduct.isMasterQR
                ? { parentProductId: scannedProduct._id }
                : { $or: [
                    { _id: scannedProduct.parentProductId },
                    { parentProductId: scannedProduct.parentProductId }
                ]};

            // Update all related products to allow them to proceed to next step
            await products.updateMany(
                relatedProductsQuery,
                {
                    WorkflowStatus: 'received',
                    ProductUpdatedDate: new Date()
                }
            );
        }

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

        // Get the scanned product
        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).send('Product not found');
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

        // If this product has multiple QR codes, update workflow status for related products
        if (scannedProduct.totalQRCodes > 1) {
            const relatedProductsQuery = scannedProduct.isMasterQR
                ? { parentProductId: scannedProduct._id }
                : { $or: [
                    { _id: scannedProduct.parentProductId },
                    { parentProductId: scannedProduct.parentProductId }
                ]};

            // Update all related products to allow them to proceed to next step
            await products.updateMany(
                relatedProductsQuery,
                {
                    WorkflowStatus: 'delivered',
                    ProductUpdatedDate: new Date()
                }
            );
        }

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

        // Get the scanned product
        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).send('Product not found');
        }

        // Validate workflow timing before allowing "receive"
        const validation = await validateWorkflowTiming(scannedProduct, 'receive');
        if (!validation.isValid) {
            const html = generateHTML(req.language, 'countdownPage', {
                message: `${req.t('workflow.waitReceive', 'Chờ thời gian nhận hàng')} - ${scannedUser.UserName}`,
                remainingSeconds: validation.remainingSeconds,
                totalSeconds: validation.remainingSeconds,
                productName: `${scannedProduct.ProductName} (${scannedProduct.ProductBarcode})`,
                nextStep: req.t('workflow.stepReceive', 'Nhận đánh bóng'),
                minimumMinutes: String(validation.minimumMinutes || 1),
                nextUrl: `/update-received/${req.params.id}?lang=${req.language}&quantity=${encodeURIComponent(quantity || '')}`,
                autoRedirect: true
            });
            return res.status(200).send(html);
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

        // If this product has multiple QR codes, update workflow status for related products
        if (scannedProduct.totalQRCodes > 1) {
            const relatedProductsQuery = scannedProduct.isMasterQR
                ? { parentProductId: scannedProduct._id }
                : { $or: [
                    { _id: scannedProduct.parentProductId },
                    { parentProductId: scannedProduct.parentProductId }
                ]};

            // Update all related products to allow them to proceed to next step
            await products.updateMany(
                relatedProductsQuery,
                {
                    WorkflowStatus: 'received',
                    ProductUpdatedDate: new Date()
                }
            );
        }

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
            const html = generateHTML(req.language, 'countdownPage', {
                message: `${req.t('workflow.waitAssembling', 'Chờ thời gian lắp ráp')} - ${scannedUser.UserName}`,
                remainingSeconds: validation.remainingSeconds,
                totalSeconds: validation.remainingSeconds,
                productName: `${product.ProductName} (${product.ProductBarcode})`,
                nextStep: req.t('workflow.stepAssembling', 'Lắp ráp'),
                minimumMinutes: String(validation.minimumMinutes || 1),
                nextUrl: `/update-assembling/${req.params.id}?lang=${req.language}&quantity=${encodeURIComponent(quantity || '')}`,
                autoRedirect: true
            });
            return res.status(200).send(html);
        }

        const scannedBy = `${scannedUser.UserName} (${scannedUser.EmployeeCode})`;

        // Get the scanned product
        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).send('Product not found');
        }

        const updateData = {
            ProductAssemblingDate: new Date(),
            ProductUpdatedDate: new Date(),
            AssemblingScannedBy: scannedBy,
            WorkflowStatus: updateWorkflowStatus({...scannedProduct.toObject(), ProductAssemblingDate: new Date()})
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

        // If this product has multiple QR codes, update workflow status for related products
        if (scannedProduct.totalQRCodes > 1) {
            const relatedProductsQuery = scannedProduct.isMasterQR
                ? { parentProductId: scannedProduct._id }
                : { $or: [
                    { _id: scannedProduct.parentProductId },
                    { parentProductId: scannedProduct.parentProductId }
                ]};

            // Update all related products to allow them to proceed to next step
            await products.updateMany(
                relatedProductsQuery,
                {
                    WorkflowStatus: updateWorkflowStatus({...scannedProduct.toObject(), ProductAssemblingDate: new Date()}),
                    ProductUpdatedDate: new Date()
                }
            );
        }

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
            const html = generateHTML(req.language, 'countdownPage', {
                message: `${req.t('workflow.waitWarehousing', 'Chờ thời gian nhập kho')} - ${scannedUser.UserName}`,
                remainingSeconds: validation.remainingSeconds,
                totalSeconds: validation.remainingSeconds,
                productName: `${product.ProductName} (${product.ProductBarcode})`,
                nextStep: req.t('workflow.stepWarehousing', 'Nhập kho'),
                minimumMinutes: String(validation.minimumMinutes || 1),
                nextUrl: `/update-warehousing/${req.params.id}?lang=${req.language}&quantity=${encodeURIComponent(quantity || '')}`,
                autoRedirect: true
            });
            return res.status(200).send(html);
        }

        // Get the scanned product
        const scannedProduct = await products.findById(req.params.id);
        if (!scannedProduct) {
            return res.status(404).send('Product not found');
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

        // If this product has multiple QR codes, update workflow status for related products
        if (scannedProduct.totalQRCodes > 1) {
            const relatedProductsQuery = scannedProduct.isMasterQR
                ? { parentProductId: scannedProduct._id }
                : { $or: [
                    { _id: scannedProduct.parentProductId },
                    { parentProductId: scannedProduct.parentProductId }
                ]};

            // Update all related products to completed status
            await products.updateMany(
                relatedProductsQuery,
                {
                    WorkflowStatus: 'completed',
                    ProductUpdatedDate: new Date()
                }
            );
        }

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
        // Single config place: show only global_step_delay
        const configs = await WorkflowConfig.find({ stepName: 'global_step_delay' }).sort({ stepName: 1 });
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

        // Enforce "single place to configure": only allow global_step_delay updates
        if (stepName !== 'global_step_delay') {
            return res.status(400).json({
                message: 'Chỉ cho phép cấu hình tại global_step_delay (1 chỗ cho tất cả bước quét)',
                language: req.language
            });
        }

        const setData = { updatedDate: new Date() };
        if (minimumMinutes !== undefined) {
            const parsed = parseInt(minimumMinutes, 10);
            if (Number.isNaN(parsed)) {
                return res.status(400).json({
                    message: 'minimumMinutes không hợp lệ',
                    language: req.language
                });
            }
            setData.minimumMinutes = Math.max(0, parsed);
        }
        if (description !== undefined) setData.description = description;
        if (isActive !== undefined) setData.isActive = Boolean(isActive);

        const fallbackDescription = 'Thời gian tối thiểu giữa mỗi bước quét (áp dụng cho tất cả bước)';
        const update = {
            $set: setData,
            $setOnInsert: {
                stepName: 'global_step_delay',
                description: fallbackDescription,
                isActive: true
            }
        };

        const updatedConfig = await WorkflowConfig.findOneAndUpdate(
            { stepName: 'global_step_delay' },
            update,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

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

// Test countdown page
router.get('/test-countdown/:seconds?', async (req, res) => {
    try {
        const seconds = parseInt(req.query.seconds) || 45; // Default 45 seconds for testing

        const html = generateHTML(req.language, 'countdownPage', {
            message: 'Test Countdown Timer',
            remainingSeconds: seconds,
            totalSeconds: seconds,
            productName: 'Test Product (TEST-001)',
            nextStep: 'Test Next Step',
            minimumMinutes: '1',
            nextUrl: '/test-countdown?seconds=' + seconds + '&completed=true',
            autoRedirect: true
        });

        res.status(200).send(html);
    } catch (error) {
        console.error('Error generating test countdown page:', error);
        res.status(500).send('Error loading test countdown');
    }
});

router.get('/workflow-admin', async (req, res) => {
    try {
        // Single config place: show only global_step_delay
        const configs = await WorkflowConfig.find({ stepName: 'global_step_delay' }).sort({ stepName: 1 });
        
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
                                <li><strong>global_step_delay:</strong> Thời gian tối thiểu giữa mỗi bước quét (áp dụng cho tất cả bước)</li>
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