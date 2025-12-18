import { StoreSummary } from '../api/types';

interface StoreSelectorProps {
  stores: StoreSummary[];
  selectedStoreId: string | null;
  onSelect: (storeId: string) => void;
}

export function StoreSelector({ stores, selectedStoreId, onSelect }: StoreSelectorProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">Select Store:</label>
      <select
        value={selectedStoreId || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full p-2 border rounded"
      >
        <option value="">-- Select a store --</option>
        {stores.map(store => (
          <option key={store.id} value={store.id}>
            {store.name} ({store.store_url})
          </option>
        ))}
      </select>
    </div>
  );
}

