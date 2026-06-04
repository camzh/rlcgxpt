const app = getApp();
const demandService = require("../../services/demand");

Page({
  data: {
    keyword: "",
    selectedStatus: "all",
    statusOptions: [
      { label: "全部", value: "all" },
      { label: "求买", value: "pending" },
      { label: "跟进中", value: "following" },
      { label: "已完成", value: "done" }
    ],
    stats: { total: 0, following: 0, done: 0, pending: 0 },
    list: []
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.syncCustomTabBar(0);
    demandService.ensureSeedData();
    this.loadData();
    app.refreshCloudData()
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  onCloudSynced() {
    this.loadData();
  },

  loadData() {
    const result = demandService.getDemandBoardData({
      keyword: this.data.keyword,
      status: this.data.selectedStatus,
      creatorId: ""
    });
    this.setData({ stats: result.stats, list: result.list });
  },

  onKeywordChange(event) {
    this.setData({ keyword: event.detail.value });
    this.loadData();
  },

  onStatusChange(event) {
    this.setData({ selectedStatus: event.currentTarget.dataset.value });
    this.loadData();
  },

  goDetail(event) {
    wx.navigateTo({ url: `/pages/detail/index?id=${event.currentTarget.dataset.id}&type=demand` });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/demand-form/index" });
  },

  goSupplyList() {
    wx.navigateTo({ url: "/pages/board/index" });
  }
});
