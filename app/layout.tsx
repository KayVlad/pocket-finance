import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Pocket · Personal finances',description:'Track individual transactions, add notes, and see your monthly finances clearly.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
