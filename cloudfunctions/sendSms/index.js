const crypto = require("crypto");
const cloud = require("wx-server-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SMS_CONFIG = {
  secretId: process.env.TENCENTCLOUD_SECRET_ID || "",
  secretKey: process.env.TENCENTCLOUD_SECRET_KEY || "",
  SdkAppId: process.env.TENCENTCLOUD_SMS_SDK_APP_ID || "1401138557",
  TemplateId: process.env.TENCENTCLOUD_SMS_TEMPLATE_ID || "2657496",
  SignName: process.env.TENCENTCLOUD_SMS_SIGN_NAME || "深圳润六尺科技有限公司",
  region: process.env.TENCENTCLOUD_SMS_REGION || "ap-guangzhou"
};

const CODE_EXPIRE_MINUTES = 5;
const SEND_INTERVAL_SECONDS = 60;
const OPENID_DAILY_LIMIT = Number(process.env.SMS_OPENID_DAILY_LIMIT || 5);
const PHONE_DAILY_LIMIT = Number(process.env.SMS_PHONE_DAILY_LIMIT || 10);

function requireSmsConfig() {
  return SMS_CONFIG.secretId && SMS_CONFIG.secretKey && SMS_CONFIG.SdkAppId && SMS_CONFIG.TemplateId && SMS_CONFIG.SignName;
}

function createSmsClient() {
  const SmsClient = tencentcloud.sms.v20210111.Client;
  return new SmsClient({
    credential: {
      secretId: SMS_CONFIG.secretId,
      secretKey: SMS_CONFIG.secretKey
    },
    region: SMS_CONFIG.region,
    profile: { httpProfile: { endpoint: "sms.tencentcloudapi.com" } }
  });
}

async function countRecent(where) {
  try {
    const res = await db.collection("sms_codes").where(where).count();
    return res.total || 0;
  } catch (err) {
    console.error("sms_codes count failed", err);
    throw new Error("短信频控检查失败，请稍后再试");
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  const normalizedPhone = String(event.phone || "").trim();

  if (!openid) {
    return { success: false, error: "微信身份校验失败，请重新进入小程序" };
  }
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
    return { success: false, error: "手机号格式不正确" };
  }
  if (!requireSmsConfig()) {
    return { success: false, error: "短信服务未配置，请联系管理员" };
  }

  const nowMs = Date.now();
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
  const recentThreshold = nowMs - SEND_INTERVAL_SECONDS * 1000;

  try {
    const recentByPhone = await countRecent({
      phone: normalizedPhone,
      createTimeMs: _.gt(recentThreshold)
    });
    if (recentByPhone > 0) {
      return { success: false, error: "发送太频繁，请稍后再试" };
    }

    const dailyByOpenid = await countRecent({
      openid,
      createTimeMs: _.gt(oneDayAgo)
    });
    if (dailyByOpenid >= OPENID_DAILY_LIMIT) {
      return { success: false, error: "今日验证码次数已达上限" };
    }

    const dailyByPhone = await countRecent({
      phone: normalizedPhone,
      createTimeMs: _.gt(oneDayAgo)
    });
    if (dailyByPhone >= PHONE_DAILY_LIMIT) {
      return { success: false, error: "该手机号今日验证码次数已达上限" };
    }
  } catch (err) {
    return { success: false, error: err.message || "短信频控检查失败" };
  }

  const code = crypto.randomInt(100000, 1000000).toString();

  try {
    const res = await createSmsClient().SendSms({
      PhoneNumberSet: ["+86" + normalizedPhone],
      SmsSdkAppId: SMS_CONFIG.SdkAppId,
      TemplateId: SMS_CONFIG.TemplateId,
      SignName: SMS_CONFIG.SignName,
      TemplateParamSet: [code, String(CODE_EXPIRE_MINUTES)]
    });

    const status = res.SendStatusSet && res.SendStatusSet[0];
    if (!status || status.Code !== "Ok") {
      return {
        success: false,
        error: (status && status.Message) || "短信发送失败",
        errCode: status && status.Code
      };
    }
  } catch (err) {
    console.error("sendSms api error", err);
    return { success: false, error: err.message || "短信发送失败" };
  }

  try {
    await db.collection("sms_codes").add({
      data: {
        openid,
        phone: normalizedPhone,
        code,
        expireAtMs: nowMs + CODE_EXPIRE_MINUTES * 60 * 1000,
        used: false,
        attempts: 0,
        createTimeMs: nowMs,
        createTime: db.serverDate()
      }
    });
  } catch (err) {
    console.error("save sms code error", err);
    return { success: false, error: "验证码存储失败，请联系管理员" };
  }

  return { success: true, message: "验证码已发送" };
};
