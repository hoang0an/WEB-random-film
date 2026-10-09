import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tối nay xem gì? — Một cú bốc, cả nhóm cùng xem',
  description: 'Danh sách phim chung của nhóm bạn. Bốc phim, chốt tối nay và lưu những bộ phim đã cùng xem.'
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
