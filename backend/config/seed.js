const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ShiftSlot = require('../models/ShiftSlot');

const seedInitialData = async () => {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const existingAdmin = await User.findOne({ username: adminUsername });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);
    await User.create({
      username: adminUsername,
      email: process.env.ADMIN_EMAIL || 'admin@asthrm.local',
      passwordHash,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      fullName: 'Quản trị Vận hành AST',
    });
    console.log(`[Seed] Đã tạo tài khoản Admin mặc định: ${adminUsername}`);
  }

  const defaultShiftSlots = [
    { code: 'CA_1', name: 'Ca Nhóm 8-9 (20:00 - 21:00)', startTime: '20:00', endTime: '21:00', colorHex: '#049FD7', defaultSlots: 8 },
    { code: 'CA_2', name: 'Ca Nhóm 9-10 (21:00 - 22:00)', startTime: '21:00', endTime: '22:00', colorHex: '#F76964', defaultSlots: 8 },
    { code: 'CA_3', name: 'Ca Nhóm 10-11 (22:00 - 23:00)', startTime: '22:00', endTime: '23:00', colorHex: '#F01D94', defaultSlots: 8 },
    { code: 'CA_4', name: 'Ca Nhóm 11-12 (23:00 - 00:00)', startTime: '23:00', endTime: '00:00', colorHex: '#7F3BF5', defaultSlots: 8 },
  ];

  for (const slot of defaultShiftSlots) {
    await ShiftSlot.updateOne({ code: slot.code }, { $setOnInsert: slot }, { upsert: true });
  }
};

module.exports = seedInitialData;