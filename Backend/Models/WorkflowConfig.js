const mongoose = require('mongoose');

const WorkflowConfigSchema = new mongoose.Schema({
    stepName: {
        type: String,
        required: true,
        unique: true,
        enum: ['delivery_to_receive', 'receive_to_assembling', 'assembling_to_warehousing']
    },
    minimumMinutes: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    description: {
        type: String,
        required: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdDate: {
        type: Date,
        default: Date.now
    },
    updatedDate: {
        type: Date,
        required: false
    }
});

const WorkflowConfig = mongoose.model("WorkflowConfig", WorkflowConfigSchema);

// Initialize default configurations
const initializeDefaultConfig = async () => {
    try {
        const existingConfigs = await WorkflowConfig.countDocuments();
        if (existingConfigs === 0) {
            const defaultConfigs = [
                {
                    stepName: 'delivery_to_receive',
                    minimumMinutes: 30,
                    description: 'Thời gian tối thiểu từ giao hàng đến nhận hàng'
                },
                {
                    stepName: 'receive_to_assembling',
                    minimumMinutes: 60,
                    description: 'Thời gian tối thiểu từ nhận hàng đến lắp ráp'
                },
                {
                    stepName: 'assembling_to_warehousing',
                    minimumMinutes: 120,
                    description: 'Thời gian tối thiểu từ lắp ráp đến nhập kho'
                }
            ];
            
            await WorkflowConfig.insertMany(defaultConfigs);
            console.log('Default workflow configurations initialized');
        }
    } catch (error) {
        console.error('Error initializing workflow config:', error);
    }
};

module.exports = { WorkflowConfig, initializeDefaultConfig };