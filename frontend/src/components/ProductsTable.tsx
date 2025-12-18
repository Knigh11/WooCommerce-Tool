import { ProductSummary } from '../api/types';

interface ProductsTableProps {
  products: ProductSummary[];
  loading: boolean;
  onProductClick: (product: ProductSummary) => void;
}

export function ProductsTable({ products, loading, onProductClick }: ProductsTableProps) {
  if (loading) {
    return <div className="text-center p-4">Loading products...</div>;
  }

  if (products.length === 0) {
    return <div className="text-center p-4 text-gray-500">No products found</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Image</th>
            <th className="border p-2 text-left">ID</th>
            <th className="border p-2 text-left">Name</th>
            <th className="border p-2 text-left">Type</th>
            <th className="border p-2 text-left">Status</th>
            <th className="border p-2 text-left">Price</th>
            <th className="border p-2 text-left">Stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map(product => (
            <tr
              key={product.id}
              onClick={() => onProductClick(product)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="border p-2">
                {product.image.mode !== 'none' ? (
                  <img
                    src={product.image.thumb}
                    alt={product.image.alt || product.name}
                    className="w-16 h-16 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23ccc"/></svg>';
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                    No image
                  </div>
                )}
              </td>
              <td className="border p-2">{product.id}</td>
              <td className="border p-2">{product.name}</td>
              <td className="border p-2">{product.type}</td>
              <td className="border p-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  product.status === 'publish' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {product.status}
                </span>
              </td>
              <td className="border p-2">{product.price || 'N/A'}</td>
              <td className="border p-2">{product.stock_status || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

