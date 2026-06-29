const STORAGE_KEY = "inventory_board_notifications";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function ensureSeedData() {
  const list = wx.getStorageSync(STORAGE_KEY);
  if (!list || !Array.isArray(list)) {
    wx.setStorageSync(STORAGE_KEY, []);
  }
}

function getNotifications() {
  ensureSeedData();
  return clone(wx.getStorageSync(STORAGE_KEY) || []);
}

function saveNotifications(list) {
  wx.setStorageSync(STORAGE_KEY, clone(list));
}

function addNotifications(entries) {
  const list = getNotifications();
  entries.forEach((entry) => {
    const exists = list.find((item) => item.matchKey && item.matchKey === entry.matchKey && item.userId === entry.userId);
    if (!exists) {
      list.unshift({
        id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        read: false,
        createdAt: new Date().toISOString(),
        ...entry
      });
    }
  });
  saveNotifications(list);
}

function getUnreadCount(userId) {
  return getNotifications().filter((item) => item.userId === userId && !item.read).length;
}

function getNotificationsByUser(userId) {
  return getNotifications()
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function markAllRead(userId) {
  const list = getNotifications();
  list.forEach((item) => {
    if (item.userId === userId) {
      item.read = true;
    }
  });
  saveNotifications(list);
}

module.exports = {
  ensureSeedData,
  addNotifications,
  getUnreadCount,
  getNotificationsByUser,
  markAllRead
};