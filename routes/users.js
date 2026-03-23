var express = require("express");
var router = express.Router();
let {
  postUserValidator,
  validateResult,
} = require("../utils/validatorHandler");
let userController = require("../controllers/users");
let cartModel = require("../schemas/cart");
let { checkLogin, checkRole } = require("../utils/authHandler.js");
let { uploadExcel } = require("../utils/uploadHandler");
let roleModel = require("../schemas/roles");
let mailHandler = require("../utils/sendMailHandler");
let path = require("path");
let excelJS = require("exceljs");
let fs = require("fs");
let crypto = require("crypto");

let userModel = require("../schemas/users");
const { default: mongoose } = require("mongoose");
//- Strong password

function generateRandomPassword(length = 16) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let index = 0; index < length; index++) {
    password += alphabet[bytes[index] % alphabet.length];
  }
  return password;
}

function getCellText(cellValue) {
  if (cellValue === null || cellValue === undefined) {
    return "";
  }
  if (typeof cellValue === "string" || typeof cellValue === "number") {
    return String(cellValue).trim();
  }
  if (typeof cellValue === "object") {
    if (Array.isArray(cellValue.richText)) {
      return cellValue.richText
        .map((item) => item.text || "")
        .join("")
        .trim();
    }
    if (cellValue.text) {
      return String(cellValue.text).trim();
    }
    if (cellValue.hyperlink) {
      return String(cellValue.hyperlink).trim();
    }
    if (cellValue.result !== undefined && cellValue.result !== null) {
      return String(cellValue.result).trim();
    }
  }
  return String(cellValue).trim();
}

function isValidEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

router.get(
  "/",
  checkLogin,
  checkRole("ADMIN", "MODERATOR"),
  async function (req, res, next) {
    let users = await userModel.find({ isDeleted: false }).populate({
      path: "role",
      select: "name",
    });
    res.send(users);
  },
);

router.get("/:id", checkLogin, async function (req, res, next) {
  try {
    let result = await userModel.find({ _id: req.params.id, isDeleted: false });
    if (result.length > 0) {
      res.send(result);
    } else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post(
  "/",
  postUserValidator,
  validateResult,
  async function (req, res, next) {
    let session = await mongoose.startSession();
    let transaction = session.startTransaction();
    try {
      let newItem = await userController.CreateAnUser(
        req.body.username,
        req.body.password,
        req.body.email,
        req.body.role,
        session,
      );
      let newCart = new cartModel({
        user: newItem._id,
      });
      let result = await newCart.save({ session });
      result = await result.populate("user");
      session.commitTransaction();
      session.endSession();
      res.send(result);
    } catch (err) {
      session.abortTransaction();
      session.endSession();
      res.status(400).send({ message: err.message });
    }
  },
);

router.post(
  "/import",
  checkLogin,
  checkRole("ADMIN", "MODERATOR"),
  uploadExcel.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      res.status(404).send({
        message: "file upload rong",
      });
      return;
    }

    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    let workbook = new excelJS.Workbook();

    try {
      let userRole = await roleModel.findOne({
        name: { $regex: /^user$/i },
        isDeleted: false,
      });

      if (!userRole) {
        res.status(400).send({ message: "khong tim thay role user" });
        return;
      }

      await workbook.xlsx.readFile(pathFile);
      let worksheet = workbook.worksheets[0];
      let result = [];

      for (let index = 2; index <= worksheet.rowCount; index++) {
        let row = worksheet.getRow(index);
        let username = getCellText(row.getCell(1).value);
        let email = getCellText(row.getCell(2).value).toLowerCase();
        let errors = [];

        if (!username) {
          errors.push("username rong");
        }
        if (!email) {
          errors.push("email rong");
        } else if (!isValidEmail(email)) {
          errors.push("email khong dung dinh dang");
        }

        if (errors.length > 0) {
          result.push({ row: index, success: false, errors: errors });
          continue;
        }

        let existedUser = await userModel.findOne({
          $or: [{ username: username }, { email: email }],
        });

        if (existedUser) {
          result.push({
            row: index,
            success: false,
            errors: ["username hoac email da ton tai"],
          });
          continue;
        }

        let session = await mongoose.startSession();
        session.startTransaction();
        try {
          let password = generateRandomPassword(16);
          let newUser = await userController.CreateAnUser(
            username,
            password,
            email,
            userRole._id,
            session,
          );
          let newCart = new cartModel({ user: newUser._id });
          await newCart.save({ session });

          await session.commitTransaction();
          await session.endSession();

          await mailHandler.sendImportPasswordMail(email, username, password);
          result.push({
            row: index,
            success: true,
            username: username,
            email: email,
          });
        } catch (error) {
          await session.abortTransaction();
          await session.endSession();
          result.push({ row: index, success: false, errors: [error.message] });
        }
      }

      res.send(result);
    } catch (error) {
      res.status(400).send({ message: error.message });
    } finally {
      if (fs.existsSync(pathFile)) {
        fs.unlinkSync(pathFile);
      }
    }
  },
);

router.put("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findById(id);
    for (const key of Object.keys(req.body)) {
      updatedItem[key] = req.body[key];
    }
    await updatedItem.save();

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel.findById(updatedItem._id);
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true },
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
