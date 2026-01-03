import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { StoreCreateRequest, StoreDetail, StoreSummary, StoreUpdateRequest } from '../api/types';

interface StoreManagerProps {
  onStoreChange?: () => void;
}

export function StoreManager({ onStoreChange }: StoreManagerProps) {
  const { t } = useTranslation();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [selectedProfileName, setSelectedProfileName] = useState<string>('');
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

      // Nếu chưa có profile được chọn, chọn active store hoặc store đầu tiên
      if (!selectedProfileName && storesWithActive.length > 0) {
        const activeStore = storesWithActive.find((s: any) => s.is_active);
        if (activeStore) {
          handleProfileSelected(activeStore.name);
        } else {
          handleProfileSelected(storesWithActive[0].name);
        }
      }
    } catch (err: any) {
      setError(t("settings.storeManager.loadError", { message: err.message }));
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
    setSelectedProfileName('');
  };

  // Handle profile selection (giống desktop app on_profile_selected)
  const handleProfileSelected = async (profileName: string) => {
    if (!profileName || !profileName.trim()) {
      return;
    }

    const store = stores.find((s) => s.name === profileName);
    if (!store) {
      // Nếu không tìm thấy trong danh sách, có thể là tên mới để tạo
      setSelectedProfileName(profileName);
        setFormData({
          name: profileName,
          store_url: '',
          consumer_key: '',
          consumer_secret: '',
          wp_username: '',
          wp_app_password: '',
          api_key: '',
          set_as_active: false,
        });
      setEditingStore(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data } = await apiFetch<StoreDetail>(endpoints.store(store.id), {
        storeId: store.id, // Include storeId to send X-Store-Key if available
      });
      setEditingStore(data);
      setSelectedProfileName(profileName);
      
      // Update API key cache from profile
      if (data.api_key) {
        const { updateStoreApiKeyFromProfile } = await import("../utils/storeKey");
        updateStoreApiKeyFromProfile(store.id, data);
      }
      
      setFormData({
        name: data.name,
        store_url: data.store_url,
        consumer_key: '', // Don't show secrets
        consumer_secret: '',
        wp_username: '',
        wp_app_password: '',
        api_key: data.api_key || '', // Show API key (it's needed for frontend)
        set_as_active: data.is_active,
      });
      
      // Update API key cache
      if (data.api_key) {
        const { updateStoreApiKeyFromProfile } = await import("../utils/storeKey");
        updateStoreApiKeyFromProfile(store.id, data);
      }
    } catch (err: any) {
      setError(`Failed to load store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle edit (giữ lại để tương thích với button "Sửa" trong table)
  const handleEdit = async (storeId: string) => {
    const store = stores.find((s) => s.id === storeId);
    if (store) {
      await handleProfileSelected(store.name);
    }
  };

  // Handle delete
  const handleDelete = async (storeId: string, storeName: string) => {
    if (!confirm(t("settings.storeManager.deleteConfirm", { name: storeName }))) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch(endpoints.store(storeId), {
        method: 'DELETE',
      });
      setSuccess(t("settings.storeManager.deleteSuccess", { name: storeName }));
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
      setSuccess(t("settings.storeManager.setActiveSuccess"));
      await loadStores();
      if (onStoreChange) onStoreChange();
    } catch (err: any) {
      setError(`Failed to set active store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle save profile (giống desktop app on_save_profile)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const profileName = selectedProfileName.trim() || formData.name.trim();
    if (!profileName) {
      setError(t("settings.storeManager.nameRequired"));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Kiểm tra xem store đã tồn tại chưa (giống desktop app logic)
      const existingStore = stores.find((s) => s.name === profileName);

      if (existingStore && (!editingStore || editingStore.name !== profileName)) {
        // Store đã tồn tại nhưng không phải store đang edit -> lỗi
        setError(t("settings.storeManager.storeExists", { name: profileName }));
        setLoading(false);
        return;
      }

      if (editingStore && editingStore.name === profileName) {
        // Update existing store - only validate store_url (consumer_key/secret are optional when updating)
        if (!formData.store_url) {
          setError(t("settings.storeManager.storeUrlRequired"));
          setLoading(false);
          return;
        }
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
        // Include API key if provided (send it if it has a value)
        if (formData.api_key && formData.api_key.trim()) {
          updateData.api_key = formData.api_key.trim();
        }

        await apiFetch(endpoints.store(editingStore.id), {
          method: 'PUT',
          body: JSON.stringify(updateData),
          storeId: editingStore.id, // Include storeId to send X-Store-Key if available
        });

        // Set as active if requested
        if (formData.set_as_active && !editingStore.is_active) {
          await apiFetch(endpoints.setActiveStore(editingStore.id), {
            method: 'POST',
          });
        }

        setSuccess(t("settings.storeManager.updateSuccess", { name: formData.name }));
      } else {
        // Create new store - validate all required fields
        if (!formData.store_url || !formData.consumer_key || !formData.consumer_secret) {
          setError(t("settings.storeManager.requiredFields"));
          setLoading(false);
          return;
        }
        
        // Create
        const createData: StoreCreateRequest = {
          name: formData.name,
          store_url: formData.store_url,
          consumer_key: formData.consumer_key,
          consumer_secret: formData.consumer_secret,
          wp_username: formData.wp_username || undefined,
          wp_app_password: formData.wp_app_password || undefined,
          api_key: formData.api_key || undefined, // Include API key if provided
          set_as_active: formData.set_as_active,
        };

        await apiFetch(endpoints.stores(), {
          method: 'POST',
          body: JSON.stringify(createData),
        });

        setSuccess(t("settings.storeManager.createSuccess", { name: profileName }));
      }

      // Reload stores và chọn profile vừa lưu (giống desktop app)
      await loadStores();
      await handleProfileSelected(profileName);
      if (onStoreChange) onStoreChange();
    } catch (err: any) {
      setError(t("settings.storeManager.saveError", { action: editingStore ? 'update' : 'create', message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  // Handle delete profile (giống desktop app on_delete_profile)
  const handleDeleteProfile = async () => {
    const profileName = selectedProfileName.trim() || formData.name.trim();
    if (!profileName) {
      setError(t("settings.storeManager.noConfigToDelete"));
      return;
    }

    const store = stores.find((s) => s.name === profileName);
    if (!store) {
      setError(t("settings.storeManager.storeNotFound"));
      return;
    }

    if (!confirm(t("settings.storeManager.deleteConfirmProfile", { name: profileName }))) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch(endpoints.store(store.id), {
        method: 'DELETE',
      });
      setSuccess(t("settings.storeManager.deleteSuccess", { name: profileName }));

      // Reload stores và chọn store đầu tiên hoặc active store (giống desktop app)
      await loadStores();
      if (onStoreChange) onStoreChange();
    } catch (err: any) {
      setError(`Failed to delete store: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t("settings.storeManager.title")}</h2>
        <button
          onClick={() => {
            resetForm();
            setSelectedProfileName('');
          }}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          {t("settings.storeManager.createNew")}
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

      {/* Profile Selector (giống desktop app) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">{t("settings.storeManager.connectionConfig")}</h3>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("settings.storeManager.profileLabel")}
            </label>
            <select
              value={selectedProfileName}
              onChange={(e) => handleProfileSelected(e.target.value)}
              className="w-full p-2 border rounded"
              disabled={loading}
            >
              <option value="">{t("settings.storeManager.selectOrEnter")}</option>
              {stores.map((store) => (
                <option key={store.id} value={store.name}>
                  {store.name} {store.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={selectedProfileName}
              onChange={(e) => {
                const newName = e.target.value;
                setSelectedProfileName(newName);
                setFormData({ ...formData, name: newName });
                // Nếu không tìm thấy trong danh sách, reset editingStore
                const found = stores.find((s) => s.name === newName);
                if (!found) {
                  setEditingStore(null);
                }
              }}
              placeholder={t("settings.storeManager.orEnterNew")}
              className="w-full p-2 border rounded mt-2"
              disabled={loading}
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {editingStore ? t("settings.storeManager.update") : t("settings.storeManager.saveConfig")}
            </button>
            <button
              type="button"
              onClick={handleDeleteProfile}
              disabled={loading || !selectedProfileName}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {t("settings.storeManager.deleteConfig")}
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSaveProfile} className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">
          {editingStore ? t("settings.storeManager.editStore") : t("settings.storeManager.createStore")}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Tên Store *:
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                const newName = e.target.value;
                setFormData({ ...formData, name: newName });
                setSelectedProfileName(newName);
              }}
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

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">
              API Key (for authentication):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                className="flex-1 p-2 border rounded"
                disabled={loading}
                placeholder="Auto-generated if empty"
              />
              <button
                type="button"
                onClick={async () => {
                  // Generate API key locally (64 hex chars)
                  const newKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
                  setFormData({ ...formData, api_key: newKey });
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={loading}
              >
                Generate
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              API key is required for store authentication. Leave empty to auto-generate on save.
            </p>
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

