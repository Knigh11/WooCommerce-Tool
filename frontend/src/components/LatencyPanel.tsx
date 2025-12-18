import { getAverageTiming } from '../api/client';
import { ApiTiming } from '../api/client';

interface LatencyPanelProps {
  lastTiming: ApiTiming | null;
  storeId: string | null;
  apiBase: string;
  lastError: string | null;
}

export function LatencyPanel({ lastTiming, storeId, apiBase, lastError }: LatencyPanelProps) {
  const avgProducts = getAverageTiming('/api/v1/stores/{storeId}/products');
  const avgJobState = getAverageTiming('/api/v1/stores/{storeId}/jobs/{jobId}');

  return (
    <div className="border rounded p-4">
      <h3 className="text-lg font-bold mb-4">Diagnostics & Latency</h3>

      <div className="space-y-3">
        <div>
          <strong>API Base URL:</strong> {apiBase}
        </div>

        <div>
          <strong>Selected Store:</strong> {storeId || 'None'}
        </div>

        {lastTiming && (
          <div>
            <strong>Last API Call:</strong>{' '}
            <span className="font-mono">{lastTiming.duration.toFixed(2)}ms</span>{' '}
            <span className="text-xs text-gray-500">
              ({new Date(lastTiming.timestamp).toLocaleTimeString()})
            </span>
          </div>
        )}

        <div>
          <strong>Avg Products List:</strong>{' '}
          <span className="font-mono">{avgProducts > 0 ? `${avgProducts.toFixed(2)}ms` : 'N/A'}</span>
          <span className="text-xs text-gray-500 ml-2">(rolling 20 calls)</span>
        </div>

        <div>
          <strong>Avg Job State Poll:</strong>{' '}
          <span className="font-mono">{avgJobState > 0 ? `${avgJobState.toFixed(2)}ms` : 'N/A'}</span>
          <span className="text-xs text-gray-500 ml-2">(rolling 20 calls)</span>
        </div>

        {lastError && (
          <div className="p-2 bg-red-100 text-red-700 rounded text-sm">
            <strong>Last Error:</strong> {lastError}
          </div>
        )}
      </div>
    </div>
  );
}

