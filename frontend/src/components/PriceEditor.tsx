import { useState } from 'react';
import { PriceUpdateRequest } from '../api/types';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { CategorySelector } from './CategorySelector';

interface PriceEditorProps {
  storeId: string | null;
  onCreateJob: (jobId: string) => void;
}

export function PriceEditor({ storeId, onCreateJob }: PriceEditorProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase');
  const [adjustmentMode, setAdjustmentMode] = useState<'amount' | 'percent'>('percent');
  const [adjustmentValue, setAdjustmentValue] = useState<string>('10');
  const [batchSize, setBatchSize] = useState<string>('30');
  const [maxRetries, setMaxRetries] = useState<string>('4');
  const [delayBetweenBatches, setDelayBetweenBatches] = useState<string>('0.2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdatePrices = async () => {
    if (!storeId) {
      setError('Please select a store first');
      return;
    }

    const value = parseFloat(adjustmentValue);
    if (isNaN(value) || value <= 0) {
      setError('Adjustment value must be a positive number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: PriceUpdateRequest = {
        category_id: selectedCategoryId,
        adjustment_type: adjustmentType,
        adjustment_mode: adjustmentMode,
        adjustment_value: value,
        options: {
          batch_size: parseInt(batchSize) || 30,
          max_retries: parseInt(maxRetries) || 4,
          delay_between_batches: parseFloat(delayBetweenBatches) || 0.2,
        },
      };

      const { data } = await apiFetch<{ job_id: string; status: string }>(
        endpoints.updatePricesJob(storeId),
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      );

      onCreateJob(data.job_id);
      
      // Reset form
      setAdjustmentValue('10');
    } catch (err: any) {
      setError(err.message || 'Failed to create price update job');
    } finally {
      setLoading(false);
    }
  };

  const categoryName = selectedCategoryId === null 
    ? 'TẤT CẢ Categories' 
    : `Category ID ${selectedCategoryId}`;

  const adjustmentText = `${adjustmentType === 'increase' ? 'Tăng' : 'Giảm'} ${adjustmentValue}${adjustmentMode === 'percent' ? '%' : ''}`;

  return (
    <div className="border rounded p-4">
      <h3 className="text-lg font-bold mb-4">Cập nhật giá sản phẩm</h3>

      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Chọn Category:</label>
        <CategorySelector
          storeId={storeId}
          selectedCategoryId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          showAllOption={true}
          height={10}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Thao tác:</label>
          <select
            value={adjustmentType}
            onChange={(e) => setAdjustmentType(e.target.value as 'increase' | 'decrease')}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          >
            <option value="increase">Tăng giá</option>
            <option value="decrease">Giảm giá</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Loại:</label>
          <select
            value={adjustmentMode}
            onChange={(e) => setAdjustmentMode(e.target.value as 'amount' | 'percent')}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          >
            <option value="percent">Phần trăm (%)</option>
            <option value="amount">Số tiền</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Giá trị:</label>
          <input
            type="number"
            step="0.01"
            value={adjustmentValue}
            onChange={(e) => setAdjustmentValue(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
            placeholder="10"
          />
        </div>
      </div>

      <div className="mb-4 p-3 bg-blue-50 rounded">
        <div className="text-sm font-medium">
          Sẽ cập nhật giá cho: <strong>{categoryName}</strong>
        </div>
        <div className="text-sm text-gray-600 mt-1">
          Rule: <strong>{adjustmentText}</strong>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Batch Size:</label>
          <input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max Retries:</label>
          <input
            type="number"
            value={maxRetries}
            onChange={(e) => setMaxRetries(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Delay (s):</label>
          <input
            type="number"
            step="0.1"
            value={delayBetweenBatches}
            onChange={(e) => setDelayBetweenBatches(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          />
        </div>
      </div>

      <button
        onClick={handleUpdatePrices}
        disabled={!storeId || loading}
        className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? 'Đang tạo job...' : 'Cập nhật giá'}
      </button>
    </div>
  );
}

