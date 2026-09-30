const UAParser = require("ua-parser-js");

function returnCurrentDate() {
  var currentdate = new Date();
  var create_date = {
    date: currentdate.getDate().toString(),
    month: (currentdate.getMonth() + 1).toString(),
    year: currentdate.getFullYear().toString(),
    hh: currentdate.getHours().toString(),
    mm: currentdate.getMinutes().toString(),
    ss: currentdate.getSeconds().toString(),
  };

  return create_date;
}

function extractDeviceInfo(req) {
  const userAgent = req.headers["user-agent"] || "";
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser: result.browser.name + " " + result.browser.version,
    os: result.os.name + " " + result.os.version,
    device: result.device.type || "desktop",
    userAgent: userAgent,
  };
}

const auth_JWT_Login = (prop, req, res, next) => {
  let token = req.headers["x-access-token"] || req.headers["authorization"];

  if (token === undefined) {
    return res
      .status(401)
      .send({ success: false, message: "Invalid Permission" });
  } else {
    if (token.startsWith("Bearer ")) {
      token = token.slice(7, token.length);
    }

    if (token) {
      prop.jwt.verify(token, "access_token", (err, decoded) => {
        if (err) {
          return res.status(401).send({
            success: false,
            message: "Invalid Token",
          });
        } else {
          req.decode = decoded;
          auth_DB_Session(prop, req, res, async () => {
            next();
          });
        }
      });
    } else {
      return res.status(401).send({
        success: false,
        message: "Invalid Token",
      });
    }
  }
};

const auth_DB_Session = async (prop, req, res, next) => {
  try {
    let token = req.headers["x-access-token"] || req.headers["authorization"];

    if (!token) {
      return res.status(401).send({
        success: false,
        message: "Token not provided",
      });
    }

    // Remove 'Bearer ' if it exists
    if (token.startsWith("Bearer ")) {
      token = token.slice(7).trim();
    }

    // Check token in Firebase
    const auth = await prop.firebaseCRUD_Server.findByKey(
      "Web_Token",
      "access_token",
      token
    );

    if (auth) {
      next();
    } else {
      return res.status(401).send({
        success: false,
        message: "Invalid Session",
      });
    }
  } catch (error) {
    console.error("auth_DB_Session Error:", error);
    return res.status(500).send({
      success: false,
      message: "Server error during authentication",
    });
  }
};

function dateTime_GetPeroid_and_Time_End_or_Not_End(
  dateAdd,
  monthAdd,
  yearAdd,
  hhAdd,
  mmAdd,
  ssAdd
) {
  var peroid = dateTime_GetPeroid(dateAdd, monthAdd, yearAdd);
  var returnData = "NA";

  if (peroid < 0) {
    returnData = "end";
  } else {
    if (peroid == 0) {
      // Check Time
      var endTime = hhAdd + ":" + mmAdd + ":" + ssAdd;
      var current =
        dateTime_Get_Current_Hour() +
        ":" +
        dateTime_Get_Current_Minute() +
        ":" +
        dateTime_Get_Current_Second();

      endTime = endTime.split(":");
      current = current.split(":");
      var totalSeconds1 = parseInt(
        endTime[0] * 3600 + endTime[1] * 60 + endTime[2]
      );
      var totalSeconds2 = parseInt(
        current[0] * 3600 + current[1] * 60 + current[2]
      );

      if (totalSeconds1 < totalSeconds2) {
        returnData = "end";
      } else {
        returnData = "not_end";
      }
    } else {
      returnData = "not_end";
    }
  }

  return returnData;
}

function dateTime_Get_Current_Hour() {
  const date = new Date();

  var value = date.getHours();

  var resuldCheck = value.toString();
  if (resuldCheck.length == 1) {
    resuldCheck = "0" + value.toString();
  }

  return resuldCheck;
}

function dateTime_Get_Current_Minute() {
  const date = new Date();

  var value = date.getMinutes();
  var resuldCheck = value.toString();
  if (resuldCheck.length == 1) {
    resuldCheck = "0" + value.toString();
  }

  return resuldCheck;
}

function dateTime_Get_Current_Second() {
  const date = new Date();

  var value = date.getSeconds();

  var resuldCheck = value.toString();
  if (resuldCheck.length == 1) {
    resuldCheck = "0" + value.toString();
  }

  return resuldCheck;
}

function dateTime_GetPeroid(dateAdd, monthAdd, yearAdd) {
  const date = new Date();
  var days = date.getDate();
  var months = date.getMonth() + 1;
  var years = date.getFullYear();

  return dateTime_GetPeroid_2_Date(
    days,
    months,
    years,
    dateAdd,
    monthAdd,
    yearAdd
  );
}

function dateTime_GetPeroid_2_Date(
  start_Date,
  start_Month,
  start_Year,
  end_Data,
  end_Month,
  end_year
) {
  var firstDate = start_Month + "/" + start_Date + "/" + start_Year;
  var endData = end_Month + "/" + end_Data + "/" + end_year;

  return datediff(parseDate(firstDate), parseDate(endData));
}

function parseDate(str) {
  var mdy = str.split("/");
  return new Date(mdy[2], mdy[0] - 1, mdy[1]);
}

// Date Sort
function datediff(first, second) {
  return Math.round((second - first) / (1000 * 60 * 60 * 24));
}

function cambodiaDate() {
  const currentDateTimeInCambodia = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, // 24-hour format
  });
  return currentDateTimeInCambodia;
}

function encrypt(value) {
  const prefix = "DE";
  const suffix = "EN";

  return base64Encode(`${prefix}---(${value}---(${suffix}`);
}

function decrypt(encodedValue) {
  const decoded = base64Decode(encodedValue);
  const parts = decoded.split("---(");
  return parts[1] || null;
}

// Replace window.btoa
function base64Encode(text) {
  return Buffer.from(text, "utf-8").toString("base64");
}

// Replace window.atob
function base64Decode(encoded) {
  return Buffer.from(encoded, "base64").toString("utf-8");
}

function checkValidtion(res, req, requiredFields) {
  for (const field of requiredFields) {
    const value = req.body[field.key];

    if (
      value === undefined || // missing key
      value === null || // null value
      value === "" // empty string
    ) {
      res.json({
        success: false,
        message: `សូមបញ្ចូល ${field.label}`,
      });
      return false;
    }
  }
  return true;
}

// Fields a client must never set through an update request
const PROTECTED_FIELDS = [
  "_id",
  "__v",
  "deleted",
  "created_by",
  "updated_by",
  "created_date",
  "updated_date",
];

// Copy of req.body without protected fields (plus any extra ones for this route)
function sanitizeUpdate(body, extraProtected = []) {
  const blocked = [...PROTECTED_FIELDS, ...extraProtected];
  const clean = {};
  for (const key of Object.keys(body || {})) {
    if (!blocked.includes(key) && !key.startsWith("$")) clean[key] = body[key];
  }
  return clean;
}

module.exports = {
  auth_JWT_Login,
  auth_DB_Session,
  returnCurrentDate,
  dateTime_GetPeroid,
  dateTime_GetPeroid_and_Time_End_or_Not_End,
  cambodiaDate,
  encrypt,
  decrypt,
  extractDeviceInfo,
  checkValidtion,
  sanitizeUpdate,
};
