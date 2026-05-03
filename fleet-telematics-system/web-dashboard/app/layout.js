import "./globals.css";

export const metadata = {
  title: "Fleet Tracking Dashboard",
  description: "Vehicle telematics route history viewer",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
