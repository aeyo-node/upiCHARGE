import "./globals.css";

export const metadata = {
  title: "upiCHARGE | Simple EV Charging in India",
  description: "Scan QR. Pay via UPI. Charge your EV. Get instant refunds for unused balance. No app installs or RFID cards needed.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#f5f5f7] text-[#1d1d1f] antialiased font-sans overflow-x-hidden selection:bg-apple-accent selection:text-[#1d1d1f]">
        {children}
      </body>
    </html>
  );
}
