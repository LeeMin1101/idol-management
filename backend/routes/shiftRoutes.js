// Thêm route đăng ký cả tháng (đặt cạnh route /register)
router.post('/register-month', authenticate, authorize('IDOL'), shiftController.registerFullMonth);
router.delete('/:id', authenticate, authorize('IDOL'), shiftController.cancelGroupShift);