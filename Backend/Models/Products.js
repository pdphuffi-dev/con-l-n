const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema(
    {
        ProductName: {
            type: String,
            required: true,
        },
        ProductBarcode: {
            type: Number,
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
    });

const Products = mongoose.model("Products", ProductSchema)
module.exports = Products;
