const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const authService = require("../../services/auth");
const notificationService = require("../../services/notifications");

Page({
  data: {
    user: { name: "", roleLabel: "" },
    isAdminDashboard: false,
    mineStats: {
      created: 0,
      sold: 0,
      following: 0,
      offline: 0,
      todayPublished: 0,
      todaySold: 0,
      weekPublished: 0,
      weekSold: 0,
      weekOffline: 0,
      publishGrowthText: "+0",
      soldGrowthText: "+0"
    },
    myItems: [],
    visibleMyItems: [],
    recentItemsExpanded: false,
    hasMoreMyItems: false,
    hiddenMyItemCount: 0,
    notifications: [],
    approvalTodoCount: 0
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.syncCustomTabBar(3);
    this.loadData();
    app.refreshCloudData()
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  onCloudSynced() {
    this.loadData();
  },

  loadData() {
    const data = service.getMyDashboard(app.globalData.activeUserId);
    const demandData = demandService.getMyDashboard(app.globalData.activeUserId);
    const adminDashboard = data.isAdminDashboard ? service.getAdminDashboard(app.globalData.activeUserId) : null;
    const demandAdminDashboard = data.isAdminDashboard ? demandService.getAdminDashboard(app.globalData.activeUserId) : null;
    const approvalTodoCount = data.isAdminDashboard
      ? authService.getPendingRequests(app.globalData.activeUserId).length
        + adminDashboard.pendingReviewItems.length
        + adminDashboard.pendingOfflineItems.length
        + (adminDashboard.pendingCompletionItems || []).length
        + (demandAdminDashboard.pendingOfflineItems || []).length
        + (demandAdminDashboard.pendingCompletionItems || []).length
      : 0;
    const notifications = notificationService.getNotificationsByUser(app.globalData.activeUserId);
    const supplyItems = this.markItemType(data.myItems || [], "supply");
    const recentSupplyState = this.buildRecentSupplyState(supplyItems, this.data.recentItemsExpanded);
    const nextData = {
      ...data,
      myItems: supplyItems,
      ...recentSupplyState,
      mineStats: {
        ...data.mineStats,
        created: (data.mineStats.created || 0) + (demandData.mineStats.created || 0),
        following: (data.mineStats.following || 0) + (demandData.mineStats.following || 0),
        sold: (data.mineStats.sold || 0) + (demandData.mineStats.sold || 0),
        offline: (data.mineStats.offline || 0) + (demandData.mineStats.offline || 0)
      },
      notifications,
      approvalTodoCount
    };
    this.setData({
      ...nextData
    });
    notificationService.markAllRead(app.globalData.activeUserId);
  },

  buildRecentSupplyState(items, expanded) {
    const limit = 6;
    const source = items || [];
    const hasMore = source.length > limit;
    return {
      visibleMyItems: expanded ? source : source.slice(0, limit),
      recentItemsExpanded: hasMore && expanded,
      hasMoreMyItems: hasMore,
      hiddenMyItemCount: Math.max(source.length - limit, 0)
    };
  },

  markItemType(items, type) {
    return (items || []).map((item) => ({
      ...item,
      itemType: type,
      metricSubtitle: type === "demand"
        ? ["需求", item.brand, item.model, item.updatedAtText].filter(Boolean).join(" · ")
        : ["货源", item.brand, item.model, item.updatedAtText].filter(Boolean).join(" · ")
    }));
  },

  selectMetric(event) {
    const metric = event.currentTarget.dataset.metric;
    wx.navigateTo({ url: `/pages/metric-list/index?metric=${metric}` });
  },

  expandRecentItems() {
    this.setData(this.buildRecentSupplyState(this.data.myItems, true));
  },

  collapseRecentItems() {
    this.setData(this.buildRecentSupplyState(this.data.myItems, false));
    wx.pageScrollTo({
      selector: "#recentSupplyBlock",
      duration: 200
    });
  },

  goCreate() { wx.navigateTo({ url: "/pages/form/index" }); },
  goDetail(event) {
    const { id, type } = event.currentTarget.dataset;
    if (!id || type === "notice") {
      return;
    }
    wx.navigateTo({ url: `/pages/detail/index?id=${id}&type=${type || "supply"}` });
  },
  goApprovals() { wx.navigateTo({ url: "/pages/admin-approvals/index" }); },
  signOut() {
    authService.clearSession();
    app.refreshSession();
    wx.reLaunch({ url: "/pages/register/index" });
  }
});
