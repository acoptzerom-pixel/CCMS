/**
 * Consulting Center Management System (CCMS) - Core Server Back-end
 * ศาลเยาวชนและครอบครัว
 */

var SPREADSHEET_ID = "1-D1Dpin3KTuH9oV1-cUyEDXuJ15gKaHi6z6K6MIYMBU";
var SYSTEM_SECRET = "ccms_super_secure_secret_system_key_2026_rayong";

/**
 * เสิร์ฟหน้าเว็บแอปแรกแรกเริ่มรันระบบ
 */
function doGet(e) {
  var output = HtmlService.createTemplateFromFile('Index').evaluate();
  output.setTitle("CCMS Rayong - ระบบบริหารจัดการศูนย์ให้คำปรึกษาฯ ศาลเยาวชนและครอบครัวจังหวัดระยอง")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  return output;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ดึงออบเจ็กต์ Spreadsheet
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * ช่วยประมวลแปลงสเกลปี พ.ศ. (พุทธศักราช > 2400) ไปเป็น ค.ศ. (คริสต์ศักราช) ป้องกันระบบกรองวันที่สถิติผิดพลาด
 */
function normalizeSheetDate(dateVal) {
  if (!dateVal) return null;
  
  if (dateVal instanceof Date || (dateVal && typeof dateVal.getTime === 'function')) {
    var d = new Date(dateVal.getTime());
    var y = d.getFullYear();
    if (y > 2400) d.setFullYear(y - 543);
    return d;
  }
  
  var dateStr = dateVal.toString().trim();
  if (dateStr === "") return null;
  
  var parts = dateStr.split("/");
  if (parts.length === 3) {
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var year = parseInt(parts[2], 10);
    if (year > 2400) year -= 543;
    return new Date(year, month, day);
  }
  
  parts = dateStr.split("-");
  if (parts.length === 3) {
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    if (year > 2400) year -= 543;
    return new Date(year, month, day);
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
function formatDateAsIso(dateVal) {
  if (!dateVal) return "";
  var d = normalizeSheetDate(dateVal);
  if (!d) return "";
  try {
    var year = d.getFullYear();
    var month = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return year + "-" + month + "-" + day;
  } catch (e) {
    return "";
  }
}

/**
 * ช่วยทำความสะอาดออบเจ็กต์ทั้งหมดเพื่อเตรียมส่งกลับหน้าบ้าน โดยแปลงทุก Date Object ในทุกฟิลด์ย่อยให้กลายเป็นสายอักขระสตริง ISO "YYYY-MM-DD"
 */
function sanitizeObjectForSerialization(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (obj instanceof Date || (obj && typeof obj.getTime === 'function')) {
    return formatDateAsIso(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObjectForSerialization);
  }
  
  if (typeof obj === 'object') {
    var cleanObj = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        cleanObj[key] = sanitizeObjectForSerialization(obj[key]);
      }
    }
    return cleanObj;
  }
  
  return obj;
}

/**
 * ช่วยทำความสะอาดเลขบัตรประชาชนให้เป็นตัวเลข 13 หลักต่อกันไม่มีขีด รองรับเลขทศนิยมและสัญลักษณ์ทางคณิตศาสตร์จาก Excel
 */
function cleanCitizenId(cid) {
  if (!cid) return "";
  var cidStr = cid.toString().trim();
  
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
function ensurePsyDiagnosisColumn() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("tb_defendants");
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var psyColIdx = headers.indexOf("psy_diagnosis");
  if (psyColIdx === -1) {
    sheet.getRange(1, lastCol + 1).setValue("psy_diagnosis");
    return lastCol + 1;
  }
  return psyColIdx + 1;
}

/**
 * แปลงรหัสผ่านแบบ SHA-256 ร่วมกับ Salt
 */
function hashPassword(password, salt) {
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
function generateSalt() {
  return Utilities.getUuid().substring(0, 16);
}

/**
 * สร้าง Session Token ฝั่งเซิร์ฟเวอร์แบบไร้รอยต่อโดยใช้โครงสร้าง Object เซ็นลายเซ็นกำกับ (STATELSS Object Token)
 */
function generateSessionToken(userId, email, role, fullName) {
  var timestamp = new Date().getTime();
  var signatureInput = userId + "|" + email + "|" + role + "|" + fullName + "|" + timestamp;
  var signature = hashPassword(signatureInput, SYSTEM_SECRET);
  return {
    userId: userId,
    email: email,
    role: role,
    fullName: fullName,
    timestamp: timestamp,
    signature: signature
  };
}

/**
 * ตรวจสอบความถูกต้องของ Session Token
 */
function verifySessionToken(tokenObj) {
  if (!tokenObj || !tokenObj.signature) return null;
  try {
    var userId = tokenObj.userId;
    var email = tokenObj.email;
    var role = tokenObj.role;
    var fullName = tokenObj.fullName;
    var timestamp = tokenObj.timestamp;
    var clientSignature = tokenObj.signature;
    
    var signatureInput = userId + "|" + email + "|" + role + "|" + fullName + "|" + timestamp;
    var expectedSignature = hashPassword(signatureInput, SYSTEM_SECRET);
    if (clientSignature !== expectedSignature) return null;
    
    // อายุการล็อกอินเข้าใช้งาน 7 วัน
    var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (new Date().getTime() - timestamp > sevenDaysMs) {
      return null;
    }
    
    // แปลงบทบาทเป็นตัวพิมพ์เล็กเสมอเพื่อป้องกันความไม่สอดคล้องของเคสตัวหนังสือในระบบและฐานข้อมูล
    return {
      userId: userId,
      email: email,
      role: role ? role.toString().trim().toLowerCase() : "",
      fullName: fullName,
      timestamp: timestamp,
      signature: clientSignature
    };
  } catch (e) {
    return null;
  }
}

var sheetDataCache = {};

function clearSheetCache(sheetName) {
  if (sheetName) {
    delete sheetDataCache[sheetName];
  } else {
    sheetDataCache = {};
  }
}

/**
 * ดึงข้อมูลชีทตารางแปลงเป็นออบเจ็กต์ของ JS (พร้อมระบบแคชในรอบการเรียกใช้งานเดียว)
 */
function getSheetData(sheetName) {
  if (sheetDataCache[sheetName]) {
    return sheetDataCache[sheetName];
  }
  var ss = getSpreadsheet();
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
      var header = headers[c];
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
 * อัปเดตข้อมูลแถวในชีท
 */
function updateRowInSheet(sheetName, rowNum, dataObj) {
  clearSheetCache(sheetName);
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var rowRange = sheet.getRange(rowNum, 1, 1, lastCol);
  var rowValues = rowRange.getValues()[0];
  
  for (var c = 0; c < lastCol; c++) {
    var header = headers[c];
    if (header && dataObj.hasOwnProperty(header)) {
      rowValues[c] = dataObj[header];
    }
  }
  rowRange.setValues([rowValues]);
}

/**
 * เพิ่มแถวข้อมูลใหม่เข้าตาราง
 */
function appendRowToSheet(sheetName, dataObj) {
  clearSheetCache(sheetName);
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var newRowValues = [];
  for (var c = 0; c < lastCol; c++) {
    var header = headers[c];
    if (header) {
      newRowValues.push(dataObj.hasOwnProperty(header) ? dataObj[header] : "");
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
function parseRayongDistrict(addressStr) {
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
 * ลงทะเบียนบัญชีสมาชิกใหม่
 */
function registerUser(userData) {
  try {
    var users = getSheetData("tb_user");
    var cleanEmail = userData.email.toString().trim().toLowerCase();
    
    for (var i = 0; i < users.length; i++) {
      if (users[i].email && users[i].email.toString().trim().toLowerCase() === cleanEmail) {
        return { success: false, message: "อีเมลนี้ถูกใช้งานลงทะเบียนในระบบแล้ว" };
      }
    }
    
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedPassword = hashPassword(userData.password, salt);
    
    var maxId = 0;
    for (var i = 0; i < users.length; i++) {
      var id = parseFloat(users[i].user_id) || 0;
      if (id > maxId) maxId = id;
    }
    var newUserId = maxId + 1;
    
    var newUserRow = {
      user_id: newUserId,
      email: cleanEmail,
      password: hashedPassword,
      username: userData.username ? userData.username.toString().trim() : cleanEmail.split("@")[0],
      full_name: userData.full_name,
      position: userData.position ? userData.position.toString().trim() : "ผู้ให้คำปรึกษา",
      phone: "",
      role: "user", // บทบาทตั้งต้นคือผู้ใช้ทั่วไป
      is_active: "yes", // อนุมัติสิทธิ์เข้าใช้งานทันที
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    appendRowToSheet("tb_user", newUserRow);
    return { success: true, message: "ลงทะเบียนสมาชิกใหม่เรียบร้อยแล้ว สามารถเข้าสู่ระบบได้ทันที" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการลงทะเบียน: " + e.toString() };
  }
}

/**
 * ตรวจสอบความถูกต้องและล็อกอินเข้าสู่ระบบ
 */
function loginUser(usernameOrEmail, password) {
  try {
    var users = getSheetData("tb_user");
    var cleanInput = usernameOrEmail.toString().trim().toLowerCase();
    var foundUser = null;
    
    for (var i = 0; i < users.length; i++) {
      var emailMatch = users[i].email && users[i].email.toString().trim().toLowerCase() === cleanInput;
      var usernameMatch = users[i].username && users[i].username.toString().trim().toLowerCase() === cleanInput;
      if (emailMatch || usernameMatch) {
        foundUser = users[i];
        break;
      }
    }
    
    if (!foundUser) {
      return { success: false, message: "ไม่พบข้อมูลผู้ใช้งานหรือชื่อผู้ใช้งานนี้ในระบบ" };
    }
    
    if (foundUser.is_active !== "yes") {
      return { success: false, message: "บัญชีสมาชิกนี้ยังไม่ได้รับการอนุมัติการเข้าใช้งาน หรือถูกจำกัดการเข้าใช้งานชั่วคราว โปรดแจ้งแอดมิน" };
    }
    
    var cleanEmail = foundUser.email ? foundUser.email.toString().trim().toLowerCase() : cleanInput;
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedPassword = hashPassword(password, salt);
    
    // ตั้งรหัสผ่านสุ่มเฉพาะตัวหากบัญชีเดิมในชีทยังไม่มีรหัสผ่าน
    if (foundUser.password) {
      if (foundUser.password !== hashedPassword) {
        return { success: false, message: "รหัสผ่านไม่ถูกต้อง โปรดตรวจสอบรหัสผ่านอีกครั้ง" };
      }
    } else {
      foundUser.password = hashedPassword;
      updateRowInSheet("tb_user", foundUser.rowNum, { password: hashedPassword });
    }
    
    var token = generateSessionToken(foundUser.user_id, foundUser.email, foundUser.role, foundUser.full_name);
    return {
      success: true,
      message: "เข้าสู่ระบบเรียบร้อยแล้ว",
      token: token,
      user: {
        userId: foundUser.user_id,
        email: foundUser.email,
        role: foundUser.role ? foundUser.role.toString().trim().toLowerCase() : "",
        fullName: foundUser.full_name,
        position: foundUser.position,
        username: foundUser.username || "",
        phone: foundUser.phone || "",
        createdAt: foundUser.created_at || "",
        profileImage: foundUser.profile_image || ""
      }
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการล็อกอิน: " + e.toString() };
  }
}

/**
 * ตรวจเช็คและเพิ่มคอลัมน์เก็บรูปภาพของสมาชิกใน tb_user
 */
function ensureProfileImageColumn() {
  var ss = getSpreadsheet();
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
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    ensureProfileImageColumn();
    var users = getSheetData("tb_user");
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
    
    updateRowInSheet("tb_user", foundUser.rowNum, updateData);
    
    // สร้าง Token และอัปเดต Session ใหม่
    var newToken = generateSessionToken(foundUser.user_id, updateData.email, foundUser.role, updateData.full_name);
    
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
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    var users = getSheetData("tb_user");
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
    var oldHashed = hashPassword(oldPassword, salt);
    
    if (foundUser.password && foundUser.password !== oldHashed) {
      return { success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" };
    }
    
    var newHashed = hashPassword(newPassword, salt);
    updateRowInSheet("tb_user", foundUser.rowNum, {
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
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    var cases = getSheetData("tb_cases");
    var defendants = getSheetData("tb_defendants");
    var charges = getSheetData("tb_charge");
    
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
      var dCid = cleanCitizenId(defendants[i].citizen_id);
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
      "ทั้งหมด": { "ชาย": 0, "หญิง": 0 },
      "มาตรา 73": { "ชาย": 0, "หญิง": 0 },
      "มาตรา 90": { "ชาย": 0, "หญิง": 0 },
      "มาตรา 132 วรรคหนึ่ง": { "ชาย": 0, "หญิง": 0 },
      "มาตรา 132 วรรคสอง": { "ชาย": 0, "หญิง": 0 },
      "คดีจากศาลอื่น": { "ชาย": 0, "หญิง": 0 },
      "คดีอื่นๆ": { "ชาย": 0, "หญิง": 0 }
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
      
      var blackDate = c.black_date ? normalizeSheetDate(c.black_date) : null;
      var radDate = c.red_date ? normalizeSheetDate(c.red_date) : null;
      
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
      
      var caseCid = cleanCitizenId(c.citizen_id);
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
                var parsedDist = parseRayongDistrict(fullAddr);
                if (parsedDist === "อื่นๆ" || parsedDist === "ไม่ระบุ") {
                  distLabel = "เมืองระยอง";
                } else if (parsedDist.indexOf("(ชลบุรี)") !== -1) {
                  distLabel = "จังหวัดอื่นๆ";
                } else {
                  distLabel = parsedDist;
                }
              } else {
                var parsedDist = parseRayongDistrict(fullAddr);
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
              var parsedDist = parseRayongDistrict(fullAddr);
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
        
        if (gender !== "ไม่มีข้อมูล") {
          genderCountsBySection["ทั้งหมด"][gender]++;
          genderCountsBySection[sectionLabel][gender]++;
        }
        
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
      topChargesBySection[sec] = list.slice(0, 10);
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
      
      var bDate = c.black_date ? normalizeSheetDate(c.black_date) : null;
      var rDate = c.red_date ? normalizeSheetDate(c.red_date) : null;
      
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
          var bDate = c.black_date ? normalizeSheetDate(c.black_date) : null;
          var rDate = c.red_date ? normalizeSheetDate(c.red_date) : null;
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
 * ดึงข้อมูลเด็กและเยาวชนทั้งหมดพร้อมคดีที่เชื่อมโยง สำหรับแสดงผลเป็นรายการการ์ดและค้นหาแบบครอบคลุม
 */
function getAllDefendantsWithCases(token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงฟังก์ชันจัดการข้อมูลเด็กและคดี" };
  }
  
  try {
    var defendants = getSheetData("tb_defendants");
    var cases = getSheetData("tb_cases");
    
    var isAdminOrStaff = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    // จัดกลุ่มคดีตามเลขบัตรประชาชน
    var caseMap = {};
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var isAssigned = (c.user_id && c.user_id.toString() === userSession.userId.toString()) || 
                       (c.counselor && c.counselor.toString().trim() === userSession.fullName.toString().trim());
      
      if (isAdminOrStaff || isAssigned) {
        var cCid = cleanCitizenId(c.citizen_id);
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
          
          caseMap[cCid].push(c);
        }
      }
    }
    
    var list = [];
    for (var i = 0; i < defendants.length; i++) {
      var d = defendants[i];
      var dCid = cleanCitizenId(d.citizen_id);
      if (!dCid) {
        continue; // ข้ามแถวที่ไม่มีเลขบัตรประชาชน (เช่น แถวว่างเปล่า)
      }
      
      // กรองเฉพาะเด็กที่ผู้ใช้งานมีสิทธิ์เข้าถึง (สำหรับ counselor ต้องมีอย่างน้อย 1 คดีที่ได้รับมอบหมาย)
      var linked = caseMap[dCid] || [];
      if (!isAdminOrStaff && linked.length === 0) {
        continue;
      }
      
      d.citizen_id = dCid;
      d.no = d.no !== undefined ? d.no : (d.No !== undefined ? d.No : (d.NO !== undefined ? d.NO : ""));
      d.cases = linked;
      
      list.push(d);
    }
    
    // เรียงลำดับการโชว์การ์ด โดยใช้คอลัมน์ no ใน tb_defendants จากมากไปหาน้อย คนไม่มีลำดับไว้ท้ายสุด
    // หากลำดับเท่ากัน หรือไม่มีทั้งคู่ ให้เรียงตามวันที่คดีล่าสุด (เหมือนดีไซน์เดิม) เป็นลำดับถัดไป
    list.sort(function(a, b) {
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
          var cDate = a.cases[i].black_date ? normalizeSheetDate(a.cases[i].black_date) : null;
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
          var cDate = b.cases[i].black_date ? normalizeSheetDate(b.cases[i].black_date) : null;
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
      data: sanitizeObjectForSerialization(list)
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดรายการข้อมูล: " + e.toString() };
  }
}

/**
 * สืบค้นเด็กและเยาวชนจากเลขบัตรประชาชน (citizen_id)
 */
function searchDefendantByCitizenId(citizenId, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงฟังก์ชันจัดการข้อมูลเด็กและคดี" };
  }
  
  try {
    var cleanId = cleanCitizenId(citizenId);
    if (!cleanId) return { success: false, message: "โปรดระบุเลขบัตรประชาชนในการค้นหา" };
    
    var defendants = getSheetData("tb_defendants");
    var foundDef = null;
    
    for (var i = 0; i < defendants.length; i++) {
      var sheetCid = cleanCitizenId(defendants[i].citizen_id);
      if (sheetCid === cleanId) {
        foundDef = defendants[i];
        break;
      }
    }
    
    if (!foundDef) {
      return { success: true, found: false, message: "ไม่พบประวัติเด็กและเยาวชนรายนี้ในระบบฐานข้อมูล" };
    }

    // สร้างข้อมูลที่อยู่เต็มชั่วคราวเพื่อส่งให้หน้าบ้านแสดงผลในช่อง textarea โดยเชื่อมคอลัมน์ _address ทั้งหมดเข้าด้วยกัน
    var fullAddrParts = [];
    var addressFields = ["number_address", "village_address", "village_number_address", "road_address", "sub_district_address", "district_address", "province_address"];
    for (var f = 0; f < addressFields.length; f++) {
      var fieldName = addressFields[f];
      if (foundDef[fieldName]) {
        var valStr = foundDef[fieldName].toString().trim();
        if (valStr !== "") {
          var prefix = "";
          if (fieldName === "village_address" && valStr.indexOf("หมู่") === -1 && valStr.indexOf("ม.") === -1) {
            prefix = "หมู่ ";
          } else if (fieldName === "sub_district_address" && valStr.indexOf("ตำบล") === -1 && valStr.indexOf("ต.") === -1) {
            prefix = "ต.";
          } else if (fieldName === "district_address" && valStr.indexOf("อำเภอ") === -1 && valStr.indexOf("อ.") === -1) {
            prefix = "อ.";
          } else if (fieldName === "province_address" && valStr.indexOf("จังหวัด") === -1 && valStr.indexOf("จ.") === -1) {
            prefix = "จ.";
          }
          fullAddrParts.push(prefix + valStr);
        }
      }
    }
    if (fullAddrParts.length === 0) {
      for (var key in foundDef) {
        if (foundDef.hasOwnProperty(key) && key.indexOf("_address") !== -1 && foundDef[key]) {
          var valStr = foundDef[key].toString().trim();
          if (valStr !== "") {
            fullAddrParts.push(valStr);
          }
        }
      }
    }
    foundDef.address = fullAddrParts.join(" ");

    // ปรับสเกลปีเกิดของเยาวชนให้อยู่ในโหมด ค.ศ. และแปลงเป็นสตริง ISO สำหรับบราวเซอร์
    if (foundDef.birth_date) {
      foundDef.birth_date = formatDateAsIso(foundDef.birth_date);
    }
    
    var cases = getSheetData("tb_cases");
    var linkedCases = [];
    var hasAccess = false;
    var hasFullViewAccess = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var caseCid = cleanCitizenId(c.citizen_id);
      if (caseCid === cleanId) {
        var isAssigned = (c.user_id && c.user_id.toString() === userSession.userId.toString()) || 
                         (c.counselor && c.counselor.toString().trim() === userSession.fullName.toString().trim());
        
        if (isAssigned) {
          hasAccess = true;
        }
        
        if (hasFullViewAccess || isAssigned) {
          // ปรับสเกลปีรับฟื้นฟู/คำสั่งศาลคดีดำแดงให้อยู่ในโหมด ค.ศ. และแปลงเป็นสตริง ISO สำหรับบราวเซอร์
          if (c.black_date) c.black_date = formatDateAsIso(c.black_date);
          if (c.red_date) c.red_date = formatDateAsIso(c.red_date);
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
      defendant: sanitizeObjectForSerialization(foundDef),
      cases: sanitizeObjectForSerialization(linkedCases)
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการดึงข้อมูลประวัติเยาวชน: " + e.toString() };
  }
}

/**
 * ช่วยจัดรูปแบบที่อยู่ของจำเลย/เยาวชนสำหรับการส่งออกข้อมูล
 */
function formatDefendantAddress(def) {
  var fullAddrParts = [];
  var addressFields = ["number_address", "village_address", "village_number_address", "road_address", "sub_district_address", "district_address", "province_address"];
  for (var f = 0; f < addressFields.length; f++) {
    var fieldName = addressFields[f];
    if (def[fieldName]) {
      var valStr = def[fieldName].toString().trim();
      if (valStr !== "") {
        var prefix = "";
        if (fieldName === "village_address" && valStr.indexOf("หมู่") === -1 && valStr.indexOf("ม.") === -1) {
          prefix = "หมู่ ";
        } else if (fieldName === "sub_district_address" && valStr.indexOf("ตำบล") === -1 && valStr.indexOf("ต.") === -1) {
          prefix = "ต.";
        } else if (fieldName === "district_address" && valStr.indexOf("อำเภอ") === -1 && valStr.indexOf("อ.") === -1) {
          prefix = "อ.";
        } else if (fieldName === "province_address" && valStr.indexOf("จังหวัด") === -1 && valStr.indexOf("จ.") === -1) {
          prefix = "จ.";
        }
        fullAddrParts.push(prefix + valStr);
      }
    }
  }
  if (fullAddrParts.length === 0) {
    for (var key in def) {
      if (def.hasOwnProperty(key) && key.indexOf("_address") !== -1 && def[key]) {
        var valStr = def[key].toString().trim();
        if (valStr !== "") {
          fullAddrParts.push(valStr);
        }
      }
    }
  }
  def.address = fullAddrParts.join(" ");
}

/**
 * ช่วยประกอบข้อมูลเยาวชนร่วมกับคดีในหน่วยความจำโดยตรง หลีกเลี่ยงการดึงข้อมูลจาก Sheets API ซ้ำ
 */
function buildDefendantResponse(foundDef, casesArray, userSession) {
  var defCopy = {};
  for (var k in foundDef) {
    if (foundDef.hasOwnProperty(k)) {
      defCopy[k] = foundDef[k];
    }
  }
  
  formatDefendantAddress(defCopy);
  
  if (defCopy.birth_date) {
    defCopy.birth_date = formatDateAsIso(defCopy.birth_date);
  }
  
  var cleanId = cleanCitizenId(defCopy.citizen_id);
  var linkedCases = [];
  var hasAccess = false;
  var hasFullViewAccess = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
  
  for (var i = 0; i < casesArray.length; i++) {
    var c = casesArray[i];
    var caseCid = cleanCitizenId(c.citizen_id);
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
        if (caseCopy.black_date) caseCopy.black_date = formatDateAsIso(caseCopy.black_date);
        if (caseCopy.red_date) caseCopy.red_date = formatDateAsIso(caseCopy.red_date);
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
    defendant: sanitizeObjectForSerialization(defCopy),
    cases: sanitizeObjectForSerialization(linkedCases)
  };
}

/**
 * เพิ่ม หรือแก้ไขข้อมูลประวัติเด็กและเยาวชน พร้อมผลทดสอบจิตวิทยา
 */
function upsertDefendant(defData, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์แก้ไข/บันทึกข้อมูลประวัติเด็กและเยาวชน" };
  }
  
  try {
    ensurePsyDiagnosisColumn();
    var defendants = getSheetData("tb_defendants");
    var cases = getSheetData("tb_cases");
    var citizenIdStr = cleanCitizenId(defData.citizen_id);
    
    var existingDef = null;
    for (var i = 0; i < defendants.length; i++) {
      var sheetCid = cleanCitizenId(defendants[i].citizen_id);
      if (sheetCid === citizenIdStr) {
        existingDef = defendants[i];
        break;
      }
    }
    
    var birthDateVal = defData.birth_date ? new Date(defData.birth_date) : "";
    if (birthDateVal) {
      birthDateVal.setHours(12, 0, 0, 0);
    }
    
    var parsedAddr = parseThaiAddress(defData.address);
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
    defRow.occupation = defData.occupation || "";
    defRow.phone_number = defData.phone_number || "";
    
    defRow.number_address = parsedAddr.number_address;
    defRow.village_address = parsedAddr.village_address;
    defRow.village_number_address = parsedAddr.village_number_address;
    defRow.road_address = parsedAddr.road_address;
    defRow.sub_district_address = parsedAddr.sub_district_address;
    defRow.district_address = parsedAddr.district_address;
    defRow.province_address = parsedAddr.province_address;
    
    defRow.medical_history = defData.medical_history || "";
    defRow.drug_history = defData.drug_history || "";
    defRow.interested = defData.interested || "";
    defRow.guardian_name = defData.guardian_name || "";
    defRow.relationship = defData.relationship || "";
    defRow.phone_number_guardian = defData.phone_number_guardian || "";
    defRow.occupation_guardian = defData.occupation_guardian || "";
    defRow.updated_at = new Date().toISOString();
    defRow.psy_diagnosis = defData.psy_diagnosis || "";
    
    var msg = "";
    if (existingDef) {
      var extNo = existingDef.no !== undefined ? existingDef.no : (existingDef.No !== undefined ? existingDef.No : (existingDef.NO !== undefined ? existingDef.NO : ""));
      defRow.no = extNo;
      defRow.No = extNo;
      defRow.NO = extNo;
      
      updateRowInSheet("tb_defendants", existingDef.rowNum, defRow);
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
      
      var newRowNum = appendRowToSheet("tb_defendants", defRow);
      defRow.rowNum = newRowNum;
      msg = "บันทึกประวัติเด็กและเยาวชนคนใหม่เข้าสู่ระบบสำเร็จ";
    }
    
    var searchRes = buildDefendantResponse(defRow, cases, userSession);
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
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ" };
  
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์แก้ไข/บันทึกข้อมูลรายละเอียดคดี" };
  }
  
  try {
    var defendants = getSheetData("tb_defendants");
    var cases = getSheetData("tb_cases");
    var citizenIdStr = cleanCitizenId(caseData.citizen_id);
    var blackCaseStr = caseData.black_case ? caseData.black_case.toString().trim() : "";
    
    var foundDef = null;
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId(defendants[i].citizen_id) === citizenIdStr) {
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
          var caseCid = cleanCitizenId(cases[i].citizen_id);
          if (caseCid === citizenIdStr) {
            existingCase = cases[i];
            break;
          }
        }
      }
    }
    
    var blackDateVal = caseData.black_date ? new Date(caseData.black_date) : "";
    if (blackDateVal) blackDateVal.setHours(12, 0, 0, 0);
    
    var redDateVal = caseData.red_date ? new Date(caseData.red_date) : "";
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
      updateRowInSheet("tb_cases", existingCase.rowNum, caseRow);
      caseRow.rowNum = existingCase.rowNum;
      for (var i = 0; i < cases.length; i++) {
        if (cases[i].rowNum === existingCase.rowNum) {
          cases[i] = caseRow;
          break;
        }
      }
      msg = "อัปเดตและเขียนทับข้อมูลคดีเรียบร้อยแล้ว";
    } else {
      var newRowNum = appendRowToSheet("tb_cases", caseRow);
      caseRow.rowNum = newRowNum;
      cases.push(caseRow);
      msg = "เพิ่มบันทึกคดีใหม่เข้าสู่ระบบฐานข้อมูลเรียบร้อยแล้ว";
    }
    
    var searchRes = buildDefendantResponse(foundDef, cases, userSession);
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
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  
  if (userSession.role !== "admin") {
    return { success: false, message: "ขออภัย สิทธิ์ในการลบข้อมูลคดีถูกจำกัดไว้เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น" };
  }
  
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("tb_cases");
    var parsedRowNum = parseFloat(rowNum);
    
    var defendants = getSheetData("tb_defendants");
    var cases = getSheetData("tb_cases");
    var targetCase = cases.filter(function(x) { return x.rowNum === parsedRowNum; })[0];
    var citizenIdStr = targetCase ? cleanCitizenId(targetCase.citizen_id) : "";
    
    sheet.deleteRow(parsedRowNum);
    clearSheetCache("tb_cases");
    
    if (citizenIdStr) {
      var foundDef = null;
      for (var i = 0; i < defendants.length; i++) {
        if (cleanCitizenId(defendants[i].citizen_id) === citizenIdStr) {
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
        var searchRes = buildDefendantResponse(foundDef, remainingCases, userSession);
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
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "เซสชันไม่ถูกต้อง" };
  
  try {
    var charges = getSheetData("tb_charge");
    var caseTypes = getSheetData("tb_casetype");
    var subCaseTypes = getSheetData("tb_subcasetype");
    var users = getSheetData("tb_user");
    
    var chargeList = charges.map(function(c) {
      return { id: c.charge_no, name: c.charge_statistics };
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
 * ดึงรายชื่อสมาชิกทั้งหมด (แอดมินเท่านั้น)
 */
function adminGetUsers(token) {
  var userSession = verifySessionToken(token);
  if (!userSession || userSession.role !== "admin") {
    return { success: false, message: "สิทธิ์การเข้าถึงหน้านี้จำกัดเฉพาะแอดมินเท่านั้น" };
  }
  
  try {
    var users = getSheetData("tb_user");
    var sanitizedUsers = users.map(function(u) {
      return {
        userId: u.user_id,
        username: u.username,
        email: u.email,
        fullName: u.full_name,
        position: u.position,
        phone: u.phone,
        role: u.role ? u.role.toString().trim().toLowerCase() : "",
        isActive: u.is_active,
        rowNum: u.rowNum
      };
    });
    return { success: true, users: sanitizedUsers };
  } catch (e) {
    return { success: false, message: "ดึงผู้ใช้งานไม่สำเร็จ: " + e.toString() };
  }
}

/**
 * แก้ไข ปรับบทบาท และอนุมัติสมาชิก (แอดมินเท่านั้น)
 */
function adminUpdateUser(userData, token) {
  var userSession = verifySessionToken(token);
  if (!userSession || userSession.role !== "admin") {
    return { success: false, message: "สิทธิ์การเข้าถึงหน้านี้จำกัดเฉพาะแอดมินเท่านั้น" };
  }
  
  try {
    var rowNum = parseFloat(userData.rowNum);
    var updateData = {
      user_id: isNaN(parseFloat(userData.userId)) ? userData.userId : parseFloat(userData.userId),
      role: userData.role,
      is_active: userData.isActive,
      full_name: userData.fullName,
      position: userData.position,
      phone: userData.phone
    };
    updateRowInSheet("tb_user", rowNum, updateData);
    return { success: true, message: "บันทึกและแก้ไขสิทธิ์สมาชิกเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการอัปเดตสมาชิก: " + e.toString() };
  }
}

/**
 * ดึงรูปภาพโปรไฟล์ของผู้ใช้งานที่เป็น Admin บัญชีแรกที่มีรูป เพื่อใช้เป็นอวตารผู้พัฒนา
 */
function getAdminProfileImage() {
  try {
    var users = getSheetData("tb_user");
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
function ccmsDiagnosticTest() {
  Logger.log("=== เริ่มการตรวจสอบข้อผิดพลาดระบบ CCMS (CCMS Diagnostic Test) ===");
  try {
    var ss = getSpreadsheet();
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
    
    var defendants = getSheetData("tb_defendants");
    if (defendants.length > 0) {
      var sampleDef = defendants[0];
      Logger.log("4. ดึงข้อมูลตัวอย่างสำเร็จ: " + JSON.stringify(sampleDef).substring(0, 200) + "...");
      
      // ทดสอบการทำความสะอาดค่าบัตรประชาชน
      var cleaned = cleanCitizenId(sampleDef.citizen_id);
      Logger.log("5. ตัวอย่างการแปลงเลขบัตรประชาชน: " + sampleDef.citizen_id + " -> " + cleaned);
      
      // ทดสอบการแปลงข้อมูลเพื่อส่งกลับหน้าบ้าน
      var sanitized = sanitizeObjectForSerialization(sampleDef);
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
function parseThaiAddress(addressStr) {
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
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  // เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์ลบข้อมูล
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์ลบข้อมูลประวัติเด็ก" };
  }
  
  try {
    // 1. ตรวจสอบรหัสผ่านผู้ใช้ปัจจุบัน
    var users = getSheetData("tb_user");
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
    var hashedInputPassword = hashPassword(password, salt);
    
    if (foundUser.password && foundUser.password !== hashedInputPassword) {
      return { success: false, message: "รหัสผ่านไม่ถูกต้อง ไม่สามารถดำเนินการลบข้อมูลได้" };
    }
    
    // 2. ค้นหาแถวของเด็กและเยาวชนใน tb_defendants
    var ss = getSpreadsheet();
    var defSheet = ss.getSheetByName("tb_defendants");
    var defendants = getSheetData("tb_defendants");
    var citizenIdStr = cleanCitizenId(citizenId);
    var targetDef = null;
    
    for (var i = 0; i < defendants.length; i++) {
      var dCid = cleanCitizenId(defendants[i].citizen_id);
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
    var cases = getSheetData("tb_cases");
    var deletedAnyCase = false;
    // ลบคดีจากล่างขึ้นบน เพื่อไม่ให้กระทบตำแหน่งแถวถัดไป (rowNum) เมื่อทำการลบแถว
    for (var j = cases.length - 1; j >= 0; j--) {
      var cCid = cleanCitizenId(cases[j].citizen_id);
      if (cCid === citizenIdStr) {
        caseSheet.deleteRow(cases[j].rowNum);
        deletedAnyCase = true;
      }
    }
    if (deletedAnyCase) {
      clearSheetCache("tb_cases");
    }
    
    // 4. ลบข้อมูลประวัติใน tb_defendants
    defSheet.deleteRow(targetDef.rowNum);
    clearSheetCache("tb_defendants");
    
    return { success: true, message: "ทำการลบข้อมูลประวัติเยาวชนและคดีที่เกี่ยวข้องทั้งหมดสำเร็จแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลวันนัดหมายสำหรับใช้ในฟังก์ชันปฏิทิน
 */
function getAppointments(token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงปฏิทินวันนัด" };
  }
  
  try {
    var appointments = getSheetData("tb_appointment");
    var cases = getSheetData("tb_cases");
    var defendants = getSheetData("tb_defendants");
    
    var isAdminOrStaff = (userSession.role === "admin" || userSession.role === "psychologist" || userSession.role === "director");
    
    // 1. สร้าง Map สำหรับค้นหา citizen_id, counselor และ user_id จากเลขคดีดำ (black_case)
    var cleanBlackCaseMap = {};
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      if (c.black_case) {
        var key = c.black_case.toString().replace(/\s+/g, "").toLowerCase();
        cleanBlackCaseMap[key] = {
          citizen_id: cleanCitizenId(c.citizen_id),
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
      var dCid = cleanCitizenId(d.citizen_id);
      if (dCid) {
        defNameMap[dCid] = (d.title_name || "") + (d.first_name || "") + " " + (d.last_name || "");
      }
    }
    
    var list = [];
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      
      var appDateIso = formatDateAsIso(app.appointment_date);
      if (!appDateIso) continue;
      
      // ค้นหาข้อมูลคดีที่เชื่อมโยง
      var appBlackCaseKey = app.black_case.toString().replace(/\s+/g, "").toLowerCase();
      var caseInfo = cleanBlackCaseMap[appBlackCaseKey];
      var citizenId = caseInfo ? caseInfo.citizen_id : "";
      var caseCounselor = caseInfo ? caseInfo.counselor : "";
      var caseUserId = caseInfo ? caseInfo.user_id : "";
      var realBlackCase = caseInfo ? caseInfo.black_case : app.black_case;
      
      var appCounselor = app.appointment_counselor ? app.appointment_counselor.toString().trim() : "";
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

function getInitialAppState(startDateStr, endDateStr, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์เซสชันไม่ถูกต้องหรือหมดอายุ โปรดเข้าสู่ระบบอีกครั้ง" };
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

  var selectListsRes = null;
  try {
    selectListsRes = getFormSelectLists(token);
    if (selectListsRes && !selectListsRes.success) {
      debugErrors.push("SelectLists error: " + selectListsRes.message);
    }
  } catch (e) {
    debugErrors.push("SelectLists exception: " + e.toString());
    Logger.log("Error in getFormSelectLists: " + e.toString());
  }

  var defendantsRes = null;
  try {
    if (userSession.role !== 'user') {
      defendantsRes = getAllDefendantsWithCases(token);
      if (defendantsRes && !defendantsRes.success) {
        debugErrors.push("Defendants error: " + defendantsRes.message);
      }
    }
  } catch (e) {
    debugErrors.push("Defendants exception: " + e.toString());
    Logger.log("Error in getAllDefendantsWithCases: " + e.toString());
  }

  var appointmentsRes = null;
  try {
    if (userSession.role !== 'user') {
      appointmentsRes = getAppointments(token);
      if (appointmentsRes && !appointmentsRes.success) {
        debugErrors.push("Appointments error: " + appointmentsRes.message);
      }
    }
  } catch (e) {
    debugErrors.push("Appointments exception: " + e.toString());
    Logger.log("Error in getAppointments: " + e.toString());
  }

  var usersRes = null;
  try {
    if (userSession.role === 'admin') {
      usersRes = adminGetUsers(token);
      if (usersRes && !usersRes.success) {
        debugErrors.push("Users error: " + usersRes.message);
      }
    }
  } catch (e) {
    debugErrors.push("Users exception: " + e.toString());
    Logger.log("Error in adminGetUsers: " + e.toString());
  }

  var counselorsRes = null;
  try {
    if (userSession.role === 'admin' || userSession.role === 'psychologist') {
      counselorsRes = adminGetCounselors(token);
      if (counselorsRes && !counselorsRes.success) {
        debugErrors.push("Counselors error: " + counselorsRes.message);
      }
    }
  } catch (e) {
    debugErrors.push("Counselors exception: " + e.toString());
    Logger.log("Error in adminGetCounselors: " + e.toString());
  }
  
  return {
    success: true,
    dashboard: (dashboardRes && dashboardRes.success) ? dashboardRes.data : null,
    selectLists: (selectListsRes && selectListsRes.success) ? selectListsRes : null,
    defendants: (defendantsRes && defendantsRes.success) ? defendantsRes.data : [],
    appointments: (appointmentsRes && appointmentsRes.success) ? appointmentsRes.appointments : [],
    users: (usersRes && usersRes.success) ? usersRes.users : [],
    counselors: (counselorsRes && counselorsRes.success) ? counselorsRes.counselors : [],
    role: userSession.role,
    debugErrors: debugErrors
  };
}

/**
 * ดึงรายชื่อผู้ให้คำปรึกษาทั้งหมด (เฉพาะแอดมินและนักจิตวิทยา)
 */
function adminGetCounselors(token) {
  var userSession = verifySessionToken(token);
  if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
    return { success: false, message: "สิทธิ์การเข้าถึงข้อมูลจำกัดเฉพาะแอดมินและนักจิตวิทยาเท่านั้น" };
  }
  
  try {
    var counselors = getSheetData("tb_counselor");
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
 * แก้ไขและอัปเดตข้อมูลผู้ให้คำปรึกษา (เฉพาะแอดมินและนักจิตวิทยา)
 */
function adminUpdateCounselor(counselorData, token) {
  var userSession = verifySessionToken(token);
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
    updateRowInSheet("tb_counselor", rowNum, updateData);
    return { success: true, message: "บันทึกและแก้ไขข้อมูลผู้ให้คำปรึกษาเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดการอัปเดตผู้ให้คำปรึกษา: " + e.toString() };
  }
}

/**
 * เพิ่มข้อมูลผู้ให้คำปรึกษาใหม่ (เฉพาะแอดมินและนักจิตวิทยา)
 */
function adminAddCounselor(counselorData, token) {
  var userSession = verifySessionToken(token);
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
    var newRowNum = appendRowToSheet("tb_counselor", insertData);
    return { success: true, message: "เพิ่มข้อมูลผู้ให้คำปรึกษาใหม่เรียบร้อยแล้ว", rowNum: newRowNum };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการเพิ่มผู้ให้คำปรึกษา: " + e.toString() };
  }
}

/**
 * ลบข้อมูลผู้ให้คำปรึกษา (เฉพาะแอดมินและนักจิตวิทยา)
 */
function deleteCounselor(rowNum, password, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุ โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินหรือนักจิตวิทยาเท่านั้นที่มีสิทธิ์ลบข้อมูล" };
  }
  
  try {
    // 1. ตรวจสอบรหัสผ่านผู้ใช้ปัจจุบัน
    var users = getSheetData("tb_user");
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
    var hashedInputPassword = hashPassword(password, salt);
    
    if (foundUser.password && foundUser.password !== hashedInputPassword) {
      return { success: false, message: "รหัสผ่านไม่ถูกต้อง ไม่สามารถดำเนินการลบข้อมูลได้" };
    }
    
    // 2. ดำเนินการลบแถวใน tb_counselor
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("tb_counselor");
    var parsedRowNum = parseFloat(rowNum);
    
    if (isNaN(parsedRowNum) || parsedRowNum < 2 || parsedRowNum > sheet.getLastRow()) {
      return { success: false, message: "ตำแหน่งข้อมูลที่จะลบไม่ถูกต้อง" };
    }
    
    sheet.deleteRow(parsedRowNum);
    clearSheetCache("tb_counselor");
    
    return { success: true, message: "ลบข้อมูลผู้ให้คำปรึกษาเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการลบผู้ให้คำปรึกษา: " + e.toString() };
  }
}
