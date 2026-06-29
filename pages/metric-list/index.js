const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const notificationService = require("../../services/notifications");
const { clearPageCloudRefresh, schedulePageCloudRefresh } = require("../../utils/page-sync");

const PAGE_SIZE = 40;

const METRIC_TITLES = {
  created: "全部发布",
  following: "跟进中",
  sold: "已完成",
  offline: "历史下架",
  notifications: "提醒"
};

Page({
  data: {
    metric: "created",
    title: "全部发布",
    items: [],
    totalCount: 0,
    countText: "0 条",
    hasMore: false
  },

  onLoad(query) {
    this.setData({
      metric: query.metric || "created",
      title: METRIC_TITLES[query.metric] || "全部发布"
    });
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    this.loadData();
    schedulePageCloudRefresh(this, app, { notify: false }, {
      success: () => this.loadData(),
      fail: (error) => wx.showToast({ title: error.message, icon: "none" })
    });
  },

  onHide() {
    clearPageCloudRefresh(this);
  },

  onCloudSynced() {
    this.loadData();
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

  loadData() {
    const metric = this.data.metric;
    if (metric === "notifications") {
      const items = notificationService.getNotificationsByUser(app.globalData.activeUserId)
        .map((item) => ({
          ...item,
          itemType: "notice",
          displayTitle: item.title,
          metricSubtitle: item.summary
        }));
      this.renderItems(items);
      return;
    }

    const supply = service.getMyDashboard(app.globalData.activeUserId);
    const demand = demandService.getMyDashboard(app.globalData.activeUserId);
    const source = [
      ...this.markItemType(supply.myItems || [], "supply"),
      ...this.markItemType(demand.myItems || [], "demand")
    ];
    const items = source
      .filter((item) => {
        if (metric === "created") return true;
        if (metric === "following") return item.status === "following";
        if (metric === "sold") return item.status === "sold" || item.status === "done";
        if (metric === "offline") return item.status === "offline";
        return true;
      })
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    this.renderItems(items);
  },

  renderItems(items) {
    const source = items || [];
    const visibleItems = source.slice(0, PAGE_SIZE);
    this._allMetricItems = source;
    this.setData({
      items: visibleItems,
      totalCount: source.length,
      countText: source.length > visibleItems.length ? `已显示 ${visibleItems.length} / ${source.length} 条` : `${source.length} 条`,
      hasMore: source.length > visibleItems.length
    });
  },

  onReachBottom() {
    const source = this._allMetricItems || [];
    if (!this.data.hasMore || !source.length) {
      return;
    }
    const visibleItems = source.slice(0, this.data.items.length + PAGE_SIZE);
    this.setData({
      items: visibleItems,
      countText: source.length > visibleItems.length ? `已显示 ${visibleItems.length} / ${source.length} 条` : `${source.length} 条`,
      hasMore: source.length > visibleItems.length
    });
  },

  goDetail(event) {
    const { id, type } = event.currentTarget.dataset;
    if (!id || type === "notice") {
      return;
    }
    wx.navigateTo({ url: `/pages/detail/index?id=${id}&type=${type || "supply"}` });
  }
});
