const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('./errorMiddleware');

const uploadDir = path.join(__dirname, '..', 'uploads', 'evidences');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new AppError('Chỉ chấp nhận tệp hình ảnh định dạng JPG, PNG hoặc WEBP', 400), false);
  }
  cb(null, true);
};

const uploadEvidenceImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { uploadEvidenceImage };