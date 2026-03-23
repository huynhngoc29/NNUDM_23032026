let nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 25,
  secure: false, // Use true for port 465, false for port 587
  auth: {
    user: "",
    pass: "",
  },
});
module.exports = {
  sendMail: async function (to, url) {
    await transporter.sendMail({
      from: '"admin@" <admin@nnptud.com>',
      to: to,
      subject: "mail reset passwrod",
      text: "lick vo day de doi passs", // Plain-text version of the message
      html: "lick vo <a href=" + url + ">day</a> de doi passs", // HTML version of the message
    });
  },
  sendImportPasswordMail: async function (to, username, password) {
    await transporter.sendMail({
      from: '"admin@" <admin@nnptud.com>',
      to: to,
      subject: "Thong tin tai khoan moi",
      text:
        "Xin chao " + username + ", mat khau tam thoi cua ban la: " + password,
      html:
        "<p>Xin chao <b>" +
        username +
        "</b>,</p>" +
        "<p>Tai khoan cua ban da duoc tao thanh cong.</p>" +
        "<p>Mat khau tam thoi: <b>" +
        password +
        "</b></p>" +
        "<p>Vui long dang nhap va doi mat khau ngay sau khi nhan duoc email nay.</p>",
    });
  },
};
