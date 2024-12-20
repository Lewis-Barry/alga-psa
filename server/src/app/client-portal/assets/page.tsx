import { AssetList } from '../../../components/client-portal/assets/AssetList';
import { getClientAssets } from '@/lib/actions/client-assets';

export default async function AssetsPage() {
  const assets = await getClientAssets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[rgb(var(--color-text-900))]">Assets</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-text-600))]">
          View and manage your assets.
        </p>
      </div>
      
      <AssetList assets={assets} />
    </div>
  );
}
