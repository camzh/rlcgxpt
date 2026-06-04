const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { phone, code } = event;
  const normalizedPhone = String(phone || "").trim();
  const smsPhone = normalizedPhone.startsWith("+86") ? normalizedPhone : `+86${normalizedPhone}`;

  if (!/^(\+86)?1[3-9]\d{9}$/.test(normalizedPhone)) {
    return { success: false, error: "手机号格式不正确" };
  }
  if (!/^\d{6}$/.test(String(code || ""))) {
    return { success: false, error: "验证码格式不正确" };
  }

  try {
    const result = await cloud.openapi.cloudbase.sendSms({
      env: cloud.DYNAMIC_CURRENT_ENV,
      content: `【货源看板】您的验证码是 ${code}，5分钟内有效。`,
      phoneNumberList: [smsPhone]
    });
    return { success: true, result };
  } catch (err) {
    console.error("sendSms failed", err);
    return {
      success: false,
      error: err.errMsg || err.message || "发送失败",
      errCode: err.errCode || err.code || "",
      rawError: JSON.stringify(err)
    };
  }
};
