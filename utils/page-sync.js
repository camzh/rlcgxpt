const DEFAULT_PAGE_SYNC_DELAY_MS = 300;

function clearPageCloudRefresh(page) {
  if (page && page._cloudRefreshTimer) {
    clearTimeout(page._cloudRefreshTimer);
    page._cloudRefreshTimer = null;
  }
}

function schedulePageCloudRefresh(page, app, options = {}, handlers = {}) {
  clearPageCloudRefresh(page);
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : DEFAULT_PAGE_SYNC_DELAY_MS;
  const syncOptions = { ...options };
  delete syncOptions.delayMs;

  page._cloudRefreshTimer = setTimeout(() => {
    page._cloudRefreshTimer = null;
    app.refreshCloudData(syncOptions)
      .then((res) => {
        if (typeof handlers.success === "function") {
          handlers.success(res);
        }
      })
      .catch((error) => {
        if (typeof handlers.fail === "function") {
          handlers.fail(error);
        }
      });
  }, delayMs);
}

module.exports = {
  clearPageCloudRefresh,
  schedulePageCloudRefresh
};
