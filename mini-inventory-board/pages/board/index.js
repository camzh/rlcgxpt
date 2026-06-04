const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const { INVENTORY_STATUS } = require("../../utils/constants");

const URGENT_FILTER = "urgent";
const RENTABLE_FILTER = "rentable";
const BUYING_FILTER = "buying";
const REVIEWING_FILTER = "reviewing";
const DEMAND_STATUS_MAP = {
  [INVENTORY_STATUS.ON_SALE]: "pending",
  [INVENTORY_STATUS.FOLLOWING]: "following",
  [INVENTORY_STATUS.SOLD]: "done",
  [INVENTORY_STATUS.OFFLINE]: "closed"
};

Page({
  data: {
    keyword: "",
    selectedStatus: "all",
    activePool: "supply",
    statusOptions: [
      { label: "\u5168\u90e8", value: "all" },
      { label: "\u7d27\u6025", value: URGENT_FILTER },
      { label: "在售", value: INVENTORY_STATUS.ON_SALE },
      { label: "\u79df\u8d41", value: RENTABLE_FILTER },
      { label: "\u6c42\u8d2d", value: BUYING_FILTER },
      { label: "\u8ddf\u8fdb\u4e2d", value: INVENTORY_STATUS.FOLLOWING },
      { label: "审批中", value: REVIEWING_FILTER }
    ],
    selectedSource: "all",
    supplySourceOptions: [
      { label: "\u5168\u90e8\u6765\u6e90", value: "all" },
      { label: "\u6211\u7684\u8d27\u6e90", value: "mine" },
      { label: "\u516c\u53f8\u8d27\u6e90", value: "company" },
      { label: "\u5176\u4ed6\u8d27\u6e90", value: "others" }
    ],
    demandSourceOptions: [
      { label: "\u5168\u90e8\u6765\u6e90", value: "all" },
      { label: "\u6211\u7684\u9700\u6c42", value: "mine" },
      { label: "\u516c\u53f8\u9700\u6c42", value: "company" },
      { label: "\u5176\u4ed6\u9700\u6c42", value: "others" }
    ],
    stats: { onSale: 0, following: 0, sold: 0, pendingReview: 0, todayAdded: 0, todaySold: 0 },
    demandStats: { total: 0, following: 0, done: 0, pending: 0 },
    reviewQueueCount: 0,
    supplyList: [],
    demandList: [],
    currentSourceOptions: []
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.syncCustomTabBar(0);
    service.ensureSeedData();
    demandService.ensureSeedData();
    this.syncSourceOptions();
    app.refreshCloudData()
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  onCloudSynced() {
    this.loadData();
  },


  syncSourceOptions() {
    this.setData({
      currentSourceOptions: this.data.activePool === "supply" ? this.data.supplySourceOptions : this.data.demandSourceOptions
    });
  },
  loadData() {
    const selectedStatus = this.data.selectedStatus;
    const isUrgentFilter = selectedStatus === URGENT_FILTER;
    const businessFilter = selectedStatus === RENTABLE_FILTER || selectedStatus === BUYING_FILTER ? selectedStatus : "all";
    const isReviewingFilter = selectedStatus === REVIEWING_FILTER;
    const supplyStatus = this.data.activePool === "supply" && !isUrgentFilter && !isReviewingFilter && businessFilter === "all" ? selectedStatus : "all";
    const demandStatus = this.data.activePool === "demand" && !isUrgentFilter && !isReviewingFilter && businessFilter === "all" && selectedStatus !== "all"
      ? DEMAND_STATUS_MAP[selectedStatus] || selectedStatus
      : "all";
    const supply = service.getBoardData({
      keyword: this.data.keyword,
      status: supplyStatus,
      urgentOnly: isUrgentFilter,
      reviewPendingOnly: isReviewingFilter,
      businessFilter,
      sourceFilter: this.data.activePool === "supply" ? this.data.selectedSource : "all",
      currentUserId: app.globalData.activeUserId
    });
    const demands = demandService.getDemandBoardData({
      keyword: this.data.keyword,
      status: demandStatus,
      urgentOnly: isUrgentFilter,
      reviewPendingOnly: isReviewingFilter,
      businessFilter,
      sourceFilter: this.data.activePool === "demand" ? this.data.selectedSource : "all",
      currentUserId: app.globalData.activeUserId,
      creatorId: ""
    });
    this.setData({
      stats: supply.stats,
      demandStats: demands.stats,
      supplyList: supply.list,
      demandList: demands.list,
      reviewQueueCount: supply.reviewQueueCount
    });
  },

  onKeywordChange(event) {
    this.setData({ keyword: event.detail.value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.loadData();
    }, 300);
  },


  onSourceChange(event) {
    this.setData({ selectedSource: event.currentTarget.dataset.value });
    this.loadData();
  },
  onStatusChange(event) {
    this.setData({ selectedStatus: event.currentTarget.dataset.value });
    this.loadData();
  },

  switchPool(event) {
    const activePool = event.currentTarget.dataset.pool;
    this.setData({
      activePool,
      selectedSource: "all",
      currentSourceOptions: activePool === "supply" ? this.data.supplySourceOptions : this.data.demandSourceOptions
    });
    this.loadData();
  },

  goDetail(event) {
    const { id, type } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}&type=${type || "supply"}` });
  },

  goCreate() {
    wx.showActionSheet({
      itemList: ["新增货源信息", "新增需求信息"],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          wx.navigateTo({ url: "/pages/form/index" });
        } else if (tapIndex === 1) {
          wx.navigateTo({ url: "/pages/demand-form/index" });
        }
      }
    });
  },

  onPullDownRefresh() {
    app.refreshCloudData()
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
      .finally(() => wx.stopPullDownRefresh());
  }
});
