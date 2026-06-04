const app = getApp();
const authService = require("../../services/auth");

Page({
  data: {
    form: {
      name: "",
      phone: "",
      smsCode: ""
    },
    verifiedUser: null,
    expectedCode: "",
    smsSent: false,
    statusText: ""
  },

  onShow() {
    const currentUser = app.refreshSession();
    if (currentUser && currentUser.approvalStatus === "approved") {
      wx.switchTab({
        url: "/pages/board/index"
      });
    }
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: event.detail.value,
      smsSent: field === "smsCode" ? this.data.smsSent : false,
      verifiedUser: field === "smsCode" ? this.data.verifiedUser : null,
      expectedCode: field === "smsCode" ? this.data.expectedCode : "",
      statusText: field === "smsCode" ? this.data.statusText : ""
    });
  },

  async requestSmsCode() {
    const name = String(this.data.form.name || "").trim();
    const phone = String(this.data.form.phone || "").trim();
    if (!name || !phone) {
      wx.showToast({ title: "请填写姓名和手机号", icon: "none" });
      return;
    }
    const user = authService.getUsers().find((item) => item.name === name && item.phone === phone);
    if (!user) {
      wx.showToast({ title: "数据库中未找到该账号", icon: "none" });
      this.setData({ statusText: "请确认姓名、手机号是否与管理员录入信息一致。" });
      return;
    }
    if (user.approvalStatus !== "approved") {
      wx.showToast({ title: "账号尚未审批通过", icon: "none" });
      this.setData({ statusText: "该账号存在，但还不能登录，请等待管理员审批。" });
      return;
    }

    const code = String(Math.random()).slice(2, 8);
    wx.showLoading({ title: "发送中..." });

    try {
      const res = await wx.cloud.callFunction({
        name: "sendSms",
        data: { phone, code }
      });
      wx.hideLoading();

      if (!res.result || !res.result.success) {
        const errMsg = res.result?.error || "发送失败";
        wx.showToast({ title: errMsg, icon: "none" });
        this.setData({ statusText: `发送失败：${errMsg}` });
        return;
      }

      this.setData({
        verifiedUser: user,
        expectedCode: code,
        smsSent: true,
        statusText: `信息核实通过，验证码已发送到 ${phone}。`
      });
      wx.showToast({ title: "验证码已发送", icon: "success" });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: "网络错误", icon: "none" });
      this.setData({ statusText: `网络错误：${err.message}` });
    }
  },

  login() {
    const { smsCode } = this.data.form;
    const user = authService.findApprovedUserByIdentity(
      this.data.form.name,
      this.data.form.phone
    );
    if (!user) {
      wx.showToast({ title: "请先获取验证码", icon: "none" });
      return;
    }
    if (!this.data.verifiedUser || this.data.verifiedUser.id !== user.id) {
      wx.showToast({ title: "请重新获取验证码", icon: "none" });
      this.setData({
        verifiedUser: null,
        expectedCode: "",
        smsSent: false
      });
      return;
    }
    if (!this.data.smsSent || smsCode !== this.data.expectedCode) {
      wx.showToast({ title: "验证码不正确", icon: "none" });
      return;
    }
    authService.setCurrentUser(user.id);
    app.refreshSession();
    wx.switchTab({
      url: "/pages/board/index"
    });
  }
});
