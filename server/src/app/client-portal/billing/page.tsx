'use client';

import BillingOverview from '@/components/client-portal/billing/BillingOverview';

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[rgb(var(--color-text-900))]">Billing</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-text-600))]">
          View and manage your billing information
        </p>
      </div>
      
      <BillingOverview />
    </div>
  );
}
