/**
 * Category Manager Component
 */

import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { CategoryNode, CategoryResponse } from '../api/types';

interface CategoryManagerProps {
  storeId: string | null;
}

export function CategoryManager({ storeId }: CategoryManagerProps) {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryNode | null>(null);
  const [fullCategoryData, setFullCategoryData] = useState<CategoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'create' | 'edit' | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parent, setParent] = useState<number>(0);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (storeId) {
      loadCategories();
    }
  }, [storeId]);

  const loadCategories = async () => {
    if (!storeId) return;
    
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch<{ flattened: CategoryNode[] }>(
        endpoints.categories(storeId)
      );
      setCategories(data.flattened || []);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải categories');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!storeId || !name.trim()) {
      setError('Vui lòng nhập tên category');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch(endpoints.categories(storeId), {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug: slug || undefined,
          parent,
          description
        }),
      });
      await loadCategories();
      setEditMode(null);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo category');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!storeId || !selectedCategory || !name.trim()) {
      setError('Vui lòng nhập tên category');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch(endpoints.categories(storeId) + `/${selectedCategory.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          slug: slug || undefined,
          parent,
          description
        }),
      });
      await loadCategories();
      // Reload full category data to get updated image
      await loadFullCategoryData(selectedCategory.id);
      setEditMode(null);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi cập nhật category');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!storeId || !selectedCategory || !event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh');
      return;
    }

    setUploadingImage(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await apiFetch<CategoryResponse>(
        endpoints.uploadCategoryImage(storeId, selectedCategory.id),
        {
          method: 'POST',
          body: formData,
        }
      );

      // Update full category data with new image
      setFullCategoryData(data);
      
      // Reload categories list to update image in list
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi upload ảnh');
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteImage = async () => {
    if (!storeId || !selectedCategory || !fullCategoryData?.image) {
      return;
    }

    if (!window.confirm('Bạn có chắc chắn muốn xóa ảnh này?')) {
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      // Update category with image_id = null to remove image
      await apiFetch(endpoints.categories(storeId) + `/${selectedCategory.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          image_id: null
        }),
      });

      // Reload full category data
      await loadFullCategoryData(selectedCategory.id);
      
      // Reload categories list
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xóa ảnh');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (categoryId: number) => {
    if (!storeId || !window.confirm('Bạn có chắc chắn muốn xóa category này?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch(endpoints.categories(storeId) + `/${categoryId}`, {
        method: 'DELETE',
      });
      await loadCategories();
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xóa category');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSlug('');
    setParent(0);
    setDescription('');
  };

  const loadFullCategoryData = async (categoryId: number) => {
    if (!storeId) return;
    
    setLoadingCategory(true);
    setError(null);
    try {
      const { data } = await apiFetch<CategoryResponse>(
        endpoints.category(storeId, categoryId)
      );
      setFullCategoryData(data);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải chi tiết category');
    } finally {
      setLoadingCategory(false);
    }
  };

  const handleCategoryClick = async (category: CategoryNode) => {
    setSelectedCategory(category);
    setEditMode(null);
    await loadFullCategoryData(category.id);
  };

  const startEdit = async (category: CategoryNode) => {
    setSelectedCategory(category);
    setEditMode('edit');
    
    // Load full data first
    setLoadingCategory(true);
    try {
      const { data } = await apiFetch<CategoryResponse>(
        endpoints.category(storeId!, category.id)
      );
      setFullCategoryData(data);
      
      // Populate form with full data
      setName(data.name);
      setSlug(data.slug || '');
      setParent(data.parent);
      setDescription(data.description || '');
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải chi tiết category');
      // Fallback to basic data from CategoryNode
      setName(category.name);
      setSlug(category.slug || '');
      setParent(category.parent);
      setDescription(category.description || '');
    } finally {
      setLoadingCategory(false);
    }
  };

  if (!storeId) {
    return (
      <div className="border rounded p-4 text-gray-500 text-center">
        Vui lòng chọn store trước
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Quản lý Category</h2>
        <button
          onClick={() => {
            setEditMode('create');
            setSelectedCategory(null);
            resetForm();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Tạo mới
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Category List */}
        <div className="border rounded p-4">
          <h3 className="font-bold mb-4">Danh sách Categories</h3>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-gray-500">Đang tải...</p>
            ) : categories.length === 0 ? (
              <p className="text-gray-500">Không có categories</p>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`p-2 border-b cursor-pointer hover:bg-gray-100 ${
                    selectedCategory?.id === cat.id ? 'bg-blue-100' : ''
                  }`}
                  onClick={() => handleCategoryClick(cat)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{cat.full_path}</div>
                      <div className="text-sm text-gray-600">ID: {cat.id}, Count: {cat.count}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(cat);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(cat.id);
                        }}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Edit Form */}
        <div className="border rounded p-4">
          <h3 className="font-bold mb-4">
            {editMode === 'create' ? 'Tạo Category mới' : editMode === 'edit' ? 'Sửa Category' : 'Chi tiết'}
          </h3>
          
          {editMode && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tên:</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Slug (tùy chọn):</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Parent ID:</label>
                <input
                  type="number"
                  value={parent}
                  onChange={(e) => setParent(parseInt(e.target.value) || 0)}
                  className="w-full border rounded p-2"
                  min={0}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description:</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border rounded p-2"
                  rows={4}
                />
              </div>
              
              {/* Image Upload Section - Only show in edit mode */}
              {editMode === 'edit' && selectedCategory && (
                <div className="border rounded p-4 bg-gray-50">
                  <label className="block text-sm font-medium mb-2">Ảnh Category:</label>
                  
                  {fullCategoryData?.image ? (
                    <div className="space-y-2">
                      <img 
                        src={fullCategoryData.image.src} 
                        alt={fullCategoryData.name}
                        className="max-w-xs border rounded"
                      />
                      <p className="text-sm text-gray-600">Image ID: {fullCategoryData.image.id}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400"
                        >
                          {uploadingImage ? 'Đang upload...' : 'Đổi ảnh'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteImage}
                          disabled={loading || uploadingImage}
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:bg-gray-400"
                        >
                          Xóa ảnh
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500">Chưa có ảnh</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400"
                      >
                        {uploadingImage ? 'Đang upload...' : 'Upload ảnh'}
                      </button>
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={editMode === 'create' ? handleCreate : handleUpdate}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  {loading ? 'Đang xử lý...' : editMode === 'create' ? 'Tạo' : 'Cập nhật'}
                </button>
                <button
                  onClick={() => {
                    setEditMode(null);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
          
          {!editMode && selectedCategory && (
            <div className="space-y-3">
              {loadingCategory ? (
                <p className="text-gray-500">Đang tải chi tiết...</p>
              ) : fullCategoryData ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <p><strong>ID:</strong> {fullCategoryData.id}</p>
                    <p><strong>Count:</strong> {fullCategoryData.count}</p>
                  </div>
                  <div>
                    <p><strong>Tên:</strong> {fullCategoryData.name}</p>
                  </div>
                  <div>
                    <p><strong>Slug:</strong> {fullCategoryData.slug || '(trống)'}</p>
                  </div>
                  <div>
                    <p><strong>Parent ID:</strong> {fullCategoryData.parent || 0}</p>
                  </div>
                  <div>
                    <p><strong>Path:</strong> {selectedCategory.full_path}</p>
                  </div>
                  {fullCategoryData.image && (
                    <div>
                      <p><strong>Ảnh:</strong></p>
                      <img 
                        src={fullCategoryData.image.src} 
                        alt={fullCategoryData.name}
                        className="mt-2 max-w-xs border rounded"
                      />
                      <p className="text-sm text-gray-600">Image ID: {fullCategoryData.image.id}</p>
                    </div>
                  )}
                  <div>
                    <p><strong>Description:</strong></p>
                    <div className="mt-2 p-3 bg-gray-50 border rounded max-h-48 overflow-y-auto">
                      {fullCategoryData.description ? (
                        <div dangerouslySetInnerHTML={{ __html: fullCategoryData.description }} />
                      ) : (
                        <p className="text-gray-500 italic">(Không có mô tả)</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <p><strong>ID:</strong> {selectedCategory.id}</p>
                    <p><strong>Count:</strong> {selectedCategory.count}</p>
                  </div>
                  <div>
                    <p><strong>Tên:</strong> {selectedCategory.name}</p>
                  </div>
                  <div>
                    <p><strong>Slug:</strong> {selectedCategory.slug || '(trống)'}</p>
                  </div>
                  <div>
                    <p><strong>Parent ID:</strong> {selectedCategory.parent || 0}</p>
                  </div>
                  <div>
                    <p><strong>Path:</strong> {selectedCategory.full_path}</p>
                  </div>
                  {selectedCategory.description && (
                    <div>
                      <p><strong>Description:</strong></p>
                      <div className="mt-2 p-3 bg-gray-50 border rounded max-h-48 overflow-y-auto">
                        <div dangerouslySetInnerHTML={{ __html: selectedCategory.description }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

