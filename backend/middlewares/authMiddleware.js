const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorMiddleware');

const protect = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return next(new AppError('Vui lòng đăng nhập để tiếp tục', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId;

    const user = await User.findById(userId).select('-password');
    if (!user || user.deletedAt) {
      return next(new AppError('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa', 401));
    }

    if (user.isActive === false) {
      return next(new AppError('Tài khoản của bạn đã bị khóa, vui lòng liên hệ Vận hành', 403));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 401));
    }
    return next(new AppError('Token xác thực không hợp lệ', 401));
  }
};

const authorize = (...allowedRoles) => (req, res, next) => {
  const roles = allowedRoles.flat();
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('Bạn không có quyền truy cập chức năng này', 403));
  }
  next();
};

module.exports = {
  protect,
  authenticate: protect,
  authorize,
};