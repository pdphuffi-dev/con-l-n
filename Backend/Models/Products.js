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
