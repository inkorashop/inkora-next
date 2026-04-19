import { Barlow } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/contexts/CartContext';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'INKORA',
  description: 'Catálogo de diseños INKORA. Seleccioná tus diseños y armá tu pedido.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={barlow.className}>
      <body><CartProvider>{children}</CartProvider></body>
    </html>
  );
}
