import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '森林手搖店｜一起長成一片森林', description: '掃碼加入，化身見習店長。在生活裡玩懂決策樹、隨機森林與集成學習。', icons: { icon: '/icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f7f5eb' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="zh-Hant" data-scroll-behavior="smooth"><body>{children}</body></html>; }
