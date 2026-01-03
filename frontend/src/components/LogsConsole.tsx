import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SSELogEvent } from '../api/types';

interface LogsConsoleProps {
  logs: SSELogEvent[];
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
}

export function LogsConsole({ logs, autoScroll, onToggleAutoScroll }: LogsConsoleProps) {
  const { t } = useTranslation();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <div className="border rounded">
      <div className="bg-gray-100 p-2 flex justify-between items-center">
        <h4 className="font-medium">{t("logs.title")} ({logs.length})</h4>
        <label className="flex items-center text-sm">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={onToggleAutoScroll}
            className="mr-2"
          />
          {t("logs.autoScroll")}
        </label>
      </div>
      <div className="h-64 overflow-y-auto p-2 font-mono text-xs bg-black text-green-400">
        {logs.length === 0 ? (
          <div className="text-gray-500">{t("logs.noLogs")}</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="mb-1">
              <span className="text-gray-500">[{log.ts}]</span>{' '}
              <span className={
                log.level === 'ERROR' ? 'text-red-400' :
                log.level === 'WARN' ? 'text-yellow-400' :
                log.level === 'SUCCESS' ? 'text-green-300' :
                'text-green-400'
              }>
                [{log.level}]
              </span>{' '}
              {log.product_id && <span className="text-blue-400">[{t("logs.product")} {log.product_id}]</span>}{' '}
              <span>{log.msg}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

