import { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { StoreSummary, StoreDetail, StoreCreateRequest, StoreUpdateRequest } from '../api/types';

interface StoreManagerProps {
  onStoreChange?: () => void;
}

export function StoreManager({ onStoreChange }: StoreManagerProps) {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [editingStore, setEditingStore] = useState<StoreDetail | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    store_url: '',
    consumer_key: '',
    consumer_secret: '',
    wp_username: '',
    wp_app_password: '',
    set_as_active: false,
  });

  // Load stores with active status
  const loadStores = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await apiFetch<StoreSummary[]>(endpoints.stores());
      
      // Load active status for each store
      const storesWithActive = await Promise.all(
        data.map(async (store) => {
          try {
            const { data: detail } = await apiFetch<StoreDetail>(endpoints.store(store.id));
            return { ...store, is_active: detail.is_active };
          } catch {
            return { ...store, is_active: false };
          }
        })
      );
      
      setStores(storesWithActive as any);
    } catch (err: any) {
      setError(`Failed to load stores: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      store_url: '',
      consumer_key: '',
      consumer_secret: '',
      wp_username: '',
      wp_app_password: '',
      set_as_active: false,
    });
    setEditingStore(null);
  };

  // Handle edit
  const handleEdit = async (storeId: string) => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await apiFetch<StoreDetail>(endpoints.store(storeId));
      setEditingStore(data);
      setFormData({
        name: data.name,
        store_url: data.store_url,
        consumer_key: '', // Don't show secrets
        consumer_secret: '',
        wp_username: '',
        wp_app_password: '',
        set_as_active: data.is_active,
      });
    } catch (err: any) {
      setError(`Failed to load store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async (storeId: string, storeName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa store "${storeName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch(endpoints.store(storeId), {
        method: 'DELETE',
      });
      setSuccess(`Đã xóa store "${storeName}" thành công`);
      resetForm();
      await loadStores();
      if (onStoreChange) onStoreChange();
    } catch (err: any) {
      setError(`Failed to delete store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle set active
  const handleSetActive = async (storeId: string) => {
    try {
      setLoading(true);
      setError(null);
      await apiFetch(endpoints.setActiveStore(storeId), {
        method: 'POST',
      });
      setSuccess('Đã đặt store làm active thành công');
      await loadStores();
      if (onStoreChange) onStoreChange();
    } catch (err: any) {
      setError(`Failed to set active store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle submit (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.store_url || !formData.consumer_key || !formData.consumer_secret) {
      setError('Vui lòng điền đầy đủ các trường bắt buộc: Tên, Store URL, Consumer Key, Consumer Secret');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (editingStore) {
        // Update
        const updateData: StoreUpdateRequest = {
          name: formData.name,
          store_url: formData.store_url,
        };
        
        // Only include credentials if they were changed (non-empty)
        if (formData.consumer_key) {
          updateData.consumer_key = formData.consumer_key;
        }
        if (formData.consumer_secret) {
          updateData.consumer_secret = formData.consumer_secret;
        }
        if (formData.wp_username !== undefined) {
          updateData.wp_username = formData.wp_username || undefined;
        }
        if (formData.wp_app_password !== undefined) {
          updateData.wp_app_password = formData.wp_app_password || undefined;
        }

        await apiFetch(endpoints.store(editingStore.id), {
          method: 'PUT',
          body: JSON.stringify(updateData),
        });

        // Set as active if requested
        if (formData.set_as_active && !editingStore.is_active) {
          await apiFetch(endpoints.setActiveStore(editingStore.id), {
            method: 'POST',
          });
        }

        setSuccess(`Đã cập nhật store "${formData.name}" thành công`);
      } else {
        // Create
        const createData: StoreCreateRequest = {
          name: formData.name,
          store_url: formData.store_url,
          consumer_key: formData.consumer_key,
          consumer_secret: formData.consumer_secret,
          wp_username: formData.wp_username || undefined,
          wp_app_password: formData.wp_app_password || undefined,
          set_as_active: formData.set_as_active,
        };

        await apiFetch(endpoints.stores(), {
          method: 'POST',
          body: JSON.stringify(createData),
        });

        setSuccess(`Đã tạo store "${formData.name}" thành công`);
      }

      resetForm();
      await loadStores();
      if (onStoreChange) onStoreChange();
    } catch (err: any) {
      setError(`Failed to ${editingStore ? 'update' : 'create'} store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Quản lý Store Profiles</h2>
        <button
          onClick={resetForm}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          {editingStore ? 'Hủy' : 'Tạo Store mới'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">
          {editingStore ? 'Chỉnh sửa Store' : 'Tạo Store mới'}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Tên Store *:
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-2 border rounded"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Store URL *:
            </label>
            <input
              type="url"
              value={formData.store_url}
              onChange={(e) => setFormData({ ...formData, store_url: e.target.value })}
              className="w-full p-2 border rounded"
              required
              disabled={loading}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Consumer Key *:
            </label>
            <input
              type="text"
              value={formData.consumer_key}
              onChange={(e) => setFormData({ ...formData, consumer_key: e.target.value })}
              className="w-full p-2 border rounded"
              required={!editingStore}
              disabled={loading}
              placeholder={editingStore ? 'Để trống nếu không đổi' : ''}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Consumer Secret *:
            </label>
            <input
              type="password"
              value={formData.consumer_secret}
              onChange={(e) => setFormData({ ...formData, consumer_secret: e.target.value })}
              className="w-full p-2 border rounded"
              required={!editingStore}
              disabled={loading}
              placeholder={editingStore ? 'Để trống nếu không đổi' : ''}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              WordPress Username (tùy chọn):
            </label>
            <input
              type="text"
              value={formData.wp_username}
              onChange={(e) => setFormData({ ...formData, wp_username: e.target.value })}
              className="w-full p-2 border rounded"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              WordPress App Password (tùy chọn):
            </label>
            <input
              type="password"
              value={formData.wp_app_password}
              onChange={(e) => setFormData({ ...formData, wp_app_password: e.target.value })}
              className="w-full p-2 border rounded"
              disabled={loading}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.set_as_active}
              onChange={(e) => setFormData({ ...formData, set_as_active: e.target.checked })}
              className="mr-2"
              disabled={loading}
            />
            <span>Đặt làm store active sau khi {editingStore ? 'cập nhật' : 'tạo'}</span>
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : editingStore ? 'Cập nhật' : 'Tạo Store'}
          </button>
          {editingStore && (
            <button
              type="button"
              onClick={resetForm}
              disabled={loading}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Hủy
            </button>
          )}
        </div>
      </form>

      {/* Stores List */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Danh sách Stores</h3>
        
        {loading && !stores.length ? (
          <div className="text-center py-4">Đang tải...</div>
        ) : stores.length === 0 ? (
          <div className="text-center py-4 text-gray-500">Chưa có store nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Tên</th>
                  <th className="border p-2 text-left">URL</th>
                  <th className="border p-2 text-center">WC Keys</th>
                  <th className="border p-2 text-center">WP Creds</th>
                  <th className="border p-2 text-center">Active</th>
                  <th className="border p-2 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id} className="hover:bg-gray-50">
                    <td className="border p-2 font-medium">{store.name}</td>
                    <td className="border p-2 text-sm">{store.store_url}</td>
                    <td className="border p-2 text-center">
                      {store.has_wc_keys ? '✓' : '✗'}
                    </td>
                    <td className="border p-2 text-center">
                      {store.has_wp_creds ? '✓' : '✗'}
                    </td>
                    <td className="border p-2 text-center">
                      {(store as any).is_active ? (
                        <span className="text-green-600 font-bold">Active</span>
                      ) : (
                        <button
                          onClick={() => handleSetActive(store.id)}
                          disabled={loading}
                          className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                          Set Active
                        </button>
                      )}
                    </td>
                    <td className="border p-2">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleEdit(store.id)}
                          disabled={loading}
                          className="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600 disabled:opacity-50"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleDelete(store.id, store.name)}
                          disabled={loading}
                          className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

