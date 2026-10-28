import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ImIn | نظام الحضور الجامعي الذكي",
  description:
    "نظام حضور إلكتروني جامعي ذكي يعتمد على تحديد الموقع الجغرافي (GPS) ورموز QR مع لوحة لحظية للدكتور وبطاقة رقمية للطالب.",
  keywords: ["ImIn", "حضور", "جامعة", "GPS", "QR Code", "Supabase"],
  applicationName: "ImIn",
  // الأيقونات تُلتقط تلقائيًا من src/app/icon.png و src/app/apple-icon.png
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
