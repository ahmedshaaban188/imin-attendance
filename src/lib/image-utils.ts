/**
 * ============================================================================
 *  ImIn | أدوات الصور المشتركة (التسجيل + تحديث مستندات الحساب)
 * ============================================================================
 *  compressImage: ضغط الصورة قبل الرفع بجودة عالية عمداً — أبعاد قصوى 1920px
 *  بصيغة JPEG بجودة 0.92 حتى تبقى صور البطاقات والصور الشخصية واضحة تماماً
 *  عند عرضها في حساب الطالب وحساب الدكتور.
 */

/** الحد الأقصى لحجم ملف الصورة المرفوع (قبل الضغط) */
export const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1920;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** التحقق من نوع وحجم ملف صورة مختار — ترجع رسالة الخطأ أو null عند الصحة */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "الملف المختار ليس صورة — اختر الصورة بصيغة PNG أو JPG.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "حجم الصورة كبير — الحد الأقصى 8 ميجابايت.";
  }
  return null;
}

/** اسم ملف آمن لرفع الصورة إلى التخزين */
export function safePhotoPath(idNumber: string, suffix: string): string {
  const safeName = idNumber.replace(/[^\w\u0600-\u06FF-]/g, "_");
  const extension = "jpg";
  return `${safeName}-${suffix}-${Date.now()}.${extension}`;
}
