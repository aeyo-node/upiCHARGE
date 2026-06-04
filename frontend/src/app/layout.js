import "./globals.css";

export const metadata = {
  title: "upiCHARGE | Simple EV Charging in India",
  description: "Scan QR. Pay via UPI. Charge your EV. Get instant refunds for unused balance. No app installs or RFID cards needed.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-black text-white antialiased font-sans overflow-x-hidden selection:bg-apple-accent selection:text-white">
        {children}
      </body>
    </html>
  );
}
