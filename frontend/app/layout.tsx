import "./globals.css";

export const metadata = {
  title: "Unified Analytics MVP",
  description: "Module 0 scaffold for analytics product"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
