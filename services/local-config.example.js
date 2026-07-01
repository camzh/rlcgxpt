module.exports = {
  LEGACY_COMPAT_TOKEN: "",

  // ============== 订阅消息模板 ID ==============
  // 在微信公众平台 -> 设置与服务 -> 订阅消息 申请模板后填入
  // 模板一：审批通知
  TM_APPROVAL: "",
  // 模板二：更新通知
  TM_UPDATE: "",
  // 模板三：跟进提醒
  TM_FOLLOW: "",
  // 模板四：周报推送
  TM_WEEKLY: "",
  // 模板五：逾期/未访问提醒
  TM_STALE: "",
  // 模板六：成交确认提醒
  TM_SOLD_CONFIRM: "",
  // 模板七：需求匹配提醒
  TM_MATCH: "",
  // 模板八：截胡提醒（复用逾期模板五）
  TM_COMPETITIVE: "",
  // 模板九：批量操作结果（复用审批模板一）
  TM_BATCH: "",
  // 模板十：数据异常告警（复用审批模板一）
  TM_ANOMALY: ""
};
