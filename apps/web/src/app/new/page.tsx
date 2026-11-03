import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
import { getService } from '@/lib/service';

export const dynamic = 'force-dynamic';

export default function NewProfilePage() {
  const years = getService().coverage().indexedYears;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <h1 className="mb-6 text-sm tracking-[0.3em] text-ink-3">排一张新盘</h1>

      <BirthForm indexedYears={years} />

      <p className="mt-4 text-2xs text-ink-3">
        <Link
          href="/"
          className="underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          ← 回到命盘对话
        </Link>
      </p>
    </div>
  );
}
