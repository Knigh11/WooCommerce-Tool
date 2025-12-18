import { useState } from 'react';
import { parseProductIds } from '../api/client';
import { BulkUpdateFieldsRequest, DeleteProductsRequest, UpdatePricesRequest } from '../api/types';

interface JobCreatorProps {
  storeId: string | null;
  onCreateJob: (jobId: string) => void;
}

type JobType = 'delete' | 'update-prices' | 'bulk-update';

export function JobCreator({ storeId, onCreateJob }: JobCreatorProps) {
  const [jobType, setJobType] = useState<JobType>('delete');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteForm, setDeleteForm] = useState<DeleteProductsRequest>({
    mode: "urls",
    options: { dry_run: true, batch_size: 25, rate_limit_rps: 5, max_retries: 5 },
  });

  const [priceForm, setPriceForm] = useState<UpdatePricesRequest>({
    scope: { product_ids: [] },
    rule: { op: 'increase', type: 'percent', value: 10 },
    options: { apply_to_variations: true, batch_size: 25, rate_limit_rps: 5, max_retries: 5 },
  });

  const [bulkForm, setBulkForm] = useState<BulkUpdateFieldsRequest>({
    scope: { product_ids: [] },
    patch: { title_prefix: '', title_suffix: '', short_description: '', description: '' },
    options: { batch_size: 20, rate_limit_rps: 3, max_retries: 5 },
  });

  const [scopeMode, setScopeMode] = useState<'ids' | 'search'>('ids');
  const [scopeInput, setScopeInput] = useState('');

  const handleCreateJob = async () => {
    if (!storeId) {
      setError('Please select a store first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let endpoint: string;
      let body: any;

      if (jobType === 'delete') {
        const productIds = parseProductIds(scopeInput);
        if (productIds.length === 0) {
          throw new Error('Please enter at least one product ID');
        }
        endpoint = `/api/v1/stores/${storeId}/jobs/delete-products`;
        body = {
          scope: { product_ids: productIds },
          options: deleteForm.options,
        };
      } else if (jobType === 'update-prices') {
        endpoint = `/api/v1/stores/${storeId}/jobs/update-prices`;
        body = {
          scope: scopeMode === 'ids'
            ? { product_ids: parseProductIds(scopeInput) }
            : { search: scopeInput },
          rule: priceForm.rule,
          options: priceForm.options,
        };
      } else {
        endpoint = `/api/v1/stores/${storeId}/jobs/bulk-update-fields`;
        body = {
          scope: scopeMode === 'ids'
            ? { product_ids: parseProductIds(scopeInput) }
            : { search: scopeInput },
          patch: bulkForm.patch,
          options: bulkForm.options,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create job: ${errorText}`);
      }

      const data = await response.json();
      onCreateJob(data.job_id);
      setScopeInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  const disabled = !storeId || loading;

  return (
    <div className="border rounded p-4">
      <h3 className="text-lg font-bold mb-4">Create Job</h3>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Job Type:</label>
        <select
          value={jobType}
          onChange={(e) => setJobType(e.target.value as JobType)}
          className="w-full p-2 border rounded"
          disabled={disabled}
        >
          <option value="delete">Delete Products</option>
          <option value="update-prices">Update Prices</option>
          <option value="bulk-update">Bulk Update Fields</option>
        </select>
      </div>

      {jobType === 'delete' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Product IDs (comma/newline separated):</label>
            <textarea
              value={scopeInput}
              onChange={(e) => setScopeInput(e.target.value)}
              className="w-full p-2 border rounded font-mono text-sm"
              rows={4}
              placeholder="123, 456, 789"
              disabled={disabled}
            />
          </div>
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={deleteForm.options?.dry_run ?? false}
                onChange={(e) => setDeleteForm({
                  ...deleteForm,
                  options: { ...(deleteForm.options || {}), dry_run: e.target.checked },
                })}
                disabled={disabled}
                className="mr-2"
              />
              Dry Run
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Batch Size:</label>
              <input
                type="number"
                value={deleteForm.options?.batch_size ?? 25}
                onChange={(e) => setDeleteForm({
                  ...deleteForm,
                  options: { ...(deleteForm.options || {}), batch_size: parseInt(e.target.value) || 25 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate Limit (RPS):</label>
              <input
                type="number"
                step="0.1"
                value={deleteForm.options?.rate_limit_rps ?? 5}
                onChange={(e) => setDeleteForm({
                  ...deleteForm,
                  options: { ...(deleteForm.options || {}), rate_limit_rps: parseFloat(e.target.value) || 5 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Retries:</label>
              <input
                type="number"
                value={deleteForm.options?.max_retries ?? 5}
                onChange={(e) => setDeleteForm({
                  ...deleteForm,
                  options: { ...(deleteForm.options || {}), max_retries: parseInt(e.target.value) || 5 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
          </div>
        </>
      )}

      {jobType === 'update-prices' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Scope Mode:</label>
            <select
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as 'ids' | 'search')}
              className="w-full p-2 border rounded"
              disabled={disabled}
            >
              <option value="ids">By Product IDs</option>
              <option value="search">By Search Term</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              {scopeMode === 'ids' ? 'Product IDs:' : 'Search Term:'}
            </label>
            {scopeMode === 'ids' ? (
              <textarea
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                className="w-full p-2 border rounded font-mono text-sm"
                rows={4}
                placeholder="123, 456, 789"
                disabled={disabled}
              />
            ) : (
              <input
                type="text"
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Search term"
                disabled={disabled}
              />
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Operation:</label>
              <select
                value={priceForm.rule.op}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  rule: { ...priceForm.rule, op: e.target.value as 'increase' | 'decrease' },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              >
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type:</label>
              <select
                value={priceForm.rule.type}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  rule: { ...priceForm.rule, type: e.target.value as 'percent' | 'fixed' },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Value:</label>
              <input
                type="number"
                step="0.01"
                value={priceForm.rule.value}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  rule: { ...priceForm.rule, value: parseFloat(e.target.value) || 0 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={priceForm.options?.apply_to_variations ?? false}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  options: { ...(priceForm.options || {}), apply_to_variations: e.target.checked },
                })}
                disabled={disabled}
                className="mr-2"
              />
              Apply to Variations
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Batch Size:</label>
              <input
                type="number"
                value={priceForm.options?.batch_size ?? 25}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  options: { ...(priceForm.options || {}), batch_size: parseInt(e.target.value) || 25 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate Limit (RPS):</label>
              <input
                type="number"
                step="0.1"
                value={priceForm.options?.rate_limit_rps ?? 5}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  options: { ...(priceForm.options || {}), rate_limit_rps: parseFloat(e.target.value) || 5 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Retries:</label>
              <input
                type="number"
                value={priceForm.options?.max_retries ?? 5}
                onChange={(e) => setPriceForm({
                  ...priceForm,
                  options: { ...(priceForm.options || {}), max_retries: parseInt(e.target.value) || 5 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
          </div>
        </>
      )}

      {jobType === 'bulk-update' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Scope Mode:</label>
            <select
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as 'ids' | 'search')}
              className="w-full p-2 border rounded"
              disabled={disabled}
            >
              <option value="ids">By Product IDs</option>
              <option value="search">By Search Term</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              {scopeMode === 'ids' ? 'Product IDs:' : 'Search Term:'}
            </label>
            {scopeMode === 'ids' ? (
              <textarea
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                className="w-full p-2 border rounded font-mono text-sm"
                rows={4}
                placeholder="123, 456, 789"
                disabled={disabled}
              />
            ) : (
              <input
                type="text"
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Search term"
                disabled={disabled}
              />
            )}
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Title Prefix:</label>
            <input
              type="text"
              value={bulkForm.patch.title_prefix || ''}
              onChange={(e) => setBulkForm({
                ...bulkForm,
                patch: { ...bulkForm.patch, title_prefix: e.target.value },
              })}
              className="w-full p-2 border rounded"
              disabled={disabled}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Title Suffix:</label>
            <input
              type="text"
              value={bulkForm.patch.title_suffix || ''}
              onChange={(e) => setBulkForm({
                ...bulkForm,
                patch: { ...bulkForm.patch, title_suffix: e.target.value },
              })}
              className="w-full p-2 border rounded"
              disabled={disabled}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Short Description:</label>
            <textarea
              value={bulkForm.patch.short_description || ''}
              onChange={(e) => setBulkForm({
                ...bulkForm,
                patch: { ...bulkForm.patch, short_description: e.target.value },
              })}
              className="w-full p-2 border rounded"
              rows={3}
              disabled={disabled}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Description:</label>
            <textarea
              value={bulkForm.patch.description || ''}
              onChange={(e) => setBulkForm({
                ...bulkForm,
                patch: { ...bulkForm.patch, description: e.target.value },
              })}
              className="w-full p-2 border rounded"
              rows={5}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Batch Size:</label>
              <input
                type="number"
                value={bulkForm.options?.batch_size ?? 20}
                onChange={(e) => setBulkForm({
                  ...bulkForm,
                  options: { ...(bulkForm.options || {}), batch_size: parseInt(e.target.value) || 20 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate Limit (RPS):</label>
              <input
                type="number"
                step="0.1"
                value={bulkForm.options?.rate_limit_rps ?? 3}
                onChange={(e) => setBulkForm({
                  ...bulkForm,
                  options: { ...(bulkForm.options || {}), rate_limit_rps: parseFloat(e.target.value) || 3 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Retries:</label>
              <input
                type="number"
                value={bulkForm.options?.max_retries ?? 5}
                onChange={(e) => setBulkForm({
                  ...bulkForm,
                  options: { ...(bulkForm.options || {}), max_retries: parseInt(e.target.value) || 5 },
                })}
                className="w-full p-2 border rounded"
                disabled={disabled}
              />
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleCreateJob}
        disabled={disabled}
        className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating...' : 'Create Job'}
      </button>
    </div>
  );
}

