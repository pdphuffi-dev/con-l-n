module.exports = {
  success: {
    productCreated: "製品が正常に作成されました",
    productUpdated: "製品が正常に更新されました",
    productDeleted: "製品が正常に削除されました",
    productDelivered: "製品が正常に出荷されました",
    productReceived: "製品が正常に受入されました",
    userCreated: "ユーザーが正常に作成されました",
    userUpdated: "ユーザーが正常に更新されました",
    userDeleted: "ユーザーが正常に削除されました",
    dataRetrieved: "データが正常に取得されました"
  },

  error: {
    productNotFound: "製品が見つかりません",
    userNotFound: "ユーザーが見つかりません",
    invalidData: "無効なデータです",
    serverError: "内部サーバーエラー",
    databaseError: "データベースエラー",
    validationError: "データ検証エラー",
    missingFields: "必須フィールドが不足しています",
    duplicateEntry: "データが既に存在します",
    unauthorized: "アクセス権限がありません",
    forbidden: "アクセスが禁止されています"
  },

  validation: {
    productNameRequired: "すべての情報を入力してください",
    lotNumberRequired: "ロット番号は20文字以内で入力してください",
    quantityRequired: "有効な数量を入力してください",
    quantityMustBeNumber: "数量は数値である必要があります",
    quantityMustBePositive: "数量は0より大きい必要があります",
    userNameRequired: "ユーザー名は必須です",
    emailRequired: "メールアドレスは必須です",
    emailInvalid: "メールアドレスが無効です",
    allFieldsRequired: "すべての情報を入力してください",
    lotNumberTooLong: "ロット番号は20文字以内で入力してください"
  },

  status: {
    pending: "処理待ち",
    processing: "処理中",
    completed: "完了",
    cancelled: "キャンセル済み",
    delivered: "出荷済み",
    received: "受入済み"
  },

  main: {
    addNewProduct: '新規商品登録'
  },

  form: {
    deliveryQuantity: '研磨品の出荷数量を入力',
    productName: '製品名',
    lotNumber: 'ロット番号',
    employeeCode: '従業員コード'
    },
    
    table:{
      lotNumber: 'ット番号',
    },

    form: {
     receiveQuantity: '研磨受入数量を入力',
    productName: '製品名',
    lotNumber: 'ロット番号',
    employeeCode: '従業員コード'
    },
    
    table:{
      lotNumber: 'ット番号',
    },
  
};