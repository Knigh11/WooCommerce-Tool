/**
 * CSV Import Component
 */

import { useState } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { CategorySelector } from './CategorySelector';

interface CSVImportProps {
  storeId: string | null;
  onCreateJob?: (jobId: string, jobToken?: string) => void;
}

export function CSVImport({ storeId, onCreateJob }: CSVImportProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!storeId) {
      setError('Vui lòng chọn store');
      return;
    }

    if (!csvFile) {
      setError('Vui lòng chọn file CSV');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Read file content
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const csvContent = e.target?.result as string;

          const request = {
            csv_content: csvContent,
            category_id: categoryId,
            tag: tag || undefined,
            options: {}
          };

          const { data } = await apiFetch(endpoints.csvImportJob(storeId), {
            method: 'POST',
            body: JSON.stringify(request),
          });

          if (onCreateJob) {
            const jobData = data as { job_id: string };
            onCreateJob(jobData.job_id, jobData.job_token);
          }
          setLoading(false);
        } catch (err: any) {
          setError(err?.message || 'Lỗi khi import CSV');
          setLoading(false);
        }
      };
      reader.readAsText(csvFile);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi đọc file');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Import sản phẩm từ CSV</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Chọn file CSV</h3>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="mb-2"
        />
        {csvFile && (
          <p className="text-sm text-gray-600">Đã chọn: {csvFile.name}</p>
        )}
        <p className="text-xs text-gray-500 mt-2">
          CSV cần có các cột: Title, Description, Color, Size, Price, Image URL
        </p>
      </div>

      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Chọn Category</h3>
        <CategorySelector
          storeId={storeId}
          selectedCategoryId={categoryId}
          onSelect={setCategoryId}
          showAllOption={false}
        />
      </div>

      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Tag sản phẩm (tùy chọn)</h3>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="w-full border rounded p-2"
          placeholder="Ví dụ: imported, sale"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !storeId || !csvFile}
        className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
      >
        {loading ? 'Đang import...' : '🚀 Bắt đầu Import'}
      </button>
    </div>
  );
}

