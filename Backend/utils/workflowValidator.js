const { WorkflowConfig } = require('../Models/WorkflowConfig');

/**
 * Validate if enough time has passed between workflow steps
 * @param {Object} product - Product document
 * @param {String} nextStep - Next step to validate
 * @returns {Object} - { isValid: boolean, message: string, remainingMinutes: number }
 */
const validateWorkflowTiming = async (product, nextStep) => {
    try {
        let configStepName;
        let previousStepDate;
        let stepDescription;

        switch (nextStep) {
            case 'receive':
                configStepName = 'delivery_to_receive';
                previousStepDate = product.ProductDeliveryDate;
                stepDescription = 'nhận hàng';
                break;
            case 'assembling':
                configStepName = 'receive_to_assembling';
                previousStepDate = product.ProductReceivedDate;
                stepDescription = 'lắp ráp';
                break;
            case 'warehousing':
                configStepName = 'assembling_to_warehousing';
                previousStepDate = product.ProductAssemblingDate;
                stepDescription = 'nhập kho';
                break;
            default:
                return { isValid: true, message: '', remainingMinutes: 0 };
        }

        if (!previousStepDate) {
            return {
                isValid: false,
                message: `Bước trước đó chưa được hoàn thành`,
                remainingMinutes: 0
            };
        }

        const config = await WorkflowConfig.findOne({ 
            stepName: configStepName, 
            isActive: true 
        });

        if (!config) {
            // If no config found, allow the step
            return { isValid: true, message: '', remainingMinutes: 0 };
        }

        const now = new Date();
        const timeDifferenceMs = now - previousStepDate;
        const timeDifferenceMinutes = Math.floor(timeDifferenceMs / (1000 * 60));
        const remainingMinutes = Math.max(0, config.minimumMinutes - timeDifferenceMinutes);

        if (timeDifferenceMinutes < config.minimumMinutes) {
            return {
                isValid: false,
                message: `Cần chờ thêm ${remainingMinutes} phút nữa mới có thể ${stepDescription}. Thời gian tối thiểu là ${config.minimumMinutes} phút.`,
                remainingMinutes: remainingMinutes
            };
        }

        return { isValid: true, message: '', remainingMinutes: 0 };

    } catch (error) {
        console.error('Error validating workflow timing:', error);
        // In case of error, allow the step to proceed
        return { isValid: true, message: '', remainingMinutes: 0 };
    }
};

/**
 * Get the next step in the workflow
 * @param {Object} product - Product document
 * @returns {String} - Next step name or null if completed
 */
const getNextWorkflowStep = (product) => {
    if (!product.ProductDeliveryDate) {
        return 'delivery';
    }
    if (!product.ProductReceivedDate) {
        return 'receive';
    }
    if (!product.ProductAssemblingDate) {
        return 'assembling';
    }
    if (!product.ProductWarehousingDate) {
        return 'warehousing';
    }
    return null; // Workflow completed
};

/**
 * Update product workflow status based on completed steps
 * @param {Object} product - Product document
 * @returns {String} - Updated workflow status
 */
const updateWorkflowStatus = (product) => {
    if (product.ProductWarehousingDate) {
        return 'completed';
    }
    if (product.ProductAssemblingDate) {
        return 'warehoused';
    }
    if (product.ProductReceivedDate) {
        return 'assembling';
    }
    if (product.ProductDeliveryDate) {
        return 'received';
    }
    return 'created';
};

module.exports = {
    validateWorkflowTiming,
    getNextWorkflowStep,
    updateWorkflowStatus
};