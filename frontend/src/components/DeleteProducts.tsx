import { useState } from 'react';
import { DeleteProductsRequest } from '../api/types';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { CategorySelector } from './CategorySelector';

interface DeleteProductsProps {
  storeId: string | null;
  onCreateJob: (jobId: string, jobToken?: string) => void;
}

export function DeleteProducts({ storeId, onCreateJob }: DeleteProductsProps) {
  const [mode, setMode] = useState<'urls' | 'categories' | 'all' | 'streaming'>('urls');
  const [urls, setUrls] = useState<string>('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [deleteMedia, setDeleteMedia] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [parallelMedia, setParallelMedia] = useState(false);
  const [batchSize, setBatchSize] = useState<string>('20');
  const [streamBatchSize, setStreamBatchSize] = useState<string>('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryToggle = (categoryId: number | null) => {
    if (categoryId === null) return;
    setSelectedCategoryIds((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const handleDelete = async () => {
    if (!storeId) {
      setError('Please select a store first');
      return;
    }

    // Validate based on mode
    if (mode === 'urls' && !urls.trim()) {
      setError('Please enter at least one product URL');
      return;
    }

    if (mode === 'categories' && selectedCategoryIds.length === 0) {
      setError('Please select at least one category');
      return;
    }

    if (mode === 'all') {
      const confirm1 = window.confirm(
        '⚠️ CẢNH BÁO: Bạn sắp xóa TẤT CẢ sản phẩm!\n\nBạn có chắc chắn?'
      );
      if (!confirm1) return;

      const confirm2 = window.prompt(
        '⚠️ XÁC NHẬN LẦN 2:\nGõ chính xác: "I UNDERSTAND DELETE ALL" để tiếp tục:'
      );
      if (confirm2 !== 'I UNDERSTAND DELETE ALL') {
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const request: DeleteProductsRequest = {
        mode,
        urls: mode === 'urls' ? urls.split('\n').filter((u) => u.trim()) : undefined,
        category_ids: mode === 'categories' ? selectedCategoryIds : undefined,
        options: {
          delete_media: deleteMedia,
          dry_run: dryRun,
          verbose,
          parallel_media: parallelMedia,
          batch_size: parseInt(batchSize) || 20,
          stream_batch_size: parseInt(streamBatchSize) || 100,
        },
      };

      const { data } = await apiFetch<{ job_id: string; status: string }>(
        endpoints.deleteProductsJob(storeId),
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      );

      onCreateJob(data.job_id);
      
      // Reset form
      setUrls('');
      setSelectedCategoryIds([]);
    } catch (err: any) {
      setError(err.message || 'Failed to create delete job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded p-4">
      <h3 className="text-lg font-bold mb-4">Xóa sản phẩm</h3>

      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Chế độ xóa:</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="w-full p-2 border rounded"
          disabled={!storeId || loading}
        >
          <option value="urls">Theo URLs</option>
          <option value="categories">Theo Categories</option>
          <option value="all">Tất cả sản phẩm</option>
          <option value="streaming">Streaming Mode (cho store lớn)</option>
        </select>
      </div>

      {mode === 'urls' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Product URLs (mỗi URL một dòng):
          </label>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            className="w-full p-2 border rounded font-mono text-sm"
            rows={6}
            placeholder="https://example.com/product/product-slug/"
            disabled={!storeId || loading}
          />
          <div className="text-xs text-gray-500 mt-1">
            Ví dụ: https://example.com/product/embroidered-floral-daisy-sweatshirt/
          </div>
        </div>
      )}

      {mode === 'categories' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Chọn Categories (click để chọn/bỏ chọn):
          </label>
          <div className="border rounded p-2 max-h-64 overflow-y-auto">
            {storeId ? (
              <CategorySelector
                storeId={storeId}
                selectedCategoryId={selectedCategoryIds[0] || null}
                onSelect={(id) => {
                  if (id !== null) handleCategoryToggle(id);
                }}
                showAllOption={false}
                height={10}
              />
            ) : (
              <div className="text-gray-500 text-center">Please select a store first</div>
            )}
          </div>
          {selectedCategoryIds.length > 0 && (
            <div className="mt-2 text-sm text-blue-600">
              Đã chọn {selectedCategoryIds.length} category(ies): {selectedCategoryIds.join(', ')}
            </div>
          )}
        </div>
      )}

      {mode === 'all' && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <div className="font-bold text-yellow-800">⚠️ CẢNH BÁO</div>
          <div className="text-sm text-yellow-700 mt-1">
            Bạn sẽ xóa TẤT CẢ sản phẩm trong store. Hành động này không thể hoàn tác!
          </div>
        </div>
      )}

      {mode === 'streaming' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Stream Batch Size:</label>
          <input
            type="number"
            value={streamBatchSize}
            onChange={(e) => setStreamBatchSize(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          />
          <div className="text-xs text-gray-500 mt-1">
            Số sản phẩm xử lý mỗi batch (50-200, recommended: 100)
          </div>
        </div>
      )}

      <div className="mb-4 space-y-2">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={deleteMedia}
            onChange={(e) => setDeleteMedia(e.target.checked)}
            disabled={!storeId || loading}
            className="mr-2"
          />
          Xóa media files (qua WP API)
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={!storeId || loading}
            className="mr-2"
          />
          Dry Run (chỉ hiển thị, không xóa thật)
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={verbose}
            onChange={(e) => setVerbose(e.target.checked)}
            disabled={!storeId || loading}
            className="mr-2"
          />
          Verbose logging
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={parallelMedia}
            onChange={(e) => setParallelMedia(e.target.checked)}
            disabled={!storeId || loading}
            className="mr-2"
          />
          Parallel media deletion (nhanh hơn nhưng tải server cao)
        </label>
      </div>

      {mode !== 'streaming' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Batch Size:</label>
          <input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={!storeId || loading}
          />
        </div>
      )}

      <button
        onClick={handleDelete}
        disabled={!storeId || loading}
        className="w-full p-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? 'Đang tạo job...' : dryRun ? '[DRY RUN] Xóa sản phẩm' : 'Xóa sản phẩm'}
      </button>
    </div>
  );
}

