const ShiftSlot = require('../models/ShiftSlot');

// Lấy danh sách tất cả khung giờ
exports.getAllShiftSlots = async (req, res) => {
  try {
    const slots = await ShiftSlot.find({ isActive: true });
    res.status(200).json(slots);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách khung giờ', error: error.message });
  }
};

// Thêm khung giờ mới (Dùng 1 lần lúc setup ban đầu)
exports.createShiftSlot = async (req, res) => {
  try {
    const { name, startTime, endTime, type, colorCode, maxSlots } = req.body;
    const newSlot = new ShiftSlot({ name, startTime, endTime, type, colorCode, maxSlots });
    await newSlot.save();
    res.status(201).json(newSlot);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo khung giờ', error: error.message });
  }
};