const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Sửa lại đường dẫn/tên hàm dưới đây cho khớp với file trong thư mục backend/middlewares/ của bạn
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.use(protect);

router.get('/me', userController.getMyProfile);
router.put('/me', userController.updateMyProfile);
router.post('/me/avatar', upload.single('avatar'), userController.updateAvatar);
router.put('/me/password', userController.changePassword);

module.exports = router;