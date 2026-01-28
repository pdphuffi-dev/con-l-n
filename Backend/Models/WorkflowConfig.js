const mongoose = require('mongoose');

const WorkflowConfigSchema = new mongoose.Schema({
    stepName: {
        type: String,
        required: true,
        unique: true,
        // Use ONE global config for all steps; legacy step configs are kept for compatibility.
        enum: [
            'global_step_delay',
            'delivery_to_receive',
            'receive_to_assembling',
            'assembling_to_warehousing'
        ]
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
        // Ensure ONE global config exists (single place to configure)
        const globalExists = await WorkflowConfig.findOne({ stepName: 'global_step_delay' });
        if (!globalExists) {
            await WorkflowConfig.create({
                stepName: 'global_step_delay',
                minimumMinutes: 1,
                description: 'Thời gian tối thiểu giữa mỗi bước quét (áp dụng cho tất cả bước)',
                isActive: true
            });
            console.log('Global workflow configuration initialized');
        }
    } catch (error) {
        console.error('Error initializing workflow config:', error);
    }
};

module.exports = { WorkflowConfig, initializeDefaultConfig };