export const metadata = {
  title: 'Inkora Admin',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Inkora Admin',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#1B2F5E',
};

export default function AdminLayout({ children }) {
  return children;
}
