const app = getApp();
const authService = require("../../services/auth");

Page({
  data: {
    form: {
      name: "",
      phone: "",
      code: ""
    },
    countdown: 0,
    agreementAccepted: false,
    sending: false,
    logging: false,
    statusText: "",
    statusTextInline: false,
    _timer: null
  },

  onShow() {
    const currentUser = app.refreshSession();
    if (currentUser && currentUser.approvalStatus === "approved") {
      wx.switchTab({
        url: "/pages/board/index"
      });
    }
  },

  onUnload() {
    if (this.data._timer) {
      clearInterval(this.data._timer);
    }
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: event.detail.value,
      statusText: "",
      statusTextInline: false
    });
  },

  onAgreementChange(event) {
    const values = event.detail.value || [];
    this.setData({
      agreementAccepted: values.includes("accepted"),
      statusText: "",
      statusTextInline: false
    });
  },

  requireAgreement() {
    if (this.data.agreementAccepted) {
      return true;
    }
    wx.showToast({ title: "请先阅读并勾选协议", icon: "none" });
    this.setData({
      statusText: "请自主阅读《用户协议》和《隐私政策》后，勾选同意再继续",
      statusTextInline: false
    });
    return false;
  },

  // 发送验证码
  async sendCode() {
    if (!this.requireAgreement()) {
      return;
    }

    const { name, phone } = this.data.form;
    const trimmedName = String(name || "").trim();
    const trimmedPhone = String(phone || "").trim();

    if (!trimmedName) {
      wx.showToast({ title: "请输入姓名", icon: "none" });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      wx.showToast({ title: "手机号格式不正确", icon: "none" });
      return;
    }

    this.setData({ sending: true });
    wx.showLoading({ title: "发送中..." });

    try {
      await authService.checkMiniUser(trimmedName, trimmedPhone);
      const res = await wx.cloud.callFunction({
        name: "sendSms",
        data: { phone: trimmedPhone }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: "验证码已发送", icon: "success" });
        this.startCountdown();
      } else {
        const msg = (res.result && res.result.error) || "发送失败";
        wx.showToast({ title: msg, icon: "none" });
        this.setData({ statusText: msg, statusTextInline: false });
      }
    } catch (err) {
      wx.hideLoading();
      const msg = (err && (err.message || err.errMsg)) || "发送失败，请稍后重试";
      wx.showToast({ title: msg, icon: "none" });
      this.setData({ statusText: msg, statusTextInline: false });
    } finally {
      this.setData({ sending: false });
    }
  },

  // 60秒倒计时
  startCountdown() {
    this.setData({ countdown: 60 });
    if (this.data._timer) {
      clearInterval(this.data._timer);
    }
    const timer = setInterval(() => {
      if (this.data.countdown <= 1) {
        clearInterval(timer);
        this.setData({ countdown: 0, _timer: null });
      } else {
        this.setData({ countdown: this.data.countdown - 1 });
      }
    }, 1000);
    this.setData({ _timer: timer });
  },

  // 登录
  async login() {
    if (!this.requireAgreement()) {
      return;
    }

    const { name, phone, code } = this.data.form;
    const trimmedName = String(name || "").trim();
    const trimmedPhone = String(phone || "").trim();
    const trimmedCode = String(code || "").trim();

    if (!trimmedName) {
      wx.showToast({ title: "请输入姓名", icon: "none" });
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      wx.showToast({ title: "手机号格式不正确", icon: "none" });
      return;
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      wx.showToast({ title: "请输入6位验证码", icon: "none" });
      return;
    }

    this.setData({ logging: true, statusText: "", statusTextInline: false });
    wx.showLoading({ title: "登录中..." });

    try {
      // 调用云函数校验验证码
      const res = await wx.cloud.callFunction({
        name: "verifySmsCode",
        data: { name: trimmedName, phone: trimmedPhone, code: trimmedCode }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        const session = (res.result && res.result.session) || null;
        if (!session || !session.token) {
          throw new Error("登录会话生成失败，请重新获取验证码");
        }
        authService.setMiniSession(session);
        const profile = await authService.fetchMiniProfile(session);
        authService.setCurrentUser(profile, session);
        app.refreshSession();
        wx.showToast({ title: "登录成功", icon: "success" });
        setTimeout(() => {
          wx.switchTab({
            url: "/pages/board/index"
          });
        }, 800);
      } else {
        const msg = (res.result && res.result.error) || "登录失败";
        wx.showToast({ title: msg, icon: "none" });
        this.setData({ statusText: msg, statusTextInline: false });
      }
    } catch (err) {
      wx.hideLoading();
      const msg = (err && (err.message || err.errMsg)) || "登录失败，请稍后重试";
      wx.showToast({ title: msg, icon: "none" });
      this.setData({ statusText: msg, statusTextInline: false });
    } finally {
      this.setData({ logging: false });
    }
  },

  openPrivacy() {
    wx.navigateTo({ url: "/pages/privacy/index" });
  },

  openTerms() {
    wx.navigateTo({ url: "/pages/terms/index" });
  }
});




