const fs = require('fs');
const path = require('path');

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const extractLiveStatsFromImage = async (file) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    return {
      success: false,
      reason: 'MISSING_API_KEY',
      message: 'Chưa cấu hình GEMINI_API_KEY trong file backend/.env',
      stats: null,
    };
  }

  try {
    const imageBuffer = file.buffer || fs.readFileSync(file.path);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(file.originalname || file.path || '').toLowerCase();
    const mimeType = file.mimetype || MIME_MAP[ext] || 'image/jpeg';

    const prompt = `
Bạn là hệ thống OCR & phân tích số liệu phiên livestream (TikTok LIVE, Bigo Live, Facebook Live, YouTube Live).
Hãy đọc ảnh chụp màn hình báo cáo kết thúc phiên LIVE này và trích xuất chính xác 4 chỉ số sau dưới dạng số nguyên (integer):
1. actualMinutes: Tổng thời lượng phát trực tiếp quy đổi ra PHÚT (làm tròn số nguyên, ví dụ "01:30:00" hoặc "1 giờ 30 phút" -> 90).
2. totalViews: Tổng lượt xem / Total viewers (ví dụ "1.5K" -> 1500, "2,340" -> 2340).
3. peakViewers: Mắt xem cao nhất cùng lúc / Peak concurrent viewers / Max viewers.
4. diamonds: Số kim cương / Xu / Quà tặng / Điểm KPI nhận được trong phiên (nếu có nhiều loại thì ưu tiên Kim cương / Diamonds / Coins).

Nếu chỉ số nào không hiển thị trong ảnh, trả về 0.
Trả về JSON đúng schema:
{
  "actualMinutes": number,
  "totalViews": number,
  "peakViewers": number,
  "diamonds": number,
  "detectedPlatform": string,
  "note": string
}
`;

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API lỗi (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanedJson = rawText.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleanedJson);

    return {
      success: true,
      stats: {
        actualMinutes: Math.max(0, Math.round(Number(parsed.actualMinutes) || 0)),
        totalViews: Math.max(0, Math.round(Number(parsed.totalViews) || 0)),
        peakViewers: Math.max(0, Math.round(Number(parsed.peakViewers) || 0)),
        diamonds: Math.max(0, Math.round(Number(parsed.diamonds) || 0)),
        detectedPlatform: parsed.detectedPlatform || 'Livestream',
        note: parsed.note || 'Đã trích xuất tự động từ ảnh báo cáo',
      },
    };
  } catch (err) {
    console.error('[AI Vision Extract Error]:', err.message);
    return {
      success: false,
      reason: 'AI_EXTRACT_FAILED',
      message: err.message || 'Không thể tự động đọc ảnh, vui lòng kiểm tra hoặc nhập tay thông số.',
      stats: null,
    };
  }
};

module.exports = { extractLiveStatsFromImage };