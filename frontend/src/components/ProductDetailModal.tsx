import { ImageInfo, ProductDetail } from '../api/types';

interface ProductDetailModalProps {
  product: ProductDetail | null;
  onClose: () => void;
}

export function ProductDetailModal({ product, onClose }: ProductDetailModalProps) {
  if (!product) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold">{product.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <strong>ID:</strong> {product.id}
          </div>
          <div>
            <strong>SKU:</strong> {product.sku || 'N/A'}
          </div>
          <div>
            <strong>Type:</strong> {product.type}
          </div>
          <div>
            <strong>Status:</strong> {product.status}
          </div>
          <div>
            <strong>Price:</strong> {product.price || 'N/A'}
          </div>
          <div>
            <strong>Stock:</strong> {product.stock_status || 'N/A'}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="font-bold mb-2">Featured Image</h3>
          <div className="mb-2">
            <strong>Mode:</strong> {product.image.mode}
          </div>
          {product.image.mode !== 'none' && (
            <div className="mb-2">
              <img
                src={product.image.thumb}
                alt={product.image.alt || product.name}
                className="max-w-xs border rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="%23ccc"/></svg>';
                }}
              />
              <div className="mt-2">
                <a
                  href={product.image.original}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  Open original in new tab
                </a>
              </div>
            </div>
          )}
        </div>

        {product.gallery.length > 0 && (
          <div className="mb-4">
            <h3 className="font-bold mb-2">Gallery ({product.gallery.length} images)</h3>
            <div className="grid grid-cols-4 gap-2">
              {product.gallery.map((img: ImageInfo, idx: number) => (
                <div key={idx} className="border rounded p-2">
                  <div className="text-xs text-gray-500 mb-1">{img.mode}</div>
                  <img
                    src={img.thumb}
                    alt={img.alt || `Gallery ${idx + 1}`}
                    className="w-full h-24 object-cover rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="%23ccc"/></svg>';
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {product.short_description && (
          <div className="mb-4">
            <h3 className="font-bold mb-2">Short Description</h3>
            <div className="border rounded p-2 bg-gray-50" dangerouslySetInnerHTML={{ __html: product.short_description }} />
          </div>
        )}

        {product.description && (
          <div className="mb-4">
            <h3 className="font-bold mb-2">Description</h3>
            <div className="border rounded p-2 bg-gray-50 max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: product.description }} />
          </div>
        )}
      </div>
    </div>
  );
}

