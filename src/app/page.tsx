import { redirect } from 'next/navigation';

// 홈 페이지 - /info로 리다이렉트
export default function Home() {
  redirect('/info');
}
