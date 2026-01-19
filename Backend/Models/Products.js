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
    });

const Products = mongoose.model("Products", ProductSchema)
module.exports = Products;
