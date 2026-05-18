'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function SoonModal({ open, topic, onClose }: { open: boolean; topic: string | null; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/subscribe-soon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topic }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`🚧 ${topic} 정보는 곧 만나요`}>
      {status === 'done' ? (
        <div className="text-sm text-[var(--color-muted)]">
          신청해주셔서 감사해요. 출시 시점에 알려드릴게요.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            실거래가에 이어 청약·생활인프라·전세대출을 단계적으로 추가합니다. 출시 알림을 받으시려면 이메일을 남겨주세요 (선택).
          </p>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>닫기</Button>
            <Button type="submit" disabled={status === 'submitting'}>신청</Button>
          </div>
          {status === 'error' && <p className="text-xs text-[var(--color-red)]">신청 실패. 잠시 후 다시 시도해주세요.</p>}
        </form>
      )}
    </Modal>
  );
}
