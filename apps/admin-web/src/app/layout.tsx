import { AuthProvider } from '../lib/auth-context';

export const metadata = {
  title: 'LiveOak Admin',
  description: 'Payroll and application administration for LiveOak',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
