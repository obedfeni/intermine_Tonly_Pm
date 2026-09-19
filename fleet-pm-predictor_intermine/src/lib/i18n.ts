/**
 * All user-facing UI text, in English and Simplified Chinese. Values that
 * need to interpolate a number/count are functions instead of plain
 * strings — call them like `t.analyzedSummary(12, 340)`.
 *
 * This intentionally does NOT translate user-entered data (truck IDs, PM
 * names typed into the editable cells, warnings echoed back from the
 * parser about specific rows) — only the app's own interface copy.
 */

export type Lang = 'en' | 'zh';

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'zh', label: '中文' },
];

export interface Translation {
  appTitle: string;
  appSubtitle: string;
  refresh: string;
  toggleTheme: string;
  toggleLanguage: string;

  uploadFileTab: string;
  googleSheetTab: string;
  dropZoneTitle: string;
  dropZoneHint: string;
  sheetUrlPlaceholder: string;
  analyze: string;
  sheetHint: string;
  pasteSheetUrlFirst: string;
  readingLog: string;
  analyzedSummary: (trucks: number, rows: number) => string;
  rowsSkipped: (n: number) => string;
  somethingWentWrong: string;
  failedToLoadTrucks: string;
  failedToSave: string;
  noTrucksYet: string;
  predictionEngineLabel: string;

  colTruckId: string;
  colPmName: string;
  colPmTarget: string;
  colCurrentOdometer: string;
  colAvgDaily: string;
  colKmRemaining: string;
  colPredictedDays: string;
  colPredictedDate: string;
  colStatus: string;
  pmNamePlaceholder: string;
  kmPlaceholder: string;
  viewTrendChart: string;
  removeTruck: string;
  confirmRemoveTruck: (truckId: string) => string;
  truckRemoved: (truckId: string) => string;
  failedToRemove: string;

  toggleMenu: string;
  monthBrowserTitle: string;
  noTrucksDueThisMonth: string;
  ofTrucks: (n: number) => string;

  statusEnterTarget: string;
  statusNoData: string;
  statusCheckLog: string;
  statusInsufficientData: string;
  statusOverdue: string;
  statusDueSoon: string;
  statusDueMedium: string;
  statusDueLater: string;
  statusOk: string;

  currentOdometerLabel: string;
  avgDailyKmLabel: string;
  fitQualityLabel: string;
  inliersOutliersLabel: string;
  checkLogWarning: string;
  odometerTrendTitle: string;
  noDatedReadings: string;
  excludedOutliers: (n: number) => string;
  fittedTrend: string;
  excludedOutlier: string;
  readingLabel: string;
  pmTargetLine: string;
  close: string;

  // PM completion log
  logPmDone: string;
  logPmCompletionTitle: (truckId: string) => string;
  pmNameFieldLabel: string;
  odometerAtPmLabel: string;
  completedDateLabel: string;
  notesFieldLabel: string;
  notesPlaceholder: string;
  cancel: string;
  savePmLog: string;
  invalidOdometer: string;
  failedToLogPm: string;
  pmLogged: (truckId: string) => string;
  pmHistoryTitle: string;
  noPmHistory: string;

  // PM scheduling
  navFleet: string;
  navSchedule: string;
  scheduleAction: string;
  scheduled: (truckId: string, date: string) => string;
  alreadyScheduled: (truckId: string) => string;
  failedToSchedule: string;
  pmScheduleTitle: string;
  failedToLoadSchedule: string;
  failedToCancelSchedule: string;
  noScheduledPms: string;
  scheduledDateLabel: string;
  markDone: string;
  cancelSchedule: string;
  print: string;
  sendByEmail: string;
  scheduleEmailSubject: string;
  scheduleEmailIntro: string;
}

export const translations: Record<Lang, Translation> = {
  en: {
    appTitle: 'Fleet PM Predictor',
    appSubtitle: 'Robust ML odometer-trend regression for predictive preventive maintenance',
    refresh: 'Refresh',
    toggleTheme: 'Toggle theme',
    toggleLanguage: 'Switch to Chinese',

    uploadFileTab: 'Upload file',
    googleSheetTab: 'Google Sheet',
    dropZoneTitle: 'Drop your charging log here, or click to browse',
    dropZoneHint: '.xlsx, .xls, or .csv — parsed entirely in this request, nothing is stored except the cleaned readings',
    sheetUrlPlaceholder: 'https://docs.google.com/spreadsheets/d/...',
    analyze: 'Analyze',
    sheetHint:
      'The sheet must be set to Anyone with the link → Viewer (Share button, top right of Google Sheets). We re-fetch it fresh every time you click Analyze — no Google sign-in needed.',
    pasteSheetUrlFirst: 'Paste a Google Sheet URL first.',
    readingLog: 'Reading log and running the ML prediction engine…',
    analyzedSummary: (trucks, rows) => `Analyzed ${trucks} trucks from ${rows} log rows`,
    rowsSkipped: (n) => ` (${n} rows skipped)`,
    somethingWentWrong: 'Something went wrong.',
    failedToLoadTrucks: 'Failed to load trucks.',
    failedToSave: 'Failed to save.',
    noTrucksYet: 'No trucks yet. Upload a charging log or connect a Google Sheet above to get started.',
    predictionEngineLabel: 'Prediction engine: ',

    colTruckId: 'Truck ID',
    colPmName: 'Next PM Name',
    colPmTarget: 'Next PM Target km',
    colCurrentOdometer: 'Current Odometer',
    colAvgDaily: 'Avg Daily km',
    colKmRemaining: 'km Remaining',
    colPredictedDays: 'Predicted Days',
    colPredictedDate: 'Predicted PM Date',
    colStatus: 'Status',
    pmNamePlaceholder: 'e.g. PM3',
    kmPlaceholder: 'km',
    viewTrendChart: 'View trend chart',
    removeTruck: 'Remove truck',
    confirmRemoveTruck: (truckId) =>
      `Remove ${truckId} from the fleet? It will stay hidden even if a future upload still contains its rows — you can bring it back later from the database if needed.`,
    truckRemoved: (truckId) => `${truckId} removed.`,
    failedToRemove: 'Failed to remove truck.',

    toggleMenu: 'Toggle menu',
    monthBrowserTitle: 'Trucks due for PM by month',
    noTrucksDueThisMonth: 'No trucks due for PM in this month.',
    ofTrucks: (n) => `of ${n} trucks`,

    statusEnterTarget: 'Enter target km',
    statusNoData: 'No log data',
    statusCheckLog: 'Check log data',
    statusInsufficientData: 'Not enough trend data',
    statusOverdue: 'Overdue',
    statusDueSoon: 'Due ≤ 7 days',
    statusDueMedium: 'Due 8–14 days',
    statusDueLater: 'Due 15–30 days',
    statusOk: '> 30 days',

    currentOdometerLabel: 'Current odometer',
    avgDailyKmLabel: 'Avg daily km',
    fitQualityLabel: 'Fit quality (R²)',
    inliersOutliersLabel: 'Inliers / outliers',
    checkLogWarning:
      "The robust regression found a downward trend, which is physically impossible for an odometer — likely two bad readings close together. Check this truck's Kilometers entries near the start or end of the log.",
    odometerTrendTitle: 'Odometer trend (RANSAC-fitted, outliers in red)',
    noDatedReadings: 'No dated readings to chart yet.',
    excludedOutliers: (n) =>
      `${n} reading${n === 1 ? '' : 's'} excluded as statistical outliers (shown in red) — likely a mistyped odometer value in the log.`,
    fittedTrend: 'Fitted trend',
    excludedOutlier: 'Excluded outlier',
    readingLabel: 'Reading',
    pmTargetLine: 'PM target',
    close: 'Close',

    logPmDone: 'Log PM done',
    logPmCompletionTitle: (truckId) => `Log PM completion — ${truckId}`,
    pmNameFieldLabel: 'PM name',
    odometerAtPmLabel: 'Odometer at PM',
    completedDateLabel: 'Date completed',
    notesFieldLabel: 'Notes (optional)',
    notesPlaceholder: 'e.g. brake pads also replaced',
    cancel: 'Cancel',
    savePmLog: 'Save',
    invalidOdometer: 'Enter a valid odometer reading.',
    failedToLogPm: 'Failed to log PM completion.',
    pmLogged: (truckId) => `Logged PM completion for ${truckId}.`,
    pmHistoryTitle: 'PM history',
    noPmHistory: 'No PMs logged yet for this truck.',

    navFleet: 'Fleet Overview',
    navSchedule: 'PM Schedule',
    scheduleAction: 'Schedule',
    scheduled: (truckId, date) => `Scheduled ${truckId} for ${date}.`,
    alreadyScheduled: (truckId) => `${truckId} already has an open scheduled PM.`,
    failedToSchedule: 'Failed to schedule PM.',
    pmScheduleTitle: 'Scheduled PMs',
    failedToLoadSchedule: 'Failed to load the PM schedule.',
    failedToCancelSchedule: 'Failed to cancel schedule entry.',
    noScheduledPms: 'Nothing scheduled yet — schedule a PM from the month browser on the Fleet Overview page.',
    scheduledDateLabel: 'Scheduled date',
    markDone: 'Mark done',
    cancelSchedule: 'Cancel schedule',
    print: 'Print',
    sendByEmail: 'Send',
    scheduleEmailSubject: 'PM Schedule',
    scheduleEmailIntro: 'Upcoming preventive maintenance:',
  },
  zh: {
    appTitle: '车队保养预测系统',
    appSubtitle: '基于稳健机器学习里程趋势回归的预防性保养预测',
    refresh: '刷新',
    toggleTheme: '切换主题',
    toggleLanguage: 'Switch to English',

    uploadFileTab: '上传文件',
    googleSheetTab: 'Google 表格',
    dropZoneTitle: '将充电记录拖到此处，或点击浏览文件',
    dropZoneHint: '支持 .xlsx、.xls 或 .csv —— 数据仅在本次请求中解析，只保存清洗后的读数',
    sheetUrlPlaceholder: 'https://docs.google.com/spreadsheets/d/...',
    analyze: '分析',
    sheetHint: '该表格必须设置为"知道链接的任何人 → 查看者"（Google 表格右上角的分享按钮）。每次点击"分析"都会重新获取最新数据 —— 无需 Google 登录。',
    pasteSheetUrlFirst: '请先粘贴 Google 表格链接。',
    readingLog: '正在读取记录并运行机器学习预测引擎…',
    analyzedSummary: (trucks, rows) => `已分析 ${trucks} 辆车，共 ${rows} 条记录`,
    rowsSkipped: (n) => `（跳过 ${n} 条记录）`,
    somethingWentWrong: '出现问题，请重试。',
    failedToLoadTrucks: '加载车辆列表失败。',
    failedToSave: '保存失败。',
    noTrucksYet: '暂无车辆数据。请在上方上传充电记录或连接 Google 表格以开始。',
    predictionEngineLabel: '预测引擎：',

    colTruckId: '车辆编号',
    colPmName: '下次保养名称',
    colPmTarget: '下次保养目标里程 (km)',
    colCurrentOdometer: '当前里程',
    colAvgDaily: '日均里程 (km)',
    colKmRemaining: '剩余里程 (km)',
    colPredictedDays: '预计剩余天数',
    colPredictedDate: '预计保养日期',
    colStatus: '状态',
    pmNamePlaceholder: '例如 PM3',
    kmPlaceholder: '公里',
    viewTrendChart: '查看趋势图',
    removeTruck: '移除车辆',
    confirmRemoveTruck: (truckId) => `确定要将 ${truckId} 从车队中移除吗？即使以后上传的记录中仍包含该车辆的数据，它也不会再显示——如需恢复，可以之后从数据库中找回。`,
    truckRemoved: (truckId) => `已移除 ${truckId}。`,
    failedToRemove: '移除车辆失败。',

    toggleMenu: '切换菜单',
    monthBrowserTitle: '按月查看待保养车辆',
    noTrucksDueThisMonth: '本月没有需要保养的车辆。',
    ofTrucks: (n) => `共 ${n} 辆车`,

    statusEnterTarget: '请输入目标里程',
    statusNoData: '暂无记录数据',
    statusCheckLog: '请检查记录数据',
    statusInsufficientData: '趋势数据不足',
    statusOverdue: '已逾期',
    statusDueSoon: '7 天内到期',
    statusDueMedium: '8–14 天内到期',
    statusDueLater: '15–30 天内到期',
    statusOk: '超过 30 天',

    currentOdometerLabel: '当前里程',
    avgDailyKmLabel: '日均里程',
    fitQualityLabel: '拟合质量 (R²)',
    inliersOutliersLabel: '正常值 / 异常值',
    checkLogWarning: '稳健回归发现里程呈下降趋势，这在物理上是不可能的 —— 很可能是两个相近的错误读数导致。请检查该车辆记录开头或结尾附近的里程数值。',
    odometerTrendTitle: '里程趋势（RANSAC 拟合，异常值以红色显示）',
    noDatedReadings: '暂无可绘制的日期读数。',
    excludedOutliers: (n) => `已排除 ${n} 条统计异常读数（红色显示）—— 很可能是记录中里程数值输入有误。`,
    fittedTrend: '拟合趋势',
    excludedOutlier: '已排除的异常值',
    readingLabel: '读数',
    pmTargetLine: '保养目标',
    close: '关闭',

    logPmDone: '记录保养完成',
    logPmCompletionTitle: (truckId) => `记录保养完成 — ${truckId}`,
    pmNameFieldLabel: '保养名称',
    odometerAtPmLabel: '保养时里程',
    completedDateLabel: '完成日期',
    notesFieldLabel: '备注（可选）',
    notesPlaceholder: '例如：同时更换了刹车片',
    cancel: '取消',
    savePmLog: '保存',
    invalidOdometer: '请输入有效的里程数。',
    failedToLogPm: '记录保养完成失败。',
    pmLogged: (truckId) => `已记录 ${truckId} 的保养完成情况。`,
    pmHistoryTitle: '保养历史',
    noPmHistory: '该车辆暂无保养记录。',

    navFleet: '车队概览',
    navSchedule: '保养计划',
    scheduleAction: '排期',
    scheduled: (truckId, date) => `已将 ${truckId} 排期至 ${date}。`,
    alreadyScheduled: (truckId) => `${truckId} 已有一个待处理的保养排期。`,
    failedToSchedule: '排期失败。',
    pmScheduleTitle: '已排期的保养',
    failedToLoadSchedule: '加载保养计划失败。',
    failedToCancelSchedule: '取消排期失败。',
    noScheduledPms: '暂无排期。请在"车队概览"页的月份浏览器中为车辆安排保养排期。',
    scheduledDateLabel: '排期日期',
    markDone: '标记为完成',
    cancelSchedule: '取消排期',
    print: '打印',
    sendByEmail: '发送',
    scheduleEmailSubject: '保养计划',
    scheduleEmailIntro: '即将到来的预防性保养：',
  },
};
