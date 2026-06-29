const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const authService = require("../../services/auth");
const notificationService = require("../../services/notifications");
const { clearPageCloudRefresh, schedulePageCloudRefresh } = require("../../utils/page-sync");

const DASHBOARD_STORAGE_KEYS = [
  "inventory_board_items",
  "inventory_board_demands",
  "inventory_board_notifications"
];
const RECENT_SUPPLY_LIMIT = 6;

function dashboardSignature(userId) {
  try {
    return [
      userId || "",
      ...DASHBOARD_STORAGE_KEYS.map((key) => {
        const rows = wx.getStorageSync(key) || [];
        if (!Array.isArray(rows) || !rows.length) return `${key}:0`;
        const first = rows[0] || {};
        const last = rows[rows.length - 1] || {};
        return [
          key,
          rows.length,
          first.id || "",
          first.updatedAt || first.createdAt || "",
          last.id || "",
          last.updatedAt || last.createdAt || ""
        ].join(":");
      })
    ].join("|");
  } catch (error) {
    return `${userId || ""}:${Date.now()}`;
  }
}

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
    myItemCount: 0,
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
    schedulePageCloudRefresh(this, app, { notify: false }, {
      success: (res) => {
        if (!res || !res.skipped) this.loadData();
      },
      fail: (error) => {
        if (authService.isAdminUser(user)) {
          wx.showToast({ title: error.message, icon: "none" });
          this.loadData();
          return;
        }
        wx.showToast({ title: error.message, icon: "none" });
      }
    });
  },

  onHide() {
    clearPageCloudRefresh(this);
  },

  onCloudSynced() {
    this.loadData();
  },

  loadData() {
    const activeUserId = app.globalData.activeUserId;
    const signature = dashboardSignature(activeUserId);
    if (signature === this._lastDashboardSignature) {
      return;
    }
    const usePreview = !this.data.recentItemsExpanded && service.getMyDashboardPreview;
    const data = usePreview
      ? service.getMyDashboardPreview(activeUserId, RECENT_SUPPLY_LIMIT)
      : service.getMyDashboard(activeUserId);
    const demandData = demandService.getMyDashboardStats
      ? demandService.getMyDashboardStats(activeUserId)
      : demandService.getMyDashboard(activeUserId);
    const approvalTodoCount = data.isAdminDashboard
      ? (service.getPendingApprovalCount ? service.getPendingApprovalCount(activeUserId) : 0)
        + (demandService.getPendingApprovalCount ? demandService.getPendingApprovalCount(activeUserId) : 0)
      : 0;
    const notifications = notificationService.getNotificationsByUser(activeUserId);
    const supplyItems = this.markItemType(data.myItems || [], "supply");
    const itemTotal = data.myItemTotal === undefined ? supplyItems.length : data.myItemTotal;
    const recentSupplyState = this.buildRecentSupplyState(supplyItems, this.data.recentItemsExpanded, itemTotal);
    this._myItems = supplyItems;
    const nextData = {
      user: data.user,
      isAdminDashboard: data.isAdminDashboard,
      myItemCount: itemTotal,
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
    notificationService.markAllRead(activeUserId);
    this._lastDashboardSignature = dashboardSignature(activeUserId);
  },

  buildRecentSupplyState(items, expanded, totalCount) {
    const limit = RECENT_SUPPLY_LIMIT;
    const source = items || [];
    const realTotal = Math.max(source.length, Number(totalCount) || 0);
    const hasMore = realTotal > limit;
    return {
      visibleMyItems: expanded ? source : source.slice(0, limit),
      recentItemsExpanded: hasMore && expanded,
      hasMoreMyItems: hasMore,
      hiddenMyItemCount: Math.max(realTotal - limit, 0)
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
    if ((this._myItems || []).length < this.data.myItemCount) {
      const data = service.getMyDashboard(app.globalData.activeUserId);
      this._myItems = this.markItemType(data.myItems || [], "supply");
    }
    this.setData(this.buildRecentSupplyState(this._myItems, true, this.data.myItemCount));
  },

  collapseRecentItems() {
    this.setData(this.buildRecentSupplyState(this._myItems, false, this.data.myItemCount));
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
