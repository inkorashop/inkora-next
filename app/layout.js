import { Barlow } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/contexts/CartContext';
import TrackBootstrap from '@/components/TrackBootstrap';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'INKORA',
  description: 'Catálogo de diseños INKORA. Seleccioná tus diseños y armá tu pedido.',
  openGraph: {
    title: 'INKORA - Catálogo de diseños',
    description: 'Seleccioná tus diseños y armá tu pedido.',
    url: 'https://www.inkora.com.ar',
    images: [
      {
        url: 'https://www.inkora.com.ar/og-image.jpg',
        width: 1200,
        height: 630,
      }
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={barlow.className}>
      <body>
        <CartProvider>
          <TrackBootstrap />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
