/**
 * Consulting Center Management System (CCMS) - Core Server Back-end
 * ศาลเยาวชนและครอบครัว
 */

var SPREADSHEET_ID = "1-D1Dpin3KTuH9oV1-cUyEDXuJ15gKaHi6z6K6MIYMBU";
var LEGACY_SYSTEM_SECRET_ = "ccms_super_secure_secret_system_key_2026_rayong";
var SYSTEM_SECRET = LEGACY_SYSTEM_SECRET_;
var cachedSystemSecret_ = null;

/**
 * ดึงคีย์ลับสำหรับเซ็น Session Token จาก PropertiesService (สร้างอัตโนมัติหากยังไม่มี)
 */
function getSystemSecret_() {
  if (cachedSystemSecret_) return cachedSystemSecret_;
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty("CCMS_SYSTEM_SECRET_V1");
    if (!secret || secret.length < 32) {
      secret = hashPassword_(Utilities.getUuid() + "_" + new Date().getTime(), LEGACY_SYSTEM_SECRET_) +
               hashPassword_( Utilities.getUuid(), "ccms_rayong_kdf");
      props.setProperty("CCMS_SYSTEM_SECRET_V1", secret);
    }
    cachedSystemSecret_ = secret;
    return secret;
  } catch (e) {
    return LEGACY_SYSTEM_SECRET_;
  }
}

/**
 * ฟังก์ชันสำหรับกดปุ่ม "▷ เรียกใช้ (Run)" ในหน้า Google Apps Script เพียง 1 ครั้ง
 * เพื่ออนุญาตสิทธิ์เชื่อมต่อภายนอก (UrlFetchApp / LINE Messaging API / MailApp)
 */
function authorizeLineOaPermissions() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/info", { muteHttpExceptions: true });
  var mailQuota = MailApp.getRemainingDailyQuota();
  Logger.log("✅ อนุญาตสิทธิ์สำเร็จ! (HTTP Status: " + res.getResponseCode() + ", Sheet: " + ss.getName() + ", Mail Quota: " + mailQuota + ")");
}

/**
 * ฟังก์ชันสำหรับตั้งเวลา Trigger รายวัน ช่วงเช้า (07.00 - 08.00 น.)
 * ส่งแจ้งเตือนก่อนวันนัด 1 สัปดาห์ (7 วัน), ก่อนวันนัด 1 วัน (1 วัน) และในวันนัดหมาย (0 วัน)
 */
function runScheduledLineNotificationsAt8AM() {
  var cfg = getLineConfigMap_();
  if (cfg.auto_send_enabled !== "true") return;
  var now = new Date();
  var todayIso = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
  var lastRunVal = (cfg.last_auto_8am_run_date || "").toString().trim();
  if (lastRunVal === "AUTO8AM_" + todayIso) return; // วันนี้ส่งไปแล้ว
  runDailyLineNotificationsCore_(false);
}

/**
 * ติดตั้ง Time-Driven Trigger ภายในระบบ (Private)
 */
function installDailyLineTriggerInternal_() {
  var triggers = ScriptApp.getProjectTriggers();
  var triggerFunc = "runScheduledLineNotificationsAt8AM";
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === triggerFunc) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger(triggerFunc)
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .inTimezone("Asia/Bangkok")
    .create();
  Logger.log("✅ ติดตั้ง Time Trigger รายวัน เวลา 07.00-08.00 น. สำเร็จ!");
}

/**
 * ติดตั้ง Google Apps Script Time-Driven Trigger รายวัน เวลา 07.00 - 08.00 น. อัตโนมัติ
 * (บังคับตรวจสอบสิทธิ์ Admin หรือ นักจิตวิทยา)
 */
function installDailyLineTrigger(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
    return { success: false, message: "เฉพาะผู้ดูแลระบบและนักจิตวิทยาเท่านั้นที่สามารถจัดการ Trigger ได้" };
  }
  try {
    installDailyLineTriggerInternal_();
    return { success: true, message: "ติดตั้งระบบตั้งเวลาแจ้งเตือนอัตโนมัติรายวัน (07.00 - 08.00 น.) บน Google Cloud เรียบร้อยแล้ว ระบบจะส่งแจ้งเตือนทุกเช้าโดยอัตโนมัติ" };
  } catch (err) {
    Logger.log("installDailyLineTrigger error: " + err.toString());
    return { success: false, message: "ไม่สามารถติดตั้ง Trigger อัตโนมัติได้: " + err.toString() };
  }
}

/**
 * ตรวจสอบและติดตั้ง Time Trigger อัตโนมัติ (Self-Healing Background Service)
 */
function ensureDailyTimeTriggerInstalled_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var triggerFunc = "runScheduledLineNotificationsAt8AM";
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === triggerFunc) {
        return; // ติดตั้งเรียบร้อยแล้ว
      }
    }
    ScriptApp.newTrigger(triggerFunc)
      .timeBased()
      .everyDays(1)
      .atHour(7)
      .inTimezone("Asia/Bangkok")
      .create();
    Logger.log("✅ Auto-installed daily 7AM Time Trigger successfully!");
  } catch (err) {
    Logger.log("ensureDailyTimeTriggerInstalled error: " + err.toString());
  }
}

/**
 * เสิร์ฟหน้าเว็บแอปแรกเริ่มรันระบบ
 */
function doGet(e) {
  // รองรับการเรียกจาก Autonomous Cron โดยไม่เปิดเผยข้อมูลภายในออกทาง JSON
  if (e && e.parameter && (e.parameter.action === "cron" || e.parameter.cron === "daily" || e.parameter.action === "run_daily_line")) {
    try {
      checkAndRunDailyLineNotificationsAuto_();
    } catch (cronErr) {}
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
  }

  // ตรวจสอบและติดตั้ง Google Cloud Time Trigger อัตโนมัติในเบื้องหลัง (Self-Healing)
  ensureDailyTimeTriggerInstalled_();

  var output = HtmlService.createTemplateFromFile('Index').evaluate();
  output.setTitle("CCMS Rayong - ระบบบริหารจัดการศูนย์ให้คำปรึกษาฯ ศาลเยาวชนและครอบครัวจังหวัดระยอง")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  return output;
}

function include(filename) {
  if (filename !== "Styles" && filename !== "Scripts") {
    return "";
  }
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ดึงออบเจ็กต์ Spreadsheet
 */
function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * ช่วยประมวลแปลงสเกลปี พ.ศ. (พุทธศักราช > 2400) ไปเป็น ค.ศ. (คริสต์ศักราช) ป้องกันระบบกรองวันที่สถิติผิดพลาด
 */
function normalizeSheetDate_(dateVal) {
  if (!dateVal) return null;
  
  if (dateVal instanceof Date || (dateVal && typeof dateVal.getTime === 'function')) {
    var d = new Date(dateVal.getTime());
    var y = d.getFullYear();
    if (y > 2400) d.setFullYear(y - 543);
    return d;
  }
  
  var dateStr = dateVal.toString().trim();
  if (dateStr === "") return null;
  
  // รองรับรูปแบบวันที่มีเครื่องหมายคั่น / หรือ - ทั้งแบบ DD/MM/YYYY, DD-MM-YYYY และ YYYY-MM-DD
  var delimiter = dateStr.indexOf("/") !== -1 ? "/" : (dateStr.indexOf("-") !== -1 ? "-" : "");
  if (delimiter) {
    var parts = dateStr.split(delimiter);
    if (parts.length === 3) {
      var p0 = parseInt(parts[0], 10);
      var p1 = parseInt(parts[1], 10);
      var p2 = parseInt(parts[2], 10);
      if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
        // หากส่วนแรกเป็นปี 4 หลัก เช่น 2569-11-16 หรือ 2026-11-16
        if (p0 > 1000) {
          var y = p0 > 2400 ? p0 - 543 : p0;
          return new Date(y, p1 - 1, p2);
        } else {
          // หากส่วนท้ายเป็นปี เช่น 16/11/2569 หรือ 16-11-2569
          var y = p2 > 2400 ? p2 - 543 : p2;
          return new Date(y, p1 - 1, p0);
        }
      }
    }
  }
  
  var d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    var y = d.getFullYear();
    if (y > 2400) d.setFullYear(y - 543);
    return d;
  }
  
  return null;
}

/**
 * ช่วยแปลง Date หรือค่าวันที่จากชีทให้อยู่ในรูปแบบสตริง ISO "YYYY-MM-DD" ป้องกันข้อผิดพลาดของระบบ Apps Script ในการส่ง Date Object ไปหน้าบ้าน
 */
function formatDateAsIso_(dateVal) {
  if (!dateVal) return "";
  var d = normalizeSheetDate_(dateVal);
  if (!d) return "";
  try {
    return Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
  } catch (e) {
    try {
      var year = d.getFullYear();
      var month = ("0" + (d.getMonth() + 1)).slice(-2);
      var day = ("0" + d.getDate()).slice(-2);
      return year + "-" + month + "-" + day;
    } catch (err) {
      return "";
    }
  }
}

/**
 * ช่วยทำความสะอาดออบเจ็กต์ทั้งหมดเพื่อเตรียมส่งกลับหน้าบ้าน โดยแปลงทุก Date Object ในทุกฟิลด์ย่อยให้กลายเป็นสายอักขระสตริง ISO "YYYY-MM-DD"
 */
function sanitizeObjectForSerialization_(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (obj instanceof Date || (obj && typeof obj.getTime === 'function')) {
    return formatDateAsIso_(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObjectForSerialization_);
  }
  
  if (typeof obj === 'object') {
    var cleanObj = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        cleanObj[key] = sanitizeObjectForSerialization_(obj[key]);
      }
    }
    return cleanObj;
  }
  
  return obj;
}

/**
 * ช่วยทำความสะอาดเลขบัตรประชาชนให้เป็นตัวเลข 13 หลักต่อกันไม่มีขีด รองรับเลขทศนิยมและสัญลักษณ์ทางคณิตศาสตร์จาก Excel
 */
function cleanCitizenId_(cid) {
  if (!cid) return "";
  var cidStr = cid.toString().trim().replace(/[๐-๙]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0x0E50 + 48);
  });
  
  var cleaned = "";
  if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(cidStr) || /^\d+\.\d+$/.test(cidStr)) {
    var num = Number(cidStr);
    if (!isNaN(num)) {
      cleaned = num.toFixed(0);
    }
  } else {
    cleaned = cidStr.replace(/\D/g, "");
  }
  
  if (cleaned && /^\d+$/.test(cleaned) && cleaned.length < 13) {
    while (cleaned.length < 13) {
      cleaned = "0" + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * ตรวจเช็คและเพิ่มคอลัมน์วินิจฉัยทางจิตวิทยาเบื้องต้นอัตโนมัติ
 */
function ensurePsyDiagnosisColumn_() {
  ensureColumnsExist_("tb_defendants", ["psy_diagnosis", "risk_assessment", "counselor_comments", "note", "counselor_note"]);
}

/**
 * ตรวจเช็คและเพิ่มคอลัมน์ในตารางของชีทตามรายชื่อคอลัมน์ที่กำหนดแบบไดนามิก
 */
function ensureColumnsExist_(sheetName, columnsArray) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  var rawHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var headers = rawHeaders.map(function(h) { return h ? h.toString().trim() : ""; });
  var added = false;
  for (var i = 0; i < columnsArray.length; i++) {
    var colName = columnsArray[i];
    if (headers.indexOf(colName) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(colName);
      lastCol++;
      headers.push(colName);
      added = true;
    }
  }
  if (added) {
    clearSheetCache_(sheetName);
  }
}

/**
 * แปลงรหัสผ่านแบบ SHA-256 ร่วมกับ Salt
 */
function hashPassword_(password, salt) {
  var rawDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt, Utilities.Charset.UTF_8);
  var hash = "";
  for (var i = 0; i < rawDigest.length; i++) {
    var byteVal = rawDigest[i];
    if (byteVal < 0) byteVal += 256;
    var byteString = byteVal.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    hash += byteString;
  }
  return hash;
}

/**
 * สร้าง Unique Dynamic Salt (ใช้คีย์สุ่มร่วมกับ UUID)
 */
function generateSalt_() {
  return Utilities.getUuid().substring(0, 16);
}

var userAuthSnapshotMemCache_ = null;
var USER_AUTH_CACHE_KEY_ = "ccms_user_auth_map_v1";

/**
 * ล้างแคชสถานะสิทธิ์ของผู้ใช้งาน (เรียกเมื่อมีการแก้ไขตาราง tb_user)
 */
function invalidateUserAuthSnapshotCache_() {
  userAuthSnapshotMemCache_ = null;
  try {
    CacheService.getScriptCache().remove(USER_AUTH_CACHE_KEY_);
  } catch (e) {}
}

/**
 * เพิกถอน Session Token เดิมทันที (เมื่อล็อกเอาท์ เปลี่ยนรหัสผ่าน หรือแอดมินระงับบัญชี)
 */
function revokeUserTokens_(userId, tokenSignature) {
  try {
    var cache = CacheService.getScriptCache();
    if (tokenSignature && typeof tokenSignature === "string") {
      cache.put("ccms_revoked_sig_" + tokenSignature.substring(0, 32), "1", 21600);
    }
    if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
      cache.put("ccms_revoked_before_" + String(userId).trim(), String(new Date().getTime()), 21600);
    }
  } catch (e) {}
}

/**
 * ดึงแผนผังสถานะและบทบาทล่าสุดของผู้ใช้งานจาก CacheService / tb_user แบบรวดเร็ว (< 2ms)
 */
function getUserAuthSnapshotMap_() {
  if (userAuthSnapshotMemCache_) return userAuthSnapshotMemCache_;
  try {
    var cache = CacheService.getScriptCache();
    var cachedRaw = cache.get(USER_AUTH_CACHE_KEY_);
    if (cachedRaw) {
      var parsed = JSON.parse(cachedRaw);
      if (parsed && typeof parsed === "object") {
        userAuthSnapshotMemCache_ = parsed;
        return parsed;
      }
    }
  } catch (e) {}

  try {
    var users = getSheetData_("tb_user");
    var map = {};
    if (users && users.length > 0) {
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var uid = (u.user_id !== undefined && u.user_id !== null) ? String(u.user_id).trim() : "";
        if (!uid) continue;
        map[uid] = {
          isActive: (u.is_active || "").toString().trim().toLowerCase(),
          role: (u.role || "user").toString().trim().toLowerCase(),
          email: (u.email || "").toString().trim().toLowerCase(),
          fullName: (u.full_name || "").toString().trim()
        };
      }
      try {
        CacheService.getScriptCache().put(USER_AUTH_CACHE_KEY_, JSON.stringify(map), 300);
      } catch (putErr) {}
    }
    userAuthSnapshotMemCache_ = map;
    return map;
  } catch (err) {
    return {};
  }
}

/**
 * สร้าง Session Token ฝั่งเซิร์ฟเวอร์โดยเซ็นลายเซ็นด้วยคีย์ลับจาก PropertiesService
 */
function generateSessionToken_(userId, email, role, fullName) {
  var timestamp = new Date().getTime();
  var cleanRole = role ? role.toString().trim().toLowerCase() : "user";
  var signatureInput = userId + "|" + email + "|" + cleanRole + "|" + fullName + "|" + timestamp;
  var signature = hashPassword_(signatureInput, getSystemSecret_());
  return {
    userId: userId,
    email: email,
    role: cleanRole,
    fullName: fullName,
    timestamp: timestamp,
    signature: signature
  };
}

/**
 * ตรวจสอบความถูกต้องของ Session Token พร้อมตรวจสอบสถานะบัญชีและสิทธิ์ปัจจุบันแบบ Real-Time
 */
function verifySessionToken_(tokenObj) {
  if (!tokenObj || !tokenObj.signature) return null;
  try {
    var userId = tokenObj.userId;
    var email = tokenObj.email;
    var role = tokenObj.role;
    var fullName = tokenObj.fullName;
    var timestamp = Number(tokenObj.timestamp || 0);
    var clientSignature = String(tokenObj.signature || "");
    if (!timestamp || isNaN(timestamp)) return null;

    var signatureInput = userId + "|" + email + "|" + role + "|" + fullName + "|" + timestamp;
    var activeSecret = getSystemSecret_();
    var expectedSignature = hashPassword_(signatureInput, activeSecret);
    var isValidSig = (clientSignature === expectedSignature);
    if (!isValidSig && activeSecret !== LEGACY_SYSTEM_SECRET_) {
      var legacySignature = hashPassword_(signatureInput, LEGACY_SYSTEM_SECRET_);
      isValidSig = (clientSignature === legacySignature);
    }
    if (!isValidSig) return null;

    // อายุการล็อกอินเข้าใช้งาน 7 วัน
    var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (new Date().getTime() - timestamp > sevenDaysMs) {
      return null;
    }

    // ตรวจสอบว่า Token นี้ถูกสั่งออกจากระบบหรือเพิกถอนแล้วหรือไม่
    var uidStr = (userId !== undefined && userId !== null) ? String(userId).trim() : "";
    try {
      var cache = CacheService.getScriptCache();
      if (cache.get("ccms_revoked_sig_" + clientSignature.substring(0, 32))) {
        return null;
      }
      if (uidStr) {
        var revokedBefore = Number(cache.get("ccms_revoked_before_" + uidStr) || 0);
        if (revokedBefore && timestamp < revokedBefore) {
          return null;
        }
      }
    } catch (revErr) {}

    // ตรวจสอบสถานะ is_active และดึงบทบาทจริงล่าสุดจากตารางผู้ใช้
    var effectiveRole = role ? role.toString().trim().toLowerCase() : "";
    var effectiveFullName = fullName;
    var authMap = getUserAuthSnapshotMap_();
    if (authMap && Object.keys(authMap).length > 0 && uidStr) {
      var liveUser = authMap[uidStr];
      if (!liveUser || liveUser.isActive !== "yes") {
        return null;
      }
      if (liveUser.role) {
        effectiveRole = liveUser.role;
      }
      if (liveUser.fullName) {
        effectiveFullName = liveUser.fullName;
      }
    }

    return {
      userId: userId,
      email: email,
      role: effectiveRole,
      fullName: effectiveFullName,
      timestamp: timestamp,
      signature: clientSignature
    };
  } catch (e) {
    return null;
  }
}

var sheetDataCache = {};

function clearSheetCache_(sheetName) {
  if (sheetName) {
    delete sheetDataCache[sheetName];
    if (sheetName === "tb_user") {
      invalidateUserAuthSnapshotCache_();
    }
  } else {
    sheetDataCache = {};
    invalidateUserAuthSnapshotCache_();
  }
}

/**
 * ป้องกันช่องโหว่ Google Sheets Formula Injection (=, +, -, @, Tab, CR)
 */
function sanitizeSheetValue_(val) {
  if (typeof val !== "string" || val.length === 0) return val;
  if (val.charAt(0) === "'") return val;
  if (val === "-") return val;
  var firstChar = val.charAt(0);
  if (firstChar === "=" || firstChar === "@" || firstChar === "\t" || firstChar === "\r") {
    return "'" + val;
  }
  if ((firstChar === "+" || firstChar === "-") && !/^[+-]?\d+(\.\d+)?$/.test(val)) {
    return "'" + val;
  }
  return val;
}

/**
 * ดึงข้อมูลชีทตารางแปลงเป็นออบเจ็กต์ของ JS (พร้อมระบบแคชในรอบการเรียกใช้งานเดียว)
 */
function getSheetData_(sheetName) {
  if (sheetDataCache[sheetName]) {
    return sheetDataCache[sheetName];
  }
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return [];
  var rangeValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = rangeValues[0];
  var data = [];
  for (var r = 1; r < lastRow; r++) {
    var row = rangeValues[r];
    var obj = {};
    for (var c = 0; c < lastCol; c++) {
      var header = headers[c] ? headers[c].toString().trim() : "";
      if (header) {
        obj[header] = row[c];
      }
    }
    obj.rowNum = r + 1; // อ้างอิงเลขแถวจริงใน Sheet
    data.push(obj);
  }
  sheetDataCache[sheetName] = data;
  return data;
}

/**
 * อัปเดตข้อมูลแถวในชีท (พร้อมป้องกัน Formula Injection)
 */
function updateRowInSheet_(sheetName, rowNum, dataObj) {
  clearSheetCache_(sheetName);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keys = dataObj ? Object.keys(dataObj) : [];

  // กรณีอัปเดตเฉพาะบางคอลัมน์ (เช่น การผูก/ยกเลิกผูก LINE) ให้อัปเดตเฉพาะเซลล์ที่ระบุโดยตรง
  // เพื่อป้องกันการเขียนทับสูตรหรือข้อมูลคอลัมน์อื่นในแถวเดียวกัน
  if (keys.length > 0 && keys.length <= 8) {
    for (var c = 0; c < lastCol; c++) {
      var header = headers[c] ? headers[c].toString().trim() : "";
      if (header && dataObj.hasOwnProperty(header)) {
        sheet.getRange(rowNum, c + 1).setValue(sanitizeSheetValue_(dataObj[header]));
      }
    }
    return;
  }

  var rowRange = sheet.getRange(rowNum, 1, 1, lastCol);
  var rowValues = rowRange.getValues()[0];
  
  for (var c = 0; c < lastCol; c++) {
    var header = headers[c] ? headers[c].toString().trim() : "";
    if (header && dataObj.hasOwnProperty(header)) {
      rowValues[c] = sanitizeSheetValue_(dataObj[header]);
    }
  }
  rowRange.setValues([rowValues]);
}

/**
 * เพิ่มแถวข้อมูลใหม่เข้าตาราง (พร้อมป้องกัน Formula Injection)
 */
function appendRowToSheet_(sheetName, dataObj) {
  clearSheetCache_(sheetName);
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var newRowValues = [];
  for (var c = 0; c < lastCol; c++) {
    var header = headers[c] ? headers[c].toString().trim() : "";
    if (header) {
      newRowValues.push(dataObj.hasOwnProperty(header) ? sanitizeSheetValue_(dataObj[header]) : "");
    } else {
      newRowValues.push("");
    }
  }
  sheet.appendRow(newRowValues);
  return sheet.getLastRow();
}

/**
 * ถอดคำและวิเคราะห์แยกแยะชื่ออำเภอในจังหวัดระยอง
 */
function parseRayongDistrict_(addressStr) {
  if (!addressStr) return "ไม่ระบุ";
  var addr = addressStr.toString();
  
  if (addr.indexOf("แกลง") !== -1) return "แกลง";
  if (addr.indexOf("ปลวกแดง") !== -1) return "ปลวกแดง";
  if (addr.indexOf("บ้านค่าย") !== -1) return "บ้านค่าย";
  if (addr.indexOf("นิคมพัฒนา") !== -1) return "นิคมพัฒนา";
  if (addr.indexOf("บ้านฉาง") !== -1) return "บ้านฉาง";
  if (addr.indexOf("เขาชะเมา") !== -1) return "เขาชะเมา";
  if (addr.indexOf("วังจันทร์") !== -1) return "วังจันทร์";
  
  if (addr.indexOf("เมืองระยอง") !== -1 || addr.indexOf("เมือง") !== -1) {
    return "เมืองระยอง";
  }
  
  if (addr.indexOf("บางละมุง") !== -1) return "บางละมุง (ชลบุรี)";
  if (addr.indexOf("สัตหีบ") !== -1) return "สัตหีบ (ชลบุรี)";
  if (addr.indexOf("ศรีราชา") !== -1) return "ศรีราชา (ชลบุรี)";
  if (addr.indexOf("หนองใหญ่") !== -1) return "หนองใหญ่ (ชลบุรี)";
  
  return "อื่นๆ";
}

/**
 * ----------------- API CONTROLLERS -----------------
 */

/**
 * คืนค่าวัน-เวลาปัจจุบันในเขตเวลาประเทศไทย (Asia/Bangkok) รูปแบบ ISO 8601
 */
function getBangkokIsoNow_() {
  return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss'+07:00'");
}

/**
 * แปลงค่าวันที่/เวลาจาก Sheet เป็นเวลา มิลลิวินาที (Epoch ms) อย่างปลอดภัย
 */
function parseTimestampToMs_(val) {
  if (!val) return 0;
  try {
    if (Object.prototype.toString.call(val) === "[object Date]" || val instanceof Date) {
      var t = val.getTime();
      return isNaN(t) ? 0 : t;
    }
    var str = val.toString().trim();
    if (!str) return 0;
    var parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.getTime();
    // รองรับรูปแบบ "dd/MM/yyyy HH:mm:ss" หรือ "dd/MM/yyyy" (พ.ศ./ค.ศ.)
    var m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (m) {
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var y = parseInt(m[3], 10);
      if (y > 2400) y -= 543;
      var hh = m[4] ? parseInt(m[4], 10) : 0;
      var mm = m[5] ? parseInt(m[5], 10) : 0;
      var ss = m[6] ? parseInt(m[6], 10) : 0;
      var dt = new Date(y, mo, d, hh, mm, ss);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }
  } catch (ignore) {}
  return 0;
}

/**
 * แปลงค่าเวลาจาก Sheet ให้เป็นข้อความ ISO 8601 เวลาไทยเสมอ เพื่อส่งให้ฝั่งเว็บแสดงผลอย่างแม่นยำ
 */
function normalizeTimestampToIso_(val) {
  if (!val) return "";
  var ms = parseTimestampToMs_(val);
  if (ms > 0) {
    return Utilities.formatDate(new Date(ms), "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss'+07:00'");
  }
  return val.toString().trim();
}

/**
 * ตรวจเช็คให้แน่ใจว่า tb_user มีคอลัมน์ login_at, login_count, logout_at, last_seen_at, profile_image, verification_code, is_verified และ verification_attempts พร้อมใช้งาน
 */
function ensureUserAuditColumns_() {
  ensureColumnsExist_("tb_user", [
    "login_at",
    "login_count",
    "logout_at",
    "last_seen_at",
    "profile_image",
    "verification_code",
    "is_verified",
    "verification_attempts"
  ]);
}

var PRESENCE_CACHE_TTL_SEC = 21600; // 6 ชั่วโมง (เก็บประวัติ heartbeat ล่าสุดใน Cache)
var PRESENCE_ONLINE_THRESHOLD_MS = 135 * 1000; // 2 นาที 15 วินาที (เกินกว่านี้ถือว่าขาดการเชื่อมต่อ/ออฟไลน์)
var PRESENCE_SHEET_SEEN_THROTTLE_SEC = 240; // อัปเดต last_seen_at ลง Sheet อย่างน้อยทุก 4 นาที

function getPresenceCacheKey_(userId) {
  return "ccms_prs_" + String(userId || "").trim();
}

function getPresenceSheetThrottleKey_(userId) {
  return "ccms_seen_sh_" + String(userId || "").trim();
}

function getPresenceCacheEntry_(userId) {
  if (!userId) return null;
  try {
    var raw = CacheService.getScriptCache().get(getPresenceCacheKey_(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function getPresenceCacheMap_(users) {
  var result = {};
  if (!users || !users.length) return result;
  try {
    var keys = [];
    var keyToUid = {};
    for (var i = 0; i < users.length; i++) {
      var uid = String(users[i].user_id || "").trim();
      if (!uid || keyToUid["k_" + uid]) continue;
      keyToUid["k_" + uid] = true;
      keys.push(getPresenceCacheKey_(uid));
    }
    if (!keys.length) return result;
    var cache = CacheService.getScriptCache();
    // getAll รองรับครั้งละไม่เกิน 100 keys (แบ่งชุดเผื่อสมาชิกเกิน 100 คน)
    for (var start = 0; start < keys.length; start += 100) {
      var chunk = keys.slice(start, start + 100);
      var map = cache.getAll(chunk) || {};
      for (var k in map) {
        if (!map.hasOwnProperty(k) || !map[k]) continue;
        try {
          var uidPart = k.replace(/^ccms_prs_/, "");
          result[uidPart] = JSON.parse(map[k]);
        } catch (parseErr) {}
      }
    }
  } catch (e) {}
  return result;
}

function markUserOnlineInCache_(userId, isoStr, tabId) {
  if (!userId) return;
  try {
    var nowMs = Date.now();
    var payload = {
      s: "online",
      t: nowMs,
      iso: isoStr || getBangkokIsoNow_(),
      tabId: tabId ? String(tabId) : ""
    };
    CacheService.getScriptCache().put(getPresenceCacheKey_(userId), JSON.stringify(payload), PRESENCE_CACHE_TTL_SEC);
  } catch (e) {}
}

function markUserOfflineByUserId_(userId, options) {
  options = options || {};
  var uid = String(userId || "").trim();
  if (!uid) return { success: false };
  try {
    var forceOffline = !!options.force;
    var incomingTabId = options.tabId ? String(options.tabId) : "";
    var existing = getPresenceCacheEntry_(uid);
    // ป้องกันกรณีรีเฟรชหน้าเว็บ (F5) หรือปิดแท็บรอง แล้ว beacon ของแท็บเก่ามาถึงช้ากว่าแท็บใหม่ที่กำลังออนไลน์อยู่
    if (!forceOffline && incomingTabId && existing && existing.s === "online" && existing.tabId && existing.tabId !== incomingTabId) {
      return { success: true, ignoredStaleTab: true };
    }

    var nowIso = getBangkokIsoNow_();
    var nowMs = Date.now();
    var offPayload = {
      s: "offline",
      t: nowMs,
      iso: nowIso,
      tabId: ""
    };
    CacheService.getScriptCache().put(getPresenceCacheKey_(uid), JSON.stringify(offPayload), PRESENCE_CACHE_TTL_SEC);

    ensureUserAuditColumns_();
    var users = getSheetData_("tb_user");
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].user_id || "").trim() === uid) {
        updateRowInSheet_("tb_user", users[i].rowNum, {
          logout_at: nowIso,
          last_seen_at: nowIso
        });
        break;
      }
    }
    return { success: true, offlineAt: nowIso };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Heartbeat จากหน้าเว็บทุก 45 วินาที เพื่อแจ้งว่าผู้ใช้งานยังเปิดใช้งานระบบอยู่ (ออนไลน์)
 */
function pingUserPresence(tokenObj, tabId) {
  var session = verifySessionToken_(tokenObj);
  if (!session) return { success: false, code: "UNAUTHORIZED" };
  try {
    var uid = String(session.userId || "").trim();
    var nowIso = getBangkokIsoNow_();
    markUserOnlineInCache_(uid, nowIso, tabId);

    // อัปเดตลง Google Sheet เฉพาะตอนที่พ้นช่วง throttle (4 นาที) หรือเดิมเคยมีสถานะออฟไลน์ค้างไว้
    var cache = CacheService.getScriptCache();
    var throttleKey = getPresenceSheetThrottleKey_(uid);
    if (!cache.get(throttleKey)) {
      cache.put(throttleKey, "1", PRESENCE_SHEET_SEEN_THROTTLE_SEC);
      ensureUserAuditColumns_();
      var users = getSheetData_("tb_user");
      for (var i = 0; i < users.length; i++) {
        if (String(users[i].user_id || "").trim() === uid) {
          var patch = { last_seen_at: nowIso };
          if (String(users[i].logout_at || "").trim() !== "") {
            patch.logout_at = "";
          }
          updateRowInSheet_("tb_user", users[i].rowNum, patch);
          break;
        }
      }
    }
    return {
      success: true,
      timestamp: nowIso,
      currentRole: session.role,
      lineUnread: canViewLineOaNotifications_(session.role) ? getLineUnreadSummaryFromCache_(session.role) : null
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * บันทึกเวลาล็อกเอาท์เมื่อผู้ใช้งานกดปุ่ม "ออกจากระบบ" พร้อมเพิกถอน Session Token ทันที
 */
function logoutUser(tokenObj) {
  var session = verifySessionToken_(tokenObj);
  if (tokenObj && tokenObj.signature) {
    revokeUserTokens_(null, tokenObj.signature);
  }
  if (!session) return { success: false, code: "UNAUTHORIZED" };
  return markUserOfflineByUserId_(session.userId, { force: true });
}

/**
 * บันทึกเวลาล็อกอินล่าสุดลง tb_user (login_at, login_count, logout_at, last_seen_at) และประวัติย้อนหลังลง tb_login_log
 * (หุ้ม try/catch แยก เพื่อไม่ให้กระทบการเข้าสู่ระบบของสมาชิกไม่ว่ากรณีใดๆ)
 * @param {Object} foundUser แถวข้อมูลสมาชิกจาก tb_user
 * @param {string} loginType "password" (กรอกรหัสผ่าน) หรือ "session" (จำสิทธิ์อัตโนมัติ)
 * @param {string=} tabId รหัสแท็บของเบราว์เซอร์เพื่อลดปัญหา race condition ตอนรีเฟรชหน้า
 */
function recordUserLoginActivity_(foundUser, loginType, tabId) {
  if (!foundUser || !foundUser.rowNum) return { updated: false };
  try {
    ensureUserAuditColumns_();
    var now = new Date();
    var nowMs = now.getTime();
    var nowIso = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss'+07:00'");
    var nowDayStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
    var lastLoginMs = parseTimestampToMs_(foundUser.login_at);

    // อัปเดตสถานะออนไลน์ใน Cache ทันทีเสมอ แม้จะติดเงื่อนไข throttle ของการบันทึก log (เช่น กด Refresh)
    markUserOnlineInCache_(foundUser.user_id, nowIso, tabId);

    // ถ้าเข้าใช้งานด้วย Session ที่จำไว้ ให้เว้นช่วงอย่างน้อย 15 นาที (ภายในวันเดียวกัน) เพื่อกันการเขียน Log ซ้ำจากการกด Refresh
    if (loginType === "session" && lastLoginMs > 0) {
      var lastDayStr = Utilities.formatDate(new Date(lastLoginMs), "Asia/Bangkok", "yyyy-MM-dd");
      if (nowDayStr === lastDayStr && (nowMs - lastLoginMs) < 15 * 60 * 1000) {
        if (String(foundUser.logout_at || "").trim() !== "") {
          updateRowInSheet_("tb_user", foundUser.rowNum, {
            logout_at: "",
            last_seen_at: nowIso
          });
        }
        return {
          updated: false,
          loginAt: normalizeTimestampToIso_(foundUser.login_at),
          loginCount: parseInt(foundUser.login_count, 10) || 0
        };
      }
    }

    var newCount = (parseInt(foundUser.login_count, 10) || 0) + 1;
    updateRowInSheet_("tb_user", foundUser.rowNum, {
      login_at: nowIso,
      login_count: newCount,
      logout_at: "",
      last_seen_at: nowIso
    });

    // บันทึกประวัติลง tb_login_log (เก็บย้อนหลัง 30 วัน)
    var logHeaders = ["log_id", "user_id", "full_name", "email", "role", "login_type", "login_at"];
    getOrCreateSheet_("tb_login_log", logHeaders);
    var logId = "LG-" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMddHHmmss") + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    appendRowToSheet_("tb_login_log", {
      log_id: logId,
      user_id: foundUser.user_id || "",
      full_name: foundUser.full_name || "",
      email: foundUser.email || "",
      role: foundUser.role ? foundUser.role.toString().trim().toLowerCase() : "",
      login_type: loginType || "password",
      login_at: nowIso
    });

    return { updated: true, loginAt: nowIso, loginCount: newCount };
  } catch (e) {
    Logger.log("recordUserLoginActivity warning: " + e.toString());
    return { updated: false };
  }
}

/**
 * ล้างประวัติการล็อกอินที่เก่าเกิน 30 วันในชีท tb_login_log แบบ Batch (ทำงานเร็วและปลอดภัยด้วย ScriptLock)
 */
function cleanupOldLoginLogs_(daysToKeep, forceRun) {
  var keepDays = daysToKeep || 30;
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = "ccms_login_log_cleanup_done";
    if (!forceRun && cache.get(cacheKey)) {
      return 0;
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_login_log");
    if (!sheet || sheet.getLastRow() <= 1) {
      cache.put(cacheKey, "1", 21600); // พัก 6 ชั่วโมง
      return 0;
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return 0;
    }

    try {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol < 1) {
        cache.put(cacheKey, "1", 21600);
        return 0;
      }

      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
        return h ? h.toString().trim() : "";
      });
      var loginAtIdx = headers.indexOf("login_at");
      if (loginAtIdx === -1) {
        cache.put(cacheKey, "1", 21600);
        return 0;
      }

      var cutoffMs = new Date().getTime() - (keepDays * 24 * 60 * 60 * 1000);
      var numDataRows = lastRow - 1;
      var allValues = sheet.getRange(2, 1, numDataRows, lastCol).getValues();

      var contiguousExpired = 0;
      var totalExpired = 0;
      var inTopBlock = true;
      var keptRows = [];

      for (var i = 0; i < allValues.length; i++) {
        var rowTimeMs = parseTimestampToMs_(allValues[i][loginAtIdx]);
        var isExpired = (rowTimeMs > 0 && rowTimeMs < cutoffMs);
        if (isExpired) {
          totalExpired++;
          if (inTopBlock) contiguousExpired++;
        } else {
          inTopBlock = false;
          keptRows.push(allValues[i]);
        }
      }

      if (totalExpired > 0) {
        if (contiguousExpired === totalExpired && contiguousExpired < numDataRows) {
          // ลบกลุ่มแถวเก่าด้านบนสุดในคำสั่งเดียว
          sheet.deleteRows(2, contiguousExpired);
        } else {
          sheet.getRange(2, 1, numDataRows, lastCol).clearContent();
          if (keptRows.length > 0) {
            sheet.getRange(2, 1, keptRows.length, lastCol).setValues(keptRows);
            var extraRows = lastRow - (keptRows.length + 1);
            if (extraRows > 0) {
              sheet.deleteRows(keptRows.length + 2, extraRows);
            }
          } else if (lastRow > 2) {
            sheet.deleteRows(3, lastRow - 2);
          }
        }
        clearSheetCache_("tb_login_log");
      }

      cache.put(cacheKey, "1", 21600); // พัก 6 ชั่วโมงก่อนตรวจรอบถัดไป
      return totalExpired;
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    Logger.log("cleanupOldLoginLogs warning: " + e.toString());
    return 0;
  }
}

/**
 * ลงทะเบียนบัญชีสมาชิกใหม่ (สร้างรหัสยืนยัน 6 หลักเฉพาะแอดมินเห็น, สถานะเริ่มต้น is_active: "no" และ is_verified: "no")
 */
function registerUser(userData) {
  try {
    if (!userData || !userData.email || !userData.password || !userData.full_name) {
      return { success: false, message: "กรุณากรอกข้อมูลการสมัครสมาชิกให้ครบถ้วน" };
    }
    var rawPwd = userData.password.toString();
    if (rawPwd.length < 8) {
      return { success: false, message: "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร" };
    }
    if (userData.confirmPassword && rawPwd !== userData.confirmPassword.toString()) {
      return { success: false, message: "รหัสผ่านและรหัสผ่านยืนยันไม่ตรงกัน โปรดตรวจสอบอีกครั้ง" };
    }

    ensureUserAuditColumns_();
    var users = getSheetData_("tb_user");
    var cleanEmail = userData.email.toString().trim().toLowerCase();
    var cleanUsername = userData.username ? userData.username.toString().trim() : cleanEmail.split("@")[0];
    
    for (var i = 0; i < users.length; i++) {
      if (users[i].email && users[i].email.toString().trim().toLowerCase() === cleanEmail) {
        return { success: false, message: "อีเมลนี้ถูกใช้งานลงทะเบียนในระบบแล้ว" };
      }
      if (cleanUsername && users[i].username && users[i].username.toString().trim().toLowerCase() === cleanUsername.toLowerCase()) {
        return { success: false, message: "ชื่อผู้ใช้งาน (Username) นี้ถูกใช้งานในระบบแล้ว" };
      }
    }
    
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedPassword = hashPassword_(rawPwd, salt);
    
    var maxId = 0;
    for (var i = 0; i < users.length; i++) {
      var id = parseFloat(users[i].user_id) || 0;
      if (id > maxId) maxId = id;
    }
    var newUserId = maxId + 1;
    var nowIso = getBangkokIsoNow_();

    // สร้างรหัสยืนยันตัวตน 6 หลักความมั่นคงสูง (แอดมินเห็นเพียงคนเดียวเพื่อส่งให้เจ้าตัว)
    var seedDigest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + "|" + new Date().getTime() + "|" + Math.random(),
      Utilities.Charset.UTF_8
    );
    var numVal = 0;
    for (var b = 0; b < 4; b++) {
      var byteInt = seedDigest[b] < 0 ? seedDigest[b] + 256 : seedDigest[b];
      numVal = (numVal * 256) + byteInt;
    }
    var vCode = String(100000 + (Math.abs(numVal) % 900000));
    
    var newUserRow = {
      user_id: newUserId,
      email: cleanEmail,
      password: hashedPassword,
      username: cleanUsername,
      full_name: userData.full_name.toString().trim(),
      position: userData.position ? userData.position.toString().trim() : "ผู้ให้คำปรึกษา",
      phone: userData.phone ? userData.phone.toString().trim() : "",
      role: "user", // บทบาทตั้งต้นคือผู้ใช้ทั่วไป
      is_active: "no", // ปิดสิทธิ์ตั้งต้น (รอแอดมินกดเปิดสิทธิ์)
      verification_code: vCode, // รหัสยืนยัน 6 หลัก
      is_verified: "no", // ยังไม่ผ่านการยืนยันรหัส 6 หลัก
      verification_attempts: 0,
      created_at: nowIso,
      updated_at: nowIso,
      login_at: "",
      login_count: 0,
      profile_image: userData.profile_image ? userData.profile_image.toString().trim() : ""
    };
    
    appendRowToSheet_("tb_user", newUserRow);
    invalidateUserAuthSnapshotCache_();
    return {
      success: true,
      pendingApproval: true,
      message: "ลงทะเบียนสมาชิกสำเร็จแล้ว! กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อรับรหัสยืนยันตัวตน 6 หลักและเปิดสิทธิ์การเข้าใช้งาน"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการลงทะเบียน: " + e.toString() };
  }
}

/**
 * ปิดบังอีเมลบางส่วนสำหรับแสดงผลบนหน้าจอ (เช่น ka***@gmail.com)
 */
function maskEmailForDisplay_(emailStr) {
  var s = (emailStr || "").toString().trim();
  var parts = s.split("@");
  if (parts.length !== 2) return "***";
  var namePart = parts[0];
  var domainPart = parts[1];
  var visible = namePart.length <= 2 ? namePart.charAt(0) : namePart.substring(0, 2);
  return visible + "***@" + domainPart;
}

/**
 * ค้นหาผู้ใช้งานจากชื่อผู้ใช้หรืออีเมล (Internal Helper)
 */
function findUserByUsernameOrEmail_(usernameOrEmail) {
  var cleanInput = (usernameOrEmail || "").toString().trim().toLowerCase();
  if (!cleanInput) return null;
  var users = getSheetData_("tb_user");
  for (var i = 0; i < users.length; i++) {
    var emailMatch = users[i].email && users[i].email.toString().trim().toLowerCase() === cleanInput;
    var usernameMatch = users[i].username && users[i].username.toString().trim().toLowerCase() === cleanInput;
    if (emailMatch || usernameMatch) {
      return users[i];
    }
  }
  return null;
}

/**
 * ขั้นตอนที่ 1: ขอรหัส OTP 6 หลักทางอีเมลเพื่อยืนยันตัวตนก่อนตั้งรหัสผ่านใหม่ด้วยตนเอง
 * (ฟรี 100% ผ่าน MailApp และแอดมินไม่เห็นรหัสผ่านของผู้ใช้งาน)
 */
function requestPasswordResetOtp(usernameOrEmail) {
  try {
    var cleanInput = (usernameOrEmail || "").toString().trim().toLowerCase();
    if (!cleanInput) {
      return { success: false, message: "กรุณากรอกอีเมลหรือชื่อผู้ใช้งาน" };
    }

    var foundUser = findUserByUsernameOrEmail_(cleanInput);
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้งานหรือชื่อผู้ใช้งานนี้ในระบบ" };
    }

    var cleanEmail = foundUser.email ? foundUser.email.toString().replace(/\s+/g, "").toLowerCase() : "";
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, message: "บัญชีนี้ยังไม่ได้ระบุอีเมลที่ถูกต้องในระบบ โปรดติดต่อผู้ดูแลระบบเพื่อตรวจสอบอีเมลในตารางสมาชิก" };
    }

    var uid = String(foundUser.user_id || foundUser.rowNum).trim();
    var cache = CacheService.getScriptCache();
    var cooldownKey = "ccms_otp_cd_" + uid;
    if (cache.get(cooldownKey)) {
      return { success: false, message: "ระบบเพิ่งส่งรหัส OTP ไปเมื่อสักครู่ กรุณารอประมาณ 1 นาทีก่อนกดขอรหัสใหม่" };
    }

    var rateKey = "ccms_otp_rate_" + uid;
    var reqCount = parseInt(cache.get(rateKey) || "0", 10) || 0;
    if (reqCount >= 5) {
      return { success: false, message: "คุณขอรหัส OTP เกินจำนวนครั้งที่กำหนด กรุณารอ 15 นาทีแล้วลองใหม่อีกครั้ง" };
    }

    var remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota <= 0) {
      return { success: false, message: "โควตาการส่งอีเมลประจำวันของระบบ Google เต็มแล้ว กรุณาลองใหม่ในวันถัดไป" };
    }

    // สร้างรหัส OTP 6 หลักแบบสุ่มความมั่นคงสูง
    var seedDigest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + "|" + new Date().getTime() + "|" + Math.random(),
      Utilities.Charset.UTF_8
    );
    var numVal = 0;
    for (var b = 0; b < 4; b++) {
      var byteInt = seedDigest[b] < 0 ? seedDigest[b] + 256 : seedDigest[b];
      numVal = (numVal * 256) + byteInt;
    }
    var otpCode = String(100000 + (Math.abs(numVal) % 900000));
    var otpHash = hashPassword_(otpCode, cleanEmail + "_ccms_otp_salt_v1");

    var otpPayload = {
      otpHash: otpHash,
      attempts: 0,
      createdAt: new Date().getTime(),
      email: cleanEmail
    };

    var displayUserName = (foundUser.full_name || foundUser.username || "").toString();
    var subject = "[CCMS Rayong] รหัสยืนยันตัวตน (OTP) สำหรับตั้งรหัสผ่านใหม่: " + otpCode;
    var plainBody =
      "ระบบบริหารจัดการศูนย์ให้คำปรึกษาฯ (CCMS Rayong)\n" +
      "ศาลเยาวชนและครอบครัวจังหวัดระยอง\n\n" +
      "เรียน คุณ " + displayUserName + ",\n\n" +
      "รหัสยืนยันตัวตน (OTP) 6 หลักสำหรับตั้งรหัสผ่านใหม่ของคุณคือ: " + otpCode + "\n" +
      "(รหัสนี้มีอายุการใช้งาน 10 นาที)\n\n" +
      "* รหัสผ่านใหม่ที่คุณตั้งจะถูกเข้ารหัสทันที โดยผู้ดูแลระบบไม่สามารถเข้าถึงหรือทราบรหัสผ่านของคุณได้\n" +
      "* หากคุณไม่ได้เป็นผู้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้";

    var htmlBody =
      '<div style="font-family:\'Sarabun\',Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#1e293b;">' +
        '<h2 style="margin:0 0 8px 0;color:#4f46e5;">ระบบบริหารจัดการศูนย์ให้คำปรึกษาฯ (CCMS Rayong)</h2>' +
        '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">ศาลเยาวชนและครอบครัวจังหวัดระยอง</div>' +
        '<p style="font-size:15px;line-height:1.6;">เรียน คุณ <b>' + displayUserName + '</b>,</p>' +
        '<p style="font-size:14px;line-height:1.6;">มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ โปรดนำรหัสยืนยันตัวตน (OTP) 6 หลักด้านล่างนี้ไปกรอกในหน้าเว็บเพื่อกำหนดรหัสผ่านใหม่ด้วยตนเอง:</p>' +
        '<div style="margin:22px 0;padding:18px;text-align:center;background:#f8fafc;border:2px dashed #6366f1;border-radius:12px;">' +
          '<div style="font-size:12px;color:#64748b;margin-bottom:6px;">รหัส OTP ยืนยันตัวตน (มีอายุ 10 นาที)</div>' +
          '<div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#4f46e5;">' + otpCode + '</div>' +
        '</div>' +
        '<p style="font-size:12.5px;color:#64748b;line-height:1.6;">* เพื่อความเป็นส่วนตัวและความปลอดภัยสูงสุด รหัสผ่านใหม่ที่คุณตั้งจะถูกเข้ารหัสทันทีโดยที่ผู้ดูแลระบบ (Admin) ไม่สามารถเข้าถึงหรือทราบรหัสผ่านของคุณได้<br>* หากคุณไม่ได้เป็นผู้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>' +
      '</div>';

    MailApp.sendEmail({
      to: cleanEmail,
      name: "CCMS Rayong",
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody
    });

    // บันทึก OTP และ Cooldown หลังจากส่งอีเมลสำเร็จแล้วเท่านั้น
    cache.put("ccms_pwd_otp_" + uid, JSON.stringify(otpPayload), 600); // อายุ 10 นาที
    cache.put(cooldownKey, "1", 55); // เว้นระยะขอซ้ำ 55 วินาที
    cache.put(rateKey, String(reqCount + 1), 900); // จำกัด 5 ครั้งใน 15 นาที

    var masked = maskEmailForDisplay_(cleanEmail);
    return {
      success: true,
      maskedEmail: masked,
      message: "ส่งรหัสยืนยันตัวตน OTP 6 หลักไปยังอีเมล " + masked + " เรียบร้อยแล้ว (รหัสมีอายุ 10 นาที)"
    };
  } catch (e) {
    var errText = e.toString();
    Logger.log("requestPasswordResetOtp error: " + errText);
    if (/MailApp|script\.send_mail|Authorization|permission|สิทธิ์|ไม่อนุญาต/i.test(errText)) {
      return {
        success: false,
        needsMailAuth: true,
        message: "ต้องกดอนุญาตสิทธิ์ส่งอีเมล (MailApp) ใน Google Apps Script เพียง 1 ครั้งก่อนใช้งาน (" + errText + ")"
      };
    }
    return { success: false, message: "ไม่สามารถส่งรหัส OTP ทางอีเมลได้: " + errText };
  }
}

/**
 * ขั้นตอนที่ 2: ยืนยันรหัส OTP 6 หลักและตั้งรหัสผ่านใหม่ด้วยตนเอง
 */
function verifyOtpAndResetPassword(usernameOrEmail, otpCode, newPassword) {
  try {
    var cleanInput = (usernameOrEmail || "").toString().trim().toLowerCase();
    var cleanOtp = (otpCode || "").toString().replace(/\s+/g, "");
    var rawPwd = (newPassword || "").toString();

    if (!cleanInput) {
      return { success: false, message: "กรุณาระบุอีเมลหรือชื่อผู้ใช้งาน" };
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { success: false, message: "กรุณากรอกรหัสยืนยันตัวตน OTP 6 หลักที่ได้จากอีเมลให้ถูกต้อง" };
    }
    if (rawPwd.length < 8) {
      return { success: false, message: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร" };
    }

    var foundUser = findUserByUsernameOrEmail_(cleanInput);
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้งานหรือชื่อผู้ใช้งานนี้ในระบบ" };
    }

    var uid = String(foundUser.user_id || foundUser.rowNum).trim();
    var cleanEmail = foundUser.email ? foundUser.email.toString().trim().toLowerCase() : cleanInput;
    var cache = CacheService.getScriptCache();
    var otpKey = "ccms_pwd_otp_" + uid;
    var rawOtpJson = cache.get(otpKey);
    if (!rawOtpJson) {
      return { success: false, message: "รหัส OTP หมดอายุหรือยังไม่ได้ขอรหัส โปรดกดขอรหัส OTP ทางอีเมลใหม่อีกครั้ง" };
    }

    var otpData = JSON.parse(rawOtpJson);
    var attempts = parseInt(otpData.attempts, 10) || 0;
    if (attempts >= 5) {
      cache.remove(otpKey);
      return { success: false, message: "กรอกรหัส OTP ผิดเกิน 5 ครั้ง ระบบได้ยกเลิกรหัสชุดนี้แล้ว โปรดกดขอรหัส OTP ใหม่" };
    }

    var expectedHash = hashPassword_(cleanOtp, cleanEmail + "_ccms_otp_salt_v1");
    if (expectedHash !== otpData.otpHash) {
      otpData.attempts = attempts + 1;
      var remaining = 5 - otpData.attempts;
      if (remaining <= 0) {
        cache.remove(otpKey);
        return { success: false, message: "รหัส OTP ไม่ถูกต้องครบ 5 ครั้ง ระบบได้ยกเลิกรหัสชุดนี้แล้ว โปรดกดขอรหัส OTP ใหม่" };
      }
      cache.put(otpKey, JSON.stringify(otpData), 600);
      return { success: false, message: "รหัส OTP ไม่ถูกต้อง (เหลือโอกาสลองอีก " + remaining + " ครั้ง)" };
    }

    // รหัส OTP ถูกต้อง -> ลบ OTP ทันทีและบันทึกค่า Hash ของรหัสผ่านใหม่
    cache.remove(otpKey);
    cache.remove("ccms_otp_cd_" + uid);
    cache.remove("ccms_login_fail_" + uid);
    cache.remove("ccms_login_fail_" + cleanInput);

    var salt = cleanEmail + "ccms_extra_salt";
    var hashedPassword = hashPassword_(rawPwd, salt);
    updateRowInSheet_("tb_user", foundUser.rowNum, {
      password: hashedPassword,
      updated_at: getBangkokIsoNow_()
    });

    // เพิกถอน Session Token เก่าทั้งหมดของบัญชีนี้ทันที
    revokeUserTokens_(foundUser.user_id, null);

    return {
      success: true,
      message: "ยืนยันตัวตนและตั้งรหัสผ่านใหม่เรียบร้อยแล้ว สามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการรีเซ็ทรหัสผ่าน: " + e.toString() };
  }
}

/**
 * รีเซ็ทรหัสผ่านผู้ใช้ (บังคับต้องผ่านการยืนยันตัวตนด้วยรหัส OTP 6 หลักเท่านั้น)
 */
function resetUserPassword(usernameOrEmail, newPassword, otpCode) {
  if (!otpCode || !/^\d{6}$/.test(String(otpCode).trim())) {
    return {
      success: false,
      message: "ระบบความปลอดภัยไม่อนุญาตให้เปลี่ยนรหัสผ่านโดยไม่ยืนยันตัวตน โปรดขอและกรอกรหัส OTP 6 หลักทางอีเมล"
    };
  }
  return verifyOtpAndResetPassword(usernameOrEmail, otpCode, newPassword);
}

/**
 * ตรวจสอบความถูกต้องและล็อกอินเข้าสู่ระบบ (พร้อมระบบป้องกันการสุ่มรหัสผ่าน Brute-Force Lockout)
 */
function loginUser(usernameOrEmail, password, tabId) {
  try {
    if (!usernameOrEmail || !password) {
      return { success: false, message: "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่านให้ครบถ้วน" };
    }
    var cleanInput = usernameOrEmail.toString().trim().toLowerCase();
    var cache = CacheService.getScriptCache();
    var inputLockKey = "ccms_login_fail_" + cleanInput;
    var inputFailCount = parseInt(cache.get(inputLockKey) || "0", 10) || 0;
    if (inputFailCount >= 5) {
      return {
        success: false,
        message: "บัญชีนี้ถูกระงับการล็อกอินชั่วคราว 15 นาที เนื่องจากกรอกรหัสผ่านผิดเกิน 5 ครั้ง โปรดรอสักครู่หรือกดลืมรหัสผ่านเพื่อยืนยันตัวตนผ่าน OTP"
      };
    }

    var foundUser = findUserByUsernameOrEmail_(cleanInput);
    if (!foundUser) {
      cache.put(inputLockKey, String(inputFailCount + 1), 900);
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" };
    }

    var uid = String(foundUser.user_id || foundUser.rowNum).trim();
    var userLockKey = "ccms_login_fail_" + uid;
    var userFailCount = parseInt(cache.get(userLockKey) || "0", 10) || 0;
    if (userFailCount >= 5) {
      return {
        success: false,
        message: "บัญชีนี้ถูกระงับการล็อกอินชั่วคราว 15 นาที เนื่องจากกรอกรหัสผ่านผิดเกิน 5 ครั้ง โปรดรอสักครู่หรือกดลืมรหัสผ่านเพื่อยืนยันตัวตนผ่าน OTP"
      };
    }
    
    var cleanEmail = foundUser.email ? foundUser.email.toString().trim().toLowerCase() : cleanInput;
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedPassword = hashPassword_(password, salt);
    
    if (!foundUser.password) {
      return {
        success: false,
        message: "บัญชีนี้ยังไม่ได้กำหนดรหัสผ่าน โปรดคลิก 'ลืมรหัสผ่าน?' เพื่อรับรหัส OTP ทางอีเมลและกำหนดรหัสผ่านของคุณ"
      };
    }

    if (foundUser.password !== hashedPassword) {
      var nextFail = Math.max(inputFailCount, userFailCount) + 1;
      cache.put(inputLockKey, String(nextFail), 900);
      cache.put(userLockKey, String(nextFail), 900);
      var remainTries = 5 - nextFail;
      if (remainTries <= 0) {
        return {
          success: false,
          message: "รหัสผ่านไม่ถูกต้องเกิน 5 ครั้ง บัญชีถูกระงับการล็อกอินชั่วคราว 15 นาที เพื่อป้องกันการสุ่มรหัสผ่าน"
        };
      }
      return {
        success: false,
        message: "รหัสผ่านไม่ถูกต้อง โปรดตรวจสอบอีกครั้ง (เหลือโอกาสลองอีก " + remainTries + " ครั้ง)"
      };
    }

    // รหัสผ่านถูกต้อง! ตรวจสอบสถานะการยืนยันรหัส 6 หลักจากแอดมิน
    var isVerified = foundUser.is_verified ? foundUser.is_verified.toString().trim().toLowerCase() : (foundUser.is_active === "yes" ? "yes" : "no");
    if (isVerified !== "yes") {
      return {
        success: false,
        needsVerification: true,
        userId: foundUser.user_id,
        username: foundUser.username || "",
        fullName: foundUser.full_name || "",
        email: foundUser.email || "",
        isActive: foundUser.is_active === "yes",
        message: "บัญชีของคุณยังไม่ได้ยืนยันรหัสยืนยันตัวตน 6 หลักที่ได้รับจากผู้ดูแลระบบ กรุณากรอกรหัสเพื่อยืนยัน"
      };
    }

    // ตรวจสอบสิทธิ์การใช้งานจากแอดมิน (is_active)
    if (foundUser.is_active !== "yes") {
      return {
        success: false,
        message: "บัญชีของคุณได้รับการยืนยันตัวตนแล้ว แต่สิทธิ์การเข้าใช้งานยังไม่ได้รับการเปิดใช้งานจากผู้ดูแลระบบ หรือถูกปิดสิทธิ์ชั่วคราว โปรดติดต่อแอดมิน"
      };
    }

    // ล็อกอินสำเร็จ -> ล้างตัวนับการกรอกรหัสผิด
    cache.remove(inputLockKey);
    cache.remove(userLockKey);
    
    // บันทึกเวลาการเข้าสู่ระบบ (login_at) และสถานะออนไลน์
    var loginTrack = recordUserLoginActivity_(foundUser, "password", tabId);
    var webAppUrl = "";
    try { webAppUrl = ScriptApp.getService().getUrl() || ""; } catch (urlErr) {}

    var token = generateSessionToken_(foundUser.user_id, foundUser.email, foundUser.role, foundUser.full_name);
    return {
      success: true,
      message: "เข้าสู่ระบบเรียบร้อยแล้ว",
      token: token,
      webAppUrl: webAppUrl,
      user: {
        userId: foundUser.user_id,
        email: foundUser.email,
        role: foundUser.role ? foundUser.role.toString().trim().toLowerCase() : "",
        fullName: foundUser.full_name,
        position: foundUser.position,
        username: foundUser.username || "",
        phone: foundUser.phone || "",
        createdAt: foundUser.created_at || "",
        loginAt: loginTrack.loginAt || normalizeTimestampToIso_(foundUser.login_at),
        profileImage: foundUser.profile_image || ""
      }
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการล็อกอิน: " + e.toString() };
  }
}

/**
 * ยืนยันรหัสยืนยันตัวตน 6 หลักที่ผู้ใช้งานได้รับจากแอดมิน
 */
function verifyUserRegistrationCode(userId, code, tabId) {
  try {
    if (!userId || !code) {
      return { success: false, message: "กรุณาระบุรหัสยืนยันตัวตน 6 หลักให้ครบถ้วน" };
    }
    var cleanCode = String(code).trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return { success: false, message: "รหัสยืนยันตัวตนต้องเป็นตัวเลข 6 หลัก" };
    }

    ensureUserAuditColumns_();
    var users = getSheetData_("tb_user");
    var foundUser = null;
    var uidStr = String(userId).trim();
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].user_id || "").trim() === uidStr) {
        foundUser = users[i];
        break;
      }
    }

    if (!foundUser) {
      return { success: false, message: "ไม่พบบัญชีผู้ใช้งานในระบบ" };
    }

    var isAlreadyVerified = foundUser.is_verified ? foundUser.is_verified.toString().trim().toLowerCase() === "yes" : false;
    if (isAlreadyVerified) {
      return { success: true, alreadyVerified: true, message: "บัญชีนี้ได้รับการยืนยันตัวตนเรียบร้อยแล้ว" };
    }

    var attempts = parseInt(foundUser.verification_attempts, 10) || 0;
    if (attempts >= 5) {
      return {
        success: false,
        message: "กรอกรหัสยืนยันผิดเกิน 5 ครั้ง บัญชีถูกระงับการยืนยันชั่วคราว กรุณาติดต่อแอดมินเพื่อขอสุ่มรหัสยืนยันใหม่"
      };
    }

    var actualCode = foundUser.verification_code ? String(foundUser.verification_code).trim() : "";
    if (!actualCode || cleanCode !== actualCode) {
      var nextAttempts = attempts + 1;
      updateRowInSheet_("tb_user", foundUser.rowNum, {
        verification_attempts: nextAttempts,
        updated_at: getBangkokIsoNow_()
      });
      var remaining = 5 - nextAttempts;
      if (remaining <= 0) {
        return {
          success: false,
          message: "รหัสยืนยันไม่ถูกต้องเกิน 5 ครั้ง กรุณาติดต่อแอดมินเพื่อขอรหัสยืนยันชุดใหม่"
        };
      }
      return {
        success: false,
        message: "รหัสยืนยันตัวตนไม่ถูกต้อง โปรดตรวจสอบอีกครั้ง (เหลือโอกาสลองอีก " + remaining + " ครั้ง)"
      };
    }

    // ยืนยันรหัส 6 หลักถูกต้อง!
    var nowIso = getBangkokIsoNow_();
    updateRowInSheet_("tb_user", foundUser.rowNum, {
      is_verified: "yes",
      verification_attempts: 0,
      updated_at: nowIso
    });
    invalidateUserAuthSnapshotCache_();

    // ตรวจสอบว่าแอดมินเปิดสิทธิ์ (is_active === 'yes') แล้วหรือยัง
    var isActive = foundUser.is_active ? foundUser.is_active.toString().trim().toLowerCase() === "yes" : false;
    if (isActive) {
      // แอดมินเปิดสิทธิ์แล้ว -> ล็อกอินเข้าสู่ระบบได้ทันที!
      var loginTrack = recordUserLoginActivity_(foundUser, "password", tabId);
      var webAppUrl = "";
      try { webAppUrl = ScriptApp.getService().getUrl() || ""; } catch (urlErr) {}
      var token = generateSessionToken_(foundUser.user_id, foundUser.email, foundUser.role, foundUser.full_name);
      return {
        success: true,
        loggedIn: true,
        token: token,
        webAppUrl: webAppUrl,
        user: {
          userId: foundUser.user_id,
          email: foundUser.email,
          role: foundUser.role ? foundUser.role.toString().trim().toLowerCase() : "",
          fullName: foundUser.full_name,
          position: foundUser.position,
          username: foundUser.username || "",
          phone: foundUser.phone || "",
          createdAt: foundUser.created_at || "",
          loginAt: loginTrack.loginAt || normalizeTimestampToIso_(foundUser.login_at),
          profileImage: foundUser.profile_image || ""
        },
        message: "ยืนยันรหัสตัวตน 6 หลักสำเร็จ ยินดีต้อนรับเข้าสู่ระบบ!"
      };
    } else {
      // ยืนยันรหัสผ่านแล้ว แต่แอดมินยังไม่ได้เปิดสิทธิ์
      return {
        success: true,
        loggedIn: false,
        message: "ยืนยันรหัสตัวตน 6 หลักถูกต้องแล้ว! กรุณารอผู้ดูแลระบบ (Admin) เปิดสิทธิ์การใช้งานเพื่อเริ่มปฏิบัติงาน"
      };
    }
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการยืนยันรหัส: " + e.toString() };
  }
}

/**
 * สุ่มสร้างรหัสยืนยัน 6 หลักใหม่สำหรับผู้ใช้งานที่ยังไม่ยืนยันตัวตน (แอดมินเท่านั้น)
 */
function adminRegenerateVerificationCode(targetUserId, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || userSession.role !== "admin") {
    return { success: false, message: "สิทธิ์การเข้าถึงจำกัดเฉพาะแอดมินเท่านั้น" };
  }

  try {
    ensureUserAuditColumns_();
    var users = getSheetData_("tb_user");
    var foundUser = null;
    var uidStr = String(targetUserId).trim();
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].user_id || "").trim() === uidStr) {
        foundUser = users[i];
        break;
      }
    }

    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้งานที่ระบุ" };
    }

    // สุ่มรหัส 6 หลักใหม่
    var seedDigest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + "|" + new Date().getTime() + "|" + Math.random(),
      Utilities.Charset.UTF_8
    );
    var numVal = 0;
    for (var b = 0; b < 4; b++) {
      var byteInt = seedDigest[b] < 0 ? seedDigest[b] + 256 : seedDigest[b];
      numVal = (numVal * 256) + byteInt;
    }
    var newCode = String(100000 + (Math.abs(numVal) % 900000));

    updateRowInSheet_("tb_user", foundUser.rowNum, {
      verification_code: newCode,
      verification_attempts: 0,
      updated_at: getBangkokIsoNow_()
    });

    invalidateUserAuthSnapshotCache_();
    return { success: true, newCode: newCode, message: "สร้างรหัสยืนยันใหม่เรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  }
}

/**
 * ตรวจเช็คและเพิ่มคอลัมน์เก็บรูปภาพของสมาชิกใน tb_user
 */
function ensureProfileImageColumn_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("tb_user");
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = headers.indexOf("profile_image");
  if (colIdx === -1) {
    sheet.getRange(1, lastCol + 1).setValue("profile_image");
    return lastCol + 1;
  }
  return colIdx + 1;
}

/**
 * อัปเดตข้อมูลส่วนตัวของสมาชิก (User Profile)
 */
function updateUserProfile(profileData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    ensureProfileImageColumn_();
    var users = getSheetData_("tb_user");
    var foundUser = null;
    
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id && users[i].user_id.toString() === userSession.userId.toString()) {
        foundUser = users[i];
        break;
      }
    }
    
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลสมาชิกบนเซิร์ฟเวอร์" };
    }
    
    // ตรวจสอบ username ซ้ำ (หากมีการเปลี่ยน username)
    var newUsername = profileData.username.toString().trim();
    if (newUsername !== foundUser.username) {
      for (var i = 0; i < users.length; i++) {
        if (users[i].username && users[i].username.toString().trim().toLowerCase() === newUsername.toLowerCase() && 
            users[i].user_id.toString() !== userSession.userId.toString()) {
          return { success: false, message: "ชื่อผู้ใช้งาน (Username) นี้ถูกใช้โดยสมาชิกท่านอื่นแล้ว" };
        }
      }
    }

    // ตรวจสอบ email ซ้ำ (หากมีการเปลี่ยน email)
    var newEmail = profileData.email.toString().trim().toLowerCase();
    if (newEmail !== foundUser.email) {
      for (var i = 0; i < users.length; i++) {
        if (users[i].email && users[i].email.toString().trim().toLowerCase() === newEmail.toLowerCase() && 
            users[i].user_id.toString() !== userSession.userId.toString()) {
          return { success: false, message: "อีเมลผู้ใช้งานนี้ถูกใช้โดยสมาชิกท่านอื่นแล้ว" };
        }
      }
    }
    
    var updateData = {
      username: newUsername,
      email: newEmail,
      full_name: profileData.fullName.toString().trim(),
      position: profileData.position.toString().trim(),
      phone: profileData.phone.toString().trim(),
      updated_at: new Date().toISOString()
    };
    
    if (profileData.hasOwnProperty("profileImage")) {
      updateData.profile_image = profileData.profileImage;
    }
    
    updateRowInSheet_("tb_user", foundUser.rowNum, updateData);
    
    // สร้าง Token และอัปเดต Session ใหม่
    var newToken = generateSessionToken_(foundUser.user_id, updateData.email, foundUser.role, updateData.full_name);
    
    return {
      success: true,
      message: "อัปเดตข้อมูลส่วนตัวเรียบร้อยแล้ว",
      token: newToken,
      user: {
        userId: foundUser.user_id,
        email: updateData.email,
        role: foundUser.role ? foundUser.role.toString().trim().toLowerCase() : "",
        fullName: updateData.full_name,
        position: updateData.position,
        username: updateData.username,
        phone: updateData.phone,
        createdAt: foundUser.created_at || "",
        profileImage: updateData.hasOwnProperty("profile_image") ? updateData.profile_image : (foundUser.profile_image || "")
      }
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูลส่วนตัว: " + e.toString() };
  }
}

/**
 * เปลี่ยนรหัสผ่านของสมาชิก
 */
function changeUserPassword(oldPassword, newPassword, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    var users = getSheetData_("tb_user");
    var foundUser = null;
    
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id && users[i].user_id.toString() === userSession.userId.toString()) {
        foundUser = users[i];
        break;
      }
    }
    
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลสมาชิกบนเซิร์ฟเวอร์" };
    }
    
    var cleanEmail = foundUser.email.toString().trim().toLowerCase();
    var salt = cleanEmail + "ccms_extra_salt";
    var oldHashed = hashPassword_(oldPassword, salt);
    
    if (foundUser.password && foundUser.password !== oldHashed) {
      return { success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" };
    }
    
    var newHashed = hashPassword_(newPassword, salt);
    updateRowInSheet_("tb_user", foundUser.rowNum, {
      password: newHashed,
      updated_at: new Date().toISOString()
    });
    
    return { success: true, message: "เปลี่ยนรหัสผ่านสำเร็จแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: " + e.toString() };
  }
}

/**
 * ดึงและคำนวณประมวลผลข้อมูลสถิติบน Dashboard
 */
function getDashboardData(startDateStr, endDateStr, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    var cases = getSheetData_("tb_cases");
    var defendants = getSheetData_("tb_defendants");
    var charges = getSheetData_("tb_charge");
    
    // แปลงช่วงข้อมูลวันที่ในการแสดงผลสถิติ
    var start = startDateStr ? new Date(startDateStr) : new Date(new Date().getFullYear() + "-01-01T00:00:00");
    var end = endDateStr ? new Date(endDateStr) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    var chargeMap = {};
    for (var i = 0; i < charges.length; i++) {
      chargeMap[charges[i].charge_no] = charges[i].charge_statistics;
    }
    
    var defendantMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var dCid = cleanCitizenId_(defendants[i].citizen_id);
      if (dCid) {
        defendantMap[dCid] = defendants[i];
      }
    }
    
    var chargeCountsBySection = {
      "ทั้งหมด": {},
      "มาตรา 73": {},
      "มาตรา 90": {},
      "มาตรา 132 วรรคหนึ่ง": {},
      "มาตรา 132 วรรคสอง": {},
      "คดีจากศาลอื่น": {},
      "คดีอื่นๆ": {}
    };
    var recidivismCountBySection = {
      "ทั้งหมด": 0,
      "มาตรา 73": 0,
      "มาตรา 90": 0,
      "มาตรา 132 วรรคหนึ่ง": 0,
      "มาตรา 132 วรรคสอง": 0,
      "คดีจากศาลอื่น": 0,
      "คดีอื่นๆ": 0
    };
    var genderCountsBySection = {
      "ทั้งหมด": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 73": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 90": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 132 วรรคหนึ่ง": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 132 วรรคสอง": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 },
      "คดีจากศาลอื่น": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 },
      "คดีอื่นๆ": { "ชาย": 0, "หญิง": 0, "ไม่มีข้อมูล": 0 }
    };
    var ageCountsBySection = {
      "ทั้งหมด": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 73": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 90": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 132 วรรคหนึ่ง": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 },
      "มาตรา 132 วรรคสอง": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 },
      "คดีจากศาลอื่น": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 },
      "คดีอื่นๆ": { "18 ปีขึ้นไป": 0, "15 ปี แต่ไม่ถึง 18 ปี": 0, "12 ปี แต่ไม่ถึง 15 ปี": 0, "ต่ำกว่า 12 ปี": 0, "ไม่มีข้อมูล": 0 }
    };
    var districtCountsBySection = {
      "ทั้งหมด": {},
      "มาตรา 73": {},
      "มาตรา 90": {},
      "มาตรา 132 วรรคหนึ่ง": {},
      "มาตรา 132 วรรคสอง": {},
      "คดีจากศาลอื่น": {},
      "คดีอื่นๆ": {}
    };
    
    var newCaseSections = { "มาตรา 73": 0, "มาตรา 90": 0, "มาตรา 132 วรรคหนึ่ง": 0, "มาตรา 132 วรรคสอง": 0, "คดีจากศาลอื่น": 0, "คดีอื่นๆ": 0 };
    var closedCaseSections = { "มาตรา 73": 0, "มาตรา 90": 0, "มาตรา 132 วรรคหนึ่ง": 0, "มาตรา 132 วรรคสอง": 0, "คดีจากศาลอื่น": 0, "คดีอื่นๆ": 0 };
    var pendingCaseSections = { "มาตรา 73": 0, "มาตรา 90": 0, "มาตรา 132 วรรคหนึ่ง": 0, "มาตรา 132 วรรคสอง": 0, "คดีจากศาลอื่น": 0, "คดีอื่นๆ": 0 };
    var carriedForwardCaseSections = { "มาตรา 73": 0, "มาตรา 90": 0, "มาตรา 132 วรรคหนึ่ง": 0, "มาตรา 132 วรรคสอง": 0, "คดีจากศาลอื่น": 0, "คดีอื่นๆ": 0 };
    
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      
      var sectionLabel = "คดีอื่นๆ";
      var ctId = parseFloat(c.case_type_id);
      var subCtId = parseFloat(c.sub_case_type_id);
      
      if (ctId === 1) {
        sectionLabel = "มาตรา 73";
      } else if (ctId === 2) {
        sectionLabel = "มาตรา 90";
      } else if (ctId === 3) {
        if (subCtId === 2) {
          sectionLabel = "มาตรา 132 วรรคสอง";
        } else {
          sectionLabel = "มาตรา 132 วรรคหนึ่ง";
        }
      } else if (ctId === 5 || ctId === 6 || ctId === 7) {
        sectionLabel = "คดีจากศาลอื่น";
      } else {
        sectionLabel = "คดีอื่นๆ";
      }
      
      var blackDate = c.black_date ? normalizeSheetDate_(c.black_date) : null;
      var radDate = c.red_date ? normalizeSheetDate_(c.red_date) : null;
      
      var hasBlack = c.black_date !== undefined && c.black_date !== null && c.black_date.toString().trim() !== "";
      var hasRed = c.red_date !== undefined && c.red_date !== null && c.red_date.toString().trim() !== "";
      
      // คดีคงค้าง: black_date ต้องไม่เลย 'ถึงวันที่' และ ไม่มี red_date
      if (hasBlack && blackDate && blackDate <= end && !hasRed) {
        pendingCaseSections[sectionLabel]++;
      }
      
      // ยоดยกมา: black_date ก่อนช่วงเริ่มต้น และ ไม่มี red_date หรือ red_date >= start
      if (hasBlack && blackDate && blackDate < start && (!hasRed || (radDate && radDate >= start))) {
        carriedForwardCaseSections[sectionLabel]++;
      }
      
      var isNewInPeriod = blackDate && (blackDate >= start && blackDate <= end);
      var isClosedInPeriod = radDate && (radDate >= start && radDate <= end);
      
      if (!isNewInPeriod && !isClosedInPeriod) continue;
      
      var caseCid = cleanCitizenId_(c.citizen_id);
      var def = caseCid ? defendantMap[caseCid] : null;
      
      if (isNewInPeriod) {
        newCaseSections[sectionLabel]++;
        
        if (c.recidivism === "ซ้ำ") {
          recidivismCountBySection["ทั้งหมด"]++;
          recidivismCountBySection[sectionLabel]++;
        }
        
        if (c.charge_no) {
          var chName = chargeMap[c.charge_no] || "ไม่ระบุข้อหา";
          chargeCountsBySection["ทั้งหมด"][chName] = (chargeCountsBySection["ทั้งหมด"][chName] || 0) + 1;
          chargeCountsBySection[sectionLabel][chName] = (chargeCountsBySection[sectionLabel][chName] || 0) + 1;
        }
        
        // ดึงค่าข้อมูลจากอายุขณะกระทำผิด (age_at_offense ในตาราง tb_cases)
        var age = parseFloat(c.age_at_offense);
        var ageGroup = "ไม่มีข้อมูล";
        if (!isNaN(age)) {
          if (age >= 18) ageGroup = "18 ปีขึ้นไป";
          else if (age >= 15) ageGroup = "15 ปี แต่ไม่ถึง 18 ปี";
          else if (age >= 12) ageGroup = "12 ปี แต่ไม่ถึง 15 ปี";
          else ageGroup = "ต่ำกว่า 12 ปี";
        }
        ageCountsBySection["ทั้งหมด"][ageGroup]++;
        ageCountsBySection[sectionLabel][ageGroup]++;
        
        var gender = "ไม่มีข้อมูล";
        var distLabel = "ไม่มีข้อมูล";
        
        if (def) {
          var g = def.gender || "";
          if (g === "ชาย") gender = "ชาย";
          else if (g === "หญิง") gender = "หญิง";
          
          var prov = def.province_address ? def.province_address.toString().trim() : "";
          var dist = def.district_address ? def.district_address.toString().trim() : "";
          
          if (prov === "" && dist === "") {
            var fullAddrParts = [];
            for (var key in def) {
              if (def.hasOwnProperty(key) && key.indexOf("_address") !== -1 && def[key]) {
                fullAddrParts.push(def[key].toString().trim());
              }
            }
            var fullAddr = fullAddrParts.join(" ");
            
            if (fullAddr !== "") {
              if (fullAddr.indexOf("ระยอง") !== -1) {
                var parsedDist = parseRayongDistrict_(fullAddr);
                if (parsedDist === "อื่นๆ" || parsedDist === "ไม่ระบุ") {
                  distLabel = "เมืองระยอง";
                } else if (parsedDist.indexOf("(ชลบุรี)") !== -1) {
                  distLabel = "จังหวัดอื่นๆ";
                } else {
                  distLabel = parsedDist;
                }
              } else {
                var parsedDist = parseRayongDistrict_(fullAddr);
                if (parsedDist !== "อื่นๆ" && parsedDist !== "ไม่ระบุ" && parsedDist.indexOf("(ชลบุรี)") === -1) {
                  distLabel = parsedDist;
                } else {
                  distLabel = "จังหวัดอื่นๆ";
                }
              }
            } else {
              distLabel = "ไม่มีข้อมูล";
            }
          } else if (prov.indexOf("ระยอง") !== -1 || dist === "แกลง" || dist === "ปลวกแดง" || dist === "บ้านค่าย" || dist === "นิคมพัฒนา" || dist === "บ้านฉาง" || dist === "เขาชะเมา" || dist === "วังจันทร์" || dist === "เมือง" || dist === "เมืองระยอง") {
            var cleanDist = dist !== "" ? dist.replace(/^(อำเภอ|อ\.)/, "").trim() : "";
            if (cleanDist === "") {
              var fullAddrParts = [];
              for (var key in def) {
                if (def.hasOwnProperty(key) && key.indexOf("_address") !== -1 && def[key]) {
                  fullAddrParts.push(def[key].toString().trim());
                }
              }
              var fullAddr = fullAddrParts.join(" ");
              var parsedDist = parseRayongDistrict_(fullAddr);
              if (parsedDist === "อื่นๆ" || parsedDist === "ไม่ระบุ") {
                distLabel = "เมืองระยอง";
              } else if (parsedDist.indexOf("(ชลบุรี)") !== -1) {
                distLabel = "จังหวัดอื่นๆ";
              } else {
                distLabel = parsedDist;
              }
            } else if (cleanDist === "เมือง" || cleanDist === "เมืองระยอง") {
              distLabel = "เมืองระยอง";
            } else {
              distLabel = cleanDist;
            }
          } else {
            distLabel = "จังหวัดอื่นๆ";
          }
        }
        
        genderCountsBySection["ทั้งหมด"][gender]++;
        genderCountsBySection[sectionLabel][gender]++;
        
        districtCountsBySection["ทั้งหมด"][distLabel] = (districtCountsBySection["ทั้งหมด"][distLabel] || 0) + 1;
        districtCountsBySection[sectionLabel][distLabel] = (districtCountsBySection[sectionLabel][distLabel] || 0) + 1;
      }
      
      if (isClosedInPeriod) {
        closedCaseSections[sectionLabel]++;
      }
    }
    
    var topChargesBySection = {};
    for (var sec in chargeCountsBySection) {
      var counts = chargeCountsBySection[sec];
      var list = [];
      for (var ch in counts) {
        list.push({ name: ch, count: counts[ch] });
      }
      list.sort(function(a, b) { return b.count - a.count; });
      topChargesBySection[sec] = list;
    }
    
    // จัดเรียงลำดับอำเภอระยองตามจำนวนจากมากไปน้อย และผลัก จังหวัดอื่นๆ/ไม่มีข้อมูล ไว้ท้ายสุด แยกตามมาตรา
    var sortedDistrictsBySection = {};
    for (var sec in districtCountsBySection) {
      var distCounts = districtCountsBySection[sec];
      var sortedDist = {};
      var districtKeys = Object.keys(distCounts);
      districtKeys.sort(function(a, b) {
        if (a === "จังหวัดอื่นๆ" || a === "ไม่มีข้อมูล") {
          if (b === "จังหวัดอื่นๆ" || b === "ไม่มีข้อมูล") {
            return a === "จังหวัดอื่นๆ" ? -1 : 1; // จังหวัดอื่นๆ อยู่ก่อน ไม่มีข้อมูล
          }
          return 1;
        }
        if (b === "จังหวัดอื่นๆ" || b === "ไม่มีข้อมูล") return -1;
        return distCounts[b] - distCounts[a];
      });
      for (var k = 0; k < districtKeys.length; k++) {
        sortedDist[districtKeys[k]] = distCounts[districtKeys[k]];
      }
      sortedDistrictsBySection[sec] = sortedDist;
    }
    
    // === Monthly Trend Chart Computation ===
    var availableYearsSet = {};
    var trendDataObj = {};
    
    var allSectionsList = ["ทั้งหมด", "มาตรา 73", "มาตรา 90", "มาตรา 132 วรรคหนึ่ง", "มาตรา 132 วรรคสอง", "คดีจากศาลอื่น", "คดีอื่นๆ"];
    function initYearInTrendData(yr) {
      if (!trendDataObj[yr]) {
        trendDataObj[yr] = {};
        for (var s = 0; s < allSectionsList.length; s++) {
          var sec = allSectionsList[s];
          trendDataObj[yr][sec] = {
            newCases: [0,0,0,0,0,0,0,0,0,0,0,0],
            closedCases: [0,0,0,0,0,0,0,0,0,0,0,0],
            pendingCases: [0,0,0,0,0,0,0,0,0,0,0,0]
          };
        }
      }
    }

    var currentYear = new Date().getFullYear();
    
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var sectionLabel = "คดีอื่นๆ";
      var ctId = parseFloat(c.case_type_id);
      var subCtId = parseFloat(c.sub_case_type_id);
      
      if (ctId === 1) sectionLabel = "มาตรา 73";
      else if (ctId === 2) sectionLabel = "มาตรา 90";
      else if (ctId === 3) {
        if (subCtId === 2) sectionLabel = "มาตรา 132 วรรคสอง";
        else sectionLabel = "มาตรา 132 วรรคหนึ่ง";
      } else if (ctId === 5 || ctId === 6 || ctId === 7) sectionLabel = "คดีจากศาลอื่น";
      else sectionLabel = "คดีอื่นๆ";
      
      var bDate = c.black_date ? normalizeSheetDate_(c.black_date) : null;
      var rDate = c.red_date ? normalizeSheetDate_(c.red_date) : null;
      
      if (bDate) {
        var bYear = bDate.getFullYear();
        var bMonth = bDate.getMonth();
        availableYearsSet[bYear] = true;
        initYearInTrendData(bYear);
        trendDataObj[bYear]["ทั้งหมด"].newCases[bMonth]++;
        trendDataObj[bYear][sectionLabel].newCases[bMonth]++;
      }
      
      if (rDate) {
        var rYear = rDate.getFullYear();
        var rMonth = rDate.getMonth();
        availableYearsSet[rYear] = true;
        initYearInTrendData(rYear);
        trendDataObj[rYear]["ทั้งหมด"].closedCases[rMonth]++;
        trendDataObj[rYear][sectionLabel].closedCases[rMonth]++;
      }
    }
    
    availableYearsSet[currentYear] = true;
    var availableYearsList = Object.keys(availableYearsSet).map(Number).sort(function(a, b) { return a - b; });
    var minYear = availableYearsList.length > 0 ? availableYearsList[0] : currentYear;
    var maxYear = currentYear;
    
    var availableYears = [];
    for (var y = minYear; y <= maxYear; y++) {
      availableYears.push(y);
      initYearInTrendData(y);
    }
    
    for (var yIdx = 0; yIdx < availableYears.length; yIdx++) {
      var yr = availableYears[yIdx];
      for (var mo = 0; mo < 12; mo++) {
        var endOfMonth = new Date(yr, mo + 1, 0, 23, 59, 59, 999);
        for (var i = 0; i < cases.length; i++) {
          var c = cases[i];
          var bDate = c.black_date ? normalizeSheetDate_(c.black_date) : null;
          var rDate = c.red_date ? normalizeSheetDate_(c.red_date) : null;
          if (!bDate) continue;
          
          if (bDate <= endOfMonth && (!rDate || rDate > endOfMonth)) {
             var sectionLabel = "คดีอื่นๆ";
             var ctId = parseFloat(c.case_type_id);
             var subCtId = parseFloat(c.sub_case_type_id);
             if (ctId === 1) sectionLabel = "มาตรา 73";
             else if (ctId === 2) sectionLabel = "มาตรา 90";
             else if (ctId === 3) {
               if (subCtId === 2) sectionLabel = "มาตรา 132 วรรคสอง";
               else sectionLabel = "มาตรา 132 วรรคหนึ่ง";
             } else if (ctId === 5 || ctId === 6 || ctId === 7) sectionLabel = "คดีจากศาลอื่น";
             else sectionLabel = "คดีอื่นๆ";
             
             trendDataObj[yr]["ทั้งหมด"].pendingCases[mo]++;
             trendDataObj[yr][sectionLabel].pendingCases[mo]++;
          }
        }
      }
    }

    // === Counselor Active Cases Calculation ===
    var counselors = getSheetData_("tb_counselor");
    var appointments = getSheetData_("tb_appointment");
    var nowTimeForCounselor = new Date();
    nowTimeForCounselor.setHours(0, 0, 0, 0);
    var nowMsForCounselor = nowTimeForCounselor.getTime();

    // Build a set of black_case numbers that have at least one future appointment
    var blackCasesWithFutureApp = {};
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      var appDateIso = formatDateAsIso_(app.appointment_date);
      if (appDateIso) {
        var appMs = new Date(appDateIso);
        appMs.setHours(0, 0, 0, 0);
        if (appMs.getTime() >= nowMsForCounselor) {
          var cleanBlack = app.black_case.toString().replace(/\s+/g, "").toLowerCase();
          blackCasesWithFutureApp[cleanBlack] = true;
        }
      }
    }

    var counselorActiveYouthIds = {};
    for (var i = 0; i < counselors.length; i++) {
      var c = counselors[i];
      var pos = c.counselor_position ? c.counselor_position.toString().trim() : "";
      if (pos === "ผู้ให้คำปรึกษา") {
        var name = c.counselor_name ? c.counselor_name.toString().trim() : "";
        if (name) {
          counselorActiveYouthIds[name] = {};
        }
      }
    }

    for (var i = 0; i < cases.length; i++) {
      var cs = cases[i];
      var hasRedNo = cs.red_case_no && cs.red_case_no.toString().trim() !== "";
      if (!hasRedNo) {
        // Check if this case's black_case has a future appointment
        var csBlackCase = cs.black_case ? cs.black_case.toString().trim() : "";
        var cleanBlackCase = csBlackCase.replace(/\s+/g, "").toLowerCase();
        if (!csBlackCase || !blackCasesWithFutureApp[cleanBlackCase]) continue;

        var csCounselor = cs.counselor ? cs.counselor.toString().trim() : "";
        if (csCounselor && counselorActiveYouthIds.hasOwnProperty(csCounselor)) {
          var cleanId = cs.citizen_id ? cleanCitizenId_(cs.citizen_id) : "";
          if (cleanId) {
            counselorActiveYouthIds[csCounselor][cleanId] = true;
          }
        }
      }
    }

    var counselorActiveCasesList = [];
    for (var name in counselorActiveYouthIds) {
      var uniqueIds = Object.keys(counselorActiveYouthIds[name]);
      var count = uniqueIds.length;
      if (count > 0) {
        counselorActiveCasesList.push({ name: name, count: count });
      }
    }
    counselorActiveCasesList.sort(function(a, b) { return b.count - a.count; });

    return {
      success: true,
      data: {
        newCaseSections: newCaseSections,
        closedCaseSections: closedCaseSections,
        pendingCaseSections: pendingCaseSections,
        carriedForwardCaseSections: carriedForwardCaseSections,
        recidivismCount: recidivismCountBySection["ทั้งหมด"],
        recidivismCountBySection: recidivismCountBySection,
        topChargesBySection: topChargesBySection,
        genderCounts: genderCountsBySection["ทั้งหมด"],
        genderCountsBySection: genderCountsBySection,
        ageCounts: ageCountsBySection["ทั้งหมด"],
        ageCountsBySection: ageCountsBySection,
        districtCounts: sortedDistrictsBySection["ทั้งหมด"],
        districtCountsBySection: sortedDistrictsBySection,
        counselorActiveCasesList: counselorActiveCasesList,
        trendData: trendDataObj,
        availableYears: availableYears,
        period: {
          start: start.toISOString(),
          end: end.toISOString()
        }
      }
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการวิเคราะห์สถิติ Dashboard: " + e.toString() };
  }
}

/**
 * ดึงรายละเอียดของคดี/ข้อหา สำหรับสถิติประชากรศาสตร์ที่กดเลือก (เพศ, ช่วงอายุ, รายอำเภอ)
 */
function getDemographicCasesDetail(startDateStr, endDateStr, sectionFilter, type, value, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    var cases = getSheetData_("tb_cases");
    var defendants = getSheetData_("tb_defendants");
    var charges = getSheetData_("tb_charge");
    
    // แปลงช่วงข้อมูลวันที่
    var start = startDateStr ? new Date(startDateStr) : new Date(new Date().getFullYear() + "-01-01T00:00:00");
    var end = endDateStr ? new Date(endDateStr) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    var chargeMap = {};
    for (var i = 0; i < charges.length; i++) {
      chargeMap[charges[i].charge_no] = charges[i].charge_statistics;
    }
    
    var defendantMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var dCid = cleanCitizenId_(defendants[i].citizen_id);
      if (dCid) {
        defendantMap[dCid] = defendants[i];
      }
    }
    
    var totalMatchingCases = 0;
    var chargeCounts = {};
    
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      
      // กรองวันที่ (เฉพาะรับเข้าใหม่ในช่วงเวลา)
      var blackDate = c.black_date ? normalizeSheetDate_(c.black_date) : null;
      var isNewInPeriod = blackDate && (blackDate >= start && blackDate <= end);
      if (!isNewInPeriod) continue;
      
      // กรองมาตรา
      var sectionLabel = "คดีอื่นๆ";
      var ctId = parseFloat(c.case_type_id);
      var subCtId = parseFloat(c.sub_case_type_id);
      
      if (ctId === 1) {
        sectionLabel = "มาตรา 73";
      } else if (ctId === 2) {
        sectionLabel = "มาตรา 90";
      } else if (ctId === 3) {
        if (subCtId === 2) {
          sectionLabel = "มาตรา 132 วรรคสอง";
        } else {
          sectionLabel = "มาตรา 132 วรรคหนึ่ง";
        }
      } else if (ctId === 5 || ctId === 6 || ctId === 7) {
        sectionLabel = "คดีจากศาลอื่น";
      } else {
        sectionLabel = "คดีอื่นๆ";
      }
      
      if (sectionFilter !== "ทั้งหมด" && sectionLabel !== sectionFilter) continue;
      
      var caseCid = cleanCitizenId_(c.citizen_id);
      var def = caseCid ? defendantMap[caseCid] : null;
      
      // ดึงเพศ
      var gender = "ไม่มีข้อมูล";
      if (def) {
        var g = def.gender || "";
        if (g === "ชาย") gender = "ชาย";
        else if (g === "หญิง") gender = "หญิง";
      }
      
      // ดึงอายุและช่วงอายุ
      var age = parseFloat(c.age_at_offense);
      var ageGroup = "ไม่มีข้อมูล";
      if (!isNaN(age)) {
        if (age >= 18) ageGroup = "18 ปีขึ้นไป";
        else if (age >= 15) ageGroup = "15 ปี แต่ไม่ถึง 18 ปี";
        else if (age >= 12) ageGroup = "12 ปี แต่ไม่ถึง 15 ปี";
        else ageGroup = "ต่ำกว่า 12 ปี";
      }
      
      // ดึงอำเภอ
      var distLabel = "ไม่มีข้อมูล";
      if (def) {
        var prov = def.province_address ? def.province_address.toString().trim() : "";
        var dist = def.district_address ? def.district_address.toString().trim() : "";
        
        if (prov === "" && dist === "") {
          var fullAddrParts = [];
          for (var key in def) {
            if (def.hasOwnProperty(key) && key.indexOf("_address") !== -1 && def[key]) {
              fullAddrParts.push(def[key].toString().trim());
            }
          }
          var fullAddr = fullAddrParts.join(" ");
          
          if (fullAddr !== "") {
            if (fullAddr.indexOf("ระยอง") !== -1) {
              var parsedDist = parseRayongDistrict_(fullAddr);
              if (parsedDist === "อื่นๆ" || parsedDist === "ไม่ระบุ") {
                distLabel = "เมืองระยอง";
              } else if (parsedDist.indexOf("(ชลบุรี)") !== -1) {
                distLabel = "จังหวัดอื่นๆ";
              } else {
                distLabel = parsedDist;
              }
            } else {
              var parsedDist = parseRayongDistrict_(fullAddr);
              if (parsedDist !== "อื่นๆ" && parsedDist !== "ไม่ระบุ" && parsedDist.indexOf("(ชลบุรี)") === -1) {
                distLabel = parsedDist;
              } else {
                distLabel = "จังหวัดอื่นๆ";
              }
            }
          } else {
            distLabel = "ไม่มีข้อมูล";
          }
        } else if (prov.indexOf("ระยอง") !== -1 || dist === "แกลง" || dist === "ปลวกแดง" || dist === "บ้านค่าย" || dist === "นิคมพัฒนา" || dist === "บ้านฉาง" || dist === "เขาชะเมา" || dist === "วังจันทร์" || dist === "เมือง" || dist === "เมืองระยอง") {
          var cleanDist = dist !== "" ? dist.replace(/^(อำเภอ|อ\.)/, "").trim() : "";
          if (cleanDist === "") {
            var fullAddrParts = [];
            for (var key in def) {
              if (def.hasOwnProperty(key) && key.indexOf("_address") !== -1 && def[key]) {
                fullAddrParts.push(def[key].toString().trim());
              }
            }
            var fullAddr = fullAddrParts.join(" ");
            var parsedDist = parseRayongDistrict_(fullAddr);
            if (parsedDist === "อื่นๆ" || parsedDist === "ไม่ระบุ") {
              distLabel = "เมืองระยอง";
            } else if (parsedDist.indexOf("(ชลบุรี)") !== -1) {
              distLabel = "จังหวัดอื่นๆ";
            } else {
              distLabel = parsedDist;
            }
          } else if (cleanDist === "เมือง" || cleanDist === "เมืองระยอง") {
            distLabel = "เมืองระยอง";
          } else {
            distLabel = cleanDist;
          }
        } else {
          distLabel = "จังหวัดอื่นๆ";
        }
      }
      
      // ตรวจสอบเงื่อนไขตามประเภทข้อมูลประชากรศาสตร์ที่กดเลือก
      var match = false;
      if (type === "gender" && gender === value) {
        match = true;
      } else if (type === "age" && ageGroup === value) {
        match = true;
      } else if (type === "district" && distLabel === value) {
        match = true;
      }
      
      if (!match) continue;
      
      var chName = c.charge_no ? (chargeMap[c.charge_no] || "ไม่ระบุข้อหา (" + c.charge_no + ")") : "ไม่ระบุข้อหา";
      chargeCounts[chName] = (chargeCounts[chName] || 0) + 1;
      
      totalMatchingCases++;
    }
    
    // แปลง chargeCounts เป็นอาเรย์จัดเรียง
    var breakdown = [];
    for (var ch in chargeCounts) {
      breakdown.push({ chargeName: ch, count: chargeCounts[ch] });
    }
    breakdown.sort(function(a, b) { return b.count - a.count; });
    
    return {
      success: true,
      data: {
        cases: [], // ไม่ส่งข้อมูลส่วนตัวรายบุคคลเพื่อความปลอดภัย (PDPA)
        chargeBreakdown: breakdown,
        totalCount: totalMatchingCases
      }
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลคดีตามสถิติ: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลเด็กและเยาวชนทั้งหมดพร้อมคดีที่เชื่อมโยง สำหรับแสดงผลเป็นรายการการ์ดและค้นหาแบบครอบคลุม
 */
function getAllDefendantsWithCases(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงฟังก์ชันจัดการข้อมูลเด็กและคดี" };
  }
  
  try {
    ensurePsyDiagnosisColumn_();
    var defendants = getSheetData_("tb_defendants");
    var cases = getSheetData_("tb_cases");
    var appointments = getSheetData_("tb_appointment");
    
    // สร้าง map ค้นหาวันนัดหมายล่าสุดของแต่ละเลขคดีดำ (black_case)
    var latestAppMap = {};
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      var cleanBlack = app.black_case.toString().trim().replace(/\s+/g, "").toLowerCase();
      var appDate = normalizeSheetDate_(app.appointment_date);
      if (appDate) {
        if (!latestAppMap[cleanBlack] || appDate.getTime() > latestAppMap[cleanBlack].getTime()) {
          latestAppMap[cleanBlack] = appDate;
        }
      }
    }
    
    var isAdminOrStaff = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    // จัดกลุ่มคดีตามเลขบัตรประชาชน
    var caseMap = {};
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var isAssigned = (c.user_id && c.user_id.toString() === userSession.userId.toString()) || 
                       (c.counselor && c.counselor.toString().trim() === userSession.fullName.toString().trim());
      
      if (isAdminOrStaff || isAssigned) {
        var cCid = cleanCitizenId_(c.citizen_id);
        if (cCid) {
          if (!caseMap[cCid]) {
            caseMap[cCid] = [];
          }
          // จัดเตรียมรูปแบบเลขคดีดำศาลสะกดเต็ม
          var courtBlackNo = "";
          if (c.abb_black_criminal && c.black_criminal_no && c.black_criminal_year) {
            courtBlackNo = c.abb_black_criminal + c.black_criminal_no + "/" + c.black_criminal_year;
          }
          c.court_black_case = courtBlackNo;
          
          // เชื่อมโยงวันนัดหมายล่าสุด (เป็น YYYY-MM-DD string)
          var cleanCBlack = c.black_case ? c.black_case.toString().trim().replace(/\s+/g, "").toLowerCase() : "";
          var latestAppDate = latestAppMap[cleanCBlack] || null;
          if (latestAppDate) {
            c.latest_appointment_date = Utilities.formatDate(latestAppDate, "GMT+7", "yyyy-MM-dd");
          } else {
            c.latest_appointment_date = null;
          }
          
          caseMap[cCid].push(c);
        }
      }
    }
    
    var list = [];
    var seenCidMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var d = defendants[i];
      var dCid = cleanCitizenId_(d.citizen_id);
      if (!dCid) {
        continue; // ข้ามแถวที่ไม่มีเลขบัตรประชาชน (เช่น แถวว่างเปล่า)
      }
      
      // กรองเฉพาะเด็กที่ผู้ใช้งานมีสิทธิ์เข้าถึง (สำหรับ counselor ต้องมีอย่างน้อย 1 คดีที่ได้รับมอบหมาย)
      var linked = caseMap[dCid] || [];
      if (!isAdminOrStaff && linked.length === 0) {
        continue;
      }
      
      if (seenCidMap[dCid]) {
        var existingEntry = seenCidMap[dCid];
        if (!existingEntry.line_user_id && d.line_user_id) existingEntry.line_user_id = d.line_user_id;
        if ((!existingEntry.line_id || existingEntry.line_id === "-") && d.line_id) existingEntry.line_id = d.line_id;
        if (!existingEntry.line_chat_url && d.line_chat_url) existingEntry.line_chat_url = d.line_chat_url;
        if (!existingEntry.parent_line_user_id && d.parent_line_user_id) existingEntry.parent_line_user_id = d.parent_line_user_id;
        if ((!existingEntry.parent_line_id || existingEntry.parent_line_id === "-") && d.parent_line_id) existingEntry.parent_line_id = d.parent_line_id;
        if (!existingEntry.parent_line_chat_url && d.parent_line_chat_url) existingEntry.parent_line_chat_url = d.parent_line_chat_url;
        continue;
      }
      
      d.citizen_id = dCid;
      d.no = d.no !== undefined ? d.no : (d.No !== undefined ? d.No : (d.NO !== undefined ? d.NO : ""));
      d.cases = linked;
      formatDefendantAddress_(d);
      seenCidMap[dCid] = d;
      list.push(d);
    }
    
    var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    
    // เรียงลำดับการโชว์การ์ด:
    // 1. ดำเนินการ (Priority 0) -> ยุติ (Priority 1) -> ไม่มีคดี (Priority 2)
    // 2. เรียงตามคอลัมน์ no ใน tb_defendants จากมากไปหาน้อย
    // 3. เรียงตามวันที่คดีล่าสุด (วันรับคดีล่าสุด) จากใหม่ไปเก่า
    list.sort(function(a, b) {
      var getStatusPriority = function(def) {
        if (!def.cases || def.cases.length === 0) return 2;
        var hasActive = def.cases.some(function(c) {
          if (!c) return false;
          var hasRedNo = c.red_case_no && String(c.red_case_no).trim() !== '';
          if (hasRedNo) return false; // ยุติ
          
          // ตรวจสอบนัดหมายล่าสุด: ถ้าเป็นวันที่ที่ผ่านไปแล้วให้ถือว่า "ยุติ"
          var hasPastApp = c.latest_appointment_date && c.latest_appointment_date < todayStr;
          if (hasPastApp) return false; // ยุติ
          
          return true; // ยังดำเนินการอยู่
        });
        return hasActive ? 0 : 1;
      };

      var pA = getStatusPriority(a);
      var pB = getStatusPriority(b);
      if (pA !== pB) {
        return pA - pB;
      }

      var noA = (a.no !== undefined && a.no !== null && a.no !== "") ? parseFloat(a.no) : null;
      var noB = (b.no !== undefined && b.no !== null && b.no !== "") ? parseFloat(b.no) : null;
      
      var hasA = (noA !== null && !isNaN(noA));
      var hasB = (noB !== null && !isNaN(noB));
      
      if (hasA && hasB) {
        if (noA !== noB) {
          return noB - noA; // มากไปหาน้อย
        }
      } else if (hasA && !hasB) {
        return -1; // คนมีลำดับมาก่อน
      } else if (!hasA && hasB) {
        return 1; // คนมีลำดับมาก่อน
      }
      
      // เกณฑ์รอง: วันรับคดีล่าสุด
      var keyA = { date: new Date(0), no: 0 };
      if (a.cases && a.cases.length > 0) {
        for (var i = 0; i < a.cases.length; i++) {
          var cDate = a.cases[i].black_date ? normalizeSheetDate_(a.cases[i].black_date) : null;
          var cNo = parseFloat(a.cases[i].black_case_no) || 0;
          var dVal = cDate ? cDate.getTime() : 0;
          if (dVal > keyA.date.getTime() || (dVal === keyA.date.getTime() && cNo > keyA.no)) {
            keyA.date = cDate || new Date(0);
            keyA.no = cNo;
          }
        }
      }
      var keyB = { date: new Date(0), no: 0 };
      if (b.cases && b.cases.length > 0) {
        for (var i = 0; i < b.cases.length; i++) {
          var cDate = b.cases[i].black_date ? normalizeSheetDate_(b.cases[i].black_date) : null;
          var cNo = parseFloat(b.cases[i].black_case_no) || 0;
          var dVal = cDate ? cDate.getTime() : 0;
          if (dVal > keyB.date.getTime() || (dVal === keyB.date.getTime() && cNo > keyB.no)) {
            keyB.date = cDate || new Date(0);
            keyB.no = cNo;
          }
        }
      }
      
      if (keyA.date.getTime() !== keyB.date.getTime()) {
        return keyB.date.getTime() - keyA.date.getTime();
      }
      return keyB.no - keyA.no;
    });
    
    return {
      success: true,
      data: sanitizeObjectForSerialization_(list)
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดรายการข้อมูล: " + e.toString() };
  }
}

/**
 * สืบค้นเด็กและเยาวชนจากเลขบัตรประชาชน (citizen_id)
 */
function searchDefendantByCitizenId(citizenId, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงฟังก์ชันจัดการข้อมูลเด็กและคดี" };
  }
  
  try {
    ensurePsyDiagnosisColumn_();
    var cleanId = cleanCitizenId_(citizenId);
    if (!cleanId) return { success: false, message: "โปรดระบุเลขบัตรประชาชนในการค้นหา" };
    
    var defendants = getSheetData_("tb_defendants");
    var foundDef = null;
    
    for (var i = 0; i < defendants.length; i++) {
      var sheetCid = cleanCitizenId_(defendants[i].citizen_id);
      if (sheetCid === cleanId) {
        if (!foundDef) {
          foundDef = {};
          for (var fk in defendants[i]) {
            if (defendants[i].hasOwnProperty(fk)) foundDef[fk] = defendants[i][fk];
          }
        } else {
          if (!foundDef.line_user_id && defendants[i].line_user_id) foundDef.line_user_id = defendants[i].line_user_id;
          if ((!foundDef.line_id || foundDef.line_id === "-") && defendants[i].line_id) foundDef.line_id = defendants[i].line_id;
          if (!foundDef.line_chat_url && defendants[i].line_chat_url) foundDef.line_chat_url = defendants[i].line_chat_url;
          if (!foundDef.parent_line_user_id && defendants[i].parent_line_user_id) foundDef.parent_line_user_id = defendants[i].parent_line_user_id;
          if ((!foundDef.parent_line_id || foundDef.parent_line_id === "-") && defendants[i].parent_line_id) foundDef.parent_line_id = defendants[i].parent_line_id;
          if (!foundDef.parent_line_chat_url && defendants[i].parent_line_chat_url) foundDef.parent_line_chat_url = defendants[i].parent_line_chat_url;
        }
      }
    }
    
    if (!foundDef) {
      return { success: true, found: false, message: "ไม่พบประวัติเด็กและเยาวชนรายนี้ในระบบฐานข้อมูล" };
    }

    foundDef.citizen_id = cleanId;
    formatDefendantAddress_(foundDef);

    // ปรับสเกลปีเกิดของเยาวชนให้อยู่ในโหมด ค.ศ. และแปลงเป็นสตริง ISO สำหรับบราวเซอร์
    if (foundDef.birth_date) {
      foundDef.birth_date = formatDateAsIso_(foundDef.birth_date);
    }
    
    var cases = getSheetData_("tb_cases");
    var linkedCases = [];
    var hasAccess = false;
    var hasFullViewAccess = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var caseCid = cleanCitizenId_(c.citizen_id);
      if (caseCid === cleanId) {
        var isAssigned = (c.user_id && c.user_id.toString() === userSession.userId.toString()) || 
                         (c.counselor && c.counselor.toString().trim() === userSession.fullName.toString().trim());
        
        if (isAssigned) {
          hasAccess = true;
        }
        
        if (hasFullViewAccess || isAssigned) {
          // ปรับสเกลปีรับฟื้นฟู/คำสั่งศาลคดีดำแดงให้อยู่ในโหมด ค.ศ. และแปลงเป็นสตริง ISO สำหรับบราวเซอร์
          if (c.black_date) c.black_date = formatDateAsIso_(c.black_date);
          if (c.red_date) c.red_date = formatDateAsIso_(c.red_date);
          linkedCases.push(c);
        }
      }
    }
    
    // หากไม่ใช่ผู้ที่มีสิทธิ์ดูทั้งหมด และไม่ได้เป็นผู้ดูแลคดีใดคดีหนึ่งของเด็กคนนี้ จะปิดกั้นข้อมูล
    if (!hasFullViewAccess && !hasAccess) {
      return { 
        success: false, 
        message: "ระบบจำกัดการเข้าถึง: คุณไม่สามารถดูข้อมูลของเยาวชนรายนี้ได้เนื่องจากคุณไม่ใช่ผู้ให้คำปรึกษาที่ดูแลรับผิดชอบคดีของรายนี้" 
      };
    }
    
    return {
      success: true,
      found: true,
      defendant: sanitizeObjectForSerialization_(foundDef),
      cases: sanitizeObjectForSerialization_(linkedCases)
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการดึงข้อมูลประวัติเยาวชน: " + e.toString() };
  }
}

/**
 * ช่วยจัดรูปแบบที่อยู่ของจำเลย/เยาวชนสำหรับการส่งออกข้อมูล
 */
function formatDefendantAddress_(def) {
  var parts = [];
  
  if (def.number_address) {
    var val = def.number_address.toString().trim();
    if (val) parts.push(val);
  }
  
  if (def.village_address) {
    var val = def.village_address.toString().trim();
    if (val) {
      if (val.indexOf("หมู่บ้าน") === -1 && val.indexOf("ม.บ้าน") === -1) {
        parts.push("หมู่บ้าน" + val);
      } else {
        parts.push(val);
      }
    }
  }
  
  if (def.village_number_address) {
    var val = def.village_number_address.toString().trim();
    if (val) {
      if (val.indexOf("หมู่ที่") === -1 && val.indexOf("หมู่") === -1 && val.indexOf("ม.") === -1) {
        parts.push("หมู่ที่ " + val);
      } else {
        parts.push(val);
      }
    }
  }
  
  if (def.road_address) {
    var val = def.road_address.toString().trim();
    if (val) {
      if (val.indexOf("ถนน") === -1 && val.indexOf("ถ.") === -1) {
        parts.push("ถนน" + val);
      } else {
        parts.push(val);
      }
    }
  }
  
  var isBkk = false;
  if (def.province_address) {
    var provVal = def.province_address.toString().trim();
    if (provVal.indexOf("กรุงเทพ") !== -1 || provVal.indexOf("กทม") !== -1) {
      isBkk = true;
    }
  }
  
  if (def.sub_district_address) {
    var val = def.sub_district_address.toString().trim();
    if (val) {
      if (isBkk) {
        if (val.indexOf("แขวง") === -1) {
          parts.push("แขวง" + val);
        } else {
          parts.push(val);
        }
      } else {
        if (val.indexOf("ตำบล") === -1 && val.indexOf("ต.") === -1) {
          parts.push("ต." + val);
        } else {
          parts.push(val);
        }
      }
    }
  }
  
  if (def.district_address) {
    var val = def.district_address.toString().trim();
    if (val) {
      if (isBkk) {
        if (val.indexOf("เขต") === -1) {
          parts.push("เขต" + val);
        } else {
          parts.push(val);
        }
      } else {
        if (val.indexOf("อำเภอ") === -1 && val.indexOf("อ.") === -1) {
          parts.push("อ." + val);
        } else {
          parts.push(val);
        }
      }
    }
  }
  
  if (def.province_address) {
    var val = def.province_address.toString().trim();
    if (val) {
      if (isBkk) {
        // กรุงเทพมหานคร ไม่ต้องใส่ จ. นำหน้า
        if (val.indexOf("กรุงเทพ") === -1) {
          parts.push("กรุงเทพมหานคร");
        } else {
          parts.push(val);
        }
      } else {
        if (val.indexOf("จังหวัด") === -1 && val.indexOf("จ.") === -1) {
          parts.push("จ." + val);
        } else {
          parts.push(val);
        }
      }
    }
  }
  
  if (def.postcode_address) {
    var val = def.postcode_address.toString().trim();
    if (val) {
      parts.push(val);
    }
  }
  
  if (parts.length === 0) {
    for (var key in def) {
      if (def.hasOwnProperty(key) && key.indexOf("_address") !== -1 && def[key]) {
        var valStr = def[key].toString().trim();
        if (valStr !== "") {
          parts.push(valStr);
        }
      }
    }
  }
  def.address = parts.join(" ");
}

/**
 * ช่วยประกอบข้อมูลเยาวชนร่วมกับคดีในหน่วยความจำโดยตรง หลีกเลี่ยงการดึงข้อมูลจาก Sheets API ซ้ำ
 */
function buildDefendantResponse_(foundDef, casesArray, userSession) {
  var defCopy = {};
  for (var k in foundDef) {
    if (foundDef.hasOwnProperty(k)) {
      defCopy[k] = foundDef[k];
    }
  }
  
  formatDefendantAddress_(defCopy);
  
  if (defCopy.birth_date) {
    defCopy.birth_date = formatDateAsIso_(defCopy.birth_date);
  }
  
  var cleanId = cleanCitizenId_(defCopy.citizen_id);
  defCopy.citizen_id = cleanId;
  var linkedCases = [];
  var hasAccess = false;
  var hasFullViewAccess = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
  
  for (var i = 0; i < casesArray.length; i++) {
    var c = casesArray[i];
    var caseCid = cleanCitizenId_(c.citizen_id);
    if (caseCid === cleanId) {
      var isAssigned = (c.user_id && c.user_id.toString() === userSession.userId.toString()) || 
                       (c.counselor && c.counselor.toString().trim() === userSession.fullName.toString().trim());
      
      if (isAssigned) {
        hasAccess = true;
      }
      
      if (hasFullViewAccess || isAssigned) {
        var caseCopy = {};
        for (var ck in c) {
          if (c.hasOwnProperty(ck)) {
            caseCopy[ck] = c[ck];
          }
        }
        if (caseCopy.black_date) caseCopy.black_date = formatDateAsIso_(caseCopy.black_date);
        if (caseCopy.red_date) caseCopy.red_date = formatDateAsIso_(caseCopy.red_date);
        linkedCases.push(caseCopy);
      }
    }
  }
  
  if (!hasFullViewAccess && !hasAccess) {
    return { 
      success: false, 
      message: "ระบบจำกัดการเข้าถึง: คุณไม่สามารถดูข้อมูลของเยาวชนรายนี้ได้เนื่องจากคุณไม่ใช่ผู้ให้คำปรึกษาที่ดูแลรับผิดชอบคดีของรายนี้" 
    };
  }
  
  return {
    success: true,
    found: true,
    defendant: sanitizeObjectForSerialization_(defCopy),
    cases: sanitizeObjectForSerialization_(linkedCases)
  };
}

/**
 * เพิ่ม หรือแก้ไขข้อมูลประวัติเด็กและเยาวชน พร้อมผลทดสอบจิตวิทยา
 */
function upsertDefendant(defData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์แก้ไข/บันทึกข้อมูลประวัติเด็กและเยาวชน" };
  }
  
  try {
    ensureColumnsExist_("tb_defendants", [
      "psy_diagnosis",
      "number_address",
      "village_address",
      "village_number_address",
      "road_address",
      "sub_district_address",
      "district_address",
      "province_address",
      "postcode_address",
      "guardian_name",
      "phone_number",
      "phone_number_guardian",
      "line_id",
      "parent_line_id",
      "line_user_id",
      "parent_line_user_id",
      "line_chat_url",
      "parent_line_chat_url",
      "occupation",
      "occupation_guardian",
      "medical_history",
      "drug_history",
      "interested",
      "education_level",
      "school",
      "risk_assessment",
      "counselor_comments",
      "note",
      "counselor_note"
    ]);
    var defendants = getSheetData_("tb_defendants");
    var cases = getSheetData_("tb_cases");
    var citizenIdStr = cleanCitizenId_(defData.citizen_id);
    
    var existingDef = null;
    for (var i = 0; i < defendants.length; i++) {
      var sheetCid = cleanCitizenId_(defendants[i].citizen_id);
      if (sheetCid === citizenIdStr) {
        existingDef = defendants[i];
        break;
      }
    }
    
    var birthDateVal = parseDateCE_(defData.birth_date);
    if (birthDateVal) {
      birthDateVal.setHours(12, 0, 0, 0);
    }
    
    var defRow = {};
    if (existingDef) {
      for (var k in existingDef) {
        if (existingDef.hasOwnProperty(k)) {
          defRow[k] = existingDef[k];
        }
      }
    }
    
    defRow.citizen_id = citizenIdStr;
    defRow.title_name = defData.title_name || "";
    defRow.first_name = defData.first_name || "";
    defRow.nick_name = defData.nick_name || "";
    defRow.last_name = defData.last_name || "";
    defRow.gender = defData.gender || "";
    defRow.birth_date = birthDateVal;
    defRow.education_level = defData.education_level || "";
    defRow.school = defData.school || "";
    defRow.occupation = defData.occupation || "";
    defRow.phone_number = defData.phone_number || "";
    
    // จัดการข้อมูล LINE เยาวชน (รองรับการยกเลิกผูก หรือแก้ไข/ล้างข้อมูล)
    var oldYouthUid = existingDef ? (existingDef.line_user_id || "").toString().trim() : "";
    if (defData.unlink_youth_line) {
      defRow.line_user_id = "";
      defRow.line_id = "";
      defRow.line_chat_url = "";
      clearLineContactLinkForDefendant_(citizenIdStr, "youth", oldYouthUid);
    } else {
      if (defData.line_id !== undefined) {
        defRow.line_id = String(defData.line_id).trim();
      } else if (existingDef && existingDef.line_id) {
        defRow.line_id = existingDef.line_id;
      } else {
        defRow.line_id = "";
      }

      if (defData.line_chat_url !== undefined) {
        defRow.line_chat_url = String(defData.line_chat_url).trim();
      } else if (existingDef && existingDef.line_chat_url) {
        defRow.line_chat_url = existingDef.line_chat_url.toString().trim();
      } else {
        defRow.line_chat_url = "";
      }

      if (defData.line_user_id !== undefined && defData.line_user_id !== null) {
        var inLineUid = String(defData.line_user_id).trim();
        defRow.line_user_id = inLineUid;
        if (!inLineUid) {
          clearLineContactLinkForDefendant_(citizenIdStr, "youth", oldYouthUid);
        } else if (inLineUid !== oldYouthUid) {
          if (oldYouthUid) clearLineContactLinkForDefendant_(citizenIdStr, "youth", oldYouthUid);
          setLineContactLinkForDefendant_(citizenIdStr, "youth", inLineUid);
        }
      } else if (oldYouthUid) {
        defRow.line_user_id = oldYouthUid;
      } else {
        defRow.line_user_id = "";
      }
    }
    
    // หากวางลิงก์ chat.line.biz ไว้ในช่อง line_user_id ให้ย้ายไปเก็บที่ line_chat_url
    if (/chat\.line\.biz\//i.test((defRow.line_user_id || "").toString())) {
      if (!defRow.line_chat_url) defRow.line_chat_url = defRow.line_user_id.toString().trim();
      defRow.line_user_id = existingDef ? (existingDef.line_user_id && !/chat\.line\.biz\//i.test(existingDef.line_user_id.toString()) ? existingDef.line_user_id : "") : "";
    }
    var parsedYouthChat = parseLineChatInput_(defRow.line_chat_url);
    if (parsedYouthChat.botId) {
      saveSingleLineConfigValue_("oa_bot_id", parsedYouthChat.botId, "chat_url");
    }
    
    defRow.number_address = defData.number_address || "";
    defRow.village_address = defData.village_address || "";
    defRow.village_number_address = defData.village_number_address || "";
    defRow.road_address = defData.road_address || "";
    defRow.sub_district_address = defData.sub_district_address || "";
    defRow.district_address = defData.district_address || "";
    defRow.province_address = defData.province_address || "";
    defRow.postcode_address = defData.postcode_address || "";
    
    defRow.medical_history = defData.medical_history || "";
    defRow.drug_history = defData.drug_history || "";
    defRow.interested = defData.interested || "";
    defRow.guardian_name = defData.guardian_name || "";
    defRow.relationship = defData.relationship || "";
    defRow.phone_number_guardian = defData.phone_number_guardian || "";
    
    // จัดการข้อมูล LINE ผู้ปกครอง (รองรับการยกเลิกผูก หรือแก้ไข/ล้างข้อมูล)
    var oldParentUid = existingDef ? (existingDef.parent_line_user_id || "").toString().trim() : "";
    if (defData.unlink_parent_line) {
      defRow.parent_line_user_id = "";
      defRow.parent_line_id = "";
      defRow.parent_line_chat_url = "";
      clearLineContactLinkForDefendant_(citizenIdStr, "parent", oldParentUid);
    } else {
      if (defData.parent_line_id !== undefined) {
        defRow.parent_line_id = String(defData.parent_line_id).trim();
      } else if (existingDef && existingDef.parent_line_id) {
        defRow.parent_line_id = existingDef.parent_line_id;
      } else {
        defRow.parent_line_id = "";
      }

      if (defData.parent_line_chat_url !== undefined) {
        defRow.parent_line_chat_url = String(defData.parent_line_chat_url).trim();
      } else if (existingDef && existingDef.parent_line_chat_url) {
        defRow.parent_line_chat_url = existingDef.parent_line_chat_url.toString().trim();
      } else {
        defRow.parent_line_chat_url = "";
      }

      if (defData.parent_line_user_id !== undefined && defData.parent_line_user_id !== null) {
        var inParentLineUid = String(defData.parent_line_user_id).trim();
        defRow.parent_line_user_id = inParentLineUid;
        if (!inParentLineUid) {
          clearLineContactLinkForDefendant_(citizenIdStr, "parent", oldParentUid);
        } else if (inParentLineUid !== oldParentUid) {
          if (oldParentUid) clearLineContactLinkForDefendant_(citizenIdStr, "parent", oldParentUid);
          setLineContactLinkForDefendant_(citizenIdStr, "parent", inParentLineUid);
        }
      } else if (oldParentUid) {
        defRow.parent_line_user_id = oldParentUid;
      } else {
        defRow.parent_line_user_id = "";
      }
    }
    
    if (/chat\.line\.biz\//i.test((defRow.parent_line_user_id || "").toString())) {
      if (!defRow.parent_line_chat_url) defRow.parent_line_chat_url = defRow.parent_line_user_id.toString().trim();
      defRow.parent_line_user_id = existingDef ? (existingDef.parent_line_user_id && !/chat\.line\.biz\//i.test(existingDef.parent_line_user_id.toString()) ? existingDef.parent_line_user_id : "") : "";
    }
    var parsedParentChat = parseLineChatInput_(defRow.parent_line_chat_url);
    if (parsedParentChat.botId) {
      saveSingleLineConfigValue_("oa_bot_id", parsedParentChat.botId, "chat_url");
    }
    
    defRow.occupation_guardian = defData.occupation_guardian || "";
    defRow.updated_at = new Date().toISOString();
    defRow.psy_diagnosis = defData.psy_diagnosis || "";
    defRow.risk_assessment = defData.risk_assessment || "";
    defRow.counselor_comments = defData.counselor_comments || "";
    defRow.note = defData.note || "";
    defRow.counselor_note = defData.counselor_note || "";
    
    var msg = "";
    if (existingDef) {
      var extNo = existingDef.no !== undefined ? existingDef.no : (existingDef.No !== undefined ? existingDef.No : (existingDef.NO !== undefined ? existingDef.NO : ""));
      defRow.no = extNo;
      defRow.No = extNo;
      defRow.NO = extNo;
      
      // อัปเดตทุกแถวที่มีเลขบัตรนี้ใน tb_defendants ให้ตรงกัน
      for (var dIdx = 0; dIdx < defendants.length; dIdx++) {
        if (cleanCitizenId_(defendants[dIdx].citizen_id) === citizenIdStr) {
          updateRowInSheet_("tb_defendants", defendants[dIdx].rowNum, defRow);
        }
      }
      msg = "อัปเดตประวัติเด็กและเยาวชนรวมถึงผลวินิจฉัยทางจิตวิทยาสำเร็จ";
    } else {
      var maxNo = 0;
      for (var i = 0; i < defendants.length; i++) {
        var d = defendants[i];
        var dNo = d.no !== undefined ? d.no : (d.No !== undefined ? d.No : (d.NO !== undefined ? d.NO : null));
        if (dNo !== null && dNo !== "") {
          var parsed = parseFloat(dNo);
          if (!isNaN(parsed) && parsed > maxNo) {
            maxNo = parsed;
          }
        }
      }
      var nextNo = maxNo + 1;
      defRow.no = nextNo;
      defRow.No = nextNo;
      defRow.NO = nextNo;
      defRow.created_at = new Date().toISOString();
      
      var newRowNum = appendRowToSheet_("tb_defendants", defRow);
      defRow.rowNum = newRowNum;
      msg = "บันทึกประวัติเด็กและเยาวชนคนใหม่เข้าสู่ระบบสำเร็จ";
    }
    
    var searchRes = buildDefendantResponse_(defRow, cases, userSession);
    searchRes.message = msg;
    return searchRes;
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูลบุคคล: " + e.toString() };
  }
}

/**
 * เพิ่ม หรือแก้ไขข้อมูลรายละเอียดคดีต่างๆ ของเด็กและเยาวชน
 */
function upsertCase(caseData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ" };
  
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์แก้ไข/บันทึกข้อมูลรายละเอียดคดี" };
  }
  
  try {
    var defendants = getSheetData_("tb_defendants");
    var cases = getSheetData_("tb_cases");
    var citizenIdStr = cleanCitizenId_(caseData.citizen_id);
    var blackCaseStr = caseData.black_case ? caseData.black_case.toString().trim() : "";
    
    var foundDef = null;
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId_(defendants[i].citizen_id) === citizenIdStr) {
        foundDef = defendants[i];
        break;
      }
    }
    if (!foundDef) {
      return { success: false, message: "ไม่พบประวัติเด็กและเยาวชนรายนี้ในระบบฐานข้อมูล" };
    }
    
    var existingCase = null;
    if (caseData.rowNum) {
      existingCase = cases.filter(function(x) { return x.rowNum === caseData.rowNum; })[0];
    } else if (blackCaseStr) {
      for (var i = 0; i < cases.length; i++) {
        if (cases[i].black_case && cases[i].black_case.toString().trim() === blackCaseStr && 
            cases[i].citizen_id) {
          var caseCid = cleanCitizenId_(cases[i].citizen_id);
          if (caseCid === citizenIdStr) {
            existingCase = cases[i];
            break;
          }
        }
      }
    }
    
    var blackDateVal = parseDateCE_(caseData.black_date);
    if (blackDateVal) blackDateVal.setHours(12, 0, 0, 0);
    
    var redDateVal = parseDateCE_(caseData.red_date);
    if (redDateVal) redDateVal.setHours(12, 0, 0, 0);
    
    var caseRow = {};
    if (existingCase) {
      for (var k in existingCase) {
        if (existingCase.hasOwnProperty(k)) {
          caseRow[k] = existingCase[k];
        }
      }
    }
    
    caseRow.citizen_id = citizenIdStr;
    caseRow.black_date = blackDateVal;
    caseRow.black_case = blackCaseStr;
    caseRow.case_type_id = parseFloat(caseData.case_type_id) || "";
    caseRow.sub_case_type_id = parseFloat(caseData.sub_case_type_id) || "";
    caseRow.case_type_abb = caseData.case_type_abb || "";
    caseRow.black_case_no = parseFloat(caseData.black_case_no) || "";
    caseRow.black_case_year = parseFloat(caseData.black_case_year) || "";
    caseRow.prosecutor = caseData.prosecutor || "";
    caseRow.charge = caseData.charge || "";
    caseRow.charge_no = parseFloat(caseData.charge_no) || "";
    caseRow.age_at_offense = parseFloat(caseData.age_at_offense) || 0;
    caseRow.red_date = redDateVal;
    caseRow.red_case_no = parseFloat(caseData.red_case_no) || "";
    caseRow.red_case_year = parseFloat(caseData.red_case_year) || "";
    caseRow.red_because = caseData.red_because || "";
    caseRow.recidivism = caseData.recidivism || "ไม่ซ้ำ";
    caseRow.previous_case_no = caseData.previous_case_no || "";
    caseRow.abb_black_criminal = caseData.abb_black_criminal || "";
    caseRow.black_criminal_no = parseFloat(caseData.black_criminal_no) || "";
    caseRow.black_criminal_year = parseFloat(caseData.black_criminal_year) || "";
    caseRow.abb_red_criminal = caseData.abb_red_criminal || "";
    caseRow.red_criminal_no = parseFloat(caseData.red_criminal_no) || "";
    caseRow.red_criminal_year = parseFloat(caseData.red_criminal_year) || "";
    caseRow.counselor = caseData.counselor || userSession.fullName;
    caseRow.user_id = parseFloat(caseData.user_id) || userSession.userId;
    caseRow.judge = caseData.judge || "";
    caseRow.officer = caseData.officer || "";
    caseRow.mediator = caseData.mediator || "";
    caseRow.note = caseData.note || "";
    
    var msg = "";
    if (existingCase) {
      updateRowInSheet_("tb_cases", existingCase.rowNum, caseRow);
      caseRow.rowNum = existingCase.rowNum;
      for (var i = 0; i < cases.length; i++) {
        if (cases[i].rowNum === existingCase.rowNum) {
          cases[i] = caseRow;
          break;
        }
      }
      msg = "อัปเดตและเขียนทับข้อมูลคดีเรียบร้อยแล้ว";
    } else {
      var newRowNum = appendRowToSheet_("tb_cases", caseRow);
      caseRow.rowNum = newRowNum;
      cases.push(caseRow);
      msg = "เพิ่มบันทึกคดีใหม่เข้าสู่ระบบฐานข้อมูลเรียบร้อยแล้ว";
    }
    
    var searchRes = buildDefendantResponse_(foundDef, cases, userSession);
    searchRes.message = msg;
    return searchRes;
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกคดี: " + e.toString() };
  }
}

/**
 * ลบข้อมูลคดี (จำกัดเฉพาะแอดมิน)
 */
function deleteCase(rowNum, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  
  if (userSession.role !== "admin") {
    return { success: false, message: "ขออภัย สิทธิ์ในการลบข้อมูลคดีถูกจำกัดไว้เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น" };
  }
  
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_cases");
    var parsedRowNum = parseFloat(rowNum);
    
    var defendants = getSheetData_("tb_defendants");
    var cases = getSheetData_("tb_cases");
    var targetCase = cases.filter(function(x) { return x.rowNum === parsedRowNum; })[0];
    var citizenIdStr = targetCase ? cleanCitizenId_(targetCase.citizen_id) : "";
    
    sheet.deleteRow(parsedRowNum);
    clearSheetCache_("tb_cases");
    
    if (citizenIdStr) {
      var foundDef = null;
      for (var i = 0; i < defendants.length; i++) {
        if (cleanCitizenId_(defendants[i].citizen_id) === citizenIdStr) {
          foundDef = defendants[i];
          break;
        }
      }
      
      var remainingCases = [];
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i];
        if (c.rowNum === parsedRowNum) {
          continue;
        }
        var cCopy = {};
        for (var ck in c) {
          if (c.hasOwnProperty(ck)) {
            cCopy[ck] = c[ck];
          }
        }
        if (cCopy.rowNum > parsedRowNum) {
          cCopy.rowNum = cCopy.rowNum - 1;
        }
        remainingCases.push(cCopy);
      }
      
      if (foundDef) {
        var searchRes = buildDefendantResponse_(foundDef, remainingCases, userSession);
        searchRes.message = "ลบข้อมูลคดีออกจากระบบเรียบร้อยแล้ว";
        return searchRes;
      }
    }
    
    return { success: true, message: "ลบแถวคดีที่เลือกออกจากชีทเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "ล้มเหลวในการลบ: " + e.toString() };
  }
}

/**
 * ดึงรายการเลือก Drop-down ในฟอร์มแบบไดนามิกจากในชีท
 */
function getFormSelectLists(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "เซสชันไม่ถูกต้อง" };
  
  try {
    var charges = getSheetData_("tb_charge");
    var caseTypes = getSheetData_("tb_casetype");
    var subCaseTypes = getSheetData_("tb_subcasetype");
    var users = getSheetData_("tb_user");
    
    var chargeList = charges.filter(function(c) {
      return c.charge_no !== undefined && c.charge_no !== null && c.charge_no.toString().trim() !== "";
    }).map(function(c) {
      return { 
        id: parseFloat(c.charge_no), 
        name: c.charge_statistics ? c.charge_statistics.toString().trim() : "" 
      };
    });
    chargeList.sort(function(a, b) {
      return a.id - b.id;
    });
    
    var caseTypeList = caseTypes.map(function(ct) {
      return { id: ct.case_type_id, name: ct.case_type, detail: ct.case_type_detail };
    });
    
    var subCaseTypeList = subCaseTypes.map(function(sct) {
      return { id: sct.sub_case_type_id, name: sct.sub_case_type };
    });
    
    var counselors = users.filter(function(u) {
      var r = u.role ? u.role.toString().trim().toLowerCase() : "";
      return r === "counselor" || r === "teacher" || r === "admin" || r === "director" || r === "psychologist" || r === "user";
    }).map(function(u) {
      return { userId: u.user_id, fullName: u.full_name };
    });
    
    var approverName = "";
    var acknowledgerName = "";
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var pos = u.position ? u.position.toString().trim() : "";
      if (pos === "ผู้อำนวยการสำนักงานประจำศาลเยาวชนและครอบครัวจังหวัดระยอง" || pos.indexOf("ผู้อำนวยการสำนักงานประจำศาลเยาวชนฯ") !== -1) {
        approverName = u.full_name || "";
      }
      if (pos === "ผู้พิพากษาหัวหน้าศาลเยาวชนและครอบครัวจังหวัดระยอง" || pos.indexOf("ผู้พิพากษาหัวหน้าศาลเยาวชนฯ") !== -1) {
        acknowledgerName = u.full_name || "";
      }
    }
    
    return {
      success: true,
      charges: chargeList,
      caseTypes: caseTypeList,
      subCaseTypes: subCaseTypeList,
      counselors: counselors,
      approverName: approverName,
      acknowledgerName: acknowledgerName
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการดึงรายการเลือกฟอร์ม: " + e.toString() };
  }
}

/**
 * ดึงรายชื่อสมาชิกทั้งหมด พร้อมข้อมูลการเข้าสู่ระบบล่าสุด (แอดมินเท่านั้น)
 */
function adminGetUsers(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || userSession.role !== "admin") {
    return { success: false, message: "สิทธิ์การเข้าถึงหน้านี้จำกัดเฉพาะแอดมินเท่านั้น" };
  }
  
  try {
    ensureUserAuditColumns_();
    cleanupOldLoginLogs_(30, false);

    var users = getSheetData_("tb_user");
    var presenceMap = getPresenceCacheMap_(users);
    var nowMs = Date.now();

    var sanitizedUsers = users.map(function(u) {
      var uid = u.user_id !== undefined && u.user_id !== null ? String(u.user_id).trim() : "";
      var cacheEntry = uid ? presenceMap[uid] : null;
      var loginIso = normalizeTimestampToIso_(u.login_at);
      var logoutIso = normalizeTimestampToIso_(u.logout_at);
      var lastSeenIso = normalizeTimestampToIso_(u.last_seen_at);
      var loginMs = parseTimestampToMs_(u.login_at);
      var logoutMs = parseTimestampToMs_(u.logout_at);
      var lastSeenMs = parseTimestampToMs_(u.last_seen_at);

      var isOnline = false;
      var offlineAt = "";

      if (cacheEntry && cacheEntry.s === "online" && cacheEntry.t && (nowMs - cacheEntry.t) <= PRESENCE_ONLINE_THRESHOLD_MS) {
        isOnline = true;
      } else if (loginMs > 0) {
        var cacheT = (cacheEntry && cacheEntry.t) ? cacheEntry.t : 0;
        var bestMs = Math.max(cacheT, logoutMs, lastSeenMs, loginMs);
        if (bestMs === cacheT && cacheEntry && cacheEntry.iso) {
          offlineAt = cacheEntry.iso;
        } else if (bestMs === logoutMs && logoutIso) {
          offlineAt = logoutIso;
        } else if (bestMs === lastSeenMs && lastSeenIso) {
          offlineAt = lastSeenIso;
        } else {
          offlineAt = loginIso;
        }
      }

      return {
        userId: u.user_id,
        username: u.username || "",
        email: u.email || "",
        fullName: u.full_name || "",
        position: u.position || "",
        phone: u.phone || "",
        role: u.role ? u.role.toString().trim().toLowerCase() : "",
        isActive: u.is_active ? u.is_active.toString().trim().toLowerCase() : "no",
        isVerified: u.is_verified ? u.is_verified.toString().trim().toLowerCase() : (u.is_active === "yes" ? "yes" : "no"),
        verificationCode: u.verification_code ? String(u.verification_code).trim() : "",
        verificationAttempts: parseInt(u.verification_attempts, 10) || 0,
        isOnline: isOnline,
        offlineAt: offlineAt,
        lastSeenAt: lastSeenIso,
        logoutAt: logoutIso,
        loginAt: loginIso,
        loginCount: parseInt(u.login_count, 10) || 0,
        createdAt: normalizeTimestampToIso_(u.created_at),
        updatedAt: normalizeTimestampToIso_(u.updated_at),
        profileImage: u.profile_image || "",
        rowNum: u.rowNum
      };
    });
    return { success: true, users: sanitizedUsers };
  } catch (e) {
    return { success: false, message: "ดึงผู้ใช้งานไม่สำเร็จ: " + e.toString() };
  }
}

/**
 * ดึงประวัติการเข้าสู่ระบบย้อนหลัง 30 วันล่าสุด (แอดมินเท่านั้น)
 */
function adminGetLoginLogs(token, forceCleanup) {
  var userSession = verifySessionToken_(token);
  if (!userSession || userSession.role !== "admin") {
    return { success: false, message: "สิทธิ์การเข้าถึงหน้านี้จำกัดเฉพาะแอดมินเท่านั้น" };
  }

  try {
    var deletedCount = cleanupOldLoginLogs_(30, !!forceCleanup);
    var logHeaders = ["log_id", "user_id", "full_name", "email", "role", "login_type", "login_at"];
    getOrCreateSheet_("tb_login_log", logHeaders);
    var rawLogs = getSheetData_("tb_login_log");

    var logs = rawLogs
      .filter(function(r) { return r && (r.login_at || r.email || r.full_name); })
      .map(function(r) {
        var ms = parseTimestampToMs_(r.login_at);
        return {
          logId: r.log_id || ("ROW-" + r.rowNum),
          userId: r.user_id !== undefined && r.user_id !== null ? r.user_id.toString() : "",
          fullName: r.full_name || "",
          email: r.email || "",
          role: r.role ? r.role.toString().trim().toLowerCase() : "",
          loginType: r.login_type ? r.login_type.toString().trim().toLowerCase() : "password",
          loginAt: normalizeTimestampToIso_(r.login_at),
          _ms: ms
        };
      });

    logs.sort(function(a, b) {
      return (b._ms || 0) - (a._ms || 0);
    });

    var maxReturn = 500;
    var trimmedLogs = logs.slice(0, maxReturn).map(function(item) {
      delete item._ms;
      return item;
    });

    return {
      success: true,
      logs: trimmedLogs,
      totalCount: logs.length,
      retentionDays: 30,
      cleanedCount: deletedCount
    };
  } catch (e) {
    return { success: false, message: "ดึงประวัติการเข้าใช้งานไม่สำเร็จ: " + e.toString() };
  }
}

/**
 * แก้ไข ปรับบทบาท ข้อมูลสมาชิก และอนุมัติสมาชิก (แอดมินเท่านั้น)
 */
function adminUpdateUser(userData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || userSession.role !== "admin") {
    return { success: false, message: "สิทธิ์การเข้าถึงหน้านี้จำกัดเฉพาะแอดมินเท่านั้น" };
  }
  
  try {
    var rowNum = parseFloat(userData.rowNum);
    if (!rowNum || rowNum < 2) {
      return { success: false, message: "ไม่พบตำแหน่งแถวข้อมูลสมาชิกที่ต้องการแก้ไข" };
    }

    var users = getSheetData_("tb_user");
    var cleanUsername = userData.username !== undefined && userData.username !== null ? userData.username.toString().trim() : undefined;
    if (cleanUsername) {
      for (var i = 0; i < users.length; i++) {
        if (users[i].rowNum !== rowNum && users[i].username && users[i].username.toString().trim().toLowerCase() === cleanUsername.toLowerCase()) {
          return { success: false, message: "ชื่อผู้ใช้งาน (Username) นี้ถูกใช้โดยสมาชิกท่านอื่นแล้ว" };
        }
      }
    }

    var updateData = {
      user_id: isNaN(parseFloat(userData.userId)) ? userData.userId : parseFloat(userData.userId),
      role: userData.role ? userData.role.toString().trim().toLowerCase() : "user",
      is_active: userData.isActive ? userData.isActive.toString().trim().toLowerCase() : "no",
      full_name: userData.fullName !== undefined ? userData.fullName.toString().trim() : "",
      position: userData.position !== undefined ? userData.position.toString().trim() : "",
      phone: userData.phone !== undefined ? userData.phone.toString().trim() : "",
      updated_at: getBangkokIsoNow_()
    };

    if (cleanUsername !== undefined && cleanUsername !== "") {
      updateData.username = cleanUsername;
    }

    updateRowInSheet_("tb_user", rowNum, updateData);
    invalidateUserAuthSnapshotCache_();
    if (updateData.is_active !== "yes") {
      revokeUserTokens_(updateData.user_id, null);
      try {
        markUserOfflineByUserId_(updateData.user_id, { force: true });
      } catch (offErr) {}
    }
    return { success: true, message: "บันทึกข้อมูลและสิทธิ์สมาชิกเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการอัปเดตสมาชิก: " + e.toString() };
  }
}

/**
 * ดึงรูปภาพโปรไฟล์ของผู้ใช้งานที่เป็น Admin บัญชีแรกที่มีรูป เพื่อใช้เป็นอวตารผู้พัฒนา
 */
function getAdminProfileImage() {
  try {
    var users = getSheetData_("tb_user");
    for (var i = 0; i < users.length; i++) {
      if (users[i].role === "admin" && users[i].profile_image) {
        return users[i].profile_image;
      }
    }
    return "";
  } catch (e) {
    return "";
  }
}

/**
 * ฟังก์ชันสำหรับแอดมินหรือนักพัฒนาเปิดรันเพื่อทดสอบระบุสาเหตุข้อผิดพลาด (Diagnostic Test)
 * โดยการคลิกเลือกฟังก์ชันนี้แล้วกดปุ่ม "เรียกใช้" (Run) ในหน้าแก้ไข Apps Script บนเบราว์เซอร์
 */
function ccmsDiagnosticTest_() {
  Logger.log("=== เริ่มการตรวจสอบข้อผิดพลาดระบบ CCMS (CCMS Diagnostic Test) ===");
  try {
    var ss = getSpreadsheet_();
    Logger.log("1. เชื่อมต่อ Google Sheets: สำเร็จ (Spreadsheet ID: " + SPREADSHEET_ID + ")");
    
    var defSheet = ss.getSheetByName("tb_defendants");
    if (!defSheet) {
      Logger.log("🚨 ข้อผิดพลาด: ไม่พบชีทชื่อ 'tb_defendants' ในไฟล์ Google Sheets ของคุณ!");
      return;
    }
    Logger.log("2. ตรวจสอบตารางประวัติเยาวชน (tb_defendants): พบข้อมูล (จำนวนแถว: " + defSheet.getLastRow() + ")");
    
    var caseSheet = ss.getSheetByName("tb_cases");
    if (!caseSheet) {
      Logger.log("🚨 ข้อผิดพลาด: ไม่พบชีทชื่อ 'tb_cases' ในไฟล์ Google Sheets ของคุณ!");
      return;
    }
    Logger.log("3. ตรวจสอบตารางคดี (tb_cases): พบข้อมูล (จำนวนแถว: " + caseSheet.getLastRow() + ")");
    
    var defendants = getSheetData_("tb_defendants");
    if (defendants.length > 0) {
      var sampleDef = defendants[0];
      Logger.log("4. ดึงข้อมูลตัวอย่างสำเร็จ: " + JSON.stringify(sampleDef).substring(0, 200) + "...");
      
      // ทดสอบการทำความสะอาดค่าบัตรประชาชน
      var cleaned = cleanCitizenId_(sampleDef.citizen_id);
      Logger.log("5. ตัวอย่างการแปลงเลขบัตรประชาชน: " + sampleDef.citizen_id + " -> " + cleaned);
      
      // ทดสอบการแปลงข้อมูลเพื่อส่งกลับหน้าบ้าน
      var sanitized = sanitizeObjectForSerialization_(sampleDef);
      Logger.log("6. ทดสอบการแปลงค่าข้อมูลส่งกลับ (Serialization Sanitizer): ผ่านฉลุย!");
    } else {
      Logger.log("4. ⚠️ คำเตือน: ยังไม่มีข้อมูลประวัติผู้ต้องหาในชีท 'tb_defendants'");
    }
    
    Logger.log("=== ผลการทดสอบ: ระบบภายในของ Code.gs ทำงานปกติ 100% ===");
  } catch (e) {
    Logger.log("🚨 เกิดข้อผิดพลาดของระบบหลังบ้าน: " + e.toString() + "\nStack: " + e.stack);
  }
}

/**
 * ฟังก์ชันวิเคราะห์และถอดรหัสสายอักขระที่อยู่เต็มของไทย (Thai Address Parser)
 * เพื่อแยกเก็บลงในฟิลด์ย่อยที่ลงท้ายด้วย _address ในชีทจริง
 */
function parseThaiAddress_(addressStr) {
  var result = {
    number_address: "",
    village_address: "",
    village_number_address: "",
    road_address: "",
    sub_district_address: "",
    district_address: "",
    province_address: ""
  };
  
  if (!addressStr) return result;
  var str = addressStr.toString().trim();
  
  // 1. แยกจังหวัด
  var provincePattern = /(จังหวัด|จ\.)\s*([ก-๙\w\s]+)/;
  var provMatch = str.match(provincePattern);
  if (provMatch) {
    result.province_address = provMatch[2].trim();
    str = str.replace(provMatch[0], "").trim();
  } else {
    // กรณีพิมพ์เฉพาะชื่อจังหวัดโดยไม่มีคำนำหน้า (เช่น ระยอง, ชลบุรี)
    var provinces = ["ระยอง", "ชลบุรี", "จันทบุรี", "ฉะเชิงเทรา", "ตราด", "กรุงเทพ"];
    for (var p = 0; p < provinces.length; p++) {
      var pIdx = str.indexOf(provinces[p]);
      if (pIdx !== -1) {
        result.province_address = provinces[p];
        str = str.substring(0, pIdx) + " " + str.substring(pIdx + provinces[p].length);
        break;
      }
    }
  }
  
  // 2. แยกอำเภอ
  var districtPattern = /(อำเภอ|อ\.)\s*([ก-๙\w\s]+)/;
  var distMatch = str.match(districtPattern);
  if (distMatch) {
    result.district_address = distMatch[2].trim();
    str = str.replace(distMatch[0], "").trim();
  } else {
    // กรณีพิมพ์เฉพาะชื่ออำเภอของระยอง
    var districts = ["เมืองระยอง", "เมือง", "แกลง", "ปลวกแดง", "บ้านค่าย", "นิคมพัฒนา", "บ้านฉาง", "เขาชะเมา", "วังจันทร์"];
    for (var d = 0; d < districts.length; d++) {
      var dIdx = str.indexOf(districts[d]);
      if (dIdx !== -1) {
        result.district_address = districts[d] === "เมือง" ? "เมืองระยอง" : districts[d];
        str = str.substring(0, dIdx) + " " + str.substring(dIdx + districts[d].length);
        break;
      }
    }
  }
  
  // 3. แยกตำบล
  var subDistPattern = /(ตำบล|ต\.)\s*([ก-๙\w\s]+)/;
  var subDistMatch = str.match(subDistPattern);
  if (subDistMatch) {
    result.sub_district_address = subDistMatch[2].trim();
    str = str.replace(subDistMatch[0], "").trim();
  }
  
  // 4. แยกหมู่ที่ / ม.
  var mooPattern = /(หมู่ที่|หมู่|ม\.)\s*(\d+)/;
  var mooMatch = str.match(mooPattern);
  if (mooMatch) {
    result.village_number_address = mooMatch[2].trim();
    str = str.replace(mooMatch[0], "").trim();
  }
  
  // 5. แยกถนน / ถ.
  var roadPattern = /(ถนน|ถ\.)\s*([ก-๙\w\s]+)/;
  var roadMatch = str.match(roadPattern);
  if (roadMatch) {
    result.road_address = roadMatch[2].trim();
    str = str.replace(roadMatch[0], "").trim();
  }
  
  // ส่วนที่เหลือเก็บเป็น บ้านเลขที่ / รายละเอียดเลขที่บ้าน (number_address)
  result.number_address = str.replace(/\s+/g, " ").trim();
  
  return result;
}

/**
 * ลบข้อมูลประวัติเด็กและเยาวชน (รวมถึงข้อมูลคดีที่เกี่ยวข้องทั้งหมด)
 */
function deleteDefendant(citizenId, password, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  // เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์ลบข้อมูล
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์ลบข้อมูลประวัติเด็ก" };
  }
  
  try {
    // 1. ตรวจสอบรหัสผ่านผู้ใช้ปัจจุบัน
    var users = getSheetData_("tb_user");
    var foundUser = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id && users[i].user_id.toString() === userSession.userId.toString()) {
        foundUser = users[i];
        break;
      }
    }
    
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้บนเซิร์ฟเวอร์" };
    }
    
    var cleanEmail = foundUser.email.toString().trim().toLowerCase();
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedInputPassword = hashPassword_(password, salt);
    
    if (foundUser.password && foundUser.password !== hashedInputPassword) {
      return { success: false, message: "รหัสผ่านไม่ถูกต้อง ไม่สามารถดำเนินการลบข้อมูลได้" };
    }
    
    // 2. ค้นหาแถวของเด็กและเยาวชนใน tb_defendants
    var ss = getSpreadsheet_();
    var defSheet = ss.getSheetByName("tb_defendants");
    var defendants = getSheetData_("tb_defendants");
    var citizenIdStr = cleanCitizenId_(citizenId);
    var targetDef = null;
    
    for (var i = 0; i < defendants.length; i++) {
      var dCid = cleanCitizenId_(defendants[i].citizen_id);
      if (dCid === citizenIdStr) {
        targetDef = defendants[i];
        break;
      }
    }
    
    if (!targetDef) {
      return { success: false, message: "ไม่พบข้อมูลประวัติเด็กและเยาวชนรายนี้ในระบบ" };
    }
    
    // 3. ค้นหาและลบคดีที่เกี่ยวข้องทั้งหมดใน tb_cases
    var caseSheet = ss.getSheetByName("tb_cases");
    var cases = getSheetData_("tb_cases");
    var deletedAnyCase = false;
    // ลบคดีจากล่างขึ้นบน เพื่อไม่ให้กระทบตำแหน่งแถวถัดไป (rowNum) เมื่อทำการลบแถว
    for (var j = cases.length - 1; j >= 0; j--) {
      var cCid = cleanCitizenId_(cases[j].citizen_id);
      if (cCid === citizenIdStr) {
        caseSheet.deleteRow(cases[j].rowNum);
        deletedAnyCase = true;
      }
    }
    if (deletedAnyCase) {
      clearSheetCache_("tb_cases");
    }
    
    // 4. ลบข้อมูลประวัติใน tb_defendants
    defSheet.deleteRow(targetDef.rowNum);
    clearSheetCache_("tb_defendants");
    
    return { success: true, message: "ทำการลบข้อมูลประวัติเยาวชนและคดีที่เกี่ยวข้องทั้งหมดสำเร็จแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลวันนัดหมายสำหรับใช้ในฟังก์ชันปฏิทิน
 */
function getAppointments(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงปฏิทินวันนัด" };
  }
  
  try {
    var appointments = getSheetData_("tb_appointment");
    var cases = getSheetData_("tb_cases");
    var defendants = getSheetData_("tb_defendants");
    
    var isAdminOrStaff = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    // 1. สร้าง Map สำหรับค้นหา citizen_id, counselor และ user_id จากเลขคดีดำ (black_case)
    var cleanBlackCaseMap = {};
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      if (c.black_case) {
        var key = c.black_case.toString().replace(/\s+/g, "").toLowerCase();
        cleanBlackCaseMap[key] = {
          citizen_id: cleanCitizenId_(c.citizen_id),
          counselor: c.counselor ? c.counselor.toString().trim() : "",
          user_id: c.user_id !== undefined ? c.user_id : "",
          black_case: c.black_case
        };
      }
    }
    
    // 2. สร้าง Map สำหรับค้นหาชื่อเด็กและเยาวชนจาก citizen_id
    var defNameMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var d = defendants[i];
      var dCid = cleanCitizenId_(d.citizen_id);
      if (dCid) {
        defNameMap[dCid] = (d.title_name || "") + (d.first_name || "") + " " + (d.last_name || "");
      }
    }
    
    var list = [];
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      
      var appDateIso = formatDateAsIso_(app.appointment_date);
      if (!appDateIso) continue;
      
      // ค้นหาข้อมูลคดีที่เชื่อมโยง
      var appBlackCaseKey = app.black_case.toString().replace(/\s+/g, "").toLowerCase();
      var caseInfo = cleanBlackCaseMap[appBlackCaseKey];
      var citizenId = caseInfo ? caseInfo.citizen_id : "";
      var caseCounselor = caseInfo ? caseInfo.counselor : "";
      var caseUserId = caseInfo ? caseInfo.user_id : "";
      var realBlackCase = caseInfo ? caseInfo.black_case : app.black_case;
      
      var appCounselor = extractAppointmentCounselor_(app);
      var finalCounselor = appCounselor || caseCounselor || "ไม่ระบุ";
      
      // กรองสิทธิ์ผู้เข้าถึง (แอดมิน นักจิตวิทยา ผอ. เห็นหมด, ผู้ให้คำปรึกษาเห็นเฉพาะที่ตนเองเกี่ยวข้อง)
      if (!isAdminOrStaff) {
        // เงื่อนไขในการเข้าถึงของผู้ให้คำปรึกษา (Counselor)
        var isOwn = false;
        
        // ก. เปรียบเทียบชื่อผู้ให้คำปรึกษาประจำวันนัด หรือชื่อผู้ให้คำปรึกษาของคดี กับชื่อผู้ล็อกอินปัจจุบัน
        if ((finalCounselor && finalCounselor.toLowerCase() === userSession.fullName.toString().trim().toLowerCase()) ||
            (caseCounselor && caseCounselor.toLowerCase() === userSession.fullName.toString().trim().toLowerCase())) {
          isOwn = true;
        }
        
        // ข. เปรียบเทียบคอลัมน์ผู้รับผิดชอบนัดหมายกับชื่อผู้ล็อกอินปัจจุบัน
        if (app.appointment_responsible_person && 
            app.appointment_responsible_person.toString().trim().toLowerCase() === userSession.fullName.toString().trim().toLowerCase()) {
          isOwn = true;
        }
        
        // ค. เปรียบเทียบ user_id ในตาราง tb_cases กับ user_id ของผู้ล็อกอินปัจจุบัน
        if (caseUserId && caseUserId.toString().trim() === userSession.userId.toString().trim()) {
          isOwn = true;
        }
        
        if (!isOwn) {
          continue; // ข้ามถ้ารายการนี้ผู้ล็อกอินไม่มีส่วนเกี่ยวข้อง
        }
      }
      
      var defName = citizenId ? (defNameMap[citizenId] || "ไม่พบรายชื่อในระบบ") : "ไม่พบคดี";
      
      list.push({
        rowNum: app.rowNum,
        black_case: realBlackCase,
        citizen_id: citizenId,
        def_name: defName,
        appointment_date: appDateIso,
        appointment_time: app.appointment_time ? app.appointment_time.toString().trim() : "",
        appointment_reason: app.appointment_reason ? app.appointment_reason.toString().trim() : "",
        counselor: finalCounselor,
        performance: app.appointment_performance ? app.appointment_performance.toString().trim() : ""
      });
    }
    
    return { success: true, appointments: list };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลวันนัดหมาย: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลนัดหมายทั้งหมดสำหรับแสดงบนแดชบอร์ด (ไม่กรองตามสิทธิ์ผู้ใช้ ทุกบทบาทเห็นได้ครบถ้วน)
 */
function getAllAppointmentsForDashboard(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ" };
  
  try {
    var appointments = getSheetData_("tb_appointment");
    var cases = getSheetData_("tb_cases");
    
    // สร้าง Map สำหรับค้นหาข้อมูลคดีจากเลขคดีดำ
    var caseMap = {};
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      if (c.black_case) {
        var key = c.black_case.toString().replace(/\s+/g, "").toLowerCase();
        caseMap[key] = {
          counselor: c.counselor ? c.counselor.toString().trim() : "",
          black_case: c.black_case
        };
      }
    }
    
    var list = [];
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      
      var appDateIso = formatDateAsIso_(app.appointment_date);
      if (!appDateIso) continue;
      
      var appBlackCaseKey = app.black_case.toString().replace(/\s+/g, "").toLowerCase();
      var caseInfo = caseMap[appBlackCaseKey];
      var caseCounselor = caseInfo ? caseInfo.counselor : "";
      var realBlackCase = caseInfo ? caseInfo.black_case : app.black_case;
      
      var appCounselor = extractAppointmentCounselor_(app);
      var finalCounselor = appCounselor || caseCounselor || "ไม่ระบุ";
      
      list.push({
        rowNum: app.rowNum,
        black_case: realBlackCase,
        appointment_date: appDateIso,
        appointment_reason: app.appointment_reason ? app.appointment_reason.toString().trim() : "",
        counselor: finalCounselor
      });
    }
    
    return { success: true, appointments: list };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมายทั้งหมดสำหรับแดชบอร์ด: " + e.toString() };
  }
}

function getInitialAppState(startDateStr, endDateStr, token, tabId) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์เซสชันไม่ถูกต้องหรือหมดอายุ โปรดเข้าสู่ระบบอีกครั้ง" };
  }

  // ตรวจสอบสถานะการอนุมัติล่าสุด และบันทึกเวลาเข้าใช้งานระบบผ่าน Session (กรณีเปิดเว็บเข้ามาใช้งานใหม่)
  try {
    var users = getSheetData_("tb_user");
    var foundUser = null;
    for (var ui = 0; ui < users.length; ui++) {
      if (users[ui].user_id && users[ui].user_id.toString() === userSession.userId.toString()) {
        foundUser = users[ui];
        break;
      }
    }
    if (foundUser) {
      var activeVal = foundUser.is_active ? foundUser.is_active.toString().trim().toLowerCase() : "";
      if (activeVal !== "yes") {
        return { success: false, message: "สิทธิ์การเข้าใช้งานบัญชีนี้ถูกจำกัดหรือถูกระงับชั่วคราว โปรดแจ้งแอดมิน" };
      }
      recordUserLoginActivity_(foundUser, "session", tabId);
    }
  } catch (sessionTrackErr) {
    Logger.log("getInitialAppState user session track error: " + sessionTrackErr.toString());
  }
  
  var debugErrors = [];
  
  var dashboardRes = null;
  try {
    dashboardRes = getDashboardData(startDateStr, endDateStr, token);
    if (dashboardRes && !dashboardRes.success) {
      debugErrors.push("Dashboard error: " + dashboardRes.message);
    }
  } catch (e) {
    debugErrors.push("Dashboard exception: " + e.toString());
    Logger.log("Error in getDashboardData: " + e.toString());
  }

  // ดึงข้อมูลนัดหมายทั้งหมดสำหรับแดชบอร์ด (ทุกบทบาทเห็นได้ ไม่กรองตามสิทธิ์)
  var dashboardAllRes = null;
  try {
    dashboardAllRes = getAllAppointmentsForDashboard(token);
    if (dashboardAllRes && !dashboardAllRes.success) {
      debugErrors.push("DashboardAllAppointments error: " + dashboardAllRes.message);
    }
  } catch (e) {
    debugErrors.push("DashboardAllAppointments exception: " + e.toString());
    Logger.log("Error in getAllAppointmentsForDashboard: " + e.toString());
  }
  
  // ตรวจสอบการส่งแจ้งเตือน LINE OA ประจำวันอัตโนมัติ (ทำงานวันละ 1 ครั้งเมื่อมีการเปิดระบบ)
  var linePublicCfg = { oa_basic_id: "@012cryec", oa_bot_id: "" };
  try {
    var cfgMap = getLineConfigMap_();
    linePublicCfg.oa_basic_id = cfgMap.oa_basic_id || "@012cryec";
    linePublicCfg.oa_bot_id = cfgMap.oa_bot_id || "";
    checkAndRunDailyLineNotificationsAuto_(cfgMap);
  } catch (e) {
    Logger.log("LINE auto check error: " + e.toString());
  }

  var webAppUrl = "";
  try { webAppUrl = ScriptApp.getService().getUrl() || ""; } catch (urlErr) {}

  return {
    success: true,
    webAppUrl: webAppUrl,
    dashboard: (dashboardRes && dashboardRes.success) ? dashboardRes.data : null,
    selectLists: null,
    defendants: [],
    appointments: [],
    dashboardAllAppointments: (dashboardAllRes && dashboardAllRes.success) ? dashboardAllRes.appointments : [],
    users: [],
    counselors: [],
    role: userSession.role,
    lineOaConfig: linePublicCfg,
    lineUnread: canViewLineOaNotifications_(userSession.role) ? getLineUnreadSummaryFromCache_(userSession.role) : null,
    debugErrors: debugErrors
  };
}

/**
 * ดึงรายชื่อผู้ให้คำปรึกษาทั้งหมด (เฉพาะแอดมินและนักจิตวิทยา)
 */
function adminGetCounselors(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
    return { success: false, message: "สิทธิ์การเข้าถึงข้อมูลจำกัดเฉพาะแอดมินและนักจิตวิทยาเท่านั้น" };
  }
  
  try {
    var counselors = getSheetData_("tb_counselor");
    var sanitized = counselors.map(function(c) {
      return {
        userId: c.user_id,
        counselorName: c.counselor_name,
        counselorPosition: c.counselor_position,
        counselorPositionSecond: c.counselor_position_second,
        rowNum: c.rowNum
      };
    });
    return { success: true, counselors: sanitized };
  } catch (e) {
    return { success: false, message: "ดึงข้อมูลผู้ให้คำปรึกษาไม่สำเร็จ: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลรายชื่อเยาวชนและคดีคงค้างสะสมทั้งหมดในความดูแลของผู้ให้คำปรึกษาที่เจาะจง
 */
function getCounselorActiveCasesDetail(counselorName, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุหรือเซสชันไม่ถูกต้อง" };
  }
  
  try {
    var cases = getSheetData_("tb_cases");
    var defendants = getSheetData_("tb_defendants");
    var appointments = getSheetData_("tb_appointment");
    var charges = getSheetData_("tb_charge");
    
    // Map charge code to charge description
    var chargeMap = {};
    for (var i = 0; i < charges.length; i++) {
      chargeMap[charges[i].charge_no] = charges[i].charge_statistics || charges[i].charge_name;
    }
    
    // Map citizen_id to defendant info
    var defMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var cid = cleanCitizenId_(defendants[i].citizen_id);
      if (cid) {
        defMap[cid] = defendants[i];
      }
    }
    
    // Group active cases of counselor by citizen_id
    var targetCounselor = counselorName ? counselorName.toString().trim().toLowerCase() : "";
    var youthMap = {};
    var todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    
    for (var i = 0; i < cases.length; i++) {
      var cs = cases[i];
      var hasRedNo = cs.red_case_no && cs.red_case_no.toString().trim() !== "";
      if (hasRedNo) continue; // Skip finished cases
      
      var csCounselor = cs.counselor ? cs.counselor.toString().trim() : "";
      if (csCounselor.toLowerCase() !== targetCounselor) continue; // Skip other counselors
      
      var cid = cs.citizen_id ? cleanCitizenId_(cs.citizen_id) : "";
      if (!cid) continue;
      
      if (!youthMap[cid]) {
        var def = defMap[cid];
        var nickName = def && def.nick_name ? def.nick_name.toString().trim() : "";
        
        youthMap[cid] = {
          citizenId: (userSession.role === "user" ? "" : cid),
          nickName: nickName,
          cases: []
        };
      }
      
      // Find appointments for this black case
      var csBlackCase = cs.black_case ? cs.black_case.toString().trim() : "";
      var nextAppDate = "";
      var nextAppReason = "";
      var nextAppTime = "";
      var minFutureDiff = Infinity;
      var nowTime = new Date().setHours(0, 0, 0, 0);
      
      if (csBlackCase) {
        var cleanCsBlack = csBlackCase.replace(/\s+/g, "").toLowerCase();
        for (var j = 0; j < appointments.length; j++) {
          var app = appointments[j];
          if (!app.black_case || !app.appointment_date) continue;
          
          var cleanAppBlack = app.black_case.toString().replace(/\s+/g, "").toLowerCase();
          if (cleanCsBlack === cleanAppBlack) {
            var appDateIso = formatDateAsIso_(app.appointment_date);
            if (appDateIso) {
              var appTime = new Date(appDateIso).setHours(0, 0, 0, 0);
              if (appTime >= nowTime) { // Current or future date
                var diff = appTime - nowTime;
                if (diff < minFutureDiff) {
                  minFutureDiff = diff;
                  nextAppDate = appDateIso;
                  nextAppReason = app.appointment_reason ? app.appointment_reason.toString().trim() : "";
                  nextAppTime = app.appointment_time ? app.appointment_time.toString().trim() : "";
                }
              }
            }
          }
        }
      }
      
      var chargeText = cs.charge_no ? (chargeMap[cs.charge_no] || cs.charge_name || cs.charge_no) : (cs.charge_name || "ไม่ระบุข้อหา");
      
      // Only include cases that have a future appointment
      if (!nextAppDate) continue;

      youthMap[cid].cases.push({
        blackCase: csBlackCase,
        charge: chargeText,
        nextAppointmentDate: nextAppDate,
        nextAppointmentReason: nextAppReason,
        nextAppointmentTime: nextAppTime
      });
    }
    
    // Convert map to array, exclude youth with no remaining cases
    var youthList = [];
    for (var cid in youthMap) {
      if (youthMap[cid].cases.length > 0) {
        youthList.push(youthMap[cid]);
      }
    }
    
    return { success: true, counselorName: counselorName, youthList: youthList };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลคดีคงค้าง: " + e.toString() };
  }
}

/**
 * แก้ไขและอัปเดตข้อมูลผู้ให้คำปรึกษา (เฉพาะแอดมินและนักจิตวิทยา)
 */
function adminUpdateCounselor(counselorData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
    return { success: false, message: "สิทธิ์การดำเนินการจำกัดเฉพาะแอดมินและนักจิตวิทยาเท่านั้น" };
  }
  
  try {
    var rowNum = parseFloat(counselorData.rowNum);
    var updateData = {
      user_id: isNaN(parseFloat(counselorData.userId)) ? counselorData.userId : parseFloat(counselorData.userId),
      counselor_name: counselorData.counselorName,
      counselor_position: counselorData.counselorPosition,
      counselor_position_second: counselorData.counselorPositionSecond
    };
    updateRowInSheet_("tb_counselor", rowNum, updateData);
    return { success: true, message: "บันทึกและแก้ไขข้อมูลผู้ให้คำปรึกษาเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการอัปเดตผู้ให้คำปรึกษา: " + e.toString() };
  }
}

/**
 * เพิ่มข้อมูลผู้ให้คำปรึกษาใหม่ (เฉพาะแอดมินและนักจิตวิทยา)
 */
function adminAddCounselor(counselorData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
    return { success: false, message: "สิทธิ์การดำเนินการจำกัดเฉพาะแอดมินและนักจิตวิทยาเท่านั้น" };
  }
  
  try {
    var insertData = {
      user_id: isNaN(parseFloat(counselorData.userId)) ? counselorData.userId : parseFloat(counselorData.userId),
      counselor_name: counselorData.counselorName,
      counselor_position: counselorData.counselorPosition,
      counselor_position_second: counselorData.counselorPositionSecond
    };
    var newRowNum = appendRowToSheet_("tb_counselor", insertData);
    return { success: true, message: "เพิ่มข้อมูลผู้ให้คำปรึกษาใหม่เรียบร้อยแล้ว", rowNum: newRowNum };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการเพิ่มผู้ให้คำปรึกษา: " + e.toString() };
  }
}

/**
 * ลบข้อมูลผู้ให้คำปรึกษา (เฉพาะแอดมินและนักจิตวิทยา)
 */
function deleteCounselor(rowNum, password, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์ลบข้อมูล" };
  }
  
  try {
    // 1. ตรวจสอบรหัสผ่านผู้ใช้ปัจจุบัน
    var users = getSheetData_("tb_user");
    var foundUser = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id && users[i].user_id.toString() === userSession.userId.toString()) {
        foundUser = users[i];
        break;
      }
    }
    
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้บนเซิร์ฟเวอร์" };
    }
    
    var cleanEmail = foundUser.email.toString().trim().toLowerCase();
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedInputPassword = hashPassword_(password, salt);
    
    if (foundUser.password && foundUser.password !== hashedInputPassword) {
      return { success: false, message: "รหัสผ่านไม่ถูกต้อง ไม่สามารถดำเนินการลบข้อมูลได้" };
    }
    
    // 2. ดำเนินการลบแถวใน tb_counselor
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_counselor");
    var parsedRowNum = parseFloat(rowNum);
    
    if (isNaN(parsedRowNum) || parsedRowNum < 2 || parsedRowNum > sheet.getLastRow()) {
      return { success: false, message: "ตำแหน่งข้อมูลที่จะลบไม่ถูกต้อง" };
    }
    
    sheet.deleteRow(parsedRowNum);
    clearSheetCache_("tb_counselor");
    
    return { success: true, message: "ลบข้อมูลผู้ให้คำปรึกษาเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการลบผู้ให้คำปรึกษา: " + e.toString() };
  }
}

/**
 * อัปเดตความเห็นเพิ่มเติมของผู้ให้คำปรึกษา
 */
function updateCounselorComments(citizenId, comments, token) {
  try {
    var userSession = verifySessionToken_(token);
    if (!userSession) {
      return { success: false, message: "โปรดเข้าสู่ระบบใหม่" };
    }
    var role = userSession.role ? userSession.role.toString().toLowerCase() : "";
    if (role !== "admin" && role !== "psychologist" && role !== "counselor") {
      return { success: false, message: "ไม่มีสิทธิ์ดำเนินการเฉพาะผู้ให้คำปรึกษา นักจิตวิทยา และแอดมินเท่านั้น" };
    }
    
    ensurePsyDiagnosisColumn_();
    
    var cleanId = cleanCitizenId_(citizenId);
    if (!cleanId) {
      return { success: false, message: "เลขบัตรประชาชนไม่ถูกต้อง" };
    }
    
    var db = getSheetData_("tb_defendants");
    var targetRow = null;
    for (var i = 0; i < db.length; i++) {
      var sheetCid = cleanCitizenId_(db[i].citizen_id);
      if (sheetCid === cleanId) {
        targetRow = db[i];
        break;
      }
    }
    
    if (!targetRow) {
      return { success: false, message: "ไม่พบข้อมูลเด็ก/เยาวชน" };
    }
    
    var rowNum = targetRow.rowNum;
    
    var updateData = {
      counselor_note: comments,
      updated_at: new Date().toISOString()
    };
    
    updateRowInSheet_("tb_defendants", rowNum, updateData);
    return { success: true, comments: comments, counselor_note: comments, message: "บันทึกความเห็นเพิ่มเติมเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกความเห็น: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลรายงานสถิติคดีประจำเดือน (งานช่วยอำนวยการ)
 */
function getMonthlyReport(monthYearStr, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  if (userSession.role === 'counselor') {
    return { success: false, message: "ขออภัย บัญชีผู้ให้คำปรึกษาไม่ได้รับอนุญาตให้เข้าถึงสถิติคดีประจำเดือน" };
  }
  
  try {
    var parts = monthYearStr.split("-");
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    
    // Start/End dates for the selected month
    var startOfMonth = new Date(year, month - 1, 1);
    var endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    
    // Start/End dates for the selected year
    var startOfYear = new Date(year, 0, 1);
    var endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
    
    var cases = getSheetData_("tb_cases");
    var appointments = getSheetData_("tb_appointment");
    
    // Helper to check success/fail
    function getCaseOutcome(c) {
      var rb = c.red_because ? c.red_because.toString().trim() : "";
      if (rb.indexOf("สำเร็จ") !== -1) {
        return "success";
      }
      if (rb.indexOf("ยกเลิก") !== -1 || rb.indexOf("ไม่สำเร็จ") !== -1 || rb.indexOf("ล้มเหลว") !== -1) {
        return "failed";
      }
      // default: if red_case_no exists, assume success unless specified otherwise
      if (c.red_case_no && c.red_case_no.toString().trim() !== "") {
        return "success";
      }
      return "pending";
    }
    
    // Compute Defaults
    var defaults = {};
    
    var charges = getSheetData_("tb_charge");
    var chargeList = charges.filter(function(c) {
      return c.charge_no !== undefined && c.charge_no !== null && c.charge_no.toString().trim() !== "";
    }).map(function(c) {
      return {
        charge_no: parseFloat(c.charge_no),
        charge_statistics: c.charge_statistics ? c.charge_statistics.toString().trim() : "",
        charge_statistics_no: c.charge_statistics_no ? c.charge_statistics_no.toString().trim() : ""
      };
    });
    chargeList.sort(function(a, b) {
      return a.charge_no - b.charge_no;
    });

    // Initialize default keys
    var keys = [
      "sec2_m90_pending", "sec2_m90_entered", "sec2_m90_success", "sec2_m90_failed", "sec2_m90_progress",
      "sec2_m132_pending", "sec2_m132_entered", "sec2_m132_success", "sec2_m132_failed", "sec2_m132_progress",
      "sec4_m90_pending", "sec4_m90_entered", "sec4_m90_success", "sec4_m90_failed", "sec4_m90_progress",
      "sec4_m132_pending", "sec4_m132_entered", "sec4_m132_success", "sec4_m132_failed", "sec4_m132_progress",
      
      "sec6_m90_t1", "sec6_m90_t2", "sec6_m90_t3", "sec6_m90_t4", "sec6_m90_t5",
      "sec6_m132_t1", "sec6_m132_t2", "sec6_m132_t3", "sec6_m132_t4", "sec6_m132_t5",
      
      "sec11_m90_t1", "sec11_m90_t2", "sec11_m90_t3", "sec11_m90_t4", "sec11_m90_t5",
      "sec11_m132_t1", "sec11_m132_t2", "sec11_m132_t3", "sec11_m132_t4", "sec11_m132_t5",
      
      "sec16_m90_cases", "sec16_m90_people", "sec16_m90_days", "sec16_m90_times", "sec16_m90_money",
      "sec16_m132_cases", "sec16_m132_people", "sec16_m132_days", "sec16_m132_times", "sec16_m132_money"
    ];
    
    // Add dynamically generated keys for Section 90 and Section 132 tables
    charges.forEach(function(c) {
      var cNo = c.charge_no;
      keys.push("m90_c" + cNo + "_1");
      keys.push("m90_c" + cNo + "_2");
      keys.push("m90_c" + cNo + "_3");
      for (var col = 1; col <= 12; col++) {
        keys.push("m132_c" + cNo + "_" + col);
      }
    });
    
    keys.forEach(function(k) { defaults[k] = 0; });
    
    // Process cases
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var ctId = parseFloat(c.case_type_id);
      if (ctId !== 2 && ctId !== 3) continue;
      
      var prefix = ctId === 2 ? "m90" : "m132";
      var blackDate = c.black_date ? normalizeSheetDate_(c.black_date) : null;
      var redDate = c.red_date ? normalizeSheetDate_(c.red_date) : null;
      var outcome = getCaseOutcome(c);
      
      if (!blackDate) continue;
      
      // --- Section 2 (รอบปี) ---
      // ค้างดำเนินการจากปีที่แล้ว
      if (blackDate < startOfYear && (!redDate || redDate >= startOfYear)) {
        defaults["sec2_" + prefix + "_pending"]++;
      }
      // เข้าสู่กระบวนการในปีนี้ (สะสมถึงสิ้นเดือนที่เลือก)
      if (blackDate >= startOfYear && blackDate <= endOfMonth) {
        defaults["sec2_" + prefix + "_entered"]++;
      }
      // คดีที่ปฏิบัติตามแผนสำเร็จในปีนี้
      if (redDate && redDate >= startOfYear && redDate <= endOfMonth && outcome === "success") {
        defaults["sec2_" + prefix + "_success"]++;
      }
      // คดีที่ปฏิบัติตามแผนไม่สำเร็จในปีนี้
      if (redDate && redDate >= startOfYear && redDate <= endOfMonth && outcome === "failed") {
        defaults["sec2_" + prefix + "_failed"]++;
      }
      
      // --- Section 4 (รอบเดือน) ---
      // ค้างดำเนินการจากเดือนที่แล้ว
      if (blackDate < startOfMonth && (!redDate || redDate >= startOfMonth)) {
        defaults["sec4_" + prefix + "_pending"]++;
      }
      // เข้าสู่กระบวนการในเดือนนี้
      if (blackDate >= startOfMonth && blackDate <= endOfMonth) {
        defaults["sec4_" + prefix + "_entered"]++;
      }
      // คดีที่สำเร็จในเดือนนี้
      if (redDate && redDate >= startOfMonth && redDate <= endOfMonth && outcome === "success") {
        defaults["sec4_" + prefix + "_success"]++;
      }
      // คดีที่ไม่สำเร็จในเดือนนี้
      if (redDate && redDate >= startOfMonth && redDate <= endOfMonth && outcome === "failed") {
        defaults["sec4_" + prefix + "_failed"]++;
      }
      
      // --- Section 6 (ระยะเวลา มาตรการสำเร็จในเดือนนี้) ---
      if (redDate && redDate >= startOfMonth && redDate <= endOfMonth && outcome === "success") {
        var diffMs = redDate.getTime() - blackDate.getTime();
        var diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.4375);
        if (diffMonths <= 1) {
          defaults["sec6_" + prefix + "_t1"]++;
        } else if (diffMonths <= 3) {
          defaults["sec6_" + prefix + "_t2"]++;
        } else if (diffMonths <= 6) {
          defaults["sec6_" + prefix + "_t3"]++;
        } else if (diffMonths <= 12) {
          defaults["sec6_" + prefix + "_t4"]++;
        } else {
          defaults["sec6_" + prefix + "_t5"]++;
        }
      }
      
      // --- Section 11 (ระยะเวลาค้าง ของคดีที่ค้างอยู่ ณ สิ้นเดือนนี้) ---
      var isPendingAtEnd = blackDate <= endOfMonth && (!redDate || redDate > endOfMonth);
      if (isPendingAtEnd) {
        var pendingMs = endOfMonth.getTime() - blackDate.getTime();
        var pendingMonths = pendingMs / (1000 * 60 * 60 * 24 * 30.4375);
        if (pendingMonths <= 1) {
          defaults["sec11_" + prefix + "_t1"]++;
        } else if (pendingMonths <= 3) {
          defaults["sec11_" + prefix + "_t2"]++;
        } else if (pendingMonths <= 6) {
          defaults["sec11_" + prefix + "_t3"]++;
        } else if (pendingMonths <= 12) {
          defaults["sec11_" + prefix + "_t4"]++;
        } else {
          defaults["sec11_" + prefix + "_t5"]++;
        }
      }
      
      // --- Section 90 & 132 detailed charge counts ---
      if (redDate && redDate >= startOfMonth && redDate <= endOfMonth) {
        var cNo = parseInt(c.charge_no);
        if (!isNaN(cNo)) {
          if (ctId === 2) { // ม.90
            defaults["m90_c" + cNo + "_2"]++; // ปฏิบัติตามแผนฯครบถ้วน
          } else if (ctId === 3) { // ม.132
            defaults["m132_c" + cNo + "_3"]++; // Measure 2 ปฏิบัติตามเงื่อนไข
          }
        }
      }
    }
    
    // Balance calculation: progress = pending + entered - success - failed
    defaults["sec2_m90_progress"] = defaults["sec2_m90_pending"] + defaults["sec2_m90_entered"] - defaults["sec2_m90_success"] - defaults["sec2_m90_failed"];
    defaults["sec2_m132_progress"] = defaults["sec2_m132_pending"] + defaults["sec2_m132_entered"] - defaults["sec2_m132_success"] - defaults["sec2_m132_failed"];
    
    defaults["sec4_m90_progress"] = defaults["sec4_m90_pending"] + defaults["sec4_m90_entered"] - defaults["sec4_m90_success"] - defaults["sec4_m90_failed"];
    defaults["sec4_m132_progress"] = defaults["sec4_m132_pending"] + defaults["sec4_m132_entered"] - defaults["sec4_m132_success"] - defaults["sec4_m132_failed"];
    
    // Helper to calculate category sums in defaults
    function sumChildren(prefix, colsCount) {
      charges.forEach(function(c) {
        var children = [];
        var noStr = c.charge_statistics_no ? c.charge_statistics_no.toString().trim() : "";
        
        if (c.charge_no >= 1 && c.charge_no <= 62) {
          if (noStr && noStr.indexOf('.') === -1) {
            charges.forEach(function(sub) {
              if (sub.charge_no >= 1 && sub.charge_no <= 62) {
                var subNoStr = sub.charge_statistics_no ? sub.charge_statistics_no.toString().trim() : "";
                if (subNoStr.indexOf(noStr + '.') === 0) {
                  children.push(sub.charge_no);
                }
              }
            });
          }
        } else if (c.charge_no === 80) {
          for (var idx = 81; idx <= 89; idx++) children.push(idx);
        } else if (c.charge_no === 63) {
          for (var idx = 64; idx <= 119; idx++) children.push(idx);
        } else if (c.charge_no === 120) {
          for (var idx = 121; idx <= 131; idx++) children.push(idx);
        }
        
        if (children.length > 0) {
          for (var col = 1; col <= colsCount; col++) {
            var sum = 0;
            children.forEach(function(childNo) {
              sum += defaults[prefix + "_c" + childNo + "_" + col] || 0;
            });
            defaults[prefix + "_c" + c.charge_no + "_" + col] = sum;
          }
        }
      });
    }
    
    sumChildren("m90", 3);
    sumChildren("m132", 12);
    
    // Check saved overrides in tb_monthly_report
    var savedValues = {};
    var hasSaved = false;
    try {
      var savedRows = getSheetData_("tb_monthly_report");
      for (var i = 0; i < savedRows.length; i++) {
        var row = savedRows[i];
        if (row.month_year === monthYearStr) {
          savedValues[row.field_key] = parseFloat(row.field_value) || 0;
          hasSaved = true;
        }
      }
    } catch (sheetErr) {
      Logger.log("tb_monthly_report sheet might not exist yet: " + sheetErr.toString());
    }
    
    // Combine saved overrides with defaults
    var finalData = {};
    keys.forEach(function(k) {
      if (hasSaved && savedValues.hasOwnProperty(k)) {
        finalData[k] = savedValues[k];
      } else {
        finalData[k] = defaults[k];
      }
    });
    
    // Fetch counselors to filter directors
    var counselors = getSheetData_("tb_counselor");
    var directors = [];
    for (var i = 0; i < counselors.length; i++) {
      var c = counselors[i];
      var userIdNum = parseInt(c.user_id, 10);
      if (userIdNum >= 100) {
        directors.push({
          userId: c.user_id,
          counselorName: c.counselor_name || "",
          counselorPosition: c.counselor_position || "",
          counselorPositionSecond: c.counselor_position_second || ""
        });
      }
    }

    return {
      success: true,
      monthYear: monthYearStr,
      data: finalData,
      defaults: defaults,
      hasSaved: hasSaved,
      charges: chargeList,
      directors: directors
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงรายงานประจำเดือน: " + e.toString() };
  }
}

/**
 * บันทึกข้อมูลรายงานสถิติคดีประจำเดือน (งานช่วยอำนวยการ)
 */
function saveMonthlyReportData(monthYearStr, fieldsDataObj, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  if (userSession.role !== 'admin' && userSession.role !== 'psychologist') {
    return { success: false, message: "ขออภัย คุณไม่มีสิทธิ์ในการบันทึกหรือแก้ไขข้อมูลสถิติรายงานนี้" };
  }
  
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_monthly_report");
    if (!sheet) {
      sheet = ss.insertSheet("tb_monthly_report");
      sheet.appendRow(["month_year", "field_key", "field_value", "updated_at"]);
      SpreadsheetApp.flush();
    }
    
    var savedRows = getSheetData_("tb_monthly_report");
    
    // Group existing rowNum by field_key for this monthYearStr
    var existingRowNums = {};
    for (var i = 0; i < savedRows.length; i++) {
      var row = savedRows[i];
      if (row.month_year === monthYearStr) {
        existingRowNums[row.field_key] = row.rowNum;
      }
    }
    
    var nowStr = new Date().toISOString();
    for (var key in fieldsDataObj) {
      if (fieldsDataObj.hasOwnProperty(key)) {
        var val = fieldsDataObj[key];
        if (existingRowNums.hasOwnProperty(key)) {
          var rowNum = existingRowNums[key];
          updateRowInSheet_("tb_monthly_report", rowNum, {
            field_value: val,
            updated_at: nowStr
          });
        } else {
          appendRowToSheet_("tb_monthly_report", {
            month_year: monthYearStr,
            field_key: key,
            field_value: val,
            updated_at: nowStr
          });
        }
      }
    }
    
    return { success: true, message: "บันทึกข้อมูลสถิติคดีประจำเดือนเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกรายงาน: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลคดีทั้งหมดเชื่อมกับข้อมูลประวัติเด็ก นัดหมาย เงื่อนไขศาล และกิจกรรม สำหรับหน้าระบบข้อมูลคดีใหม่
 */
function getCaseInfoModuleData(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist" && userSession.role !== "director") {
    return { success: false, message: "สิทธิ์การเข้าถึงข้อมูลจำกัดเฉพาะผู้มีส่วนเกี่ยวข้อง" };
  }
  try {
    var cases = getSheetData_("tb_cases");
    var defendants = getSheetData_("tb_defendants");
    
    // จัดแผนที่ข้อมูลผู้ต้องหา
    var defMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var d = defendants[i];
      var cid = cleanCitizenId_(d.citizen_id);
      if (cid) {
        defMap[cid] = d;
      }
    }
    
    var isAdminOrStaff = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    var linkedCases = [];
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      
      var isAssigned = (c.user_id && c.user_id.toString() === userSession.userId.toString()) || 
                       (c.counselor && c.counselor.toString().trim() === userSession.fullName.toString().trim());
      
      if (isAdminOrStaff || isAssigned) {
        var cid = cleanCitizenId_(c.citizen_id);
        var def = defMap[cid] || {};
        
        linkedCases.push({
          rowNum: c.rowNum,
          citizen_id: safeStr_(c.citizen_id),
          black_date: safeStr_(c.black_date),
          black_case: safeStr_(c.black_case),
          case_type_id: safeNum_(c.case_type_id),
          sub_case_type_id: safeNum_(c.sub_case_type_id),
          case_type_abb: safeStr_(c.case_type_abb),
          black_case_no: safeNum_(c.black_case_no),
          black_case_year: safeNum_(c.black_case_year),
          prosecutor: safeStr_(c.prosecutor),
          charge: safeStr_(c.charge),
          charge_no: safeNum_(c.charge_no),
          age_at_offense: safeNum_(c.age_at_offense),
          red_date: safeStr_(c.red_date),
          red_case_no: safeNum_(c.red_case_no),
          red_case_year: safeNum_(c.red_case_year),
          red_because: safeStr_(c.red_because),
          recidivism: safeStr_(c.recidivism) || "ไม่ซ้ำ",
          previous_case_no: safeStr_(c.previous_case_no),
          abb_black_criminal: safeStr_(c.abb_black_criminal),
          black_criminal_no: safeNum_(c.black_criminal_no),
          black_criminal_year: safeNum_(c.black_criminal_year),
          abb_red_criminal: safeStr_(c.abb_red_criminal),
          red_criminal_no: safeNum_(c.red_criminal_no),
          red_criminal_year: safeNum_(c.red_criminal_year),
          counselor: safeStr_(c.counselor),
          user_id: safeStr_(c.user_id),
          judge: safeStr_(c.judge),
          officer: safeStr_(c.officer),
          mediator: safeStr_(c.mediator),
          mediator_add_date: safeStr_(c.mediator_add_date),
          court_date_plan: safeStr_(c.court_date_plan),
          plan_days: safeStr_(c.plan_days),
          court_order_plan: safeStr_(c.court_order_plan),
          note: safeStr_(c.note),
          def_first_name: safeStr_(def.first_name),
          def_last_name: safeStr_(def.last_name),
          def_nick_name: safeStr_(def.nick_name),
          def_title_name: safeStr_(def.title_name),
          def_birth_date: safeStr_(def.birth_date),
          def_parent_name: safeStr_(def.parent_name),
          def_parent_relation: safeStr_(def.parent_relation),
          def_address: safeStr_(def.address),
          def_phone_number: safeStr_(def.phone_number)
        });
      }
    }
    
    return {
      success: true,
      debugCasesLength: cases.length,
      debugLinkedLength: linkedCases.length,
      userRole: userSession.role,
      cases: linkedCases,
      appointments: [],
      conditions: [],
      activities: []
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดข้อมูลคดี: " + e.toString() };
  }
}

/**
 * แปลงค่าเป็นสตริงธรรมดาอย่างปลอดภัย (ป้องกัน Date object ทำให้ google.script.run คืนค่า null)
 */
function safeStr_(val) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    try {
      if (isNaN(val.getTime())) return "";
      return val.toISOString();
    } catch (e) {
      return "";
    }
  }
  return val.toString();
}

function safeNum_(val) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return "";
  var n = parseFloat(val);
  return isNaN(n) ? val.toString() : n;
}

/**
 * ดึงรายละเอียดเต็มของคดีที่เลือก (สำหรับเมื่อผู้ใช้คลิกเลือกคดีจากการ์ด)
 */
function getCaseDetailData(rowNum, blackCase, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  try {
    var appointments = getSheetData_("tb_appointment");
    var conditions = getSheetData_("tb_condition");
    var activities = getSheetData_("tb_activity");
    
    var bcStr = (blackCase || "").toString().trim();
    
    var caseAppointments = [];
    for (var i = 0; i < appointments.length; i++) {
      var a = appointments[i];
      if (a.black_case && a.black_case.toString().trim() === bcStr) {
        caseAppointments.push({
          black_case: safeStr_(a.black_case),
          appointment_date: safeStr_(a.appointment_date),
          appointment_time: safeStr_(a.appointment_time),
          appointment_reason: safeStr_(a.appointment_reason),
          appointment_counselor: extractAppointmentCounselor_(a),
          appointment_not: safeStr_(a.appointment_not),
          appointment_performance: safeStr_(a.appointment_performance),
          appointment_responsible_person: safeStr_(a.appointment_responsible_person)
        });
      }
    }
    
    var caseConditions = [];
    for (var i = 0; i < conditions.length; i++) {
      var co = conditions[i];
      if (co.black_case && co.black_case.toString().trim() === bcStr) {
        caseConditions.push({
          black_case: safeStr_(co.black_case),
          condition_no: safeStr_(co.condition_no),
          condition: safeStr_(co.condition),
          condition_performance_no: safeStr_(co.condition_performance_no),
          condition_performance: safeStr_(co.condition_performance)
        });
      }
    }
    
    var caseActivities = [];
    for (var i = 0; i < activities.length; i++) {
      var ac = activities[i];
      if (ac.black_case && ac.black_case.toString().trim() === bcStr) {
        caseActivities.push({
          black_case: safeStr_(ac.black_case),
          activity_no: safeStr_(ac.activity_no),
          activity_type: safeStr_(ac.activity_type),
          activity_name: safeStr_(ac.activity_name),
          activity_start_date: safeStr_(ac.activity_start_date),
          activity_finish_date: safeStr_(ac.activity_finish_date),
          activity_responsible_agency: safeStr_(ac.activity_responsible_agency),
          activity_venue: safeStr_(ac.activity_venue),
          activity_performance: safeStr_(ac.activity_performance)
        });
      }
    }
    
    return {
      success: true,
      appointments: caseAppointments,
      conditions: caseConditions,
      activities: caseActivities
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดรายละเอียดคดี: " + e.toString() };
  }
}

/**
 * บันทึกรายการตารางนัดหมายของคดี
 */
function saveCaseAppointments(blackCase, list, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ไม่มีสิทธิ์ในการบันทึกหรือแก้ไขตารางข้อมูลนัดหมาย" };
  }
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_appointment");
    var data = sheet.getDataRange().getValues();
    
    // ลบแถวเดิมที่เลขคดีดำตรงกันออกทั้งหมด
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] && data[i][0].toString().trim() === blackCase.toString().trim()) {
        sheet.deleteRow(i + 1);
      }
    }
    
    // เพิ่มแถวใหม่ตามลิสต์
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var aptDate = parseDateCE_(item.appointment_date);
      if (aptDate) aptDate.setHours(12, 0, 0, 0);
      
      var row = [
        blackCase,
        aptDate,
        item.appointment_time || "",
        item.appointment_reason || "",
        item.appointment_counselor || "",
        item.appointment_not || "",
        item.appointment_performance || "",
        item.appointment_responsible_person || ""
      ];
      sheet.appendRow(row);
    }
    clearSheetCache_("tb_appointment");
    return { success: true, message: "บันทึกตารางนัดหมายสำเร็จ" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกตารางนัดหมาย: " + e.toString() };
  }
}

/**
 * บันทึกรายการตารางกำหนด/เงื่อนไขของคดี
 */
function saveCaseConditions(blackCase, list, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ไม่มีสิทธิ์ในการบันทึกหรือแก้ไขตารางเงื่อนไขศาล" };
  }
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_condition");
    var data = sheet.getDataRange().getValues();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1] && data[i][1].toString().trim() === blackCase.toString().trim()) {
        sheet.deleteRow(i + 1);
      }
    }
    
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var row = [
        parseFloat(item.condition_no) || (i + 1),
        blackCase,
        item.condition || "",
        parseFloat(item.condition_performance_no) || "",
        item.condition_performance || ""
      ];
      sheet.appendRow(row);
    }
    clearSheetCache_("tb_condition");
    return { success: true, message: "บันทึกตารางกำหนดเงื่อนไขสำเร็จ" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกตารางเงื่อนไขศาล: " + e.toString() };
  }
}

/**
 * บันทึกรายการตารางการเข้าร่วมกิจกรรมของคดี
 */
function saveCaseActivities(blackCase, list, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ไม่มีสิทธิ์ในการบันทึกหรือแก้ไขตารางข้อมูลกิจกรรมย่อย" };
  }
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("tb_activity");
    var data = sheet.getDataRange().getValues();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] && data[i][0].toString().trim() === blackCase.toString().trim()) {
        sheet.deleteRow(i + 1);
      }
    }
    
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var startDate = parseDateCE_(item.activity_start_date);
      if (startDate) startDate.setHours(12, 0, 0, 0);
      var finishDate = parseDateCE_(item.activity_finish_date);
      if (finishDate) finishDate.setHours(12, 0, 0, 0);
      
      var row = [
        blackCase,
        parseFloat(item.activity_no) || (i + 1),
        item.activity_type || "",
        item.activity_name || "",
        startDate,
        finishDate,
        item.activity_responsible_agency || "",
        item.activity_venue || "",
        item.activity_performance || ""
      ];
      sheet.appendRow(row);
    }
    clearSheetCache_("tb_activity");
    return { success: true, message: "บันทึกตารางข้อมูลกิจกรรมสำเร็จ" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกตารางกิจกรรม: " + e.toString() };
  }
}

function parseDateCE_(val) {
  if (!val) return "";
  var d = new Date(val);
  if (isNaN(d.getTime())) return "";
  if (d.getFullYear() > 2400) {
    d.setFullYear(d.getFullYear() - 543);
  }
  return d;
}

/**
 * ============================================================================
 * LINE OFFICIAL ACCOUNT (@012cryec) & AUTOMATED REMINDER MODULE (PHASE 2)
 * ============================================================================
 */

/**
 * แยกสกัดรหัส LINE User ID (U...) และ Bot ID (U...) หากผู้ใช้วางลิงก์จาก chat.line.biz หรือ manager.line.biz
 */
function parseLineChatInput_(inputVal) {
  var result = { botId: "", userId: "" };
  if (!inputVal) return result;
  var str = inputVal.toString().trim();
  
  // กรณีวางลิงก์ https://chat.line.biz/Uxxxx.../chat/Uyyyy...
  var chatMatch = str.match(/chat\.line\.biz\/(U[0-9a-fA-F]{32})\/chat\/(U[0-9a-fA-F]{32})/);
  if (chatMatch) {
    result.botId = chatMatch[1];
    result.userId = chatMatch[2];
    return result;
  }
  
  // กรณีวางลิงก์ที่มี /chat/Uyyyy...
  var singleChatMatch = str.match(/\/chat\/(U[0-9a-fA-F]{32})/);
  if (singleChatMatch) {
    result.userId = singleChatMatch[1];
    return result;
  }
  
  // กรณีวางเฉพาะรหัส U... 33 หลักตรงๆ
  var rawUidMatch = str.match(/^(U[0-9a-fA-F]{32})$/);
  if (rawUidMatch) {
    result.userId = rawUidMatch[1];
    return result;
  }
  
  return result;
}

/**
 * สร้างหรือดึงชีทตามชื่อและหัวตารางที่กำหนด
 */
function getOrCreateSheet_(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  } else if (headers && headers.length > 0) {
    ensureColumnsExist_(sheetName, headers);
  }
  return sheet;
}

/**
 * ค่าเริ่มต้นของระบบ LINE OA และเทมเพลตข้อความแจ้งเตือน
 */
function getDefaultLineConfig_() {
  return {
    oa_basic_id: "@012cryec",
    oa_bot_id: "",
    channel_access_token: "",
    channel_secret: "",
    auto_send_enabled: "true",
    days_before_notify: "0,1,7",
    appointment_template: "📌 แจ้งเตือนวันนัดหมาย ศูนย์ให้คำปรึกษาฯ\n" +
      "เรียน เยาวชน {defendant_name} และผู้ปกครอง ({guardian_name})\n" +
      "เลขคดี: {black_case}\n" +
      "📅 วันที่นัด: {appointment_date} ({days_remaining})\n" +
      "⏰ เวลา: {appointment_time} น.\n" +
      "📋 เรื่องที่นัด: {appointment_reason}\n" +
      "👤 ผู้ให้คำปรึกษา: {counselor}\n" +
      "กรุณามาตามวันและเวลาดังกล่าว หากมีข้อสงสัยสามารถตอบกลับแชทนี้ได้ทันทีครับ/ค่ะ",
    activity_template: "📌 แจ้งเตือนการเข้าร่วมกิจกรรม/โครงการ ศูนย์ให้คำปรึกษาฯ\n" +
      "เรียน เยาวชน {defendant_name} และผู้ปกครอง ({guardian_name})\n" +
      "เลขคดี: {black_case}\n" +
      "🎯 กิจกรรม: {activity_name} {activity_type}\n" +
      "📅 วันที่เข้าร่วม: {activity_start_date} ({days_remaining})\n" +
      "📍 สถานที่: {activity_venue}\n" +
      "🏢 หน่วยงานรับผิดชอบ: {activity_responsible_agency}\n" +
      "กรุณาเข้าร่วมกิจกรรมตามวันและสถานที่ดังกล่าวครับ/ค่ะ",
    binding_prompt_template: "🔍 พบข้อมูลในระบบศูนย์ให้คำปรึกษาฯ:\n" +
      "👤 ชื่อเยาวชน: {defendant_name}\n" +
      "📋 เลขคดี: {black_case}\n\n" +
      "กรุณากดปุ่มด้านล่างเพื่อยืนยันว่าท่านคือ \"เยาวชน\" หรือ \"ผู้ปกครอง\" เพื่อรับการแจ้งเตือนครับ/ค่ะ:",
    binding_success_template: "✅ ผูกบัญชี LINE สำเร็จเรียบร้อย!\n\n" +
      "👤 ข้อมูลของ: {defendant_name}\n" +
      "🏷️ สถานะของคุณ: {role}\n\n" +
      "ระบบจะส่งข้อความแจ้งเตือนวันนัดหมายและกิจกรรมให้ท่านผ่านห้องสนทนานี้โดยอัตโนมัติครับ/ค่ะ",
    binding_not_found_template: "⚠️ ไม่พบข้อมูลเด็ก/เยาวชนในระบบศูนย์ให้คำปรึกษาฯ\n\n" +
      "เลขประจำตัวประชาชน: {citizen_id}\n\n" +
      "กรุณาตรวจสอบความถูกต้องของเลขประจำตัวประชาชน 13 หลักอีกครั้ง หากข้อมูลถูกต้องแล้วแต่ยังไม่พบในระบบ กรุณาพิมพ์ข้อความติดต่อเจ้าหน้าที่ศูนย์ให้คำปรึกษาฯ ผ่านห้องแชทนี้เพื่อประสานงานเพิ่มเติมครับ/ค่ะ",
    last_auto_run_date: "",
    last_auto_8am_run_date: ""
  };
}

/**
 * ดึงค่าการตั้งค่า LINE OA ทั้งหมดจากชีท tb_line_config
 */
function getLineConfigMap_() {
  try {
    var cfgCache = CacheService.getScriptCache();
    if (!cfgCache.get("ccms_line_obsolete_checked_v1")) {
      var ss = getSpreadsheet_();
      var obsoleteMsgSheet = ss.getSheetByName("tb_line_messages");
      if (obsoleteMsgSheet) {
        ss.deleteSheet(obsoleteMsgSheet);
      }
      cfgCache.put("ccms_line_obsolete_checked_v1", "1", 21600);
    }
  } catch (ignoreErr) {}
  var defaults = getDefaultLineConfig_();
  var sheet = getOrCreateSheet_("tb_line_config", ["config_key", "config_value", "updated_at", "updated_by"]);
  var rows = getSheetData_("tb_line_config");
  
  var map = {};
  for (var k in defaults) {
    if (defaults.hasOwnProperty(k)) {
      map[k] = defaults[k];
    }
  }
  
  var existingKeys = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.config_key) {
      var keyStr = r.config_key.toString().trim();
      existingKeys[keyStr] = true;
      if (r.config_value !== undefined && r.config_value !== null && r.config_value !== "") {
        if (keyStr === "oa_bot_id" && (r.updated_by === "webhook" || r.updated_by === "line_api" || r.config_value.toString().trim() === "Uc26f8cd9efde3d463307945a2077ff3f")) {
          continue;
        }
        if (keyStr === "last_auto_run_date" || keyStr === "last_auto_8am_run_date") {
          var rawLastRun = r.config_value.toString().trim();
          map[keyStr] = (rawLastRun.indexOf("RUN_") === 0 || rawLastRun.indexOf("AUTO8AM_") === 0) ? rawLastRun : (formatDateAsIso_(r.config_value) || rawLastRun);
          continue;
        }
        if (keyStr === "days_before_notify") {
          var rawDays = r.config_value.toString().replace(/\s+/g, "");
          if (rawDays === "1,3" || rawDays === "13" || rawDays === "1.3" || rawDays === "17" || rawDays === "0,1,7") {
            map[keyStr] = "0, 1, 7";
            if (r.config_value.toString().trim() !== "0, 1, 7") {
              try {
                updateRowInSheet_("tb_line_config", r.rowNum, {
                  config_key: "days_before_notify",
                  config_value: "'0, 1, 7",
                  updated_at: new Date().toISOString(),
                  updated_by: "system"
                });
                clearSheetCache_("tb_line_config");
              } catch (ignoreUpdateErr) {}
            }
            continue;
          }
        }
        map[keyStr] = r.config_value.toString();
      }
    }
  }
  
  // บันทึกค่าเริ่มต้นลงในชีทหากยังไม่มีแถวข้อมูลเลย
  if (rows.length === 0) {
    var nowIso = new Date().toISOString();
    for (var dk in defaults) {
      if (defaults.hasOwnProperty(dk)) {
        appendRowToSheet_("tb_line_config", {
          config_key: dk,
          config_value: dk === "days_before_notify" ? "'0, 1, 7" : defaults[dk],
          updated_at: nowIso,
          updated_by: "system"
        });
      }
    }
    clearSheetCache_("tb_line_config");
  }
  
  return map;
}

/**
 * บันทึกหรืออัปเดตค่าตั้งค่าเดี่ยวลงใน tb_line_config
 */
function saveSingleLineConfigValue_(key, value, updatedBy) {
  if (!key) return;
  getOrCreateSheet_("tb_line_config", ["config_key", "config_value", "updated_at", "updated_by"]);
  var rows = getSheetData_("tb_line_config");
  var nowIso = new Date().toISOString();
  var strVal = value !== undefined && value !== null ? value.toString() : "";
  if (key === "days_before_notify" && strVal.indexOf("'") !== 0) {
    strVal = "'" + strVal;
  }
  var found = false;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].config_key && rows[i].config_key.toString().trim() === key) {
      updateRowInSheet_("tb_line_config", rows[i].rowNum, {
        config_key: key,
        config_value: strVal,
        updated_at: nowIso,
        updated_by: updatedBy || "system"
      });
      found = true;
      break;
    }
  }
  if (!found) {
    appendRowToSheet_("tb_line_config", {
      config_key: key,
      config_value: value !== undefined && value !== null ? value.toString() : "",
      updated_at: nowIso,
      updated_by: updatedBy || "system"
    });
  }
  clearSheetCache_("tb_line_config");
  try {
    CacheService.getScriptCache().remove("ccms_line_pubcfg_v1");
  } catch (ignoreCfgCacheErr) {}
}

/**
 * ดึงข้อมูลโปรไฟล์ผู้ใช้จาก LINE Messaging API
 */
function fetchLineUserProfile_(userId, channelAccessToken) {
  if (!userId || !channelAccessToken) return { displayName: "", pictureUrl: "" };
  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/profile/" + encodeURIComponent(userId), {
      method: "get",
      headers: {
        "Authorization": "Bearer " + channelAccessToken
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      return {
        displayName: data.displayName || "",
        pictureUrl: data.pictureUrl || ""
      };
    }
  } catch (e) {
    Logger.log("fetchLineUserProfile error: " + e.toString());
  }
  return { displayName: "", pictureUrl: "" };
}

/**
 * ดึงข้อมูล Bot Info (เช่น basicId และ displayName ของ LINE OA)
 */
function fetchLineBotInfo_(channelAccessToken) {
  if (!channelAccessToken) return null;
  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/info", {
      method: "get",
      headers: {
        "Authorization": "Bearer " + channelAccessToken
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText());
    }
  } catch (e) {
    Logger.log("fetchLineBotInfo error: " + e.toString());
  }
  return null;
}

/**
 * ส่งข้อความตอบกลับ (Reply Message) ผ่าน LINE Messaging API
 */
function sendLineReplyMessage_(replyToken, messagesArray, channelAccessToken) {
  if (!replyToken || !channelAccessToken) return false;
  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + channelAccessToken
      },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: messagesArray
      }),
      muteHttpExceptions: true
    });
    return res.getResponseCode() === 200;
  } catch (e) {
    Logger.log("sendLineReplyMessage error: " + e.toString());
    return false;
  }
}

/**
 * ส่งข้อความแจ้งเตือน (Push Message) ไปยังผู้ใช้ผ่าน LINE Messaging API
 */
function sendLinePushMessage_(toUserId, messageText, channelAccessToken) {
  if (!toUserId || !messageText || !channelAccessToken) {
    return { success: false, message: "ข้อมูลไม่ครบถ้วน (ต้องมี LINE User ID และ Channel Access Token)" };
  }
  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + channelAccessToken
      },
      payload: JSON.stringify({
        to: toUserId.toString().trim(),
        messages: [
          {
            type: "text",
            text: messageText
          }
        ]
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200) {
      return { success: true, message: "ส่งข้อความสำเร็จ" };
    } else {
      return { success: false, message: "LINE API Error (" + code + "): " + res.getContentText() };
    }
  } catch (e) {
    return { success: false, message: "Exception: " + e.toString() };
  }
}

var LINE_CONTACTS_SCHEMA = [
  "line_user_id", "display_name", "picture_url",
  "last_message", "last_message_type", "last_incoming_at", "is_unread",
  "linked_citizen_id", "linked_role", "updated_at"
];
var LINE_UNREAD_CACHE_KEY = "ccms_line_unread_v1";
var LINE_UNREAD_CACHE_TTL_SEC = 21600;
var LINE_PUBCFG_CACHE_KEY = "ccms_line_pubcfg_v1";
var LINE_LAST_CLEARED_PROP_KEY = "ccms_line_last_cleared_v1";

function getLineLastClearedInfo_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(LINE_LAST_CLEARED_PROP_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.byName) return parsed;
    }
  } catch (e) {}
  return null;
}

function saveLineLastClearedInfo_(userSession, clearedCount, actionType) {
  try {
    var info = {
      byName: ((userSession && (userSession.fullName || userSession.email)) || "เจ้าหน้าที่").toString().trim(),
      byRole: (userSession && userSession.role ? userSession.role : "").toString().trim(),
      atIso: new Date().toISOString(),
      clearedCount: Number(clearedCount || 0),
      actionType: (actionType || "mark_all").toString().trim()
    };
    PropertiesService.getScriptProperties().setProperty(LINE_LAST_CLEARED_PROP_KEY, JSON.stringify(info));
    return info;
  } catch (e) {
    return null;
  }
}

function canViewLineOaNotifications_(role) {
  var r = String(role || "").trim().toLowerCase();
  return r === "admin" || r === "psychologist";
}

function ensureLineContactsSchema_() {
  var cache = CacheService.getScriptCache();
  if (cache.get("ccms_line_contacts_schema_v1")) return;
  getOrCreateSheet_("tb_line_contacts", LINE_CONTACTS_SCHEMA);
  ensureColumnsExist_("tb_line_contacts", LINE_CONTACTS_SCHEMA);
  cache.put("ccms_line_contacts_schema_v1", "1", LINE_UNREAD_CACHE_TTL_SEC);
}

function invalidateLineUnreadCache_() {
  try {
    CacheService.getScriptCache().remove(LINE_UNREAD_CACHE_KEY);
  } catch (e) {}
}

function parseTimestampMsSafe_(val) {
  if (!val) return 0;
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  var ms = new Date(val).getTime();
  return isNaN(ms) ? 0 : ms;
}

function summarizeLineWebhookEvent_(ev) {
  if (!ev) return null;
  if (ev.type === "follow") {
    return {
      text: "[เพิ่มเพื่อนใหม่]",
      type: "follow",
      runBinding: false,
      markUnread: true
    };
  }
  if (ev.type === "postback") {
    var pbData = (ev.postback && ev.postback.data) ? ev.postback.data.toString().trim() : "";
    var pbPreview = pbData.length > 140 ? pbData.substring(0, 137) + "..." : pbData;
    return {
      text: pbPreview ? ("[กดปุ่มตอบกลับ] " + pbPreview) : "[กดปุ่มตอบกลับใน LINE]",
      rawText: pbData,
      type: "postback",
      runBinding: pbData.indexOf("ยืนยัน") === 0,
      markUnread: true
    };
  }
  if (ev.type === "message" && ev.message) {
    var mType = (ev.message.type || "other").toString().trim().toLowerCase();
    if (mType === "text") {
      var raw = (ev.message.text || "").toString().trim();
      var preview = raw.length > 180 ? raw.substring(0, 177) + "..." : raw;
      return {
        text: preview || "[ส่งข้อความ]",
        rawText: raw,
        type: "text",
        runBinding: true,
        markUnread: true
      };
    }
    var typeLabels = {
      image: "[ส่งรูปภาพ]",
      sticker: "[ส่งสติกเกอร์]",
      video: "[ส่งวิดีโอ]",
      audio: "[ส่งข้อความเสียง]",
      file: "[ส่งไฟล์แนบ]" + (ev.message.fileName ? (" " + ev.message.fileName.toString().trim()) : ""),
      location: "[ส่งตำแหน่งที่ตั้ง]" + ((ev.message.title || ev.message.address) ? (" " + (ev.message.title || ev.message.address).toString().trim()) : "")
    };
    return {
      text: typeLabels[mType] || ("[ส่งข้อความ (" + mType + ")]"),
      type: mType || "other",
      runBinding: false,
      markUnread: true
    };
  }
  return null;
}

function rebuildLineUnreadCache_() {
  ensureLineContactsSchema_();
  var contacts = getSheetData_("tb_line_contacts");
  var unreadRows = [];
  for (var i = 0; i < contacts.length; i++) {
    var ct = contacts[i];
    if (!ct.line_user_id) continue;
    var unreadFlag = (ct.is_unread || "").toString().trim().toLowerCase();
    if (unreadFlag === "yes") {
      unreadRows.push(ct);
    }
  }

  var defByCid = {};
  var defByUid = {};
  if (unreadRows.length > 0) {
    var defendants = getSheetData_("tb_defendants");
    for (var dIdx = 0; dIdx < defendants.length; dIdx++) {
      var d = defendants[dIdx];
      var cid = cleanCitizenId_(d.citizen_id);
      var fullName = ((d.title_name || "") + (d.first_name || "") + " " + (d.last_name || "")).trim();
      var rec = {
        citizen_id: cid,
        name: fullName,
        line_user_id: (d.line_user_id || "").toString().trim(),
        parent_line_user_id: (d.parent_line_user_id || "").toString().trim(),
        line_chat_url: (d.line_chat_url || "").toString().trim(),
        parent_line_chat_url: (d.parent_line_chat_url || "").toString().trim()
      };
      if (cid && !defByCid[cid]) {
        defByCid[cid] = rec;
      }
      if (rec.line_user_id && !defByUid[rec.line_user_id]) {
        defByUid[rec.line_user_id] = { rec: rec, role: "เยาวชน" };
      }
      if (rec.parent_line_user_id && !defByUid[rec.parent_line_user_id]) {
        defByUid[rec.parent_line_user_id] = { rec: rec, role: "ผู้ปกครอง" };
      }
    }
  }

  var items = [];
  for (var j = 0; j < unreadRows.length; j++) {
    var u = unreadRows[j];
    var uid = u.line_user_id.toString().trim();
    var linkedCid = cleanCitizenId_(u.linked_citizen_id);
    var linkedRole = (u.linked_role || "").toString().trim();
    var defInfo = (linkedCid && defByCid[linkedCid]) ? defByCid[linkedCid] : null;
    if (!defInfo && defByUid[uid]) {
      defInfo = defByUid[uid].rec;
      if (!linkedCid) linkedCid = defInfo.citizen_id || "";
      if (!linkedRole) linkedRole = defByUid[uid].role || "";
    }
    var isParentRole = (linkedRole === "ผู้ปกครอง" || linkedRole === "parent");
    var chatUrl = "";
    if (defInfo) {
      chatUrl = isParentRole
        ? (defInfo.parent_line_chat_url || defInfo.line_chat_url || "")
        : (defInfo.line_chat_url || defInfo.parent_line_chat_url || "");
    }
    var incomingIso = (u.last_incoming_at || u.updated_at || "").toString().trim();
    var incomingMs = parseTimestampMsSafe_(incomingIso);
    var msgText = (u.last_message || "").toString().trim();
    if (msgText.length > 180) msgText = msgText.substring(0, 177) + "...";

    items.push({
      line_user_id: uid,
      display_name: (u.display_name || "ผู้ใช้ LINE").toString().trim(),
      picture_url: (u.picture_url || "").toString().trim(),
      last_message: msgText,
      last_message_type: (u.last_message_type || "text").toString().trim() || "text",
      last_incoming_at: incomingIso,
      incoming_ms: incomingMs,
      linked_citizen_id: linkedCid,
      linked_role: linkedRole,
      linked_defendant_name: defInfo ? (defInfo.name || "") : "",
      chat_url: chatUrl
    });
  }

  items.sort(function(a, b) {
    return (b.incoming_ms || 0) - (a.incoming_ms || 0);
  });

  var latestMs = items.length > 0 ? (items[0].incoming_ms || 0) : 0;
  var summary = {
    count: items.length,
    latestMs: latestMs,
    items: items.slice(0, 100),
    lastCleared: getLineLastClearedInfo_()
  };
  try {
    CacheService.getScriptCache().put(LINE_UNREAD_CACHE_KEY, JSON.stringify(summary), LINE_UNREAD_CACHE_TTL_SEC);
  } catch (putErr) {
    Logger.log("rebuildLineUnreadCache put error: " + putErr.toString());
  }
  return summary;
}

function getLineUnreadSummaryFromCache_(role) {
  if (!canViewLineOaNotifications_(role)) return null;
  try {
    var raw = CacheService.getScriptCache().get(LINE_UNREAD_CACHE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.count === "number") {
        return parsed;
      }
    }
  } catch (e) {}
  return rebuildLineUnreadCache_();
}

function getLinePublicConfigFast_() {
  var cache = CacheService.getScriptCache();
  try {
    var cachedRaw = cache.get(LINE_PUBCFG_CACHE_KEY);
    if (cachedRaw) {
      return JSON.parse(cachedRaw);
    }
  } catch (e) {}
  var cfg = getLineConfigMap_();
  var pubCfg = {
    oa_basic_id: cfg.oa_basic_id || "@012cryec",
    oa_bot_id: cfg.oa_bot_id || ""
  };
  try {
    cache.put(LINE_PUBCFG_CACHE_KEY, JSON.stringify(pubCfg), LINE_UNREAD_CACHE_TTL_SEC);
  } catch (e2) {}
  return pubCfg;
}

/**
 * ดึงเฉพาะรายการข้อความเข้าใหม่ที่ยังไม่ได้อ่านแบบรวดเร็ว (Admin & Psychologist เท่านั้น)
 */
function getLineUnreadInbox(token, forceRefresh) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (!canViewLineOaNotifications_(userSession.role)) {
    return { success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลกล่องข้อความ LINE OA" };
  }
  try {
    var summary = forceRefresh === true
      ? (function() { clearSheetCache_("tb_line_contacts"); return rebuildLineUnreadCache_(); })()
      : getLineUnreadSummaryFromCache_(userSession.role);
    var pubCfg = getLinePublicConfigFast_();
    return {
      success: true,
      unread: summary,
      publicConfig: pubCfg
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดข้อความเข้า LINE OA: " + e.toString() };
  }
}

/**
 * ทำเครื่องหมายว่าอ่านข้อความล่าสุดของผู้ติดต่อรายนี้แล้ว (ลบออกจากรายการยังไม่อ่าน)
 */
function markLineContactRead(lineUserId, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (!canViewLineOaNotifications_(userSession.role)) {
    return { success: false, message: "ไม่มีสิทธิ์จัดการสถานะข้อความ LINE OA" };
  }
  try {
    var targetUid = (lineUserId || "").toString().trim();
    if (!targetUid) return { success: false, message: "ไม่พบรหัสผู้ติดต่อ LINE" };
    ensureLineContactsSchema_();
    var contacts = getSheetData_("tb_line_contacts");
    for (var i = 0; i < contacts.length; i++) {
      if (contacts[i].line_user_id && contacts[i].line_user_id.toString().trim() === targetUid) {
        updateRowInSheet_("tb_line_contacts", contacts[i].rowNum, { is_unread: "no" });
        break;
      }
    }
    clearSheetCache_("tb_line_contacts");
    saveLineLastClearedInfo_(userSession, 1, "single");
    var summary = rebuildLineUnreadCache_();
    return { success: true, unread: summary };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  }
}

/**
 * ล้างแจ้งเตือนข้อความเข้าทั้งหมดให้เป็นสถานะอ่านแล้ว
 */
function markAllLineContactsRead(token, actionType) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (!canViewLineOaNotifications_(userSession.role)) {
    return { success: false, message: "ไม่มีสิทธิ์จัดการสถานะข้อความ LINE OA" };
  }
  try {
    ensureLineContactsSchema_();
    var contacts = getSheetData_("tb_line_contacts");
    var updated = 0;
    for (var i = 0; i < contacts.length; i++) {
      var unreadFlag = (contacts[i].is_unread || "").toString().trim().toLowerCase();
      if (unreadFlag === "yes") {
        updateRowInSheet_("tb_line_contacts", contacts[i].rowNum, { is_unread: "no" });
        updated++;
      }
    }
    if (updated > 0) {
      clearSheetCache_("tb_line_contacts");
    }
    if (updated > 0 || actionType === "open_oa_all") {
      saveLineLastClearedInfo_(userSession, updated, actionType || "mark_all");
    }
    var summary = rebuildLineUnreadCache_();
    return { success: true, cleared: updated, unread: summary };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  }
}

/**
 * บันทึกรายชื่อผู้ติดต่อที่ทักหรือเพิ่มเพื่อนเข้ามาใน LINE OA ลงในชีท tb_line_contacts
 */
function upsertLineContactRecord_(userId, displayName, lastMsg, linkedCid, linkedRole, opts) {
  if (!userId) return;
  ensureLineContactsSchema_();
  var contacts = getSheetData_("tb_line_contacts");
  var nowIso = new Date().toISOString();
  var existing = null;
  for (var i = 0; i < contacts.length; i++) {
    if (contacts[i].line_user_id && contacts[i].line_user_id.toString().trim() === userId) {
      existing = contacts[i];
      break;
    }
  }
  var hasOpts = opts && typeof opts === "object";
  if (existing) {
    var rowObj = {
      line_user_id: userId,
      display_name: displayName || existing.display_name || "",
      picture_url: (hasOpts && opts.pictureUrl) ? opts.pictureUrl : (existing.picture_url || ""),
      last_message: lastMsg !== undefined ? lastMsg : (existing.last_message || ""),
      last_message_type: (hasOpts && opts.messageType !== undefined) ? opts.messageType : (existing.last_message_type || ""),
      last_incoming_at: (hasOpts && opts.incomingAt !== undefined) ? opts.incomingAt : (existing.last_incoming_at || ""),
      is_unread: (hasOpts && opts.isUnread !== undefined) ? opts.isUnread : (existing.is_unread || ""),
      linked_citizen_id: linkedCid !== undefined ? linkedCid : (existing.linked_citizen_id || ""),
      linked_role: linkedRole !== undefined ? linkedRole : (existing.linked_role || ""),
      updated_at: nowIso
    };
    updateRowInSheet_("tb_line_contacts", existing.rowNum, rowObj);
  } else {
    appendRowToSheet_("tb_line_contacts", {
      line_user_id: userId,
      display_name: displayName || "",
      picture_url: (hasOpts && opts.pictureUrl) ? opts.pictureUrl : "",
      last_message: lastMsg || "",
      last_message_type: (hasOpts && opts.messageType !== undefined) ? opts.messageType : "",
      last_incoming_at: (hasOpts && opts.incomingAt !== undefined) ? opts.incomingAt : "",
      is_unread: (hasOpts && opts.isUnread !== undefined) ? opts.isUnread : "",
      linked_citizen_id: linkedCid || "",
      linked_role: linkedRole || "",
      updated_at: nowIso
    });
  }
  clearSheetCache_("tb_line_contacts");
}

/**
 * ทำความสะอาดรหัสเลขคดีเพื่อใช้เปรียบเทียบ (เช่น "มพ. 34/69" -> "มพ34/69")
 */
function normalizeBlackCaseKey_(bc) {
  if (!bc) return "";
  return bc.toString().trim().replace(/[\s\.]/g, "").toLowerCase();
}

/**
 * ซิงค์ข้อมูลการผูกบัญชี (ฟังก์ชันสำรอง - ป้องกันการเขียนทับข้อมูลที่ถูกลบไปแล้ว)
 */
function syncLineBindingsFromContactsToDefendants_() {
  // ไม่ทำการเขียนทับข้อมูลใน tb_defendants อัตโนมัติ เพื่อให้ผู้ดูแลระบบสามารถลบหรือแก้ไขข้อมูลในฐานข้อมูลได้อย่างถูกต้อง
  return;
}

/**
 * Webhook รับข้อมูลจาก LINE Messaging API เมื่อเยาวชนหรือผู้ปกครองเพิ่มเพื่อนหรือส่งข้อความเข้า LINE OA (@012cryec)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }

    var rawBody = String(e.postData.contents || "");
    if (rawBody.length > 250000) {
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }
    var payload = JSON.parse(rawBody);

    // Fast-path สำหรับ navigator.sendBeacon เมื่อผู้ใช้งานปิดหน้าต่างหรือปิดเบราว์เซอร์ (ไม่ต้องรอล็อกคิวของ LINE Webhook)
    if (payload && payload.ccmsAction === "presence_offline") {
      try {
        var beaconSession = verifySessionToken_(payload.token);
        if (beaconSession && beaconSession.userId) {
          markUserOfflineByUserId_(beaconSession.userId, { tabId: payload.tabId || "", force: !!payload.force });
        }
      } catch (prsErr) {}
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      ensureDailyTimeTriggerInstalled_();
    } catch (trigErr) {}
    
    try {
      hasLock = lock.tryLock(25000);
    } catch (lockErr) {}
    clearSheetCache_();
    var cfg = getLineConfigMap_();
    var accessToken = cfg.channel_access_token || "";
    
    var events = Array.isArray(payload.events) ? payload.events.slice(0, 50) : [];
    var webhookCache = CacheService.getScriptCache();
    var hasUnreadChange = false;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev) continue;
      if (ev.webhookEventId) {
        var dedupKey = "line_ev_" + String(ev.webhookEventId).substring(0, 64);
        if (webhookCache.get(dedupKey)) continue;
        webhookCache.put(dedupKey, "1", 600);
      }
      var userId = (ev.source && ev.source.userId) ? String(ev.source.userId).trim() : "";
      var replyToken = ev.replyToken || "";
      if (!userId || !/^U[0-9a-zA-Z_-]{3,64}$/.test(userId)) continue;

      var evSummary = summarizeLineWebhookEvent_(ev);
      if (!evSummary) continue;

      var profile = fetchLineUserProfile_(userId, accessToken);
      var displayName = profile.displayName || "";
      var evIso = (ev.timestamp && !isNaN(Number(ev.timestamp)))
        ? new Date(Number(ev.timestamp)).toISOString()
        : new Date().toISOString();

      var prevContactInfo = null;
      if (evSummary.runBinding) {
        // เก็บข้อมูลติดต่อเดิมก่อนถูกเขียนทับด้วยข้อความใหม่ เผื่อกรณีผู้ใช้พิมพ์เลขบัตร 13 หลัก แล้วพิมพ์คำว่า "เยาวชน"/"ผู้ปกครอง" ตามมาในข้อความถัดไป
        try {
          var existingContacts = getSheetData_("tb_line_contacts");
          for (var ecIdx = 0; ecIdx < existingContacts.length; ecIdx++) {
            if (existingContacts[ecIdx].line_user_id && existingContacts[ecIdx].line_user_id.toString().trim() === userId) {
              prevContactInfo = {
                linked_citizen_id: cleanCitizenId_(existingContacts[ecIdx].linked_citizen_id),
                linked_role: (existingContacts[ecIdx].linked_role || "").toString().trim(),
                last_message: (existingContacts[ecIdx].last_message || "").toString().trim()
              };
              break;
            }
          }
        } catch (prevErr) {}
      }

      upsertLineContactRecord_(userId, displayName, evSummary.text, undefined, undefined, {
        pictureUrl: profile.pictureUrl || "",
        messageType: evSummary.type,
        incomingAt: evIso,
        isUnread: evSummary.markUnread ? "yes" : undefined
      });
      if (evSummary.markUnread) {
        hasUnreadChange = true;
      }

      if (evSummary.runBinding && (evSummary.rawText || evSummary.text)) {
        handleIncomingLineTextForBinding_(userId, displayName, evSummary.rawText || evSummary.text, replyToken, accessToken, prevContactInfo);
      }
    }
    
    try {
      SpreadsheetApp.flush();
    } catch (flushErr) {}
    if (hasUnreadChange) {
      try {
        rebuildLineUnreadCache_();
      } catch (rebuildErr) {
        invalidateLineUnreadCache_();
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("doPost Webhook Error: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {}
    }
  }
}

/**
 * บันทึกการผูกบัญชี LINE ของเยาวชนหรือผู้ปกครองลงใน tb_defendants (ผูกเฉพาะรายการที่พบเลขบัตรใน tb_defendants เท่านั้น จะไม่สร้างแถวใหม่เด็ดขาด)
 */
function saveLineBindingToDefendantsSheet_(targetCid, userId, displayName, isParent, chatUrl) {
  ensureColumnsExist_("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id", "line_chat_url", "parent_line_chat_url"]);
  clearSheetCache_("tb_defendants");
  var defendants = getSheetData_("tb_defendants");
  var matchedRows = [];
  for (var i = 0; i < defendants.length; i++) {
    if (cleanCitizenId_(defendants[i].citizen_id) === targetCid) {
      matchedRows.push(defendants[i]);
    }
  }

  // หากไม่พบเลขบัตรประชาชนใน tb_defendants จะไม่สามารถผูกบัญชีได้ และต้องไม่สร้างแถวใหม่ลงใน tb_defendants เด็ดขาด
  if (matchedRows.length === 0) {
    return { matched: false, defFullName: "", matchedCaseNo: "" };
  }

  var cases = getSheetData_("tb_cases");
  var matchedCaseNo = "";
  for (var cIdx = 0; cIdx < cases.length; cIdx++) {
    if (cleanCitizenId_(cases[cIdx].citizen_id) === targetCid) {
      if (cases[cIdx].black_case && !matchedCaseNo) {
        matchedCaseNo = cases[cIdx].black_case.toString().trim();
      }
    }
  }

  var defFullName = "";
  for (var m = 0; m < matchedRows.length; m++) {
    var rowDef = matchedRows[m];
    if (!defFullName) {
      defFullName = ((rowDef.title_name || "") + (rowDef.first_name || "") + " " + (rowDef.last_name || "")).trim();
    }
    var partialUpdate = {};
    if (isParent) {
      partialUpdate.parent_line_user_id = userId;
      if (chatUrl) partialUpdate.parent_line_chat_url = chatUrl;
      var curParentLineId = (rowDef.parent_line_id || "").toString().trim();
      if (!curParentLineId || curParentLineId === "-") {
        partialUpdate.parent_line_id = displayName || userId;
      }
    } else {
      partialUpdate.line_user_id = userId;
      if (chatUrl) partialUpdate.line_chat_url = chatUrl;
      var curYouthLineId = (rowDef.line_id || "").toString().trim();
      if (!curYouthLineId || curYouthLineId === "-") {
        partialUpdate.line_id = displayName || userId;
      }
    }
    updateRowInSheet_("tb_defendants", rowDef.rowNum, partialUpdate);
  }
  if (!defFullName) {
    defFullName = matchedCaseNo ? ("เยาวชนคดี " + matchedCaseNo) : ("เลขบัตร " + targetCid);
  }
  clearSheetCache_("tb_defendants");
  invalidateLineUnreadCache_();
  return { matched: true, defFullName: defFullName, matchedCaseNo: matchedCaseNo };
}

/**
 * ประมวลผลข้อความที่ส่งเข้ามาใน LINE OA เพื่อผูกบัญชีเยาวชนหรือผู้ปกครองอัตโนมัติ
 */
function handleIncomingLineTextForBinding_(userId, displayName, text, replyToken, accessToken, prevContactInfo) {
  ensureColumnsExist_("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id", "line_chat_url", "parent_line_chat_url"]);
  clearSheetCache_("tb_defendants");
  var defendants = getSheetData_("tb_defendants");
  var cfg = getLineConfigMap_();
  
  // แปลงตัวเลขไทย ๐-๙ เป็น 0-9 และตัดอักขระพิเศษที่มองไม่เห็น (Zero-width spaces)
  var normalizedText = (text || "").toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[๐-๙]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x0E50 + 48);
    })
    .trim();

  // Helper ภายในสำหรับบันทึกการผูกบัญชีลงทุกแถวที่ตรงกับเลขบัตรประชาชน และส่งข้อความยืนยัน
  function executeBindingAndReply(targetCid, isParent) {
    var bindRes = saveLineBindingToDefendantsSheet_(targetCid, userId, displayName, isParent, "");
    if (!bindRes.matched) {
      if (replyToken && accessToken) {
        var notFoundTpl = cfg.binding_not_found_template || getDefaultLineConfig_().binding_not_found_template;
        var notFoundMsg = renderLineMessageTemplate_(notFoundTpl, {
          citizen_id: targetCid
        });
        sendLineReplyMessage_(replyToken, [{ type: "text", text: notFoundMsg }], accessToken);
      }
      return false;
    }
    var defFullName = bindRes.defFullName || ("เลขบัตร " + targetCid);
    
    var roleLabel = isParent ? "ผู้ปกครอง" : "เยาวชน";
    upsertLineContactRecord_(userId, displayName, "ยืนยัน" + roleLabel + ":" + targetCid, targetCid, roleLabel);
    try {
      SpreadsheetApp.flush();
    } catch (flushErr) {}
    
    if (replyToken && accessToken) {
      var tpl = cfg.binding_success_template || getDefaultLineConfig_().binding_success_template;
      var successMsg = renderLineMessageTemplate_(tpl, {
        defendant_name: defFullName,
        role: roleLabel,
        citizen_id: targetCid
      });
      sendLineReplyMessage_(replyToken, [{ type: "text", text: successMsg }], accessToken);
    }
    return true;
  }
  
  // 1. ตรวจสอบกรณีผู้ใช้กดปุ่มยืนยันสถานะ: "ยืนยันเยาวชน:1234567890123" หรือ "ยืนยันผู้ปกครอง:1234567890123"
  // หรือพิมพ์สถานะพร้อมเลขบัตร 13 หลักในข้อความเดียวกัน
  var cleanedForRoleMatch = normalizedText.replace(/^[^ก-๙a-zA-Z0-9]+/, "").trim();
  var confirmMatch = cleanedForRoleMatch.match(/^(?:ยืนยัน)?\s*(?:ฉันคือ|ผมคือ|หนูคือ|เป็น|ผมเป็น|หนูเป็น)?\s*(เยาวชน|ผู้ปกครอง|ผปค\.?|บิดา|มารดา|พ่อ|แม่|ผู้ดูแล)(?:ครับ|ค่ะ|คะ|จ้า)?[\s:\-]*(.*)$/);
  if (confirmMatch) {
    var roleWord = confirmMatch[1];
    var restDigits = (confirmMatch[2] || "").replace(/\D/g, "");
    var isParent = (roleWord !== "เยาวชน");
    if (restDigits.length === 13) {
      executeBindingAndReply(restDigits, isParent);
      return;
    }
    // กรณีผู้ใช้พิมพ์เฉพาะคำว่า "เยาวชน" / "ฉันคือเยาวชน" / "ผู้ปกครอง" / "ฉันคือผู้ปกครอง" หลังจากเพิ่งพิมพ์เลขบัตร 13 หลักไปก่อนหน้า
    if (restDigits.length === 0) {
      var prevCid = "";
      if (prevContactInfo) {
        if (prevContactInfo.linked_citizen_id && prevContactInfo.linked_citizen_id.length === 13) {
          prevCid = prevContactInfo.linked_citizen_id;
        } else if (prevContactInfo.last_message) {
          var prevDigits = prevContactInfo.last_message.replace(/[๐-๙]/g, function(ch) {
            return String.fromCharCode(ch.charCodeAt(0) - 0x0E50 + 48);
          }).replace(/\D/g, "");
          if (prevDigits.length === 13) {
            prevCid = prevDigits;
          }
        }
      }
      if (!prevCid) {
        var contacts = getSheetData_("tb_line_contacts");
        for (var ctIdx = 0; ctIdx < contacts.length; ctIdx++) {
          if (contacts[ctIdx].line_user_id && contacts[ctIdx].line_user_id.toString().trim() === userId) {
            var candCid = cleanCitizenId_(contacts[ctIdx].linked_citizen_id);
            if (candCid && candCid.length === 13) {
              prevCid = candCid;
            }
            break;
          }
        }
      }
      if (prevCid) {
        executeBindingAndReply(prevCid, isParent);
        return;
      }
    }
  }

  // กรณีพิมพ์เลขบัตร 13 หลักตามด้วยสถานะ เช่น "1234567890123 ผู้ปกครอง" หรือ "1234567890123 เยาวชน"
  var reverseMatch = normalizedText.match(/^([\d\s\-]{13,20})\s*(?:ยืนยัน)?\s*(?:ฉันคือ)?\s*(เยาวชน|ผู้ปกครอง|ผปค\.?|บิดา|มารดา|พ่อ|แม่|ผู้ดูแล)$/);
  if (reverseMatch) {
    var revDigits = reverseMatch[1].replace(/\D/g, "");
    var revRole = reverseMatch[2];
    if (revDigits.length === 13) {
      executeBindingAndReply(revDigits, revRole !== "เยาวชน");
      return;
    }
  }
  
  // 2. ตรวจสอบกรณีพิมพ์เลขบัตรประชาชน 13 หลักของเยาวชนเท่านั้น (เช่น 1234567890123 หรือ 1-2345-67890-12-3)
  var digitsOnly = normalizedText.replace(/\D/g, "");
  if (digitsOnly.length === 13 && /^[0-9\s\-]+$/.test(normalizedText)) {
    var matchedDef = null;
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId_(defendants[i].citizen_id) === digitsOnly) {
        matchedDef = defendants[i];
        break;
      }
    }
    
    // หากพบข้อมูลเยาวชนในฐานข้อมูลทะเบียนประวัติ tb_defendants ให้ส่งข้อความแจ้งเตือนพร้อมปุ่มเลือกสถานะ (Quick Reply)
    if (matchedDef && replyToken && accessToken) {
      var cases = getSheetData_("tb_cases");
      var matchedCaseNo = "-";
      for (var cIdx = 0; cIdx < cases.length; cIdx++) {
        if (cleanCitizenId_(cases[cIdx].citizen_id) === digitsOnly) {
          if (cases[cIdx].black_case) {
            matchedCaseNo = cases[cIdx].black_case.toString().trim();
            break;
          }
        }
      }

      // บันทึกเลขบัตรประชาชน 13 หลักที่ค้นพบไว้ใน tb_line_contacts ทันที (หากยังไม่ได้ผูกสถานะ จะบันทึกเป็น "รอยืนยันสถานะ")
      var contactsNow = getSheetData_("tb_line_contacts");
      var existingRoleForCid = "";
      for (var kIdx = 0; kIdx < contactsNow.length; kIdx++) {
        if (contactsNow[kIdx].line_user_id && contactsNow[kIdx].line_user_id.toString().trim() === userId) {
          if (cleanCitizenId_(contactsNow[kIdx].linked_citizen_id) === digitsOnly) {
            existingRoleForCid = (contactsNow[kIdx].linked_role || "").toString().trim();
          }
          break;
        }
      }
      upsertLineContactRecord_(userId, displayName, digitsOnly, digitsOnly, existingRoleForCid || "รอยืนยันสถานะ");
      
      var defFullName = ((matchedDef.title_name || "") + (matchedDef.first_name || "") + " " + (matchedDef.last_name || "")).trim() || ("เลขบัตร " + digitsOnly);
      var tpl = cfg.binding_prompt_template || getDefaultLineConfig_().binding_prompt_template;
      var promptText = renderLineMessageTemplate_(tpl, {
        defendant_name: defFullName,
        citizen_id: digitsOnly,
        black_case: matchedCaseNo
      });
      
      var quickReplyObj = {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: "👦 ฉันคือเยาวชน",
              text: "ยืนยันเยาวชน:" + digitsOnly
            }
          },
          {
            type: "action",
            action: {
              type: "message",
              label: "👨‍👩‍👦 ฉันคือผู้ปกครอง",
              text: "ยืนยันผู้ปกครอง:" + digitsOnly
            }
          }
        ]
      };
      
      // ส่งการ์ดปุ่มกดยืนยันขนาดใหญ่ในแชท (Flex Message) พร้อมปุ่มด่วน Quick Reply เพื่อให้กดยืนยันได้ง่ายและไม่หลุดหายบนทุกอุปกรณ์
      var flexPromptMessage = {
        type: "flex",
        altText: (promptText || "กรุณาเลือกสถานะเพื่อผูกบัญชี LINE").substring(0, 380),
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: promptText,
                wrap: true,
                size: "sm",
                color: "#1e293b"
              }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#06C755",
                height: "sm",
                action: {
                  type: "message",
                  label: "👦 ฉันคือเยาวชน",
                  text: "ยืนยันเยาวชน:" + digitsOnly
                }
              },
              {
                type: "button",
                style: "primary",
                color: "#0284c7",
                height: "sm",
                action: {
                  type: "message",
                  label: "👨‍👩‍👦 ฉันคือผู้ปกครอง",
                  text: "ยืนยันผู้ปกครอง:" + digitsOnly
                }
              }
            ]
          }
        },
        quickReply: quickReplyObj
      };
      
      var flexSent = sendLineReplyMessage_(replyToken, [flexPromptMessage], accessToken);
      if (!flexSent) {
        var fallbackTextMessage = {
          type: "text",
          text: promptText,
          quickReply: quickReplyObj
        };
        sendLineReplyMessage_(replyToken, [fallbackTextMessage], accessToken);
      }
      return;
    }
    
    // หากพิมพ์เลขบัตรประชาชน 13 หลักเข้ามา แต่ไม่พบในฐานข้อมูล tb_defendants ให้ส่งข้อความตอบกลับอัตโนมัติแจ้งว่าไม่พบข้อมูล
    if (!matchedDef && replyToken && accessToken) {
      upsertLineContactRecord_(userId, displayName, digitsOnly, "", "");
      var notFoundTpl = cfg.binding_not_found_template || getDefaultLineConfig_().binding_not_found_template;
      var notFoundText = renderLineMessageTemplate_(notFoundTpl, {
        citizen_id: digitsOnly
      });
      sendLineReplyMessage_(replyToken, [{ type: "text", text: notFoundText }], accessToken);
      return;
    }
    return;
  }
  
  // กรณีข้อความอื่นๆ ทุกกรณี (เช่น สวัสดี, สอบถาม, หรือข้อความทั่วไป): ไม่ต้องส่งข้อความตอบกลับอัตโนมัติ เพื่อให้เจ้าหน้าที่เปิดแชทสนทนาได้โดยตรง
}

/**
 * สกัดดึงชื่อผู้ให้คำปรึกษาประจำวันนัดหมายจากตาราง tb_appointment อย่างครอบคลุม
 * รองรับทั้ง appointment_counselor, counselor, ผู้ให้คำปรึกษา, ผู้รับผิดชอบ และชื่อหัวคอลัมน์ที่มีช่องว่าง
 */
function extractAppointmentCounselor_(row) {
  if (!row) return "";
  var candidates = [
    row.appointment_counselor,
    row.counselor,
    row["ผู้ให้คำปรึกษา"],
    row["ผู้ให้คำปรึกษาประจำวันนัด"],
    row["ผู้ให้คำปรึกษา/ผู้รับผิดชอบ"],
    row.counselor_name,
    row["ชื่อผู้ให้คำปรึกษา"],
    row.appointment_responsible_person,
    row["ผู้รับผิดชอบ"]
  ];
  for (var i = 0; i < candidates.length; i++) {
    var v = candidates[i];
    if (v !== undefined && v !== null && v.toString().trim() !== "") {
      return v.toString().trim();
    }
  }
  for (var k in row) {
    if (row.hasOwnProperty(k)) {
      var normK = k.toString().trim().toLowerCase().replace(/[\s_\-]/g, "");
      if (normK === "appointmentcounselor" || 
          normK === "counselor" || 
          normK === "ผู้ให้คำปรึกษา" || 
          normK === "ผู้ให้คำปรึกษาประจำวันนัด" || 
          normK === "counselorname" ||
          normK === "appointmentresponsibleperson" ||
          normK === "ผู้รับผิดชอบ") {
        var val = row[k];
        if (val !== undefined && val !== null && val.toString().trim() !== "") {
          return val.toString().trim();
        }
      }
    }
  }
  return "";
}

/**
 * ค้นหาชื่อผู้ให้คำปรึกษาจาก tb_appointment ตามเลขคดีและวันที่นัดหมาย ISO โดยตรง
 */
function findAppointmentCounselorByDate_(blackCase, targetIso, appointments) {
  if (!blackCase || !targetIso || !appointments) return "";
  var normTargetBc = normalizeBlackCaseKey_(blackCase);
  for (var i = 0; i < appointments.length; i++) {
    var ap = appointments[i];
    if (!ap.black_case || !ap.appointment_date) continue;
    if (normalizeBlackCaseKey_(ap.black_case) === normTargetBc) {
      var apDate = normalizeSheetDate_(ap.appointment_date);
      if (apDate) {
        var apIso = Utilities.formatDate(apDate, "GMT+7", "yyyy-MM-dd");
        if (apIso === targetIso) {
          var c = extractAppointmentCounselor_(ap);
          if (c) return c;
        }
      }
    }
  }
  return "";
}

/**
 * แปลงวันที่เป็นรูปแบบภาษาไทยสวยงาม เช่น "14 ส.ค. 2569"
 */
function formatThaiShortDateServer_(dateVal) {
  var d = normalizeSheetDate_(dateVal);
  if (!d) return "-";
  var thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  var day = d.getDate();
  var month = thaiMonths[d.getMonth()];
  var yearBE = d.getFullYear() + 543;
  return day + " " + month + " " + yearBE;
}

/**
 * แทนที่ตัวแปรใน Template ข้อความแจ้งเตือน
 */
function renderLineMessageTemplate_(templateStr, vars) {
  if (!templateStr) return "";
  var out = templateStr.toString();
  for (var k in vars) {
    if (vars.hasOwnProperty(k)) {
      var val = (vars[k] !== undefined && vars[k] !== null && vars[k] !== "") ? vars[k].toString() : "-";
      var regex = new RegExp("\\{" + k + "\\}", "g");
      out = out.replace(regex, val);
    }
  }
  return out;
}

/**
 * สร้างรายการนัดหมาย (tb_appointment) และกิจกรรม (tb_activity) ที่เชื่อมโยงกับเลขคดี -> เลขบัตรประชาชน -> ข้อมูลเยาวชน/ผู้ปกครอง
 */
function buildLineReminderItems_(daysAheadLimit, cfgMap) {
  var cfg = cfgMap || getLineConfigMap_();
  var cases = getSheetData_("tb_cases");
  var defendants = getSheetData_("tb_defendants");
  var appointments = getSheetData_("tb_appointment");
  var activities = getSheetData_("tb_activity");
  getOrCreateSheet_("tb_line_logs", ["log_id", "sent_date", "sent_at", "notify_type", "black_case", "citizen_id", "recipient_role", "recipient_name", "line_user_id", "target_date", "title", "status", "error_message"]);
  var logs = getSheetData_("tb_line_logs");
  
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayMs = today.getTime();
  var todayIso = Utilities.formatDate(today, "GMT+7", "yyyy-MM-dd");
  
  // 1. สร้าง Map เชื่อมโยง black_case -> ข้อมูลคดี
  var caseMap = {};
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    if (!c.black_case) continue;
    var exactKey = c.black_case.toString().trim().replace(/\s+/g, "").toLowerCase();
    var normKey = normalizeBlackCaseKey_(c.black_case);
    caseMap[exactKey] = c;
    if (normKey) caseMap[normKey] = c;
  }
  
  // 2. สร้าง Map เชื่อมโยง citizen_id -> ข้อมูลเยาวชนและผู้ปกครองใน tb_defendants (รวมค่า LINE กรณีมีแถวซ้ำ)
  var defMap = {};
  for (var i = 0; i < defendants.length; i++) {
    var d = defendants[i];
    var cid = cleanCitizenId_(d.citizen_id);
    if (cid) {
      if (!defMap[cid]) {
        var dCopy = {};
        for (var dk in d) {
          if (d.hasOwnProperty(dk)) dCopy[dk] = d[dk];
        }
        defMap[cid] = dCopy;
      } else {
        var ex = defMap[cid];
        if (!ex.line_user_id && d.line_user_id) ex.line_user_id = d.line_user_id;
        if ((!ex.line_id || ex.line_id === "-") && d.line_id) ex.line_id = d.line_id;
        if (!ex.line_chat_url && d.line_chat_url) ex.line_chat_url = d.line_chat_url;
        if (!ex.parent_line_user_id && d.parent_line_user_id) ex.parent_line_user_id = d.parent_line_user_id;
        if ((!ex.parent_line_id || ex.parent_line_id === "-") && d.parent_line_id) ex.parent_line_id = d.parent_line_id;
        if (!ex.parent_line_chat_url && d.parent_line_chat_url) ex.parent_line_chat_url = d.parent_line_chat_url;
      }
    }
  }
  
  // 3. สร้าง Map ตรวจสอบประวัติการส่งอัตโนมัติ (เฉพาะรอบ 08.00 น. รหัส AUTO8AM-) แยกจากการกดส่งเองแบบแมนนวล
  var sentTodayMap = {};
  var sentTodayByUidMap = {};
  var everSentMap = {};
  for (var i = 0; i < logs.length; i++) {
    var lg = logs[i];
    if (lg.status === "สำเร็จ") {
      var logIdStr = (lg.log_id || "").toString().trim();
      var isAuto8AmLog = (logIdStr.indexOf("AUTO8AM-") === 0);
      var lgSentDateIso = formatDateAsIso_(lg.sent_date) || (lg.sent_date ? lg.sent_date.toString().trim() : "");
      var lgTargetDateIso = formatDateAsIso_(lg.target_date) || (lg.target_date ? lg.target_date.toString().trim() : "");
      var lgSentAtStr = (lg.sent_at instanceof Date)
        ? Utilities.formatDate(lg.sent_at, "GMT+7", "yyyy-MM-dd HH:mm:ss")
        : (lg.sent_at || lgSentDateIso || "ส่งแล้ว").toString();
      var itemKey = (lg.notify_type || "") + "|" + normalizeBlackCaseKey_(lg.black_case) + "|" + lgTargetDateIso + "|" + (lg.recipient_role || "");
      everSentMap[itemKey] = lgSentAtStr + (isAuto8AmLog ? " (อัตโนมัติ 08.00 น.)" : " (กดส่งเอง)");
      // นับว่าส่งอัตโนมัติของวันนี้ไปแล้ว เฉพาะรายการที่ส่งจากระบบอัตโนมัติ 08.00 น. (AUTO8AM-) เท่านั้น
      // ส่วนที่เจ้าหน้าที่กดส่งทดสอบเองแบบแมนนวล จะไม่ถูกนำมาคิดรวม
      if (isAuto8AmLog && lgSentDateIso === todayIso) {
        sentTodayMap[itemKey] = true;
        var lgUid = (lg.line_user_id || "").toString().trim();
        if (lgUid && lgTargetDateIso) {
          sentTodayByUidMap[lgUid + "|" + lgTargetDateIso] = true;
        }
      }
    }
  }
  
  var maxDays = (daysAheadLimit !== undefined && daysAheadLimit !== null) ? parseInt(daysAheadLimit, 10) : 30;
  if (isNaN(maxDays)) maxDays = 30;
  
  var items = [];
  var seenEntryMap = {};
  var tParts = todayIso.split("-");
  var todayUtcMs = Date.UTC(parseInt(tParts[0], 10), parseInt(tParts[1], 10) - 1, parseInt(tParts[2], 10));
  
  // Helper สร้างข้อมูลผู้รับและข้อความ
  function createReminderEntry(type, bcRaw, targetDateObj, titleText, subTitleText, extraVars) {
    if (!bcRaw || !targetDateObj) return;
    var dCopy = new Date(targetDateObj.getTime());
    var targetDateIso = Utilities.formatDate(dCopy, "GMT+7", "yyyy-MM-dd");
    var dParts = targetDateIso.split("-");
    var targetUtcMs = Date.UTC(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
    var diffDays = Math.round((targetUtcMs - todayUtcMs) / 86400000);
    
    // แสดงตั้งแต่วันนี้ (diffDays >= 0) ไปจนถึง maxDays ข้างหน้า (หากผ่านวันที่ต้องแจ้งเตือนมาแล้วไม่ต้องแจ้งเตือนอีก)
    if (diffDays < 0 || diffDays > maxDays) return;
    
    var exactKey = bcRaw.toString().trim().replace(/\s+/g, "").toLowerCase();
    var normKey = normalizeBlackCaseKey_(bcRaw);
    
    // ป้องกันการสร้างรายการแจ้งเตือนซ้ำซ้อนในวันเดียวกันของคดีเดียวกันและประเภทเดียวกัน
    var uniqueEntryKey = type + "|" + normKey + "|" + targetDateIso;
    if (seenEntryMap[uniqueEntryKey]) {
      // หากมีรายการของวันเดียวกันถูกสร้างไว้ก่อนหน้า แต่รายการนั้นยังไม่มีชื่อผู้ให้คำปรึกษา แล้วรายการแถวนี้มี ให้ปรับปรุงชื่อให้สมบูรณ์
      if (type === "appointment" && extraVars && extraVars.counselor) {
        for (var it = 0; it < items.length; it++) {
          if (items[it].id && items[it].id.indexOf(type + "_" + normKey + "_" + targetDateIso) === 0) {
            if (!items[it].counselor || items[it].counselor === "-") {
              items[it].counselor = extraVars.counselor;
              items[it].subtitle = "เวลา: " + (extraVars.appointment_time || "-") + " | ผู้ให้คำปรึกษา: " + extraVars.counselor;
              var tVars = {
                black_case: bcRaw.toString().trim(),
                citizen_id: cid || "-",
                defendant_name: defName,
                nick_name: (matchedDef && matchedDef.nick_name) ? matchedDef.nick_name : "-",
                guardian_name: guardianName,
                days_remaining: daysLabel,
                counselor: extraVars.counselor,
                appointment_date: extraVars.appointment_date || "-",
                appointment_time: extraVars.appointment_time || "-",
                appointment_reason: extraVars.appointment_reason || "-"
              };
              items[it].message_text = renderLineMessageTemplate_(cfg.appointment_template, tVars);
            }
            break;
          }
        }
      }
      return;
    }
    seenEntryMap[uniqueEntryKey] = true;
    
    var matchedCase = caseMap[exactKey] || caseMap[normKey] || null;
    var cid = matchedCase ? cleanCitizenId_(matchedCase.citizen_id) : "";
    var matchedDef = cid ? (defMap[cid] || null) : null;
    
    var defName = matchedDef ? ((matchedDef.title_name || "") + (matchedDef.first_name || "") + " " + (matchedDef.last_name || "")).trim() : "ไม่พบชื่อเยาวชนในระบบ";
    var guardianName = matchedDef ? (matchedDef.guardian_name || "-") : "-";
    var lineId = matchedDef ? (matchedDef.line_id || "").toString().trim() : "";
    var lineUserId = matchedDef ? (matchedDef.line_user_id || "").toString().trim() : "";
    var parentLineId = matchedDef ? (matchedDef.parent_line_id || "").toString().trim() : "";
    var parentLineUserId = matchedDef ? (matchedDef.parent_line_user_id || "").toString().trim() : "";
    
    // หากช่อง line_id เผลอใส่เป็นรหัส U... 33 หลักมา ให้ใช้ส่ง API ได้ด้วย
    if (!lineUserId && /^U[0-9a-fA-F]{32}$/.test(lineId)) {
      lineUserId = lineId;
    }
    if (!parentLineUserId && /^U[0-9a-fA-F]{32}$/.test(parentLineId)) {
      parentLineUserId = parentLineId;
    }
    
    var daysLabel = diffDays === 0
      ? "วันนี้ (วันนัดหมาย)"
      : (diffDays === 1
          ? "พรุ่งนี้ (ล่วงหน้า 1 วัน)"
          : (diffDays === 7 ? "ล่วงหน้า 1 สัปดาห์ (7 วัน)" : "อีก " + diffDays + " วัน"));
    
    // ผู้ให้คำปรึกษา: หากเป็นวันนัดหมาย (type === "appointment") ให้ระบุชื่อจาก appointment_counselor ในตาราง tb_appointment ที่ตรงกับวันนัดที่จะทำการแจ้งเตือนเท่านั้น
    var resolvedCounselor = "-";
    if (type === "appointment") {
      resolvedCounselor = (extraVars && extraVars.counselor) ? extraVars.counselor.toString().trim() : "";
      if (!resolvedCounselor) {
        resolvedCounselor = findAppointmentCounselorByDate_(bcRaw, targetDateIso, appointments);
      }
      if (!resolvedCounselor) {
        resolvedCounselor = "-";
      }
      if (resolvedCounselor !== "-" && subTitleText.indexOf("ผู้ให้คำปรึกษา:") === -1) {
        subTitleText = "เวลา: " + (extraVars.appointment_time || "-") + " | ผู้ให้คำปรึกษา: " + resolvedCounselor;
      }
    } else {
      resolvedCounselor = (extraVars && extraVars.counselor) ? extraVars.counselor.toString().trim() : (matchedCase && matchedCase.counselor ? matchedCase.counselor.toString().trim() : "-");
    }
    
    var templateVars = {
      black_case: bcRaw.toString().trim(),
      citizen_id: cid || "-",
      defendant_name: defName,
      nick_name: (matchedDef && matchedDef.nick_name) ? matchedDef.nick_name : "-",
      guardian_name: guardianName,
      days_remaining: daysLabel,
      counselor: resolvedCounselor,
      appointment_date: extraVars.appointment_date || "-",
      appointment_time: extraVars.appointment_time || "-",
      appointment_reason: extraVars.appointment_reason || "-",
      activity_name: extraVars.activity_name || "-",
      activity_type: extraVars.activity_type || "",
      activity_start_date: extraVars.activity_start_date || "-",
      activity_finish_date: extraVars.activity_finish_date || "-",
      activity_venue: extraVars.activity_venue || "-",
      activity_responsible_agency: extraVars.activity_responsible_agency || "-"
    };
    
    var rawTpl = (type === "activity") ? cfg.activity_template : cfg.appointment_template;
    var renderedMsg = renderLineMessageTemplate_(rawTpl, templateVars);
    
    var youthKey = type + "|" + normKey + "|" + targetDateIso + "|เยาวชน";
    var parentKey = type + "|" + normKey + "|" + targetDateIso + "|ผู้ปกครอง";
    var youthSentToday = !!sentTodayMap[youthKey] || !!(lineUserId && sentTodayByUidMap[lineUserId + "|" + targetDateIso]);
    var parentSentToday = !!sentTodayMap[parentKey] || !!(parentLineUserId && sentTodayByUidMap[parentLineUserId + "|" + targetDateIso]);
    
    items.push({
      id: type + "_" + normKey + "_" + targetDateIso + "_" + items.length,
      notify_type: type,
      notify_type_label: type === "activity" ? "กิจกรรม (tb_activity)" : "วันนัดหมาย (tb_appointment)",
      black_case: bcRaw.toString().trim(),
      citizen_id: cid,
      defendant_name: defName,
      guardian_name: guardianName,
      target_date_iso: targetDateIso,
      target_date_thai: formatThaiShortDateServer_(dCopy),
      diff_days: diffDays,
      days_label: daysLabel,
      title: titleText,
      subtitle: subTitleText,
      counselor: resolvedCounselor,
      line_id: lineId,
      line_user_id: lineUserId,
      parent_line_id: parentLineId,
      parent_line_user_id: parentLineUserId,
      line_chat_url: matchedDef ? (matchedDef.line_chat_url || "").toString().trim() : "",
      parent_line_chat_url: matchedDef ? (matchedDef.parent_line_chat_url || "").toString().trim() : "",
      youth_sent_today: youthSentToday,
      parent_sent_today: parentSentToday,
      youth_last_sent: everSentMap[youthKey] || "",
      parent_last_sent: everSentMap[parentKey] || "",
      message_text: renderedMsg
    });
  }
  
  // 4. กวาดข้อมูลจากตาราง tb_appointment
  for (var i = 0; i < appointments.length; i++) {
    var ap = appointments[i];
    if (!ap.black_case || !ap.appointment_date) continue;
    var apDate = normalizeSheetDate_(ap.appointment_date);
    if (!apDate) continue;
    var apTimeStr = safeStr_(ap.appointment_time) || "-";
    var apReasonStr = safeStr_(ap.appointment_reason) || "นัดหมายตามกำหนด";
    // กรณีที่ appointment_reason เท่ากับ "เก็บข้อมูลเบื้องต้น" ไม่ต้องทำการแจ้งเตือนข้อความในวันนั้นๆ
    if (apReasonStr.replace(/\s+/g, "") === "เก็บข้อมูลเบื้องต้น") continue;
    
    // ดึงชื่อผู้ให้คำปรึกษาจาก appointment_counselor ในตาราง tb_appointment ที่ตรงกับวันนัดหมายนี้
    var apCounselorStr = extractAppointmentCounselor_(ap);
    
    createReminderEntry(
      "appointment",
      ap.black_case,
      apDate,
      apReasonStr,
      "เวลา: " + apTimeStr + (apCounselorStr ? " | ผู้ให้คำปรึกษา: " + apCounselorStr : ""),
      {
        appointment_date: formatThaiShortDateServer_(apDate),
        appointment_time: apTimeStr,
        appointment_reason: apReasonStr,
        counselor: apCounselorStr
      }
    );
  }
  
  // 5. กวาดข้อมูลจากตาราง tb_activity
  for (var i = 0; i < activities.length; i++) {
    var ac = activities[i];
    if (!ac.black_case || !ac.activity_start_date) continue;
    var acStartDate = normalizeSheetDate_(ac.activity_start_date);
    if (!acStartDate) continue;
    var acFinishDate = normalizeSheetDate_(ac.activity_finish_date);
    var acNameStr = safeStr_(ac.activity_name) || "เข้าร่วมกิจกรรม/โครงการ";
    var acTypeStr = safeStr_(ac.activity_type) || "";
    var acVenueStr = safeStr_(ac.activity_venue) || "-";
    var acAgencyStr = safeStr_(ac.activity_responsible_agency) || "-";
    
    createReminderEntry(
      "activity",
      ac.black_case,
      acStartDate,
      acNameStr + (acTypeStr ? " (" + acTypeStr + ")" : ""),
      "สถานที่: " + acVenueStr + " | หน่วยงาน: " + acAgencyStr,
      {
        activity_name: acNameStr,
        activity_type: acTypeStr ? "(" + acTypeStr + ")" : "",
        activity_start_date: formatThaiShortDateServer_(acStartDate),
        activity_finish_date: acFinishDate ? formatThaiShortDateServer_(acFinishDate) : formatThaiShortDateServer_(acStartDate),
        activity_venue: acVenueStr,
        activity_responsible_agency: acAgencyStr
      }
    );
  }
  
  // เรียงลำดับตามวันที่ใกล้ถึงที่สุดก่อน
  items.sort(function(a, b) {
    if (a.diff_days !== b.diff_days) return a.diff_days - b.diff_days;
    return a.black_case.localeCompare(b.black_case);
  });
  
  return items;
}

/**
 * ทำความสะอาดแถวข้อมูลจำลอง (Stub / Placeholder) ที่อาจเคยถูกสร้างขึ้นชั่วคราวใน tb_defendants
 * เช่น แถวที่มีชื่อขึ้นต้นด้วย "เยาวชนคดี", "เยาวชนเลขบัตร", "รอระบุชื่อ" โดยไม่มีนามสกุล
 */
function cleanupStubDefendantRows_() {
  try {
    var rows = getSheetData_("tb_defendants");
    var toDelete = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var fn = (r.first_name || "").toString().trim();
      var ln = (r.last_name || "").toString().trim();
      if (/^(?:เยาวชนคดี|เยาวชนเลขบัตร|รอระบุชื่อ)/.test(fn) && !ln) {
        toDelete.push(r.rowNum);
      }
    }
    if (toDelete.length > 0) {
      var ss = getSpreadsheet_();
      var defSheet = ss.getSheetByName("tb_defendants");
      if (!defSheet) return;
      toDelete.sort(function(a, b) { return b - a; });
      for (var d = 0; d < toDelete.length; d++) {
        defSheet.deleteRow(toDelete[d]);
      }
      clearSheetCache_("tb_defendants");
      Logger.log("Cleaned up " + toDelete.length + " stub rows from tb_defendants.");
    }
  } catch (err) {
    Logger.log("cleanupStubDefendantRows error: " + err.toString());
  }
}

/**
 * โหลดข้อมูลหน้าจัดการแจ้งเตือน LINE OA ทั้งหมด (สำหรับ Admin และ นักจิตวิทยา)
 */
function getLineOaModuleData(daysAhead, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "เฉพาะผู้ดูแลระบบ (Admin) และนักจิตวิทยาเท่านั้นที่สามารถเข้าถึงการตั้งค่าระบบแจ้งเตือน LINE OA ได้" };
  }
  
  try {
    var cfg = getLineConfigMap_();
    try {
      checkAndRunDailyLineNotificationsAuto_(cfg);
    } catch (autoErr) {
      Logger.log("Auto run in getLineOaModuleData error: " + autoErr.toString());
    }

    // 1. อ่านข้อมูล tb_defendants และ tb_line_contacts เพื่อตรวจสอบความสอดคล้อง
    cleanupStubDefendantRows_();
    var defendants = getSheetData_("tb_defendants");
    var allContacts = getSheetData_("tb_line_contacts");
    
    var defMap = {};
    var defLineUidMap = {};
    for (var dIdx = 0; dIdx < defendants.length; dIdx++) {
      var dCid = cleanCitizenId_(defendants[dIdx].citizen_id);
      if (!dCid) continue;
      defMap[dCid] = defendants[dIdx];
      if (!defLineUidMap[dCid]) defLineUidMap[dCid] = { youth: "", parent: "" };
      var yUid = (defendants[dIdx].line_user_id || "").toString().trim();
      var pUid = (defendants[dIdx].parent_line_user_id || "").toString().trim();
      if (yUid) defLineUidMap[dCid].youth = yUid;
      if (pUid) defLineUidMap[dCid].parent = pUid;
    }

    var anyReconciled = false;

    // 2. ตรวจสอบความถูกต้องของการผูกบัญชีใน tb_line_contacts กับ tb_defendants
    for (var rIdx = 0; rIdx < allContacts.length; rIdx++) {
      var rCt = allContacts[rIdx];
      var rUid = (rCt.line_user_id || "").toString().trim();
      var rName = (rCt.display_name || "").toString().trim();
      var rCid = cleanCitizenId_(rCt.linked_citizen_id);
      var rRole = (rCt.linked_role || "").toString().trim();
      var rLastMsg = (rCt.last_message || "").toString().trim();
      if (!rUid) continue;

      if (!rCid && !rRole && rLastMsg.indexOf("ยกเลิก") === -1) {
        var confM = rLastMsg.match(/^ยืนยัน(เยาวชน|ผู้ปกครอง):(\d{13})$/);
        if (confM) {
          var recRoleLabel = confM[1];
          var recCid = confM[2];
          var recIsParent = (recRoleLabel === "ผู้ปกครอง");
          if (defMap[recCid]) {
            var saveRes = saveLineBindingToDefendantsSheet_(recCid, rUid, rName, recIsParent, "");
            if (saveRes.matched) {
              rCt.linked_citizen_id = recCid;
              rCt.linked_role = recRoleLabel;
              updateRowInSheet_("tb_line_contacts", rCt.rowNum, {
                linked_citizen_id: recCid,
                linked_role: recRoleLabel
              });
              if (!defLineUidMap[recCid]) defLineUidMap[recCid] = { youth: "", parent: "" };
              if (recIsParent) defLineUidMap[recCid].parent = rUid;
              else defLineUidMap[recCid].youth = rUid;
              anyReconciled = true;
            }
          }
        } else {
          var pendingM = rLastMsg.match(/^(\d{13})$/);
          if (pendingM) {
            var pendingCid = pendingM[1];
            if (defMap[pendingCid]) {
              rCt.linked_citizen_id = pendingCid;
              rCt.linked_role = "รอยืนยันสถานะ";
              updateRowInSheet_("tb_line_contacts", rCt.rowNum, {
                linked_citizen_id: pendingCid,
                linked_role: "รอยืนยันสถานะ"
              });
            }
          }
        }
      } else if (rCid && rRole !== "รอยืนยันสถานะ") {
        var isParent = (rRole === "ผู้ปกครอง" || rRole === "parent");
        if (!defLineUidMap[rCid]) {
          // หากเลขบัตรนี้ไม่มีใน tb_defendants ให้ล้างค่าผูกใน tb_line_contacts ให้ตรงกัน
          var oldLastMsg = (rCt.last_message || "").toString().trim();
          var updatedLastMsg = /^ยืนยัน(เยาวชน|ผู้ปกครอง):/.test(oldLastMsg) ? (oldLastMsg + " (ไม่พบในทะเบียนประวัติ)") : oldLastMsg;
          rCt.linked_citizen_id = "";
          rCt.linked_role = "";
          rCt.last_message = updatedLastMsg;
          updateRowInSheet_("tb_line_contacts", rCt.rowNum, {
            linked_citizen_id: "",
            linked_role: "",
            last_message: updatedLastMsg
          });
          anyReconciled = true;
        } else {
          var expectedUid = isParent ? defLineUidMap[rCid].parent : defLineUidMap[rCid].youth;
          if (!expectedUid || expectedUid !== rUid) {
            var oldLastMsg = (rCt.last_message || "").toString().trim();
            var updatedLastMsg = /^ยืนยัน(เยาวชน|ผู้ปกครอง):/.test(oldLastMsg) ? (oldLastMsg + " (ยกเลิกผูกแล้ว)") : oldLastMsg;
            rCt.linked_citizen_id = "";
            rCt.linked_role = "";
            rCt.last_message = updatedLastMsg;
            updateRowInSheet_("tb_line_contacts", rCt.rowNum, {
              linked_citizen_id: "",
              linked_role: "",
              last_message: updatedLastMsg
            });
            anyReconciled = true;
          }
        }
      }
    }

    if (anyReconciled) {
      clearSheetCache_("tb_defendants");
      clearSheetCache_("tb_line_contacts");
    }

    // 3. ดึงรายการแจ้งเตือนที่จะถึง (เรียกครั้งเดียว)
    var upcomingList = buildLineReminderItems_(daysAhead || 30, cfg);
    
    // 4. ดึง Logs ประวัติการส่งล่าสุด 100 รายการ
    var allLogs = getSheetData_("tb_line_logs");
    allLogs.sort(function(a, b) {
      return (b.rowNum || 0) - (a.rowNum || 0);
    });
    var recentLogs = allLogs.slice(0, 100);

    allContacts.sort(function(a, b) {
      return (b.rowNum || 0) - (a.rowNum || 0);
    });
    
    return {
      success: true,
      config: maskLineConfigForClient_(cfg),
      upcomingList: sanitizeObjectForSerialization_(upcomingList),
      logs: sanitizeObjectForSerialization_(recentLogs),
      contacts: sanitizeObjectForSerialization_(allContacts.slice(0, 100))
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดข้อมูลระบบแจ้งเตือน LINE OA: " + e.toString() };
  }
}

var LINE_SECRET_MASK_ = "••••••••••••••••••••••••••••••••";

function isMaskedSecretValue_(val) {
  var s = (val || "").toString().trim();
  return s.indexOf("••••") !== -1 || s === "__MASKED__";
}

function maskLineConfigForClient_(cfg) {
  var safeCfg = {};
  if (!cfg) return safeCfg;
  var keys = Object.keys(cfg);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "channel_access_token" || k === "channel_secret") {
      var raw = (cfg[k] || "").toString().trim();
      safeCfg[k] = raw ? LINE_SECRET_MASK_ : "";
      safeCfg["has_" + k] = !!raw;
    } else {
      safeCfg[k] = cfg[k];
    }
  }
  return safeCfg;
}

/**
 * บันทึกการตั้งค่า LINE OA และข้อความเทมเพลตล่วงหน้า (เฉพาะ Admin และ นักจิตวิทยา)
 */
function saveLineOaSettings(newConfig, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินและนักจิตวิทยาเท่านั้นที่สามารถแก้ไขข้อความตั้งค่าล่วงหน้าได้" };
  }
  
  try {
    // หากผู้ใช้เผลอวางลิงก์เต็ม https://chat.line.biz/Uxxxx/chat/... ในช่อง oa_bot_id ให้สกัดเฉพาะรหัสบัญชี Uxxxx ของ chat.line.biz ออกมา
    if (newConfig.oa_bot_id !== undefined && newConfig.oa_bot_id !== null) {
      var rawBotVal = newConfig.oa_bot_id.toString().trim();
      var chatBizMatch = rawBotVal.match(/chat\.line\.biz\/(U[0-9a-fA-F]{32})/i);
      if (chatBizMatch) {
        newConfig.oa_bot_id = chatBizMatch[1];
      }
    }

    var currentCfg = getLineConfigMap_();
    var keysToSave = [
      "oa_basic_id",
      "oa_bot_id",
      "channel_access_token",
      "channel_secret",
      "auto_send_enabled",
      "days_before_notify",
      "appointment_template",
      "activity_template",
      "binding_prompt_template",
      "binding_success_template",
      "binding_not_found_template"
    ];
    
    for (var i = 0; i < keysToSave.length; i++) {
      var k = keysToSave[i];
      if (newConfig[k] !== undefined) {
        if (k === "channel_access_token" || k === "channel_secret") {
          if (isMaskedSecretValue_(newConfig[k])) {
            continue; // ข้ามค่าที่ถูก Mask ไว้ เพื่อคงค่ากุญแจลับเดิมในฐานข้อมูล
          }
          if (userSession.role !== "admin" && String(newConfig[k] || "").trim() !== String(currentCfg[k] || "").trim()) {
            continue; // เฉพาะแอดมินเท่านั้นที่สามารถเปลี่ยนคีย์เชื่อมต่อ API ได้
          }
        }
        saveSingleLineConfigValue_(k, newConfig[k], userSession.fullName || userSession.username);
      }
    }
    
    // ตรวจสอบการเชื่อมต่อกับ LINE Messaging API และดึง oa_bot_id / oa_basic_id อัตโนมัติ
    var botInfoMsg = "";
    var updatedCfg = getLineConfigMap_();
    var activeToken = (updatedCfg.channel_access_token || "").toString().trim();
    if (activeToken && !isMaskedSecretValue_(newConfig.channel_access_token)) {
      var botInfo = fetchLineBotInfo_(activeToken);
      if (botInfo) {
        if (botInfo.basicId) {
          saveSingleLineConfigValue_("oa_basic_id", botInfo.basicId, "line_api");
          updatedCfg.oa_basic_id = botInfo.basicId;
        }
        botInfoMsg = " (เชื่อมต่อกับบัญชี LINE OA: " + (botInfo.displayName || botInfo.basicId || "") + " สำเร็จ!)";
      }
    }

    // หากเปิดระบบส่งแจ้งเตือนอัตโนมัติ ให้ติดตั้ง/อัปเดต Time Trigger อัตโนมัติบน Google Cloud ทันที
    if (newConfig.auto_send_enabled === "true") {
      try {
        installDailyLineTriggerInternal_();
      } catch (trigErr) {
        Logger.log("Auto trigger install error: " + trigErr.toString());
      }
    }
    
    return {
      success: true,
      message: "บันทึกการตั้งค่าและข้อความแจ้งเตือนอัตโนมัติเรียบร้อยแล้ว" + botInfoMsg,
      config: maskLineConfigForClient_(updatedCfg)
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า: " + e.toString() };
  }
}

/**
 * ส่งข้อความแจ้งเตือนนัดหมาย/กิจกรรม รายรายการ (หรือส่งด่วนถึงเยาวชน/ผู้ปกครอง)
 */
function sendSingleLineReminder(itemData, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist" && userSession.role !== "counselor") {
    return { success: false, message: "ไม่มีสิทธิ์ในการส่งข้อความแจ้งเตือน" };
  }
  
  try {
    var cfg = getLineConfigMap_();
    var accessToken = (cfg.channel_access_token || "").toString().trim();
    if (!accessToken) {
      return {
        success: false,
        message: "ยังไม่ได้ตั้งค่า Channel Access Token ของ LINE OA (@012cryec) กรุณาไปที่แท็บ 'ตั้งค่าการเชื่อมต่อ LINE OA' เพื่อใส่รหัสเชื่อมต่อก่อนครับ"
      };
    }
    
    getOrCreateSheet_("tb_line_logs", ["log_id", "sent_date", "sent_at", "notify_type", "black_case", "citizen_id", "recipient_role", "recipient_name", "line_user_id", "target_date", "title", "status", "error_message"]);
    
    var now = new Date();
    var todayIso = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
    var nowTimeStr = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss");
    
    var msgText = (itemData.message_text || "").toString().trim();
    if (!msgText) {
      return { success: false, message: "ข้อความแจ้งเตือนห้ามเป็นค่าว่าง" };
    }
    
    var targets = [];
    var targetRoleFilter = itemData.target_role || "both"; // 'youth', 'parent', or 'both'
    
    if ((targetRoleFilter === "both" || targetRoleFilter === "youth") && itemData.line_user_id) {
      targets.push({
        role: "เยาวชน",
        name: itemData.defendant_name || "-",
        uid: itemData.line_user_id.toString().trim()
      });
    }
    if ((targetRoleFilter === "both" || targetRoleFilter === "parent") && itemData.parent_line_user_id) {
      targets.push({
        role: "ผู้ปกครอง",
        name: itemData.guardian_name || "-",
        uid: itemData.parent_line_user_id.toString().trim()
      });
    }
    
    if (targets.length === 0) {
      return {
        success: false,
        message: "เยาวชนและผู้ปกครองในคดีนี้ยังไม่ได้ผูก LINE User ID (U...) กับ LINE OA (@012cryec) กรุณาให้เยาวชน/ผู้ปกครองแอดไลน์ @012cryec แล้วพิมพ์เลขบัตรประชาชน 13 หลักของเยาวชน เพื่อผูกบัญชีก่อนครับ"
      };
    }
    
    var sentCount = 0;
    var errors = [];
    
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var pushRes = sendLinePushMessage_(t.uid, msgText, accessToken);
      appendRowToSheet_("tb_line_logs", {
        log_id: "MANUAL-" + now.getTime() + "-" + i,
        sent_date: todayIso,
        sent_at: nowTimeStr,
        notify_type: itemData.notify_type || "manual",
        black_case: itemData.black_case || "-",
        citizen_id: itemData.citizen_id || "-",
        recipient_role: t.role,
        recipient_name: t.name,
        line_user_id: t.uid,
        target_date: itemData.target_date_iso || todayIso,
        title: itemData.title || "แจ้งเตือนนัดหมาย",
        status: pushRes.success ? "สำเร็จ" : "ไม่สำเร็จ",
        error_message: pushRes.success ? "" : pushRes.message
      });
      if (pushRes.success) {
        sentCount++;
      } else {
        errors.push(t.role + ": " + pushRes.message);
      }
    }
    
    clearSheetCache_("tb_line_logs");
    
    if (sentCount > 0) {
      return {
        success: true,
        message: "ส่งข้อความแจ้งเตือนผ่าน LINE OA สำเร็จ (" + sentCount + " บัญชี | ไม่นับรวมกับรอบอัตโนมัติ 08.00 น.)" + (errors.length > 0 ? " | ข้อผิดพลาดบางส่วน: " + errors.join(", ") : "")
      };
    } else {
      return {
        success: false,
        message: "ส่งข้อความไม่สำเร็จ: " + errors.join(", ")
      };
    }
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการส่งข้อความ LINE: " + e.toString() };
  }
}

/**
 * ฟังก์ชันรันการส่งแจ้งเตือนอัตโนมัติประจำวัน เวลา 08.00 น. [ทริกเกอร์ช่วง 07.00 - 08.00 น. ไม่เกิน 08.00 น.] (หรือกดสั่งทดสอบด้วยตนเองโดยเจ้าหน้าที่)
 * เงื่อนไข:
 * 1. แจ้งเตือนเฉพาะ: ก่อนวันนัด 1 สัปดาห์ (7 วัน), ก่อนวันนัด 1 วัน (1 วัน), และในวันนัดหมาย (0 วัน)
 * 2. รอบอัตโนมัติ 08.00 น. (เมื่อไม่มี token): ส่งเฉพาะในช่วงเวลา 07.00 - 08.00 น. เพียง 1 ครั้งต่อวัน (ห้ามส่งเกิน 08.00 น.) และไม่นำการกดส่งเองแบบแมนนวลมาคิดรวม
 * 3. รอบกดส่งเองโดยเจ้าหน้าที่ (เมื่อมี token): ส่งทดสอบได้ตลอดเวลาโดยไม่ไปบล็อกหรือตัดสิทธิ์รอบอัตโนมัติ 08.00 น.
 * 4. ยกเว้นรายการที่ appointment_reason เท่ากับ "เก็บข้อมูลเบื้องต้น"
 */
function runDailyLineNotifications(token) {
  var userSession = verifySessionToken_(token);
  if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
    return { success: false, message: "เฉพาะแอดมินและนักจิตวิทยาเท่านั้นที่สามารถสั่งรันระบบแจ้งเตือนได้" };
  }
  return runDailyLineNotificationsCore_(true);
}

function runDailyLineNotificationsCore_(isManualTrigger) {
  
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    if (!isManualTrigger) {
      try {
        hasLock = lock.tryLock(25000);
      } catch (lockErr) {}
      if (!hasLock) return { success: false, message: "กำลังรันการแจ้งเตือนอัตโนมัติอยู่ในขณะนี้" };
      clearSheetCache_();
    }
    
    var now = new Date();
    var todayIso = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
    var nowTimeStr = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss");
    var cfg = getLineConfigMap_();
    
    if (!isManualTrigger) {
      // ตรวจสอบซ้ำอีกครั้งภายใต้ Lock ว่าวันนี้ส่งรอบอัตโนมัติไปแล้วหรือยัง
      var lastRunVal = (cfg.last_auto_8am_run_date || "").toString().trim();
      if (lastRunVal === "AUTO8AM_" + todayIso) {
        return { success: true, message: "วันนี้ส่งแจ้งเตือนอัตโนมัติรอบประจำวันไปเรียบร้อยแล้ว", totalSent: 0, totalMatched: 0 };
      }
      var currentHour = parseInt(Utilities.formatDate(now, "GMT+7", "HH"), 10);
      // อนุญาตให้ส่งแจ้งเตือนอัตโนมัติประจำวันเฉพาะช่วงเวลากลางวัน (06.00 - 18.00 น.) ป้องกันการรบกวนผู้รับเวลากลางคืน
      if (currentHour < 6 || currentHour >= 18) {
        return { success: false, message: "นอกช่วงเวลาส่งแจ้งเตือนอัตโนมัติประจำวัน (ระบบอนุญาตช่วงเวลา 06.00 - 18.00 น.)" };
      }
    }
    
    var accessToken = (cfg.channel_access_token || "").toString().trim();
    if (!accessToken) {
      return { success: false, message: "ยังไม่ได้ตั้งค่า Channel Access Token ในระบบ" };
    }
    
    // แปลงค่า days_before_notify เช่น "0, 1, 7" -> { 0: true, 1: true, 7: true }
    // ป้องกันกรณี Google Sheets แปลง "0,1,7" เป็นตัวเลข 17 หรือ "1,3" เป็น 13
    var rawDaysCfg = (cfg.days_before_notify || "0, 1, 7").toString().replace(/^'/, "").trim();
    var compactDays = rawDaysCfg.replace(/\s+/g, "");
    if (!compactDays || compactDays === "17" || compactDays === "13" || compactDays === "1,3" || compactDays === "1.3" || compactDays === "0,1,7") {
      rawDaysCfg = "0, 1, 7";
    }
    var dayParts = rawDaysCfg.split(",");
    var targetDaysMap = {};
    var maxDay = 7;
    for (var i = 0; i < dayParts.length; i++) {
      var dNum = parseInt(dayParts[i].trim(), 10);
      if (!isNaN(dNum) && dNum >= 0) {
        targetDaysMap[dNum] = true;
        if (dNum > maxDay) maxDay = dNum;
      }
    }
    
    var items = buildLineReminderItems_(maxDay + 2, cfg);
    var totalSent = 0;
    var totalMatched = 0;
    var failMessages = [];
    var sentInThisRunMap = {};
    var logPrefix = isManualTrigger ? "MANUAL-BATCH-" : "AUTO8AM-";
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!targetDaysMap[item.diff_days]) continue;
      totalMatched++;
      
      // ส่งหาเยาวชน:
      // - หากรันอัตโนมัติ 08.00 น. (!isManualTrigger): เช็คว่าวันนี้ระบบอัตโนมัติ 08.00 น. เคยส่งให้หรือยัง (!item.youth_sent_today)
      // - หากเจ้าหน้าที่กดส่งเอง (isManualTrigger): ส่งได้ทันทีโดยไม่นำประวัติการส่งก่อนหน้ามาบล็อก และไม่ไปบล็อกรอบ 08.00 น.
      var yBatchKey = item.line_user_id + "|" + item.target_date_iso;
      var canSendYouth = item.line_user_id && !sentInThisRunMap[yBatchKey] && (isManualTrigger || !item.youth_sent_today);
      if (canSendYouth) {
        sentInThisRunMap[yBatchKey] = true;
        var resY = sendLinePushMessage_(item.line_user_id, item.message_text, accessToken);
        appendRowToSheet_("tb_line_logs", {
          log_id: logPrefix + now.getTime() + "-Y" + i,
          sent_date: todayIso,
          sent_at: nowTimeStr,
          notify_type: item.notify_type,
          black_case: item.black_case,
          citizen_id: item.citizen_id,
          recipient_role: "เยาวชน",
          recipient_name: item.defendant_name,
          line_user_id: item.line_user_id,
          target_date: item.target_date_iso,
          title: item.title,
          status: resY.success ? "สำเร็จ" : "ไม่สำเร็จ",
          error_message: resY.success ? "" : resY.message
        });
        if (resY.success) {
          totalSent++;
        } else {
          failMessages.push(resY.message);
        }
      }
      
      // ส่งหาผู้ปกครอง:
      var pBatchKey = item.parent_line_user_id + "|" + item.target_date_iso;
      var canSendParent = item.parent_line_user_id && !sentInThisRunMap[pBatchKey] && (isManualTrigger || !item.parent_sent_today);
      if (canSendParent) {
        sentInThisRunMap[pBatchKey] = true;
        var resP = sendLinePushMessage_(item.parent_line_user_id, item.message_text, accessToken);
        appendRowToSheet_("tb_line_logs", {
          log_id: logPrefix + now.getTime() + "-P" + i,
          sent_date: todayIso,
          sent_at: nowTimeStr,
          notify_type: item.notify_type,
          black_case: item.black_case,
          citizen_id: item.citizen_id,
          recipient_role: "ผู้ปกครอง",
          recipient_name: item.guardian_name,
          line_user_id: item.parent_line_user_id,
          target_date: item.target_date_iso,
          title: item.title,
          status: resP.success ? "สำเร็จ" : "ไม่สำเร็จ",
          error_message: resP.success ? "" : resP.message
        });
        if (resP.success) {
          totalSent++;
        } else {
          failMessages.push(resP.message);
        }
      }
    }
    
    clearSheetCache_("tb_line_logs");
    // บันทึกสถานะว่ารันรอบอัตโนมัติ 08.00 น. ของวันนี้ไปแล้ว เฉพาะเมื่อเป็นการรันอัตโนมัติเท่านั้น (ไม่รวมกรณีเจ้าหน้าที่กดปุ่มเอง)
    if (!isManualTrigger) {
      saveSingleLineConfigValue_("last_auto_8am_run_date", "AUTO8AM_" + todayIso, "auto_8am_scheduler");
      try {
        SpreadsheetApp.flush();
      } catch (flushErr) {}
    }
    
    var modeLabel = isManualTrigger ? "[ส่งแบบแมนนวลโดยเจ้าหน้าที่ - ไม่คิดรวมกับรอบอัตโนมัติ 08.00 น.] " : "[ระบบอัตโนมัติ 08.00 น.] ";
    var failSuffix = failMessages.length > 0 ? (" | ส่งไม่สำเร็จ " + failMessages.length + " รายการ (" + failMessages[0] + ")") : "";
    return {
      success: failMessages.length === 0 || totalSent > 0,
      message: modeLabel + "ตรวจสอบนัดหมายตามเกณฑ์ (ล่วงหน้า " + rawDaysCfg + " วัน ยกเว้นนัดเก็บข้อมูลเบื้องต้น) พบ " + totalMatched + " รายการ | ส่งข้อความแจ้งเตือนสำเร็จ " + totalSent + " ข้อความ" + failSuffix,
      totalSent: totalSent,
      totalMatched: totalMatched
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการรันระบบแจ้งเตือนอัตโนมัติ: " + e.toString() };
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {}
    }
  }
}

/**
 * ตรวจสอบและรันการส่งแจ้งเตือนอัตโนมัติประจำวันวันละ 1 ครั้ง
 * หาก Time Trigger รอบเช้า 07.00 - 08.00 น. ยังไม่ได้ทำงาน (เช่น ยังไม่ได้ติดตั้ง Trigger บน Google Cloud)
 * เมื่อเจ้าหน้าที่เปิดเข้าสู่ระบบในช่วงเวลากลางวัน (06.00 - 18.00 น.) ระบบจะส่งแจ้งเตือนรอบของวันนี้ให้อัตโนมัติทันที
 */
function checkAndRunDailyLineNotificationsAuto_(cfgMap) {
  var cfg = cfgMap || getLineConfigMap_();
  if (cfg.auto_send_enabled !== "true") return;
  if (!cfg.channel_access_token || cfg.channel_access_token.toString().trim() === "") return;
  
  var now = new Date();
  var todayIso = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
  var lastRunVal = (cfg.last_auto_8am_run_date || "").toString().trim();
  if (lastRunVal === "AUTO8AM_" + todayIso) return; // รันรอบอัตโนมัติของวันนี้ไปแล้ว (ส่งอัตโนมัติวันละ 1 ครั้งเท่านั้น)
  
  var currentHour = parseInt(Utilities.formatDate(now, "GMT+7", "HH"), 10);
  // อนุญาตให้ส่งแจ้งเตือนอัตโนมัติประจำวันเฉพาะช่วงเวลากลางวัน (06.00 - 18.00 น.) ป้องกันการรบกวนผู้รับเวลากลางคืน
  if (currentHour < 6 || currentHour >= 18) {
    return;
  }
  
  runDailyLineNotificationsCore_(false);
}

/**
 * ผูกบัญชีผู้ติดต่อจากรายการผู้ติดตาม LINE OA เข้ากับข้อมูลเยาวชนหรือผู้ปกครองด้วยคลิกเดียว
 */
function linkLineContactToDefendant(payload, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role === "user") {
    return { success: false, message: "ไม่มีสิทธิ์ในการผูกบัญชี LINE OA" };
  }
  
  try {
    var rawCitizenOrCase = (payload && payload.citizen_id ? payload.citizen_id : "").toString().trim();
    var lineUserId = (payload && payload.line_user_id ? payload.line_user_id : "").toString().trim();
    var displayName = (payload && payload.display_name ? payload.display_name : "").toString().trim();
    var targetRole = (payload && payload.target_role) ? payload.target_role : "youth"; // 'youth' or 'parent'
    var isParent = (targetRole === "parent" || targetRole === "ผู้ปกครอง");
    
    // รองรับกรณีวางลิงก์ chat.line.biz ในช่อง line_user_id
    var chatUrl = (payload && payload.chat_url ? payload.chat_url : "").toString().trim();
    if (/chat\.line\.biz\//i.test(lineUserId)) {
      if (!chatUrl) chatUrl = lineUserId;
      var parsedUid = parseLineChatInput_(lineUserId);
      if (parsedUid.userId) lineUserId = parsedUid.userId;
    }

    if (!rawCitizenOrCase || !lineUserId) {
      return { success: false, message: "กรุณาระบุเลขบัตรประชาชน (หรือเลขคดีดำ) ของเยาวชน และบัญชี LINE ที่ต้องการผูก" };
    }

    clearSheetCache_("tb_defendants");
    clearSheetCache_("tb_cases");
    var defendants = getSheetData_("tb_defendants");
    var cases = getSheetData_("tb_cases");

    // รองรับทั้งการกรอกเลขบัตรประชาชน 13 หลัก, เลขคดีดำ (เช่น ศป22/69), หรือการเลือกจากรายการที่มีวงเล็บเลขบัตร
    var cid = "";
    var explicit13Match = rawCitizenOrCase.replace(/[๐-๙]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x0E50 + 48);
    }).match(/\d{13}/);
    if (explicit13Match) {
      cid = explicit13Match[0];
    } else {
      var candidateDigits = cleanCitizenId_(rawCitizenOrCase);
      if (candidateDigits && candidateDigits.length === 13 && /^[\d\s\-๐-๙]+$/.test(rawCitizenOrCase)) {
        cid = candidateDigits;
      } else {
        // ค้นหาจากเลขคดีดำใน tb_cases
        var normInputCase = normalizeBlackCaseKey_(rawCitizenOrCase);
        for (var cIdx = 0; cIdx < cases.length; cIdx++) {
          var cBlack = cases[cIdx].black_case ? cases[cIdx].black_case.toString().trim() : "";
          if (cBlack && (normalizeBlackCaseKey_(cBlack) === normInputCase || cBlack.toLowerCase() === rawCitizenOrCase.toLowerCase())) {
            var caseCid = cleanCitizenId_(cases[cIdx].citizen_id);
            if (caseCid) {
              cid = caseCid;
              break;
            }
          }
        }
        // หากยังไม่พบ ให้ค้นหาจากชื่อ-นามสกุลใน tb_defendants
        if (!cid) {
          var cleanInputName = rawCitizenOrCase.replace(/\s+/g, " ").toLowerCase();
          for (var dIdx = 0; dIdx < defendants.length; dIdx++) {
            var d = defendants[dIdx];
            var full1 = ((d.title_name || "") + (d.first_name || "") + " " + (d.last_name || "")).replace(/\s+/g, " ").trim().toLowerCase();
            var full2 = ((d.first_name || "") + " " + (d.last_name || "")).replace(/\s+/g, " ").trim().toLowerCase();
            if ((full1 && full1.indexOf(cleanInputName) !== -1) || (full2 && full2.indexOf(cleanInputName) !== -1)) {
              cid = cleanCitizenId_(d.citizen_id);
              if (cid) break;
            }
          }
        }
      }
    }

    if (!cid || cid.length !== 13) {
      return { success: false, message: "ไม่พบเลขบัตรประชาชน 13 หลัก หรือเลขคดีที่ตรงกับ \"" + rawCitizenOrCase + "\" กรุณาตรวจสอบอีกครั้ง" };
    }
    
    var bindRes = saveLineBindingToDefendantsSheet_(cid, lineUserId, displayName, isParent, chatUrl);
    if (!bindRes.matched) {
      return {
        success: false,
        message: "ไม่พบข้อมูลเด็ก/เยาวชนที่มีเลขประจำตัวประชาชน " + cid + " ในฐานข้อมูลทะเบียนประวัติเยาวชน (tb_defendants) กรุณาลงทะเบียนประวัติเยาวชนในระบบก่อนทำการผูกบัญชี LINE"
      };
    }
    
    var parsedChat = parseLineChatInput_(chatUrl);
    if (parsedChat.botId) {
      saveSingleLineConfigValue_("oa_bot_id", parsedChat.botId, "chat_url");
    }
    
    var roleLabel = isParent ? "ผู้ปกครอง" : "เยาวชน";
    upsertLineContactRecord_(lineUserId, displayName, undefined, cid, roleLabel);
    try {
      SpreadsheetApp.flush();
    } catch (flushErr) {}
    invalidateLineUnreadCache_();
    
    return {
      success: true,
      citizen_id: cid,
      target_role: isParent ? "parent" : "youth",
      line_user_id: lineUserId,
      display_name: displayName || lineUserId,
      message: "ผูกบัญชี LINE (" + (displayName || lineUserId) + ") เข้ากับ " + bindRes.defFullName + " (" + roleLabel + ") สำเร็จ!"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการผูกบัญชี: " + e.toString() };
  }
}

/**
 * บันทึกลิงก์ห้องแชท chat.line.biz ของเยาวชนหรือผู้ปกครองโดยตรง
 */
function saveDefendantLineChatUrl(payload, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  try {
    var cid = cleanCitizenId_(payload && payload.citizen_id);
    var chatUrl = (payload && payload.chat_url ? payload.chat_url : "").toString().trim();
    var targetRole = (payload && payload.target_role) ? payload.target_role.toString().trim() : "เยาวชน";
    if (!cid || !chatUrl) {
      return { success: false, message: "กรุณาวางลิงก์จากหน้าแชท chat.line.biz" };
    }
    ensureColumnsExist_("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id", "line_chat_url", "parent_line_chat_url"]);
    var defendants = getSheetData_("tb_defendants");
    var matchedRows = [];
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId_(defendants[i].citizen_id) === cid) {
        matchedRows.push(defendants[i]);
      }
    }
    if (matchedRows.length === 0) {
      return { success: false, message: "ไม่พบข้อมูลเยาวชนเลขบัตรประชาชน " + cid };
    }
    var isParent = (targetRole === "parent" || targetRole === "ผู้ปกครอง");
    var partialUpdate = {};
    if (isParent) {
      partialUpdate.parent_line_chat_url = chatUrl;
    } else {
      partialUpdate.line_chat_url = chatUrl;
    }
    for (var m = 0; m < matchedRows.length; m++) {
      updateRowInSheet_("tb_defendants", matchedRows[m].rowNum, partialUpdate);
    }
    var parsedChat = parseLineChatInput_(chatUrl);
    if (parsedChat.botId && parsedChat.botId !== "Uc26f8cd9efde3d463307945a2077ff3f") {
      saveSingleLineConfigValue_("oa_bot_id", parsedChat.botId, "chat_url");
    }
    clearSheetCache_("tb_defendants");
    invalidateLineUnreadCache_();
    return {
      success: true,
      chat_url: chatUrl,
      oa_bot_id: parsedChat.botId || "",
      message: "บันทึกลิงก์ห้องแชท LINE OA เรียบร้อยแล้ว ครั้งต่อไปคลิกที่ไอดีไลน์จะเปิดห้องแชทนี้ทันที"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + e.toString() };
  }
}

/**
 * ล้างข้อมูลการผูกบัญชีใน tb_line_contacts สำหรับเยาวชนหรือผู้ปกครอง
 */
function clearLineContactLinkForDefendant_(citizenIdStr, role, oldUid) {
  if (!citizenIdStr && !oldUid) return;
  try {
    getOrCreateSheet_("tb_line_contacts", ["line_user_id", "display_name", "last_message", "linked_citizen_id", "linked_role", "updated_at"]);
    var contacts = getSheetData_("tb_line_contacts");
    var targetRoleLabel = (role === "parent" || role === "ผู้ปกครอง") ? "ผู้ปกครอง" : "เยาวชน";
    var cleanedCid = citizenIdStr ? cleanCitizenId_(citizenIdStr) : "";
    var cleanedOldUid = oldUid ? String(oldUid).trim() : "";
    
    for (var i = 0; i < contacts.length; i++) {
      var ct = contacts[i];
      var ctCid = cleanCitizenId_(ct.linked_citizen_id);
      var ctRole = (ct.linked_role || "").toString().trim();
      var ctUid = (ct.line_user_id || "").toString().trim();
      
      var isTargetCid = cleanedCid && (ctCid === cleanedCid) && (ctRole === targetRoleLabel || !ctRole);
      var isTargetUid = cleanedOldUid && (ctUid === cleanedOldUid);
      
      if (isTargetCid || isTargetUid) {
        var oldMsg = (ct.last_message || "").toString().trim();
        var newMsg = /^ยืนยัน(เยาวชน|ผู้ปกครอง):/.test(oldMsg) ? (oldMsg + " (ยกเลิกผูกแล้ว)") : oldMsg;
        updateRowInSheet_("tb_line_contacts", ct.rowNum, {
          linked_citizen_id: "",
          linked_role: "",
          last_message: newMsg
        });
      }
    }
    clearSheetCache_("tb_line_contacts");
  } catch (err) {
    Logger.log("clearLineContactLinkForDefendant error: " + err.toString());
  }
}

/**
 * เชื่อมโยงบัญชีใน tb_line_contacts สำหรับเยาวชนหรือผู้ปกครอง เมื่อมีการระบุ line_user_id
 */
function setLineContactLinkForDefendant_(citizenIdStr, role, newUid) {
  if (!newUid || !citizenIdStr) return;
  try {
    var cleanedCid = cleanCitizenId_(citizenIdStr);
    var cleanedUid = String(newUid).trim();
    if (!cleanedCid || !cleanedUid) return;
    
    getOrCreateSheet_("tb_line_contacts", ["line_user_id", "display_name", "last_message", "linked_citizen_id", "linked_role", "updated_at"]);
    var contacts = getSheetData_("tb_line_contacts");
    var targetRoleLabel = (role === "parent" || role === "ผู้ปกครอง") ? "ผู้ปกครอง" : "เยาวชน";
    
    for (var i = 0; i < contacts.length; i++) {
      var ct = contacts[i];
      if ((ct.line_user_id || "").toString().trim() === cleanedUid) {
        updateRowInSheet_("tb_line_contacts", ct.rowNum, {
          linked_citizen_id: cleanedCid,
          linked_role: targetRoleLabel,
          updated_at: new Date().toISOString()
        });
        break;
      }
    }
    clearSheetCache_("tb_line_contacts");
  } catch (err) {
    Logger.log("setLineContactLinkForDefendant error: " + err.toString());
  }
}

/**
 * ยกเลิกการผูกบัญชี LINE ของเด็กและเยาวชน หรือผู้ปกครอง (สั่งการจากหน้าเว็บ)
 */
function unlinkDefendantLine(payload, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role === "user") {
    return { success: false, message: "ไม่มีสิทธิ์ยกเลิกการผูกบัญชี LINE" };
  }
  
  try {
    var cid = cleanCitizenId_(payload && payload.citizen_id);
    var targetRole = (payload && payload.target_role) ? payload.target_role.toString().trim() : "youth";
    if (!cid) return { success: false, message: "กรุณาระบุเลขบัตรประชาชนของเยาวชน" };
    
    ensureColumnsExist_("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id", "line_chat_url", "parent_line_chat_url"]);
    var defendants = getSheetData_("tb_defendants");
    var matchedRows = [];
    var unlinkedUids = [];
    var isParent = (targetRole === "parent" || targetRole === "ผู้ปกครอง");
    
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId_(defendants[i].citizen_id) === cid) {
        matchedRows.push(defendants[i]);
        var uid = isParent ? (defendants[i].parent_line_user_id || "").toString().trim()
                           : (defendants[i].line_user_id || "").toString().trim();
        if (uid && unlinkedUids.indexOf(uid) === -1) {
          unlinkedUids.push(uid);
        }
      }
    }
    
    if (matchedRows.length === 0) {
      return { success: false, message: "ไม่พบข้อมูลเยาวชนเลขบัตรประชาชน " + cid + " ในระบบ" };
    }
    
    // ล้างข้อมูลใน tb_defendants ทุกแถวที่ตรงกับเลขบัตรประชาชนนี้
    var partialClear = {};
    if (isParent) {
      partialClear.parent_line_user_id = "";
      partialClear.parent_line_id = "";
      partialClear.parent_line_chat_url = "";
    } else {
      partialClear.line_user_id = "";
      partialClear.line_id = "";
      partialClear.line_chat_url = "";
    }
    
    for (var m = 0; m < matchedRows.length; m++) {
      updateRowInSheet_("tb_defendants", matchedRows[m].rowNum, partialClear);
    }
    
    // ล้างการเชื่อมโยงใน tb_line_contacts ให้ตรงกัน
    getOrCreateSheet_("tb_line_contacts", ["line_user_id", "display_name", "last_message", "linked_citizen_id", "linked_role", "updated_at"]);
    var contacts = getSheetData_("tb_line_contacts");
    var targetRoleLabel = isParent ? "ผู้ปกครอง" : "เยาวชน";
    for (var cIdx = 0; cIdx < contacts.length; cIdx++) {
      var ct = contacts[cIdx];
      var ctCid = cleanCitizenId_(ct.linked_citizen_id);
      var ctRole = (ct.linked_role || "").toString().trim();
      var ctUid = (ct.line_user_id || "").toString().trim();
      if ((ctCid === cid && (ctRole === targetRoleLabel || !ctRole)) || (ctUid && unlinkedUids.indexOf(ctUid) !== -1)) {
        var oldCtMsg = (ct.last_message || "").toString().trim();
        var newCtMsg = /^ยืนยัน(เยาวชน|ผู้ปกครอง):/.test(oldCtMsg) ? (oldCtMsg + " (ยกเลิกผูกแล้ว)") : oldCtMsg;
        updateRowInSheet_("tb_line_contacts", ct.rowNum, {
          linked_citizen_id: "",
          linked_role: "",
          last_message: newCtMsg
        });
      }
    }
    
    clearSheetCache_("tb_defendants");
    clearSheetCache_("tb_line_contacts");
    invalidateLineUnreadCache_();
    try {
      SpreadsheetApp.flush();
    } catch (flushErr) {}
    
    return {
      success: true,
      message: "ยกเลิกการผูกบัญชี LINE ของ" + (isParent ? "ผู้ปกครอง" : "เยาวชน") + "เรียบร้อยแล้ว"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการยกเลิกการผูกบัญชี: " + e.toString() };
  }
}

/**
 * ยกเลิกการผูกบัญชีผู้ติดต่อ LINE OA ออกจากเยาวชน/ผู้ปกครอง จากตารางรายชื่อผู้ติดต่อ
 */
function unlinkLineContact(payload, token) {
  var userSession = verifySessionToken_(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role === "user") {
    return { success: false, message: "ไม่มีสิทธิ์ยกเลิกการผูกบัญชี LINE" };
  }
  
  try {
    var lineUserId = (payload && payload.line_user_id ? payload.line_user_id : "").toString().trim();
    if (!lineUserId) return { success: false, message: "กรุณาระบุรหัส LINE User ID" };
    
    getOrCreateSheet_("tb_line_contacts", ["line_user_id", "display_name", "last_message", "linked_citizen_id", "linked_role", "updated_at"]);
    var contacts = getSheetData_("tb_line_contacts");
    var foundContact = null;
    for (var i = 0; i < contacts.length; i++) {
      if (contacts[i].line_user_id && contacts[i].line_user_id.toString().trim() === lineUserId) {
        foundContact = contacts[i];
        break;
      }
    }
    
    var linkedCid = foundContact ? cleanCitizenId_(foundContact.linked_citizen_id) : "";
    var linkedRole = foundContact ? (foundContact.linked_role || "").toString().trim() : "";
    var isParent = (linkedRole === "ผู้ปกครอง" || linkedRole === "parent");
    
    if (foundContact) {
      var oldFoundMsg = (foundContact.last_message || "").toString().trim();
      var newFoundMsg = /^ยืนยัน(เยาวชน|ผู้ปกครอง):/.test(oldFoundMsg) ? (oldFoundMsg + " (ยกเลิกผูกแล้ว)") : oldFoundMsg;
      updateRowInSheet_("tb_line_contacts", foundContact.rowNum, {
        linked_citizen_id: "",
        linked_role: "",
        last_message: newFoundMsg
      });
    }
    
    // ล้างใน tb_defendants ด้วย
    ensureColumnsExist_("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id", "line_chat_url", "parent_line_chat_url"]);
    var defendants = getSheetData_("tb_defendants");
    for (var dIdx = 0; dIdx < defendants.length; dIdx++) {
      var d = defendants[dIdx];
      var matchesCid = linkedCid && cleanCitizenId_(d.citizen_id) === linkedCid;
      var matchesYouthUid = (d.line_user_id || "").toString().trim() === lineUserId;
      var matchesParentUid = (d.parent_line_user_id || "").toString().trim() === lineUserId;
      
      var partialClear = {};
      var needsUpdate = false;
      if (matchesYouthUid || (matchesCid && !isParent && matchesYouthUid)) {
        partialClear.line_user_id = "";
        partialClear.line_id = "";
        partialClear.line_chat_url = "";
        needsUpdate = true;
      }
      if (matchesParentUid || (matchesCid && isParent && matchesParentUid)) {
        partialClear.parent_line_user_id = "";
        partialClear.parent_line_id = "";
        partialClear.parent_line_chat_url = "";
        needsUpdate = true;
      }
      if (needsUpdate) {
        updateRowInSheet_("tb_defendants", d.rowNum, partialClear);
      }
    }
    
    clearSheetCache_("tb_defendants");
    clearSheetCache_("tb_line_contacts");
    invalidateLineUnreadCache_();
    try {
      SpreadsheetApp.flush();
    } catch (flushErr) {}
    
    return {
      success: true,
      message: "ยกเลิกการผูกบัญชี LINE เรียบร้อยแล้ว"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการยกเลิกการผูกบัญชี: " + e.toString() };
  }
}
