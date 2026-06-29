const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");

Page({
  data: {
    pendingReviewCount: 0,
    pendingOfflineCount: 0,
    processingIds: {},
    dashboard: {
      stats: {},
      periodStats: {},
      pendingReviewItems: [],
      pendingOfflineItems: [],
      pendingDemandOfflineItems: [],
      market: { midpoint: "0", pricePoints: [], asks: [], bids: [], totalVolume: 0 }
    }
  },

  onShow() {
    const currentUser = app.requireApprovedUser();
    if (!currentUser) {
      return;
    }
    if (!app.isAdmin()) {
      wx.showToast({ title: "仅管理员可访问", icon: "none" });
      wx.navigateBack();
      return;
    }
    this.loadData();
    this.refreshApprovalData();
  },

  onCloudSynced() {
    this.loadData();
  },

  refreshApprovalData() {
    wx.showLoading({ title: "同步审批" });
    return Promise.all([
      service.refreshCloudItems(),
      demandService.refreshCloudDemands()
    ])
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message || "审批同步失败", icon: "none" }))
      .finally(() => wx.hideLoading());
  },

  loadData() {
    const dashboard = service.getAdminDashboard(app.globalData.activeUserId);
    const demandDashboard = demandService.getAdminDashboard(app.globalData.activeUserId);
    dashboard.pendingCompletionItems = [];
    dashboard.pendingDemandCompletionItems = [];
    dashboard.pendingDemandOfflineItems = demandDashboard.pendingOfflineItems || [];
    this.setData({
      dashboard,
      pendingReviewCount: dashboard.pendingReviewItems.length,
      pendingOfflineCount: dashboard.pendingOfflineItems.length + dashboard.pendingDemandOfflineItems.length
    });
  },

  goReviewDetail(event) {
    wx.navigateTo({ url: `/pages/detail/index?id=${event.currentTarget.dataset.id}&type=supply` });
  },

  approveReview(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认通过",
      content: "通过后该信息将在货源池正常展示。",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          service.approveReviewItem(id, app.globalData.activeUserId);
          wx.showToast({ title: "已通过", icon: "success" });
          this.loadData();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  },

  rejectReview(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认拒绝",
      content: "拒绝后该上传信息将不再展示在货源池。",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          service.rejectReviewItem(id, app.globalData.activeUserId);
          wx.showToast({ title: "已拒绝", icon: "success" });
          this.loadData();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  },

  isProcessing(id) {
    return Boolean(this.data.processingIds && this.data.processingIds[id]);
  },

  setProcessing(id, value) {
    this.setData({ [`processingIds.${id}`]: value });
  },

  approveOffline(event) {
    const id = event.currentTarget.dataset.id;
    if (this.isProcessing(id)) return;
    const type = event.currentTarget.dataset.type || "supply";
    wx.showModal({
      title: "确认下架",
      content: "通过后该货源/需求将正式下架。",
      success: (res) => {
        if (!res.confirm) return;
        this.setProcessing(id, true);
        const task = type === "demand"
          ? demandService.approveOfflineRequestToCloud(id, app.globalData.activeUserId)
          : service.approveOfflineRequestToCloud(id, app.globalData.activeUserId);
        Promise.resolve(task)
          .then(() => {
            wx.showToast({ title: "已下架", icon: "success" });
            this.loadData();
          })
          .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
          .finally(() => this.setProcessing(id, false));
      }
    });
  },

  rejectOffline(event) {
    const id = event.currentTarget.dataset.id;
    if (this.isProcessing(id)) return;
    const type = event.currentTarget.dataset.type || "supply";
    wx.showModal({
      title: "拒绝下架",
      content: "拒绝后该货源/需求将保持当前状态。",
      success: (res) => {
        if (!res.confirm) return;
        this.setProcessing(id, true);
        const task = type === "demand"
          ? demandService.rejectOfflineRequest(id, app.globalData.activeUserId)
          : service.rejectOfflineRequest(id, app.globalData.activeUserId);
        Promise.resolve(task)
          .then(() => {
            wx.showToast({ title: "已拒绝", icon: "success" });
            this.loadData();
          })
          .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
          .finally(() => this.setProcessing(id, false));
      }
    });
  }
});
