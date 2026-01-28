module.exports = {
  success: {
    productCreated: "Sản phẩm đã được tạo thành công",
    productUpdated: "Sản phẩm đã được cập nhật thành công",
    productDeleted: "Sản phẩm đã được xóa thành công",
    productDelivered: "Sản phẩm đã được giao thành công",
    productReceived: "Sản phẩm đã được nhận thành công",
    productAssembled: "Sản phẩm đã được lắp ráp thành công",
    productWarehoused: "Sản phẩm đã được nhập kho thành công",
    userCreated: "Người dùng đã được tạo thành công",
    userUpdated: "Người dùng đã được cập nhật thành công",
    userDeleted: "Người dùng đã được xóa thành công",
    dataRetrieved: "Dữ liệu đã được lấy thành công"
  },

  error: {
    productNotFound: "Không tìm thấy sản phẩm",
    userNotFound: "Không tìm thấy người dùng",
    invalidData: "Dữ liệu không hợp lệ",
    serverError: "Lỗi máy chủ nội bộ",
    databaseError: "Lỗi cơ sở dữ liệu",
    validationError: "Lỗi xác thực dữ liệu",
    missingFields: "Thiếu các trường bắt buộc",
    duplicateEntry: "Dữ liệu đã tồn tại",
    unauthorized: "Không có quyền truy cập",
    forbidden: "Bị cấm truy cập"
  },

  validation: {
    productNameRequired: "Vui lòng nhập đầy đủ thông tin",
    lotNumberRequired: "Số hiệu lố không được quá 20 ký tự",
    quantityRequired: "Vui lòng nhập số lượng hợp lệ",
    quantityMustBeNumber: "Số lượng phải là một số",
    quantityMustBePositive: "Số lượng phải lớn hơn 0",
    userNameRequired: "Tên người dùng là bắt buộc",
    emailRequired: "Email là bắt buộc",
    emailInvalid: "Email không hợp lệ",
    allFieldsRequired: "Vui lòng nhập đầy đủ thông tin",
    lotNumberTooLong: "Số hiệu lố không được quá 20 ký tự"
  },

  status: {
    pending: "Đang chờ xử lý",
    processing: "Đang xử lý",
    completed: "Hoàn thành",
    cancelled: "Đã hủy",
    delivered: "Đã giao",
    received: "Đã nhận"
  },

  main: {
    addNewProduct: 'Thêm sản phẩm mới'
  },

  form: {
    deliveryQuantity: 'Nhập số lượng giao đánh bóng',
    receivedQuantity: 'Nhập số lượng nhận đánh bóng',
    assemblingQuantity: 'Nhập số lượng lắp ráp',
    warehousingQuantity: 'Nhập số lượng nhập kho',
    productName: 'Tên sản phẩm',
    lotNumber: 'Số hiệu lố',
    employeeCode: 'Mã nhân viên',
    submit: 'Gửi'
    },

    table:{
      lotNumber: 'Số hiệu lố',
      quantity: 'Số lượng',
      assembling: 'Lắp ráp',
      warehousing: 'Nhập kho',
      scanToAssemble: 'Quét để lắp ráp',
      scanToWarehouse: 'Quét để nhập kho',
      assemblingInfo: 'Thông tin lắp ráp',
      warehousingInfo: 'Thông tin nhập kho',
     },

  auth: {
    registrationRequired: 'Yêu cầu đăng ký người dùng',
    actionNotAllowed: 'Hành động không được phép',
    deliveryRequiresRegistration: 'Bạn cần đăng ký làm người dùng để có thể quét sản phẩm giao hàng',
    receiveRequiresRegistration: 'Bạn cần đăng ký làm người dùng để có thể quét sản phẩm nhận hàng',
    registerAndContinue: 'Đăng ký và tiếp tục',
    userNotRegistered: 'Người dùng chưa được đăng ký'
  },

  users: {
    addNewUser: 'Thêm người dùng mới',
    userName: 'Tên người dùng'
  },

  common: {
    loading: 'Đang tải...',
    noData: 'Không có dữ liệu',
    success: 'Thành công'
  },

  messages: {
    error: 'Lỗi',
    somethingWentWrong: 'Có lỗi xảy ra'
  },

  workflow: {
    timingError: 'Chưa đủ thời gian để thực hiện bước tiếp theo',
    workflowCompleted: 'Quy trình đã hoàn tất',
    nextStep: 'Bước tiếp theo',
    currentStatus: 'Trạng thái hiện tại',
    waitTime: 'Thời gian chờ',
    minutes: 'phút'
  },


};