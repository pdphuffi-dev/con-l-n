const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema(
    {
        UserName: {
            type: String,
            required: true,
        },
        EmployeeCode: {
            type: String,
            required: true,
            unique: true,
        },
        DeviceIP: {
            type: String,
            required: false,
        },
        DeviceId: {
            type: String,
            required: false,
            unique: true,
            sparse: true
        },
        DeviceInfo: {
            browser: String,
            os: String,
            userAgent: String,
            lastSeen: Date
        },
        CreatedDate: {
            type: Date,
            default: Date.now,
            required: false,
        },
        UpdatedDate: {
            type: Date,
            required: false,
        },
        LastLoginDate: {
            type: Date,
            required: false,
        },
    });

const User = mongoose.model("User", UserSchema)
module.exports = User;