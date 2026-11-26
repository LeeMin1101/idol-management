const mongoose = require('mongoose');

const idolSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Tên thật
  nickname: { type: String, required: true, unique: true }, // Tên trên bảng đăng ký (LeeMin, HIRO...)
  role: { type: String, enum: ['IDOL', 'ADMIN', 'MANAGER'], default: 'IDOL' },
  isActive: { type: Boolean, default: true } // Có đang hợp tác không (nghỉ việc thì set false)
}, { timestamps: true });

module.exports = mongoose.model('Idol', idolSchema);