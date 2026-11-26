class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Lỗi máy chủ nội bộ';

  if (err.code === 11000) {
    statusCode = 409;
    message = 'Dữ liệu đã tồn tại hoặc bạn đã đăng ký khung giờ này rồi';
  }
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  res.status(statusCode).json({ success: false, message });
};

module.exports = { AppError, errorHandler };