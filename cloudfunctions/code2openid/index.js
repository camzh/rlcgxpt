const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const CONFIG = {
  APP_ID: process.env.WX_APP_ID || "",
  APP_SECRET: process.env.WX_APP_SECRET || ""
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const code = event.code || "";

  if (!code) {
    return { success: false, error: "code 不能为空" };
  }

  if (!CONFIG.APP_ID || !CONFIG.APP_SECRET) {
    return { success: false, error: "微信配置缺失" };
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${CONFIG.APP_ID}&secret=${CONFIG.APP_SECRET}&js_code=${code}&grant_type=authorization_code`;

  try {
    const res = await cloud.cloudRequest({
      url,
      method: "GET"
    });

    const data = res.data || {};

    if (data.errcode) {
      return {
        success: false,
        errcode: data.errcode,
        errmsg: data.errmsg || "code2session 失败"
      };
    }

    return {
      success: true,
      openid: data.openid || "",
      session_key: data.session_key || "",
      // 信任的云函数内部调用才返回 unionid
      unionid: data.unionid || ""
    };
  } catch (err) {
    return { success: false, error: err.message || "code2session 失败" };
  }
};
