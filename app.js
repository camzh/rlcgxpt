const authService = require("./services/auth");
const inventoryService = require("./services/inventory");
const demandService = require("./services/demand");
const cloudApi = require("./services/cloud-api");

const BOOTSTRAP_STORAGE_KEY = "inventory_board_mini_bootstrap_done";
const CLOUD_MIGRATION_STORAGE_KEY = "inventory_board_cloud_origin_v3_rlcgxpt";
const SYNC_INTERVAL_MS = 120000;
const CLOUD_DATA_STORAGE_KEYS = [
  "inventory_board_items",
  "inventory_board_demands"
];

function cloudDataSignature() {
  try {
    return CLOUD_DATA_STORAGE_KEYS.map((key) => {
      const value = wx.getStorageSync(key) || [];
      return `${key}:${JSON.stringify(value)}`;
    }).join("|");
  } catch (error) {
    return "";
  }
}

App({
  globalData: {
    activeUserId: "",
    currentUser: null,
    syncTimer: null,
    syncRunning: false,
    syncPromise: null,
    lastCloudSyncAt: 0
  },

  onLaunch() {
    try {
      if (wx.cloud && typeof wx.cloud.init === "function") {
        wx.cloud.init({ env: "cloudbase-d9gehmfnxf8b53557", traceUser: true });
      }
    } catch (error) {
      console.warn("wx.cloud.init failed", error && error.message ? error.message : error);
    }
    try {
      authService.ensureSeedData();
      this.resetCloudCacheAfterOriginSwitch();
      inventoryService.ensureSeedData();
      demandService.ensureSeedData();
      this.refreshSession();
      this.bootstrapMiniData();
    } catch (error) {
      console.error("app launch init failed", error && error.message ? error.message : error);
    }
  },

  onShow() {
    const currentUser = this.refreshSession();
    if (currentUser && currentUser.approvalStatus === "approved") {
      this.refreshRemoteProfile();
      this.startForegroundSync();
    }
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

  refreshRemoteProfile() {
    if (!authService.getMiniSessionToken()) {
      return Promise.resolve(null);
    }
    return authService.fetchMiniProfile()
      .then((profile) => {
        authService.setCurrentUser(profile);
        return this.refreshSession();
      })
      .catch((error) => {
        if (error && (error.statusCode === 401 || error.statusCode === 403)) {
          authService.clearSession();
          this.refreshSession();
          wx.reLaunch({ url: "/pages/register/index" });
        }
        return null;
      });
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

  resetCloudCacheAfterOriginSwitch() {
    if (wx.getStorageSync(CLOUD_MIGRATION_STORAGE_KEY)) {
      return;
    }
    wx.removeStorageSync("inventory_board_items");
    wx.removeStorageSync("inventory_board_demands");
    wx.removeStorageSync("inventory_board_logs");
    wx.removeStorageSync("inventory_board_demand_logs");
    wx.removeStorageSync(BOOTSTRAP_STORAGE_KEY);
    // 清 storage 后重置 seed 标志位，让下次 getItems 重新跑 ensureSeedData
    inventoryService.resetSeedCache();
    demandService.resetSeedCache();
    wx.setStorageSync(CLOUD_MIGRATION_STORAGE_KEY, {
      origin: "https://rlcgxpt.com",
      at: new Date().toISOString()
    });
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

  refreshCloudData(options = {}) {
    const force = options.force === true;
    const minIntervalMs = Number.isFinite(Number(options.minIntervalMs)) ? Number(options.minIntervalMs) : SYNC_INTERVAL_MS;
    const lastCloudSyncAt = this.globalData.lastCloudSyncAt || 0;
    const syncAgeMs = Date.now() - lastCloudSyncAt;
    if (!force && lastCloudSyncAt && syncAgeMs < minIntervalMs) {
      return Promise.resolve({ skipped: true, reason: "fresh", ageMs: syncAgeMs });
    }
    if (this.globalData.syncRunning) {
      return this.globalData.syncPromise || Promise.resolve({ skipped: true, reason: "running" });
    }
    const notify = options.notify !== false;
    const beforeSignature = notify ? cloudDataSignature() : "";
    this.globalData.syncRunning = true;
    const syncPromise = Promise.all([
      inventoryService.refreshCloudItems(),
      demandService.refreshCloudDemands()
    ])
      .then((result) => {
        this.globalData.lastCloudSyncAt = Date.now();
        const changed = notify ? beforeSignature !== cloudDataSignature() : false;
        if (notify && changed) {
          this.notifyActivePageCloudSynced();
        }
        return { skipped: false, changed, result };
      })
      .catch((error) => {
        console.warn("refreshCloudData failed", error && error.message ? error.message : error);
        return { skipped: false, error };
      })
      .finally(() => {
        this.globalData.syncRunning = false;
        this.globalData.syncPromise = null;
      });
    this.globalData.syncPromise = syncPromise;
    return syncPromise;
  },

  startForegroundSync() {
    if (this.globalData.syncTimer) {
      return;
    }
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
