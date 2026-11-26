const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config(); // Đọc các biến từ file .env

const apiRoutes = require('./routes/apiRoutes');
const { errorHandler } = require('./middlewares/errorMiddleware');
const { scanForgottenCheckOuts } = require('./services/liveSessionService');
const ShiftSlot = require('./models/ShiftSlot');
const User = require('./models/User');
const WorkPeriod = require('./models/WorkPeriod');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Phục vụ tệp ảnh bằng chứng KPI đã tải lên tại /uploads/evidences/...
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Hàm tự động khởi tạo dữ liệu ban đầu
const autoSeed = async () => {
  try {
    const slotCount = await ShiftSlot.countDocuments();
    if (slotCount === 0) {
      await ShiftSlot.insertMany([
        { name: 'Ca Nhóm 8-9', startTime: '20:00', endTime: '21:00', type: 'GROUP', colorCode: 'blue', maxSlots: 8 },
        { name: 'Ca Nhóm 9-10', startTime: '21:00', endTime: '22:00', type: 'GROUP', colorCode: 'red', maxSlots: 8 },
        { name: 'Ca Nhóm 10-11', startTime: '22:00', endTime: '23:00', type: 'GROUP', colorCode: 'pink', maxSlots: 8 },
        { name: 'Ca Nhóm 11-12', startTime: '23:00', endTime: '00:00', type: 'GROUP', colorCode: 'purple', maxSlots: 8 },
        { name: 'Live Đơn', type: 'SOLO', colorCode: 'default' },
      ]);
      console.log('✓ Đã nạp 5 khung giờ mặc định!');
    }

    const adminExists = await User.findOne({ role: 'ADMIN' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);
      await User.create({
        username: 'admin',
        password: hashedPassword,
        name: 'Quản Trị Viên',
        role: 'ADMIN',
        accountStatus: 'ACTIVE',
      });
      console.log('✓ Tạo tài khoản Admin mặc định (admin / admin123)');
    }

    // Tự động tạo kỳ làm việc mặc định cho tháng hiện tại nếu DB chưa có kỳ nào
    const periodCount = await WorkPeriod.countDocuments();
    if (periodCount === 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const code = `${year}-${String(month + 1).padStart(2, '0')}`;
      await WorkPeriod.create({
        code,
        name: `Tháng ${month + 1}/${year}`,
        startDate: new Date(Date.UTC(year, month, 1)),
        endDate: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)),
        groupHourlyRate: 50000,
        defaultMaxSlots: 8,
        maxGroupShiftsPerDay: 1,
        registrationOpen: true,
        status: 'OPEN',
      });
      console.log(`✓ Đã khởi tạo kỳ làm việc mặc định: ${code}`);
    }
  } catch (error) {
    console.error('Lỗi auto-seed:', error.message);
  }
};

// Kết nối Database & khởi chạy Background Jobs
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    await autoSeed();

    // Quét các phiên LIVE quên check-out ngay khi khởi động và định kỳ mỗi 15 phút
    await scanForgottenCheckOuts();
    setInterval(() => {
      scanForgottenCheckOuts().catch((err) => console.error('Lỗi quét quên check-out:', err.message));
    }, 15 * 60 * 1000);
  } catch (err) {
    console.error('✗ Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  }
};

connectDB();

app.get('/api/health', (req, res) => {
  res.json({ success: true, serverTime: new Date().toISOString() });
});

app.use('/api', apiRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));