const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const notificationService = require("../../services/notifications");

Page({
  data: {
    logs: [],
    notifications: []
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.syncCustomTabBar(1);
    this.setData({
      logs: [...service.getTimeline(), ...demandService.getTimeline()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      notifications: notificationService.getNotificationsByUser(app.globalData.activeUserId)
    });
    notificationService.markAllRead(app.globalData.activeUserId);
  }
});
