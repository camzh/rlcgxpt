const authService = require("./services/auth");
const inventoryService = require("./services/inventory");
const demandService = require("./services/demand");
const cloudApi = require("./services/cloud-api");

const BOOTSTRAP_STORAGE_KEY = "inventory_board_mini_bootstrap_done";
const SYNC_INTERVAL_MS = 30000;

App({
  globalData: {
    activeUserId: "",
    currentUser: null,
    syncTimer: null,
    syncRunning: false
  },

  onLaunch() {
    wx.cloud.init({ env: "cloudbase-d9gehmfnxf8b53557", traceUser: true });
    authService.ensureSeedData();
    inventoryService.ensureSeedData();
    demandService.ensureSeedData();
    this.refreshSession();
    this.bootstrapMiniData();
  },

  onShow() {
    this.startForegroundSync();
  },

  onHide() {
    this.stopForegroundSync();
  },

  refreshSession() {
    const currentUser = authService.getCurrentUser();
    this.globalData.activeUserId = currentUser ? currentUser.id : "";
    this.globalData.currentUser = currentUser;
    return currentUser;
  },

  requireApprovedUser() {
    const currentUser = this.refreshSession();
    if (!currentUser || currentUser.approvalStatus !== "approved") {
      wx.reLaunch({
        url: "/pages/register/index"
      });
      return null;
    }
    return currentUser;
  },

  isAdmin() {
    const user = this.globalData.currentUser || this.refreshSession();
    return authService.isAdminUser(user);
  },

  bootstrapMiniData() {
    if (wx.getStorageSync(BOOTSTRAP_STORAGE_KEY)) {
      this.clearLocalOnlyData();
      return Promise.resolve({ skipped: true });
    }
    const supplies = typeof inventoryService.getBootstrapItems === "function"
      ? inventoryService.getBootstrapItems()
      : [];
    const demands = typeof demandService.getBootstrapDemands === "function"
      ? demandService.getBootstrapDemands()
      : [];
    return cloudApi.bootstrapFromMini(supplies, demands, this.globalData.activeUserId)
      .then((res) => {
        wx.setStorageSync(BOOTSTRAP_STORAGE_KEY, {
          at: new Date().toISOString(),
          count: supplies.length + demands.length,
          serverSkipped: !!res.skipped
        });
        this.clearLocalOnlyData();
        return res;
      })
      .catch((error) => {
        console.warn("bootstrapMiniData failed", error && error.message ? error.message : error);
        return { error };
      });
  },

  clearLocalOnlyData() {
    if (typeof inventoryService.clearLocalOnlyItems === "function") {
      inventoryService.clearLocalOnlyItems();
    }
    if (typeof demandService.clearLocalOnlyDemands === "function") {
      demandService.clearLocalOnlyDemands();
    }
  },

  refreshCloudData() {
    if (this.globalData.syncRunning) {
      return Promise.resolve({ skipped: true });
    }
    this.globalData.syncRunning = true;
    return Promise.all([
      inventoryService.refreshCloudItems(),
      demandService.refreshCloudDemands()
    ])
      .then((result) => {
        this.notifyActivePageCloudSynced();
        return result;
      })
      .catch((error) => {
        console.warn("refreshCloudData failed", error && error.message ? error.message : error);
        return { error };
      })
      .finally(() => {
        this.globalData.syncRunning = false;
      });
  },

  startForegroundSync() {
    if (this.globalData.syncTimer) {
      return;
    }
    this.refreshCloudData();
    this.globalData.syncTimer = setInterval(() => {
      this.refreshCloudData();
    }, SYNC_INTERVAL_MS);
  },

  stopForegroundSync() {
    if (this.globalData.syncTimer) {
      clearInterval(this.globalData.syncTimer);
      this.globalData.syncTimer = null;
    }
  },

  notifyActivePageCloudSynced() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    if (page && typeof page.onCloudSynced === "function") {
      page.onCloudSynced();
    }
  },

  syncCustomTabBar(selected) {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    if (!page || typeof page.getTabBar !== "function") {
      return;
    }
    const tabBar = page.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected });
    }
  }
});
