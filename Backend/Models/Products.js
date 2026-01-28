const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema(
    {
        ProductName: {
            type: String,
            required: true,
        },
        ProductBarcode: {
            type: String,
            required: true,
        },
        // Multi-QR support (one "master" + related QR items)
        parentProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Products',
            required: false,
            default: null,
        },
        qrCodeIndex: {
            type: Number,
            required: false,
            default: 1,
        },
        isMasterQR: {
            type: Boolean,
            required: false,
            default: true,
        },
        totalQRCodes: {
            type: Number,
            required: false,
            default: 1,
        },
        // When created via "quantity-only", user must scan QR to set real info first
        needsSetup: {
            type: Boolean,
            required: false,
            default: false,
        },
        ProductCreatedDate: {
            type: Date,
            default: Date.now,
            required: false,
        },
        ProductDeliveryDate: {
            type: Date,
            required: false,
        },
        ProductReceivedDate: {
            type: Date,
            required: false,
        },
        ProductUpdatedDate: {
            type: Date,
            required: false,
        },
        DeliveryScannedBy: {
            type: String,
            required: false,
        },
        ReceivedScannedBy: {
            type: String,
            required: false,
        },
        WorkflowStep: {
            type: String,
            enum: ['delivery', 'received', 'completed'],
            required: false,
        },
        NextStepAvailable: {
            type: Date,
            required: false,
        },
        CountdownDuration: {
            type: Number, // in seconds
            default: 0,
            required: false,
        },
        ShippingQuantity: {
            type: Number,
            required: false,
        },
        ReceivedQuantity: {
            type: Number,
            required: false,
        },
        // New workflow steps
        ProductAssemblingDate: {
            type: Date,
            required: false,
        },
        ProductWarehousingDate: {
            type: Date,
            required: false,
        },
        AssemblingScannedBy: {
            type: String,
            required: false,
        },
        WarehousingScannedBy: {
            type: String,
            required: false,
        },
        AssemblingQuantity: {
            type: Number,
            required: false,
        },
        WarehousingQuantity: {
            type: Number,
            required: false,
        },
        // Workflow status tracking
        WorkflowStatus: {
            type: String,
            enum: ['created', 'delivered', 'received', 'assembling', 'warehoused', 'completed'],
            default: 'created',
            required: false,
        },
    });

const Products = mongoose.model("Products", ProductSchema)
module.exports = Products;
