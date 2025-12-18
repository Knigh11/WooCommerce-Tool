/**
 * Bulk Update Products Component
 * Allows updating product title, short description, and description with templates
 */

import { useState } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { CategorySelector } from './CategorySelector';

interface BulkUpdateProductsProps {
  storeId: string | null;
  onCreateJob?: (jobId: string) => void;
}

export function BulkUpdateProducts({ storeId, onCreateJob }: BulkUpdateProductsProps) {
  const [mode, setMode] = useState<'urls' | 'categories'>('urls');
  const [urls, setUrls] = useState('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);

  // Title update
  const [updateTitle, setUpdateTitle] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [avoidDuplicateTitle, setAvoidDuplicateTitle] = useState(true);

  // Short description
  const [updateShortDescription, setUpdateShortDescription] = useState(false);
  const [shortTemplate, setShortTemplate] = useState('');

  // Description
  const [updateDescription, setUpdateDescription] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<'replace' | 'append' | 'prepend'>('append');
  const [descriptionTemplate, setDescriptionTemplate] = useState('');
  const [useMarker, setUseMarker] = useState(true);

  // Options
  const [dryRun, setDryRun] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [maxWorkers, setMaxWorkers] = useState(3);
  const [delayBetweenBatches, setDelayBetweenBatches] = useState(0.5);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!storeId) {
      setError('Vui lòng chọn store');
      return;
    }

    if (mode === 'urls' && !urls.trim()) {
      setError('Vui lòng nhập ít nhất một URL');
      return;
    }

    if (mode === 'categories' && categoryIds.length === 0) {
      setError('Vui lòng chọn ít nhất một category');
      return;
    }

    if (!updateTitle && !updateShortDescription && !updateDescription) {
      setError('Vui lòng chọn ít nhất một trường để cập nhật');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build request object, only including fields that are needed
      const request: any = {
        mode,
        update_title: updateTitle,
        avoid_duplicate_title: avoidDuplicateTitle,
        update_short_description: updateShortDescription,
        update_description: updateDescription,
        description_mode: descriptionMode,
        use_marker_for_description: useMarker,
        options: {
          dry_run: dryRun,
          batch_size: batchSize,
          max_workers: maxWorkers,
          delay_between_batches: delayBetweenBatches,
          max_retries: 3,
          base_retry_delay: 1.0,
          max_retry_delay: 10.0
        }
      };

      // Add mode-specific fields
      if (mode === 'urls') {
        const urlList = urls.split('\n').filter(u => u.trim());
        if (urlList.length === 0) {
          setError('Vui lòng nhập ít nhất một URL');
          return;
        }
        request.urls = urlList;
      } else {
        if (categoryIds.length === 0) {
          setError('Vui lòng chọn ít nhất một category');
          return;
        }
        request.category_ids = categoryIds;
      }

      // Add title fields only if update_title is enabled and values are provided
      if (updateTitle) {
        if (prefix && prefix.trim()) {
          request.prefix = prefix.trim();
        }
        if (suffix && suffix.trim()) {
          request.suffix = suffix.trim();
        }
      }

      // Add short description template only if enabled and value is provided
      if (updateShortDescription && shortTemplate && shortTemplate.trim()) {
        request.short_template = shortTemplate.trim();
      }

      // Add description template only if enabled and value is provided
      if (updateDescription && descriptionTemplate && descriptionTemplate.trim()) {
        request.description_template = descriptionTemplate.trim();
      }

      const { data } = await apiFetch(endpoints.bulkUpdateJob(storeId), {
        method: 'POST',
        body: JSON.stringify(request),
      });

      if (onCreateJob) {
        // Because 'data' is of type 'unknown', we should verify its shape
        if (
          typeof data === 'object' &&
          data !== null &&
          'job_id' in data &&
          typeof (data as any).job_id !== 'undefined'
        ) {
          onCreateJob((data as any).job_id);
        } else {
          setError('Phản hồi không hợp lệ từ máy chủ');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi khi tạo job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cập nhật sản phẩm hàng loạt</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Product Selection */}
      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Chọn sản phẩm</h3>

        <div className="space-y-2 mb-4">
          <label className="flex items-center">
            <input
              type="radio"
              checked={mode === 'urls'}
              onChange={() => setMode('urls')}
              className="mr-2"
            />
            Theo URL
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              checked={mode === 'categories'}
              onChange={() => setMode('categories')}
              className="mr-2"
            />
            Theo danh mục
          </label>
        </div>

        {mode === 'urls' ? (
          <div>
            <label className="block mb-2">Dán URL sản phẩm (mỗi dòng 1 URL):</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              className="w-full border rounded p-2 font-mono text-sm"
              rows={6}
              placeholder="https://example.com/product/abc&#10;https://example.com/product/xyz"
            />
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-2">Click vào categories để chọn (có thể chọn nhiều):</p>
            <div className="border rounded p-2 max-h-64 overflow-y-auto">
              {storeId ? (
                <CategorySelector
                  storeId={storeId}
                  selectedCategoryId={null}
                  onSelect={(id) => {
                    if (id !== null) {
                      if (categoryIds.includes(id)) {
                        setCategoryIds(categoryIds.filter(cid => cid !== id));
                      } else {
                        setCategoryIds([...categoryIds, id]);
                      }
                    }
                  }}
                  showAllOption={false}
                />
              ) : (
                <p className="text-gray-500">Vui lòng chọn store trước</p>
              )}
            </div>
            {categoryIds.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium">Đã chọn ({categoryIds.length}):</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {categoryIds.map(id => (
                    <span
                      key={id}
                      className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                    >
                      ID: {id}
                      <button
                        onClick={() => setCategoryIds(categoryIds.filter(cid => cid !== id))}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setCategoryIds([])}
                  className="mt-2 text-sm text-red-600 hover:underline"
                >
                  Xóa tất cả
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title Update */}
      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Cập nhật Title</h3>

        <label className="flex items-center mb-4">
          <input
            type="checkbox"
            checked={updateTitle}
            onChange={(e) => setUpdateTitle(e.target.checked)}
            className="mr-2"
          />
          Bật cập nhật title
        </label>

        {updateTitle && (
          <div className="space-y-4">
            <div>
              <label className="block mb-2">Prefix (tiền tố):</label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full border rounded p-2"
                placeholder="Ví dụ: [NEW]"
              />
            </div>

            <div>
              <label className="block mb-2">Suffix (hậu tố):</label>
              <input
                type="text"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                className="w-full border rounded p-2"
                placeholder="Ví dụ: - Sale"
              />
            </div>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={avoidDuplicateTitle}
                onChange={(e) => setAvoidDuplicateTitle(e.target.checked)}
                className="mr-2"
              />
              Tránh thêm prefix/suffix nếu đã có
            </label>
          </div>
        )}
      </div>

      {/* Short Description */}
      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Cập nhật Short Description</h3>

        <label className="flex items-center mb-4">
          <input
            type="checkbox"
            checked={updateShortDescription}
            onChange={(e) => setUpdateShortDescription(e.target.checked)}
            className="mr-2"
          />
          Bật cập nhật short description
        </label>

        {updateShortDescription && (
          <div>
            <label className="block mb-2">
              Template (có thể dùng {'{title}, {sku}, {short}, {categories}'}):
            </label>
            <textarea
              value={shortTemplate}
              onChange={(e) => setShortTemplate(e.target.value)}
              className="w-full border rounded p-2 font-mono text-sm"
              rows={4}
              placeholder="{title} - {short}"
            />
          </div>
        )}
      </div>

      {/* Description */}
      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Cập nhật Description</h3>

        <label className="flex items-center mb-4">
          <input
            type="checkbox"
            checked={updateDescription}
            onChange={(e) => setUpdateDescription(e.target.checked)}
            className="mr-2"
          />
          Bật cập nhật description
        </label>

        {updateDescription && (
          <div className="space-y-4">
            <div>
              <label className="block mb-2">Mode:</label>
              <select
                value={descriptionMode}
                onChange={(e) => setDescriptionMode(e.target.value as any)}
                className="border rounded p-2"
              >
                <option value="append">Append (thêm vào cuối)</option>
                <option value="prepend">Prepend (thêm vào đầu)</option>
                <option value="replace">Replace (thay thế hoàn toàn)</option>
              </select>
            </div>

            <div>
              <label className="block mb-2">Template:</label>
              <textarea
                value={descriptionTemplate}
                onChange={(e) => setDescriptionTemplate(e.target.value)}
                className="w-full border rounded p-2 font-mono text-sm"
                rows={6}
                placeholder="<p>Nội dung mô tả với {title}, {sku}, {short}, {categories}</p>"
              />
            </div>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={useMarker}
                onChange={(e) => setUseMarker(e.target.checked)}
                className="mr-2"
              />
              Sử dụng marker blocks để tránh thêm trùng lặp
            </label>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Tùy chọn</h3>

        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="mr-2"
            />
            Dry run (chạy thử, không ghi dữ liệu)
          </label>

          <div>
            <label className="block mb-2">Batch size:</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
              className="border rounded p-2 w-32"
              min={1}
              max={50}
            />
          </div>

          <div>
            <label className="block mb-2">Max workers:</label>
            <input
              type="number"
              value={maxWorkers}
              onChange={(e) => setMaxWorkers(parseInt(e.target.value) || 3)}
              className="border rounded p-2 w-32"
              min={1}
              max={10}
            />
          </div>

          <div>
            <label className="block mb-2">Delay between batches (seconds):</label>
            <input
              type="number"
              value={delayBetweenBatches}
              onChange={(e) => setDelayBetweenBatches(parseFloat(e.target.value) || 0.5)}
              className="border rounded p-2 w-32"
              min={0}
              max={5}
              step={0.1}
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || !storeId}
        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {loading ? 'Đang tạo job...' : 'Bắt đầu cập nhật'}
      </button>
    </div>
  );
}

