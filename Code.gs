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
  ensureColumnsExist("tb_defendants", ["psy_diagnosis", "risk_assessment", "counselor_comments", "note", "counselor_note"]);
}

/**
 * ตรวจเช็คและเพิ่มคอลัมน์ในตารางของชีทตามรายชื่อคอลัมน์ที่กำหนดแบบไดนามิก
 */
function ensureColumnsExist(sheetName, columnsArray) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  for (var i = 0; i < columnsArray.length; i++) {
    var colName = columnsArray[i];
    if (headers.indexOf(colName) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(colName);
      lastCol++;
      headers.push(colName);
    }
  }
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
 * รีเซ็ทรหัสผ่านผู้ใช้
 */
function resetUserPassword(usernameOrEmail, newPassword) {
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
    
    var cleanEmail = foundUser.email ? foundUser.email.toString().trim().toLowerCase() : cleanInput;
    var salt = cleanEmail + "ccms_extra_salt";
    var hashedPassword = hashPassword(newPassword, salt);
    
    updateRowInSheet("tb_user", foundUser.rowNum, { password: hashedPassword, updated_at: new Date().toISOString() });
    
    return {
      success: true,
      message: "รีเซ็ทรหัสผ่านใหม่เรียบร้อยแล้ว สามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการรีเซ็ทรหัสผ่าน: " + e.toString() };
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

    // === Counselor Active Cases Calculation ===
    var counselors = getSheetData("tb_counselor");
    var appointments = getSheetData("tb_appointment");
    var nowTimeForCounselor = new Date();
    nowTimeForCounselor.setHours(0, 0, 0, 0);
    var nowMsForCounselor = nowTimeForCounselor.getTime();

    // Build a set of black_case numbers that have at least one future appointment
    var blackCasesWithFutureApp = {};
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      var appDateIso = formatDateAsIso(app.appointment_date);
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
          var cleanId = cs.citizen_id ? cleanCitizenId(cs.citizen_id) : "";
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
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  
  try {
    var cases = getSheetData("tb_cases");
    var defendants = getSheetData("tb_defendants");
    var charges = getSheetData("tb_charge");
    
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
      var dCid = cleanCitizenId(defendants[i].citizen_id);
      if (dCid) {
        defendantMap[dCid] = defendants[i];
      }
    }
    
    var totalMatchingCases = 0;
    var chargeCounts = {};
    
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      
      // กรองวันที่ (เฉพาะรับเข้าใหม่ในช่วงเวลา)
      var blackDate = c.black_date ? normalizeSheetDate(c.black_date) : null;
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
      
      var caseCid = cleanCitizenId(c.citizen_id);
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
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ โปรดเข้าสู่ระบบใหม่อีกครั้ง" };
  
  if (userSession.role === "user") {
    return { success: false, message: "ระบบปฏิเสธคำขอ: บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงฟังก์ชันจัดการข้อมูลเด็กและคดี" };
  }
  
  try {
    ensurePsyDiagnosisColumn();
    var defendants = getSheetData("tb_defendants");
    var cases = getSheetData("tb_cases");
    var appointments = getSheetData("tb_appointment");
    
    // สร้าง map ค้นหาวันนัดหมายล่าสุดของแต่ละเลขคดีดำ (black_case)
    var latestAppMap = {};
    for (var i = 0; i < appointments.length; i++) {
      var app = appointments[i];
      if (!app.black_case || !app.appointment_date) continue;
      var cleanBlack = app.black_case.toString().trim().replace(/\s+/g, "").toLowerCase();
      var appDate = normalizeSheetDate(app.appointment_date);
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
      formatDefendantAddress(d);
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
    ensurePsyDiagnosisColumn();
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

    formatDefendantAddress(foundDef);

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
    ensureColumnsExist("tb_defendants", [
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
    
    var birthDateVal = parseDateCE(defData.birth_date);
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
    defRow.line_id = defData.line_id || "";
    defRow.line_user_id = defData.line_user_id !== undefined ? defData.line_user_id : (defRow.line_user_id || "");
    
    // สกัดรหัส LINE User ID (U...) และ Bot ID อัตโนมัติหากวางลิงก์จาก chat.line.biz
    var parsedYouthLine = parseLineChatInput(defRow.line_user_id || defRow.line_id);
    if (parsedYouthLine.userId) {
      defRow.line_user_id = parsedYouthLine.userId;
    }
    if (parsedYouthLine.botId) {
      saveSingleLineConfigValue("oa_bot_id", parsedYouthLine.botId);
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
    defRow.parent_line_id = defData.parent_line_id || "";
    defRow.parent_line_user_id = defData.parent_line_user_id !== undefined ? defData.parent_line_user_id : (defRow.parent_line_user_id || "");
    
    var parsedParentLine = parseLineChatInput(defRow.parent_line_user_id || defRow.parent_line_id);
    if (parsedParentLine.userId) {
      defRow.parent_line_user_id = parsedParentLine.userId;
    }
    if (parsedParentLine.botId) {
      saveSingleLineConfigValue("oa_bot_id", parsedParentLine.botId);
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
    
    var blackDateVal = parseDateCE(caseData.black_date);
    if (blackDateVal) blackDateVal.setHours(12, 0, 0, 0);
    
    var redDateVal = parseDateCE(caseData.red_date);
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

/**
 * ดึงข้อมูลนัดหมายทั้งหมดสำหรับแสดงบนแดชบอร์ด (ไม่กรองตามสิทธิ์ผู้ใช้ ทุกบทบาทเห็นได้ครบถ้วน)
 */
function getAllAppointmentsForDashboard(token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "เซสชันล็อกอินหมดอายุ" };
  
  try {
    var appointments = getSheetData("tb_appointment");
    var cases = getSheetData("tb_cases");
    
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
      
      var appDateIso = formatDateAsIso(app.appointment_date);
      if (!appDateIso) continue;
      
      var appBlackCaseKey = app.black_case.toString().replace(/\s+/g, "").toLowerCase();
      var caseInfo = caseMap[appBlackCaseKey];
      var caseCounselor = caseInfo ? caseInfo.counselor : "";
      var realBlackCase = caseInfo ? caseInfo.black_case : app.black_case;
      
      var appCounselor = app.appointment_counselor ? app.appointment_counselor.toString().trim() : "";
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
    var cfgMap = getLineConfigMap();
    linePublicCfg.oa_basic_id = cfgMap.oa_basic_id || "@012cryec";
    linePublicCfg.oa_bot_id = cfgMap.oa_bot_id || "";
    checkAndRunDailyLineNotificationsAuto(cfgMap);
  } catch (e) {
    Logger.log("LINE auto check error: " + e.toString());
  }

  return {
    success: true,
    dashboard: (dashboardRes && dashboardRes.success) ? dashboardRes.data : null,
    selectLists: null,
    defendants: [],
    appointments: [],
    dashboardAllAppointments: (dashboardAllRes && dashboardAllRes.success) ? dashboardAllRes.appointments : [],
    users: [],
    counselors: [],
    role: userSession.role,
    lineOaConfig: linePublicCfg,
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
 * ดึงข้อมูลรายชื่อเยาวชนและคดีคงค้างสะสมทั้งหมดในความดูแลของผู้ให้คำปรึกษาที่เจาะจง
 */
function getCounselorActiveCasesDetail(counselorName, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การเข้าใช้งานหมดอายุหรือเซสชันไม่ถูกต้อง" };
  }
  
  try {
    var cases = getSheetData("tb_cases");
    var defendants = getSheetData("tb_defendants");
    var appointments = getSheetData("tb_appointment");
    var charges = getSheetData("tb_charge");
    
    // Map charge code to charge description
    var chargeMap = {};
    for (var i = 0; i < charges.length; i++) {
      chargeMap[charges[i].charge_no] = charges[i].charge_statistics || charges[i].charge_name;
    }
    
    // Map citizen_id to defendant info
    var defMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var cid = cleanCitizenId(defendants[i].citizen_id);
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
      
      var cid = cs.citizen_id ? cleanCitizenId(cs.citizen_id) : "";
      if (!cid) continue;
      
      if (!youthMap[cid]) {
        var def = defMap[cid];
        var nickName = def && def.nick_name ? def.nick_name.toString().trim() : "";
        
        youthMap[cid] = {
          citizenId: cid,
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
            var appDateIso = formatDateAsIso(app.appointment_date);
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

/**
 * อัปเดตความเห็นเพิ่มเติมของผู้ให้คำปรึกษา
 */
function updateCounselorComments(citizenId, comments, token) {
  try {
    var userSession = verifySessionToken(token);
    if (!userSession) {
      return { success: false, message: "โปรดเข้าสู่ระบบใหม่" };
    }
    var role = userSession.role ? userSession.role.toString().toLowerCase() : "";
    if (role !== "admin" && role !== "psychologist" && role !== "counselor") {
      return { success: false, message: "ไม่มีสิทธิ์ดำเนินการเฉพาะผู้ให้คำปรึกษา นักจิตวิทยา และแอดมินเท่านั้น" };
    }
    
    ensurePsyDiagnosisColumn();
    
    var cleanId = cleanCitizenId(citizenId);
    if (!cleanId) {
      return { success: false, message: "เลขบัตรประชาชนไม่ถูกต้อง" };
    }
    
    var db = getSheetData("tb_defendants");
    var targetRow = null;
    for (var i = 0; i < db.length; i++) {
      var sheetCid = cleanCitizenId(db[i].citizen_id);
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
    
    updateRowInSheet("tb_defendants", rowNum, updateData);
    return { success: true, comments: comments, counselor_note: comments, message: "บันทึกความเห็นเพิ่มเติมเรียบร้อยแล้ว" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกความเห็น: " + e.toString() };
  }
}

/**
 * ดึงข้อมูลรายงานสถิติคดีประจำเดือน (งานช่วยอำนวยการ)
 */
function getMonthlyReport(monthYearStr, token) {
  var userSession = verifySessionToken(token);
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
    
    var cases = getSheetData("tb_cases");
    var appointments = getSheetData("tb_appointment");
    
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
    
    var charges = getSheetData("tb_charge");
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
      var blackDate = c.black_date ? normalizeSheetDate(c.black_date) : null;
      var redDate = c.red_date ? normalizeSheetDate(c.red_date) : null;
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
      var savedRows = getSheetData("tb_monthly_report");
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
    var counselors = getSheetData("tb_counselor");
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
  var userSession = verifySessionToken(token);
  if (!userSession) {
    return { success: false, message: "สิทธิ์การทำงานหมดอายุหรือเซสชันไม่ถูกต้อง โปรดล็อกอินใหม่อีกครั้ง" };
  }
  if (userSession.role !== 'admin' && userSession.role !== 'psychologist') {
    return { success: false, message: "ขออภัย คุณไม่มีสิทธิ์ในการบันทึกหรือแก้ไขข้อมูลสถิติรายงานนี้" };
  }
  
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("tb_monthly_report");
    if (!sheet) {
      sheet = ss.insertSheet("tb_monthly_report");
      sheet.appendRow(["month_year", "field_key", "field_value", "updated_at"]);
      SpreadsheetApp.flush();
    }
    
    var savedRows = getSheetData("tb_monthly_report");
    
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
          updateRowInSheet("tb_monthly_report", rowNum, {
            field_value: val,
            updated_at: nowStr
          });
        } else {
          appendRowToSheet("tb_monthly_report", {
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
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist" && userSession.role !== "director") {
    return { success: false, message: "สิทธิ์การเข้าถึงข้อมูลจำกัดเฉพาะผู้มีส่วนเกี่ยวข้อง" };
  }
  try {
    var cases = getSheetData("tb_cases");
    var defendants = getSheetData("tb_defendants");
    
    // จัดแผนที่ข้อมูลผู้ต้องหา
    var defMap = {};
    for (var i = 0; i < defendants.length; i++) {
      var d = defendants[i];
      var cid = cleanCitizenId(d.citizen_id);
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
        var cid = cleanCitizenId(c.citizen_id);
        var def = defMap[cid] || {};
        
        linkedCases.push({
          rowNum: c.rowNum,
          citizen_id: safeStr(c.citizen_id),
          black_date: safeStr(c.black_date),
          black_case: safeStr(c.black_case),
          case_type_id: safeNum(c.case_type_id),
          sub_case_type_id: safeNum(c.sub_case_type_id),
          case_type_abb: safeStr(c.case_type_abb),
          black_case_no: safeNum(c.black_case_no),
          black_case_year: safeNum(c.black_case_year),
          prosecutor: safeStr(c.prosecutor),
          charge: safeStr(c.charge),
          charge_no: safeNum(c.charge_no),
          age_at_offense: safeNum(c.age_at_offense),
          red_date: safeStr(c.red_date),
          red_case_no: safeNum(c.red_case_no),
          red_case_year: safeNum(c.red_case_year),
          red_because: safeStr(c.red_because),
          recidivism: safeStr(c.recidivism) || "ไม่ซ้ำ",
          previous_case_no: safeStr(c.previous_case_no),
          abb_black_criminal: safeStr(c.abb_black_criminal),
          black_criminal_no: safeNum(c.black_criminal_no),
          black_criminal_year: safeNum(c.black_criminal_year),
          abb_red_criminal: safeStr(c.abb_red_criminal),
          red_criminal_no: safeNum(c.red_criminal_no),
          red_criminal_year: safeNum(c.red_criminal_year),
          counselor: safeStr(c.counselor),
          user_id: safeStr(c.user_id),
          judge: safeStr(c.judge),
          officer: safeStr(c.officer),
          mediator: safeStr(c.mediator),
          mediator_add_date: safeStr(c.mediator_add_date),
          court_date_plan: safeStr(c.court_date_plan),
          plan_days: safeStr(c.plan_days),
          court_order_plan: safeStr(c.court_order_plan),
          note: safeStr(c.note),
          def_first_name: safeStr(def.first_name),
          def_last_name: safeStr(def.last_name),
          def_nick_name: safeStr(def.nick_name),
          def_title_name: safeStr(def.title_name),
          def_birth_date: safeStr(def.birth_date),
          def_parent_name: safeStr(def.parent_name),
          def_parent_relation: safeStr(def.parent_relation),
          def_address: safeStr(def.address),
          def_phone_number: safeStr(def.phone_number)
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
function safeStr(val) {
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

function safeNum(val) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return "";
  var n = parseFloat(val);
  return isNaN(n) ? val.toString() : n;
}

/**
 * ดึงรายละเอียดเต็มของคดีที่เลือก (สำหรับเมื่อผู้ใช้คลิกเลือกคดีจากการ์ด)
 */
function getCaseDetailData(rowNum, blackCase, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  try {
    var appointments = getSheetData("tb_appointment");
    var conditions = getSheetData("tb_condition");
    var activities = getSheetData("tb_activity");
    
    var bcStr = (blackCase || "").toString().trim();
    
    var caseAppointments = [];
    for (var i = 0; i < appointments.length; i++) {
      var a = appointments[i];
      if (a.black_case && a.black_case.toString().trim() === bcStr) {
        caseAppointments.push({
          black_case: safeStr(a.black_case),
          appointment_date: safeStr(a.appointment_date),
          appointment_time: safeStr(a.appointment_time),
          appointment_reason: safeStr(a.appointment_reason),
          appointment_counselor: safeStr(a.appointment_counselor),
          appointment_not: safeStr(a.appointment_not),
          appointment_performance: safeStr(a.appointment_performance),
          appointment_responsible_person: safeStr(a.appointment_responsible_person)
        });
      }
    }
    
    var caseConditions = [];
    for (var i = 0; i < conditions.length; i++) {
      var co = conditions[i];
      if (co.black_case && co.black_case.toString().trim() === bcStr) {
        caseConditions.push({
          black_case: safeStr(co.black_case),
          condition_no: safeStr(co.condition_no),
          condition: safeStr(co.condition),
          condition_performance_no: safeStr(co.condition_performance_no),
          condition_performance: safeStr(co.condition_performance)
        });
      }
    }
    
    var caseActivities = [];
    for (var i = 0; i < activities.length; i++) {
      var ac = activities[i];
      if (ac.black_case && ac.black_case.toString().trim() === bcStr) {
        caseActivities.push({
          black_case: safeStr(ac.black_case),
          activity_no: safeStr(ac.activity_no),
          activity_type: safeStr(ac.activity_type),
          activity_name: safeStr(ac.activity_name),
          activity_start_date: safeStr(ac.activity_start_date),
          activity_finish_date: safeStr(ac.activity_finish_date),
          activity_responsible_agency: safeStr(ac.activity_responsible_agency),
          activity_venue: safeStr(ac.activity_venue),
          activity_performance: safeStr(ac.activity_performance)
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
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ไม่มีสิทธิ์ในการบันทึกหรือแก้ไขตารางข้อมูลนัดหมาย" };
  }
  try {
    var ss = getSpreadsheet();
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
      var aptDate = parseDateCE(item.appointment_date);
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
    clearSheetCache("tb_appointment");
    return { success: true, message: "บันทึกตารางนัดหมายสำเร็จ" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกตารางนัดหมาย: " + e.toString() };
  }
}

/**
 * บันทึกรายการตารางกำหนด/เงื่อนไขของคดี
 */
function saveCaseConditions(blackCase, list, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ไม่มีสิทธิ์ในการบันทึกหรือแก้ไขตารางเงื่อนไขศาล" };
  }
  try {
    var ss = getSpreadsheet();
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
    clearSheetCache("tb_condition");
    return { success: true, message: "บันทึกตารางกำหนดเงื่อนไขสำเร็จ" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกตารางเงื่อนไขศาล: " + e.toString() };
  }
}

/**
 * บันทึกรายการตารางการเข้าร่วมกิจกรรมของคดี
 */
function saveCaseActivities(blackCase, list, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ไม่มีสิทธิ์ในการบันทึกหรือแก้ไขตารางข้อมูลกิจกรรมย่อย" };
  }
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("tb_activity");
    var data = sheet.getDataRange().getValues();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] && data[i][0].toString().trim() === blackCase.toString().trim()) {
        sheet.deleteRow(i + 1);
      }
    }
    
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var startDate = parseDateCE(item.activity_start_date);
      if (startDate) startDate.setHours(12, 0, 0, 0);
      var finishDate = parseDateCE(item.activity_finish_date);
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
    clearSheetCache("tb_activity");
    return { success: true, message: "บันทึกตารางข้อมูลกิจกรรมสำเร็จ" };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกตารางกิจกรรม: " + e.toString() };
  }
}

function parseDateCE(val) {
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
function parseLineChatInput(inputVal) {
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
function getOrCreateSheet(sheetName, headers) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  } else if (headers && headers.length > 0) {
    ensureColumnsExist(sheetName, headers);
  }
  return sheet;
}

/**
 * ค่าเริ่มต้นของระบบ LINE OA และเทมเพลตข้อความแจ้งเตือน
 */
function getDefaultLineConfig() {
  return {
    oa_basic_id: "@012cryec",
    oa_bot_id: "",
    channel_access_token: "",
    channel_secret: "",
    auto_send_enabled: "true",
    days_before_notify: "1,3",
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
    welcome_reply_template: "สวัสดีครับ/ค่ะ ศูนย์ให้คำปรึกษาฯ (@012cryec) ยินดีต้อนรับ 🙏\n\n" +
      "เพื่อลงทะเบียนรับข้อความแจ้งเตือนวันนัดหมายและกิจกรรมอัตโนมัติ กรุณาพิมพ์:\n" +
      "👉 \"เลขบัตรประชาชน 13 หลักของเยาวชน\" หรือ\n" +
      "👉 \"เลขคดี (เช่น มพ34/69)\"\n" +
      "ส่งเข้ามาในห้องแชทนี้ได้เลยครับ/ค่ะ",
    last_auto_run_date: ""
  };
}

/**
 * ดึงค่าการตั้งค่า LINE OA ทั้งหมดจากชีท tb_line_config
 */
function getLineConfigMap() {
  var defaults = getDefaultLineConfig();
  var sheet = getOrCreateSheet("tb_line_config", ["config_key", "config_value", "updated_at", "updated_by"]);
  var rows = getSheetData("tb_line_config");
  
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
        map[keyStr] = r.config_value.toString();
      }
    }
  }
  
  // บันทึกค่าเริ่มต้นลงในชีทหากยังไม่มีแถวข้อมูลเลย
  if (rows.length === 0) {
    var nowIso = new Date().toISOString();
    for (var dk in defaults) {
      if (defaults.hasOwnProperty(dk)) {
        appendRowToSheet("tb_line_config", {
          config_key: dk,
          config_value: defaults[dk],
          updated_at: nowIso,
          updated_by: "system"
        });
      }
    }
    clearSheetCache("tb_line_config");
  }
  
  return map;
}

/**
 * บันทึกหรืออัปเดตค่าตั้งค่าเดี่ยวลงใน tb_line_config
 */
function saveSingleLineConfigValue(key, value, updatedBy) {
  if (!key) return;
  getOrCreateSheet("tb_line_config", ["config_key", "config_value", "updated_at", "updated_by"]);
  var rows = getSheetData("tb_line_config");
  var nowIso = new Date().toISOString();
  var found = false;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].config_key && rows[i].config_key.toString().trim() === key) {
      updateRowInSheet("tb_line_config", rows[i].rowNum, {
        config_key: key,
        config_value: value !== undefined && value !== null ? value.toString() : "",
        updated_at: nowIso,
        updated_by: updatedBy || "system"
      });
      found = true;
      break;
    }
  }
  if (!found) {
    appendRowToSheet("tb_line_config", {
      config_key: key,
      config_value: value !== undefined && value !== null ? value.toString() : "",
      updated_at: nowIso,
      updated_by: updatedBy || "system"
    });
  }
  clearSheetCache("tb_line_config");
}

/**
 * ดึงข้อมูลโปรไฟล์ผู้ใช้จาก LINE Messaging API
 */
function fetchLineUserProfile(userId, channelAccessToken) {
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
 * ดึงข้อมูล Bot Info (เช่น userId ของ LINE OA สำหรับสร้างลิงก์ chat.line.biz/{botId}/chat/{userId})
 */
function fetchLineBotInfo(channelAccessToken) {
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
function sendLineReplyMessage(replyToken, messagesArray, channelAccessToken) {
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
function sendLinePushMessage(toUserId, messageText, channelAccessToken) {
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

/**
 * บันทึกรายชื่อผู้ติดต่อที่ทักหรือเพิ่มเพื่อนเข้ามาใน LINE OA ลงในชีท tb_line_contacts
 */
function upsertLineContactRecord(userId, displayName, lastMsg, linkedCid, linkedRole) {
  if (!userId) return;
  getOrCreateSheet("tb_line_contacts", ["line_user_id", "display_name", "last_message", "linked_citizen_id", "linked_role", "updated_at"]);
  var contacts = getSheetData("tb_line_contacts");
  var nowIso = new Date().toISOString();
  var existing = null;
  for (var i = 0; i < contacts.length; i++) {
    if (contacts[i].line_user_id && contacts[i].line_user_id.toString().trim() === userId) {
      existing = contacts[i];
      break;
    }
  }
  if (existing) {
    var rowObj = {
      line_user_id: userId,
      display_name: displayName || existing.display_name || "",
      last_message: lastMsg !== undefined ? lastMsg : (existing.last_message || ""),
      linked_citizen_id: linkedCid !== undefined ? linkedCid : (existing.linked_citizen_id || ""),
      linked_role: linkedRole !== undefined ? linkedRole : (existing.linked_role || ""),
      updated_at: nowIso
    };
    updateRowInSheet("tb_line_contacts", existing.rowNum, rowObj);
  } else {
    appendRowToSheet("tb_line_contacts", {
      line_user_id: userId,
      display_name: displayName || "",
      last_message: lastMsg || "",
      linked_citizen_id: linkedCid || "",
      linked_role: linkedRole || "",
      updated_at: nowIso
    });
  }
  clearSheetCache("tb_line_contacts");
}

/**
 * ทำความสะอาดรหัสเลขคดีเพื่อใช้เปรียบเทียบ (เช่น "มพ. 34/69" -> "มพ34/69")
 */
function normalizeBlackCaseKey(bc) {
  if (!bc) return "";
  return bc.toString().trim().replace(/[\s\.]/g, "").toLowerCase();
}

/**
 * Webhook รับข้อมูลจาก LINE Messaging API เมื่อเยาวชนหรือผู้ปกครองเพิ่มเพื่อนหรือส่งข้อความเข้า LINE OA (@012cryec)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var payload = JSON.parse(e.postData.contents);
    var cfg = getLineConfigMap();
    var accessToken = cfg.channel_access_token || "";
    
    // บันทึก destination (ซึ่งคือ Bot User ID ของ LINE OA) อัตโนมัติเพื่อใช้สร้างลิงก์แชทตรงบน PC
    if (payload.destination && (!cfg.oa_bot_id || cfg.oa_bot_id !== payload.destination)) {
      saveSingleLineConfigValue("oa_bot_id", payload.destination, "webhook");
    }
    
    var events = payload.events || [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var userId = (ev.source && ev.source.userId) ? ev.source.userId : "";
      var replyToken = ev.replyToken || "";
      if (!userId) continue;
      
      var profile = fetchLineUserProfile(userId, accessToken);
      var displayName = profile.displayName || "";
      
      if (ev.type === "follow") {
        upsertLineContactRecord(userId, displayName, "[เพิ่มเพื่อนใหม่]", "", "");
        if (replyToken && accessToken && cfg.welcome_reply_template) {
          sendLineReplyMessage(replyToken, [{ type: "text", text: cfg.welcome_reply_template }], accessToken);
        }
      } else if (ev.type === "message" && ev.message && ev.message.type === "text") {
        var text = (ev.message.text || "").toString().trim();
        upsertLineContactRecord(userId, displayName, text, undefined, undefined);
        
        handleIncomingLineTextForBinding(userId, displayName, text, replyToken, accessToken);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("doPost Webhook Error: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ประมวลผลข้อความที่ส่งเข้ามาใน LINE OA เพื่อผูกบัญชีเยาวชนหรือผู้ปกครองอัตโนมัติ
 */
function handleIncomingLineTextForBinding(userId, displayName, text, replyToken, accessToken) {
  ensureColumnsExist("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id"]);
  var defendants = getSheetData("tb_defendants");
  var cases = getSheetData("tb_cases");
  
  // 1. ตรวจสอบกรณีผู้ใช้กดปุ่มยืนยันสถานะ: "ยืนยันเยาวชน:1234567890123" หรือ "ยืนยันผู้ปกครอง:1234567890123"
  var confirmMatch = text.match(/^(?:ยืนยัน)?\s*(เยาวชน|ผู้ปกครอง|ผปค)[\s:]+(\d{13})$/);
  if (confirmMatch) {
    var roleWord = confirmMatch[1];
    var targetCid = confirmMatch[2];
    var isParent = (roleWord === "ผู้ปกครอง" || roleWord === "ผปค");
    
    var foundDef = null;
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId(defendants[i].citizen_id) === targetCid) {
        foundDef = defendants[i];
        break;
      }
    }
    
    if (foundDef) {
      var updateObj = {};
      for (var k in foundDef) {
        if (foundDef.hasOwnProperty(k)) updateObj[k] = foundDef[k];
      }
      if (isParent) {
        updateObj.parent_line_user_id = userId;
        if (!updateObj.parent_line_id || updateObj.parent_line_id.toString().trim() === "-") {
          updateObj.parent_line_id = displayName || userId;
        }
      } else {
        updateObj.line_user_id = userId;
        if (!updateObj.line_id || updateObj.line_id.toString().trim() === "-") {
          updateObj.line_id = displayName || userId;
        }
      }
      updateRowInSheet("tb_defendants", foundDef.rowNum, updateObj);
      upsertLineContactRecord(userId, displayName, text, targetCid, isParent ? "ผู้ปกครอง" : "เยาวชน");
      
      if (replyToken && accessToken) {
        var fullName = (foundDef.title_name || "") + (foundDef.first_name || "") + " " + (foundDef.last_name || "");
        var roleLabel = isParent ? "ผู้ปกครอง" : "เยาวชน";
        var successMsg = "✅ ผูกบัญชี LINE สำเร็จเรียบร้อย!\n\n" +
          "👤 ข้อมูลของ: " + fullName.trim() + "\n" +
          "🏷️ สถานะของคุณ: " + roleLabel + "\n\n" +
          "ระบบจะส่งข้อความแจ้งเตือนวันนัดหมายและกิจกรรมให้ท่านผ่านห้องสนทนานี้โดยอัตโนมัติครับ/ค่ะ";
        sendLineReplyMessage(replyToken, [{ type: "text", text: successMsg }], accessToken);
      }
    }
    return;
  }
  
  // 2. ตรวจสอบกรณีพิมพ์เลขบัตรประชาชน 13 หลัก หรือ เลขคดี (เช่น มพ34/69)
  var digitsOnly = text.replace(/\D/g, "");
  var matchedDef = null;
  var matchedCid = "";
  
  if (digitsOnly.length === 13) {
    matchedCid = digitsOnly;
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId(defendants[i].citizen_id) === matchedCid) {
        matchedDef = defendants[i];
        break;
      }
    }
  } else {
    // ลองค้นหาจากเลขคดีดำใน tb_cases (เช่น มพ34/69)
    var cleanInputCase = normalizeBlackCaseKey(text);
    if (cleanInputCase.length >= 3) {
      for (var cIdx = 0; cIdx < cases.length; cIdx++) {
        var cCaseKey = normalizeBlackCaseKey(cases[cIdx].black_case);
        if (cCaseKey && cCaseKey === cleanInputCase) {
          matchedCid = cleanCitizenId(cases[cIdx].citizen_id);
          break;
        }
      }
      if (matchedCid) {
        for (var dIdx = 0; dIdx < defendants.length; dIdx++) {
          if (cleanCitizenId(defendants[dIdx].citizen_id) === matchedCid) {
            matchedDef = defendants[dIdx];
            break;
          }
        }
      }
    }
  }
  
  if (matchedDef && matchedCid && replyToken && accessToken) {
    var defFullName = ((matchedDef.title_name || "") + (matchedDef.first_name || "") + " " + (matchedDef.last_name || "")).trim();
    var promptMessage = {
      type: "text",
      text: "🔍 พบข้อมูลในระบบ:\nชื่อเยาวชน: " + defFullName + "\n\nกรุณากดปุ่มด้านล่างเพื่อยืนยันว่าท่านคือ เยาวชน หรือ ผู้ปกครอง:\n(หรือพิมพ์ \"เยาวชน " + matchedCid + "\" หรือ \"ผู้ปกครอง " + matchedCid + "\")",
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: "👦 ฉันคือเยาวชน",
              text: "ยืนยันเยาวชน:" + matchedCid
            }
          },
          {
            type: "action",
            action: {
              type: "message",
              label: "👨‍👩‍👦 ฉันคือผู้ปกครอง",
              text: "ยืนยันผู้ปกครอง:" + matchedCid
            }
          }
        ]
      }
    };
    sendLineReplyMessage(replyToken, [promptMessage], accessToken);
  }
}

/**
 * แปลงวันที่เป็นรูปแบบภาษาไทยสวยงาม เช่น "14 ส.ค. 2569"
 */
function formatThaiShortDateServer(dateVal) {
  var d = normalizeSheetDate(dateVal);
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
function renderLineMessageTemplate(templateStr, vars) {
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
function buildLineReminderItems(daysAheadLimit, cfgMap) {
  var cfg = cfgMap || getLineConfigMap();
  var cases = getSheetData("tb_cases");
  var defendants = getSheetData("tb_defendants");
  var appointments = getSheetData("tb_appointment");
  var activities = getSheetData("tb_activity");
  getOrCreateSheet("tb_line_logs", ["log_id", "sent_date", "sent_at", "notify_type", "black_case", "citizen_id", "recipient_role", "recipient_name", "line_user_id", "target_date", "title", "status", "error_message"]);
  var logs = getSheetData("tb_line_logs");
  
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
    var normKey = normalizeBlackCaseKey(c.black_case);
    caseMap[exactKey] = c;
    if (normKey) caseMap[normKey] = c;
  }
  
  // 2. สร้าง Map เชื่อมโยง citizen_id -> ข้อมูลเยาวชนและผู้ปกครองใน tb_defendants
  var defMap = {};
  for (var i = 0; i < defendants.length; i++) {
    var d = defendants[i];
    var cid = cleanCitizenId(d.citizen_id);
    if (cid) {
      defMap[cid] = d;
    }
  }
  
  // 3. สร้าง Map ตรวจสอบประวัติการส่งของวันนี้และประวัติการส่งทั้งหมดสำหรับรายการนั้น
  var sentTodayMap = {};
  var everSentMap = {};
  for (var i = 0; i < logs.length; i++) {
    var lg = logs[i];
    if (lg.status === "สำเร็จ") {
      var itemKey = (lg.notify_type || "") + "|" + normalizeBlackCaseKey(lg.black_case) + "|" + (lg.target_date || "") + "|" + (lg.recipient_role || "");
      everSentMap[itemKey] = lg.sent_at || lg.sent_date || "ส่งแล้ว";
      if (lg.sent_date === todayIso) {
        sentTodayMap[itemKey] = true;
      }
    }
  }
  
  var maxDays = (daysAheadLimit !== undefined && daysAheadLimit !== null) ? parseInt(daysAheadLimit, 10) : 30;
  if (isNaN(maxDays)) maxDays = 30;
  
  var items = [];
  
  // Helper สร้างข้อมูลผู้รับและข้อความ
  function createReminderEntry(type, bcRaw, targetDateObj, titleText, subTitleText, extraVars) {
    if (!bcRaw || !targetDateObj) return;
    var dCopy = new Date(targetDateObj.getTime());
    dCopy.setHours(0, 0, 0, 0);
    var diffDays = Math.round((dCopy.getTime() - todayMs) / 86400000);
    
    // แสดงตั้งแต่วันนี้ (diffDays >= 0) ไปจนถึง maxDays ข้างหน้า
    if (diffDays < 0 || diffDays > maxDays) return;
    
    var exactKey = bcRaw.toString().trim().replace(/\s+/g, "").toLowerCase();
    var normKey = normalizeBlackCaseKey(bcRaw);
    var matchedCase = caseMap[exactKey] || caseMap[normKey] || null;
    var cid = matchedCase ? cleanCitizenId(matchedCase.citizen_id) : "";
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
    
    var daysLabel = diffDays === 0 ? "วันนี้" : (diffDays === 1 ? "พรุ่งนี้ (อีก 1 วัน)" : "อีก " + diffDays + " วัน");
    var targetDateIso = Utilities.formatDate(dCopy, "GMT+7", "yyyy-MM-dd");
    
    var templateVars = {
      black_case: bcRaw.toString().trim(),
      citizen_id: cid || "-",
      defendant_name: defName,
      nick_name: (matchedDef && matchedDef.nick_name) ? matchedDef.nick_name : "-",
      guardian_name: guardianName,
      days_remaining: daysLabel,
      counselor: extraVars.counselor || (matchedCase && matchedCase.counselor ? matchedCase.counselor : "-"),
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
    var renderedMsg = renderLineMessageTemplate(rawTpl, templateVars);
    
    var youthKey = type + "|" + normKey + "|" + targetDateIso + "|เยาวชน";
    var parentKey = type + "|" + normKey + "|" + targetDateIso + "|ผู้ปกครอง";
    
    items.push({
      id: type + "_" + normKey + "_" + targetDateIso + "_" + items.length,
      notify_type: type,
      notify_type_label: type === "activity" ? "กิจกรรม (tb_activity)" : "วันนัดหมาย (tb_appointment)",
      black_case: bcRaw.toString().trim(),
      citizen_id: cid,
      defendant_name: defName,
      guardian_name: guardianName,
      target_date_iso: targetDateIso,
      target_date_thai: formatThaiShortDateServer(dCopy),
      diff_days: diffDays,
      days_label: daysLabel,
      title: titleText,
      subtitle: subTitleText,
      line_id: lineId,
      line_user_id: lineUserId,
      parent_line_id: parentLineId,
      parent_line_user_id: parentLineUserId,
      youth_sent_today: !!sentTodayMap[youthKey],
      parent_sent_today: !!sentTodayMap[parentKey],
      youth_last_sent: everSentMap[youthKey] || "",
      parent_last_sent: everSentMap[parentKey] || "",
      message_text: renderedMsg
    });
  }
  
  // 4. กวาดข้อมูลจากตาราง tb_appointment
  for (var i = 0; i < appointments.length; i++) {
    var ap = appointments[i];
    if (!ap.black_case || !ap.appointment_date) continue;
    var apDate = normalizeSheetDate(ap.appointment_date);
    if (!apDate) continue;
    var apTimeStr = safeStr(ap.appointment_time) || "-";
    var apReasonStr = safeStr(ap.appointment_reason) || "นัดหมายตามกำหนด";
    var apCounselorStr = safeStr(ap.appointment_counselor);
    
    createReminderEntry(
      "appointment",
      ap.black_case,
      apDate,
      apReasonStr,
      "เวลา: " + apTimeStr + (apCounselorStr ? " | ผู้ให้คำปรึกษา: " + apCounselorStr : ""),
      {
        appointment_date: formatThaiShortDateServer(apDate),
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
    var acStartDate = normalizeSheetDate(ac.activity_start_date);
    if (!acStartDate) continue;
    var acFinishDate = normalizeSheetDate(ac.activity_finish_date);
    var acNameStr = safeStr(ac.activity_name) || "เข้าร่วมกิจกรรม/โครงการ";
    var acTypeStr = safeStr(ac.activity_type) || "";
    var acVenueStr = safeStr(ac.activity_venue) || "-";
    var acAgencyStr = safeStr(ac.activity_responsible_agency) || "-";
    
    createReminderEntry(
      "activity",
      ac.black_case,
      acStartDate,
      acNameStr + (acTypeStr ? " (" + acTypeStr + ")" : ""),
      "สถานที่: " + acVenueStr + " | หน่วยงาน: " + acAgencyStr,
      {
        activity_name: acNameStr,
        activity_type: acTypeStr ? "(" + acTypeStr + ")" : "",
        activity_start_date: formatThaiShortDateServer(acStartDate),
        activity_finish_date: acFinishDate ? formatThaiShortDateServer(acFinishDate) : formatThaiShortDateServer(acStartDate),
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
 * โหลดข้อมูลหน้าจัดการแจ้งเตือน LINE OA ทั้งหมด (สำหรับ Admin และ นักจิตวิทยา)
 */
function getLineOaModuleData(daysAhead, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "เฉพาะผู้ดูแลระบบ (Admin) และนักจิตวิทยาเท่านั้นที่สามารถเข้าถึงการตั้งค่าระบบแจ้งเตือน LINE OA ได้" };
  }
  
  try {
    var cfg = getLineConfigMap();
    var upcomingList = buildLineReminderItems(daysAhead || 30, cfg);
    
    getOrCreateSheet("tb_line_logs", ["log_id", "sent_date", "sent_at", "notify_type", "black_case", "citizen_id", "recipient_role", "recipient_name", "line_user_id", "target_date", "title", "status", "error_message"]);
    var allLogs = getSheetData("tb_line_logs");
    allLogs.sort(function(a, b) {
      return (b.rowNum || 0) - (a.rowNum || 0);
    });
    var recentLogs = allLogs.slice(0, 100);
    
    getOrCreateSheet("tb_line_contacts", ["line_user_id", "display_name", "last_message", "linked_citizen_id", "linked_role", "updated_at"]);
    var allContacts = getSheetData("tb_line_contacts");
    allContacts.sort(function(a, b) {
      return (b.rowNum || 0) - (a.rowNum || 0);
    });
    
    return {
      success: true,
      config: cfg,
      upcomingList: sanitizeObjectForSerialization(upcomingList),
      logs: sanitizeObjectForSerialization(recentLogs),
      contacts: sanitizeObjectForSerialization(allContacts.slice(0, 100))
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการโหลดข้อมูลระบบแจ้งเตือน LINE OA: " + e.toString() };
  }
}

/**
 * บันทึกการตั้งค่า LINE OA และข้อความเทมเพลตล่วงหน้า (เฉพาะ Admin และ นักจิตวิทยา)
 */
function saveLineOaSettings(newConfig, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "ระบบจำกัดสิทธิ์: เฉพาะแอดมินและนักจิตวิทยาเท่านั้นที่สามารถแก้ไขข้อความตั้งค่าล่วงหน้าได้" };
  }
  
  try {
    var keysToSave = [
      "oa_basic_id",
      "oa_bot_id",
      "channel_access_token",
      "channel_secret",
      "auto_send_enabled",
      "days_before_notify",
      "appointment_template",
      "activity_template",
      "welcome_reply_template"
    ];
    
    for (var i = 0; i < keysToSave.length; i++) {
      var k = keysToSave[i];
      if (newConfig[k] !== undefined) {
        saveSingleLineConfigValue(k, newConfig[k], userSession.fullName || userSession.username);
      }
    }
    
    // หากมีการระบุ Channel Access Token ให้ดึง Bot User ID (U...) อัตโนมัติจาก LINE API เพื่อใช้เปิดแชทตรงบน PC
    var botInfoMsg = "";
    if (newConfig.channel_access_token && newConfig.channel_access_token.toString().trim() !== "") {
      var botInfo = fetchLineBotInfo(newConfig.channel_access_token.toString().trim());
      if (botInfo && botInfo.userId) {
        saveSingleLineConfigValue("oa_bot_id", botInfo.userId, "line_api");
        if (botInfo.basicId) {
          saveSingleLineConfigValue("oa_basic_id", botInfo.basicId, "line_api");
        }
        botInfoMsg = " (เชื่อมต่อกับบัญชี LINE OA: " + (botInfo.displayName || botInfo.basicId || "") + " สำเร็จ!)";
      }
    }
    
    var updatedCfg = getLineConfigMap();
    return {
      success: true,
      message: "บันทึกการตั้งค่าและข้อความแจ้งเตือนอัตโนมัติเรียบร้อยแล้ว" + botInfoMsg,
      config: updatedCfg
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า: " + e.toString() };
  }
}

/**
 * ส่งข้อความแจ้งเตือนนัดหมาย/กิจกรรม รายรายการ (หรือส่งด่วนถึงเยาวชน/ผู้ปกครอง)
 */
function sendSingleLineReminder(itemData, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist" && userSession.role !== "counselor") {
    return { success: false, message: "ไม่มีสิทธิ์ในการส่งข้อความแจ้งเตือน" };
  }
  
  try {
    var cfg = getLineConfigMap();
    var accessToken = (cfg.channel_access_token || "").toString().trim();
    if (!accessToken) {
      return {
        success: false,
        message: "ยังไม่ได้ตั้งค่า Channel Access Token ของ LINE OA (@012cryec) กรุณาไปที่แท็บ 'ตั้งค่าการเชื่อมต่อ LINE OA' เพื่อใส่รหัสเชื่อมต่อก่อนครับ"
      };
    }
    
    getOrCreateSheet("tb_line_logs", ["log_id", "sent_date", "sent_at", "notify_type", "black_case", "citizen_id", "recipient_role", "recipient_name", "line_user_id", "target_date", "title", "status", "error_message"]);
    
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
        message: "เยาวชนและผู้ปกครองในคดีนี้ยังไม่ได้ผูก LINE User ID (U...) กับ LINE OA (@012cryec) กรุณาให้เยาวชน/ผู้ปกครองแอดไลน์ @012cryec แล้วพิมพ์เลขบัตรประชาชน 13 หลัก หรือเลขคดี เพื่อผูกบัญชีก่อนครับ"
      };
    }
    
    var sentCount = 0;
    var errors = [];
    
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var pushRes = sendLinePushMessage(t.uid, msgText, accessToken);
      appendRowToSheet("tb_line_logs", {
        log_id: "LOG-" + now.getTime() + "-" + i,
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
    
    clearSheetCache("tb_line_logs");
    
    if (sentCount > 0) {
      return {
        success: true,
        message: "ส่งข้อความแจ้งเตือนผ่าน LINE OA สำเร็จ (" + sentCount + " บัญชี)" + (errors.length > 0 ? " | ข้อผิดพลาดบางส่วน: " + errors.join(", ") : "")
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
 * ฟังก์ชันรันการส่งแจ้งเตือนอัตโนมัติประจำวัน (เรียกใช้จาก Time-driven Trigger หรือกดปุ่มรันตรวจสอบทันที)
 */
function runDailyLineNotifications(token) {
  // หากเรียกผ่านหน้าเว็บ จะมี token มาด้วย ให้ตรวจสิทธิ์เฉพาะ admin หรือ psychologist
  if (token && typeof token === "string") {
    var userSession = verifySessionToken(token);
    if (!userSession || (userSession.role !== "admin" && userSession.role !== "psychologist")) {
      return { success: false, message: "เฉพาะแอดมินและนักจิตวิทยาเท่านั้นที่สามารถสั่งรันระบบแจ้งเตือนได้" };
    }
  }
  
  try {
    var cfg = getLineConfigMap();
    var accessToken = (cfg.channel_access_token || "").toString().trim();
    if (!accessToken) {
      return { success: false, message: "ยังไม่ได้ตั้งค่า Channel Access Token ในระบบ" };
    }
    
    // แปลงค่า days_before_notify เช่น "1,3" -> [1, 3]
    var daysStr = (cfg.days_before_notify || "1,3").toString();
    var dayParts = daysStr.split(",");
    var targetDaysMap = {};
    var maxDay = 7;
    for (var i = 0; i < dayParts.length; i++) {
      var dNum = parseInt(dayParts[i].trim(), 10);
      if (!isNaN(dNum) && dNum >= 0) {
        targetDaysMap[dNum] = true;
        if (dNum > maxDay) maxDay = dNum;
      }
    }
    
    var items = buildLineReminderItems(maxDay + 2, cfg);
    var now = new Date();
    var todayIso = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
    var nowTimeStr = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss");
    
    var totalSent = 0;
    var totalMatched = 0;
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!targetDaysMap[item.diff_days]) continue;
      totalMatched++;
      
      // ส่งหาเยาวชน (ถ้ามี line_user_id และวันนี้ยังไม่ได้ส่ง)
      if (item.line_user_id && !item.youth_sent_today) {
        var resY = sendLinePushMessage(item.line_user_id, item.message_text, accessToken);
        appendRowToSheet("tb_line_logs", {
          log_id: "AUTO-" + now.getTime() + "-Y" + i,
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
        if (resY.success) totalSent++;
      }
      
      // ส่งหาผู้ปกครอง (ถ้ามี parent_line_user_id และวันนี้ยังไม่ได้ส่ง)
      if (item.parent_line_user_id && !item.parent_sent_today) {
        var resP = sendLinePushMessage(item.parent_line_user_id, item.message_text, accessToken);
        appendRowToSheet("tb_line_logs", {
          log_id: "AUTO-" + now.getTime() + "-P" + i,
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
        if (resP.success) totalSent++;
      }
    }
    
    clearSheetCache("tb_line_logs");
    saveSingleLineConfigValue("last_auto_run_date", todayIso, "auto_scheduler");
    
    return {
      success: true,
      message: "ตรวจสอบนัดหมายตามเกณฑ์ล่วงหน้า (" + daysStr + " วัน) พบ " + totalMatched + " รายการ | ส่งข้อความแจ้งเตือนสำเร็จ " + totalSent + " ข้อความ",
      totalSent: totalSent,
      totalMatched: totalMatched
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการรันระบบแจ้งเตือนอัตโนมัติ: " + e.toString() };
  }
}

/**
 * ตรวจสอบและรันการส่งแจ้งเตือนอัตโนมัติวันละ 1 ครั้งเมื่อมีการเข้าใช้งานระบบ
 */
function checkAndRunDailyLineNotificationsAuto(cfgMap) {
  var cfg = cfgMap || getLineConfigMap();
  if (cfg.auto_send_enabled !== "true") return;
  if (!cfg.channel_access_token || cfg.channel_access_token.toString().trim() === "") return;
  
  var todayIso = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  if (cfg.last_auto_run_date === todayIso) return; // รันของวันนี้ไปแล้ว
  
  runDailyLineNotifications(null);
}

/**
 * ผูกบัญชีผู้ติดต่อจากรายการผู้ติดตาม LINE OA เข้ากับข้อมูลเยาวชนหรือผู้ปกครองด้วยคลิกเดียว
 */
function linkLineContactToDefendant(payload, token) {
  var userSession = verifySessionToken(token);
  if (!userSession) return { success: false, message: "สิทธิ์ล็อกอินหมดอายุ" };
  if (userSession.role !== "admin" && userSession.role !== "psychologist") {
    return { success: false, message: "เฉพาะแอดมินและนักจิตวิทยาเท่านั้นที่มีสิทธิ์ผูกบัญชี LINE OA" };
  }
  
  try {
    var cid = cleanCitizenId(payload.citizen_id);
    var lineUserId = (payload.line_user_id || "").toString().trim();
    var displayName = (payload.display_name || "").toString().trim();
    var targetRole = payload.target_role || "youth"; // 'youth' or 'parent'
    
    if (!cid || !lineUserId) {
      return { success: false, message: "กรุณาระบุเลขบัตรประชาชนของเยาวชนและบัญชี LINE ที่ต้องการผูก" };
    }
    
    ensureColumnsExist("tb_defendants", ["line_id", "parent_line_id", "line_user_id", "parent_line_user_id"]);
    var defendants = getSheetData("tb_defendants");
    var foundDef = null;
    for (var i = 0; i < defendants.length; i++) {
      if (cleanCitizenId(defendants[i].citizen_id) === cid) {
        foundDef = defendants[i];
        break;
      }
    }
    
    if (!foundDef) {
      return { success: false, message: "ไม่พบข้อมูลเยาวชนเลขบัตรประชาชน " + cid + " ในระบบ" };
    }
    
    var rowCopy = {};
    for (var k in foundDef) {
      if (foundDef.hasOwnProperty(k)) rowCopy[k] = foundDef[k];
    }
    
    if (targetRole === "parent") {
      rowCopy.parent_line_user_id = lineUserId;
      if (displayName && (!rowCopy.parent_line_id || rowCopy.parent_line_id === "-")) {
        rowCopy.parent_line_id = displayName;
      }
    } else {
      rowCopy.line_user_id = lineUserId;
      if (displayName && (!rowCopy.line_id || rowCopy.line_id === "-")) {
        rowCopy.line_id = displayName;
      }
    }
    
    updateRowInSheet("tb_defendants", foundDef.rowNum, rowCopy);
    upsertLineContactRecord(lineUserId, displayName, undefined, cid, targetRole === "parent" ? "ผู้ปกครอง" : "เยาวชน");
    
    var defFullName = ((foundDef.title_name || "") + (foundDef.first_name || "") + " " + (foundDef.last_name || "")).trim();
    return {
      success: true,
      message: "ผูกบัญชี LINE (" + (displayName || lineUserId) + ") เข้ากับ " + defFullName + " (" + (targetRole === "parent" ? "ผู้ปกครอง" : "เยาวชน") + ") สำเร็จ!"
    };
  } catch (e) {
    return { success: false, message: "เกิดข้อผิดพลาดในการผูกบัญชี: " + e.toString() };
  }
}

