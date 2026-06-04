const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const authService = require("../../services/auth");
const { formatDateTime } = require("../../utils/helpers");

Page({
  data: {
    requests: [],
    pendingRequestCount: 0,
    pendingReviewCount: 0,
    pendingOfflineCount: 0,
    pendingCompletionCount: 0,
    dashboard: {
      stats: {},
      periodStats: {},
      pendingReviewItems: [],
      pendingOfflineItems: [],
      pendingCompletionItems: [],
      pendingDemandCompletionItems: [],
      pendingDemandOfflineItems: [],
      market: { midpoint: "0", pricePoints: [], asks: [], bids: [], totalVolume: 0 }
    }
  },

  onShow() {
    const currentUser = app.requireApprovedUser();
    if (!currentUser) {
      return;
    }
    if (!authService.isAdminUser(currentUser)) {
      wx.showToast({ title: "仅管理员可访问", icon: "none" });
      wx.navigateBack();
      return;
    }
    this.loadData();
    app.refreshCloudData()
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  onCloudSynced() {
    this.loadData();
  },

  loadData() {
    const requests = authService.getPendingRequests(app.globalData.activeUserId).map((item) => ({
      ...item,
      createdAtText: formatDateTime(item.createdAt)
    }));
    const dashboard = service.getAdminDashboard(app.globalData.activeUserId);
    const demandDashboard = demandService.getAdminDashboard(app.globalData.activeUserId);
    dashboard.pendingDemandCompletionItems = demandDashboard.pendingCompletionItems || [];
    dashboard.pendingDemandOfflineItems = demandDashboard.pendingOfflineItems || [];
    this.setData({
      requests,
      dashboard,
      pendingRequestCount: requests.length,
      pendingReviewCount: dashboard.pendingReviewItems.length,
      pendingOfflineCount: dashboard.pendingOfflineItems.length + dashboard.pendingDemandOfflineItems.length,
      pendingCompletionCount: (dashboard.pendingCompletionItems || []).length + dashboard.pendingDemandCompletionItems.length
    });
  },

  approve(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认通过",
      content: "通过后该员工将获得系统访问权限。",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          authService.approveRequest(id, app.globalData.activeUserId);
          wx.showToast({ title: "已通过", icon: "success" });
          this.loadData();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  },

  reject(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认拒绝",
      content: "拒绝后该申请将从待审批列表移除。",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          authService.rejectRequest(id, app.globalData.activeUserId);
          wx.showToast({ title: "已拒绝", icon: "success" });
          this.loadData();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
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

  approveCompletion(event) {
    const id = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type || "supply";
    wx.showModal({
      title: "确认完成",
      content: "通过后该信息将从对应池子下架，并在用户我的页面留存。",
      success: (res) => {
        if (!res.confirm) return;
        const task = type === "demand"
          ? demandService.approveCompletionRequestToCloud(id, app.globalData.activeUserId)
          : service.approveCompletionRequestToCloud(id, app.globalData.activeUserId);
        task.then(() => {
          wx.showToast({ title: "已通过", icon: "success" });
          this.loadData();
        }).catch((error) => wx.showToast({ title: error.message, icon: "none" }));
      }
    });
  },

  rejectCompletion(event) {
    const id = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type || "supply";
    try {
      const task = type === "demand"
        ? demandService.rejectCompletionRequest(id, app.globalData.activeUserId)
        : service.rejectCompletionRequest(id, app.globalData.activeUserId);
      Promise.resolve(task).then(() => {
      wx.showToast({ title: "已拒绝", icon: "success" });
      this.loadData();
      }).catch((error) => wx.showToast({ title: error.message, icon: "none" }));
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  approveOffline(event) {
    const id = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type || "supply";
    wx.showModal({
      title: "确认下架",
      content: "通过后该货源将正式下架。",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          const task = type === "demand"
            ? demandService.approveOfflineRequestToCloud(id, app.globalData.activeUserId)
            : service.approveOfflineRequestToCloud(id, app.globalData.activeUserId);
          task
            .then(() => {
              wx.showToast({ title: "已下架", icon: "success" });
              this.loadData();
            })
            .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  },

  rejectOffline(event) {
    const id = event.currentTarget.dataset.id;
    const type = event.currentTarget.dataset.type || "supply";
    wx.showModal({
      title: "拒绝下架",
      content: "拒绝后该货源将保持当前状态。",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          const task = type === "demand"
            ? demandService.rejectOfflineRequest(id, app.globalData.activeUserId)
            : service.rejectOfflineRequest(id, app.globalData.activeUserId);
          Promise.resolve(task).then(() => {
          wx.showToast({ title: "已拒绝", icon: "success" });
          this.loadData();
          }).catch((error) => wx.showToast({ title: error.message, icon: "none" }));
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  }
});
