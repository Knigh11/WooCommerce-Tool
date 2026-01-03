import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { CategoryNode } from '../api/types';

interface CategorySelectorProps {
  storeId: string | null;
  selectedCategoryId: number | null;
  onSelect: (categoryId: number | null) => void;
  showAllOption?: boolean;
  height?: number;
}

export function CategorySelector({
  storeId,
  selectedCategoryId,
  onSelect,
  showAllOption = true,
  height = 15,
}: CategorySelectorProps) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!storeId) {
      setCategories([]);
      return;
    }

    const loadCategories = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiFetch<{ tree: CategoryNode[]; flattened: CategoryNode[] }>(
          endpoints.categories(storeId),
          { storeId } // Pass storeId to ensure X-Store-Key is included if available
        );
        setCategories(data.flattened || []);
      } catch (err: any) {
        setError(err.message || t("categories.failedToLoad"));
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, [storeId]);

  const filteredCategories = searchQuery
    ? categories.filter(
        (cat) =>
          cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cat.full_path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : categories;

  const getCategoryDisplayName = (node: CategoryNode): string => {
    const indent = '  '.repeat(node.level);
    return `${indent}${node.name} (ID=${node.id}, ${node.count} sp)`;
  };

  const handleSelect = (categoryId: number | null) => {
    onSelect(categoryId);
  };

  if (!storeId) {
    return (
      <div className="border rounded p-4 text-gray-500 text-center">
        {t("categories.selectStoreFirst")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border rounded p-4 text-center">
        <div className="text-gray-500">{t("categories.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded p-4 bg-red-50 text-red-700">
        {t("categories.error")}: {error}
      </div>
    );
  }

  return (
    <div className="border rounded">
      <div className="p-2 border-b">
        <input
          type="text"
          placeholder={t("categories.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
      <div
        className="overflow-y-auto border-t"
        style={{ maxHeight: `${height * 1.5}rem` }}
      >
        {showAllOption && (
          <div
            className={`p-2 cursor-pointer hover:bg-gray-100 ${
              selectedCategoryId === null ? 'bg-blue-100' : ''
            }`}
            onClick={() => handleSelect(null)}
          >
            <strong>{t("categories.allCategories")}</strong>
          </div>
        )}
        {filteredCategories.length === 0 ? (
          <div className="p-4 text-center text-gray-500">{t("categories.noCategories")}</div>
        ) : (
          filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className={`p-2 cursor-pointer hover:bg-gray-100 ${
                selectedCategoryId === cat.id ? 'bg-blue-100' : ''
              }`}
              onClick={() => handleSelect(cat.id)}
            >
              {getCategoryDisplayName(cat)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

