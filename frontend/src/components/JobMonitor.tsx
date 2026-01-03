import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { JobResponse, SSELogEvent, SSEProgressEvent, SSEStatusEvent } from '../api/types';
import { useJobManager } from '../state/jobManager';
import { LogsConsole } from './LogsConsole';

interface JobMonitorProps {
  storeId: string | null;
  jobId: string | null;
  onClose: () => void;
}

export function JobMonitor({ storeId, jobId, onClose }: JobMonitorProps) {
  const { t } = useTranslation();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [logs, setLogs] = useState<SSELogEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseError, setSseError] = useState<string | null>(null);
  const [eventsPerMinute, setEventsPerMinute] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const eventCountRef = useRef(0);
  const eventCountStartRef = useRef(Date.now());
  const { getJob: getJobFromManager } = useJobManager();

  // Polling fallback - chỉ dùng khi SSE không hoạt động
  useEffect(() => {
    if (!storeId || !jobId) return;
    if (sseConnected) return; // Không polling nếu SSE đã kết nối
    if (job && ['done', 'failed', 'cancelled'].includes(job.status)) return; // Không polling nếu job đã xong

    const pollJob = async () => {
      try {
        const { data } = await apiFetch<JobResponse>(endpoints.job(storeId, jobId));
        setJob(data);
      } catch (err: any) {
        console.error('Polling error:', err);
        // If it's a 404, job might not exist yet (just created)
        // If it's a 503, Redis might be down
        if (err.status === 404) {
          // Job not found yet, might be still creating
          console.warn('Job not found yet, might be still creating');
        } else         if (err.status === 503) {
          setSseError(`${t("jobMonitor.redisUnavailable")}: ${err.message}`);
        } else {
          // Other errors - don't spam console, just log once
          if (!sseError || !sseError.includes('polling')) {
            console.error('Polling failed:', err.message);
          }
        }
      }
    };

    pollJob();
    pollingIntervalRef.current = window.setInterval(pollJob, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [storeId, jobId, sseConnected, job?.status]);

  // SSE connection
  useEffect(() => {
    if (!storeId || !jobId) return;
    if (job && ['done', 'failed', 'cancelled'].includes(job.status)) return; // Không kết nối SSE nếu job đã xong

    // EventSource needs absolute URL or relative path (Vite proxy handles it)
    // Get job token from job manager if available
    const jobState = getJobFromManager(jobId);
    const jobToken = jobState?.jobToken;
    const sseUrl = endpoints.jobEvents(storeId, jobId, jobToken);
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setSseConnected(true);
      setSseError(null);
      eventCountRef.current = 0;
      eventCountStartRef.current = Date.now();
      // Dừng polling khi SSE kết nối thành công
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    eventSource.onerror = (err) => {
      // Check readyState to determine error type
      if (eventSource.readyState === EventSource.CONNECTING) {
        // Still connecting, might be temporary
        setSseError(t("jobMonitor.sseConnecting"));
      } else if (eventSource.readyState === EventSource.CLOSED) {
        // Connection closed - dừng SSE và để polling tiếp quản
        setSseConnected(false);
        setSseError(t("jobMonitor.sseConnectionClosed"));
        console.error('SSE connection closed:', err);
        eventSource.close();
      } else {
        // Other error
        setSseConnected(false);
        setSseError(t("jobMonitor.sseConnectionClosed"));
        console.error('SSE error:', err);
      }
    };

    eventSource.addEventListener('connected', () => {
      setSseConnected(true);
      setSseError(null);
      eventCountRef.current = 0;
      eventCountStartRef.current = Date.now();
      // Dừng polling khi SSE kết nối thành công
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    });

    eventSource.addEventListener('status', (e: Event) => {
      try {
        const messageEvent = e as MessageEvent;
        const data: SSEStatusEvent = JSON.parse(messageEvent.data);
        setJob((prev) => {
          const newJob = prev
            ? {
              ...prev,
              status: data.status as any,
              progress: data.total
                ? { done: 0, total: data.total, percent: 0 }
                : prev.progress,
            }
            : null;
          
          // Đóng SSE nếu job đã xong
          if (newJob && ['done', 'failed', 'cancelled'].includes(newJob.status)) {
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
          
          return newJob;
        });
        eventCountRef.current++;
      } catch (err) {
        console.error('Error parsing status event:', err);
      }
    });

    eventSource.addEventListener('error', (e: Event) => {
      try {
        const messageEvent = e as MessageEvent;
        const data = JSON.parse(messageEvent.data);
        setSseError(`SSE Error: ${data.error || 'Unknown error'}`);
        setSseConnected(false);
        console.error('SSE error event:', data);
      } catch (err) {
        console.error('Error parsing error event:', err);
      }
    });

    eventSource.addEventListener('progress', (e: Event) => {
      try {
        const messageEvent = e as MessageEvent;
        const data: SSEProgressEvent = JSON.parse(messageEvent.data);
        setJob((prev) =>
          prev
            ? {
              ...prev,
              progress: {
                done: data.done,
                total: data.total,
                percent: data.percent,
              },
              metrics: {
                success: data.success,
                failed: data.failed,
                retried: data.retried,
                skipped: data.skipped,
              },
              current: data.current,
            }
            : null
        );
        eventCountRef.current++;
      } catch (err) {
        console.error('Error parsing progress event:', err);
      }
    });

    eventSource.addEventListener('log', (e: Event) => {
      try {
        const messageEvent = e as MessageEvent;
        const data: SSELogEvent = JSON.parse(messageEvent.data);
        setLogs((prev) => [...prev, data]);
        eventCountRef.current++;
      } catch (err) {
        console.error('Error parsing log event:', err);
      }
    });

    eventSource.addEventListener('comment', () => {
      // Heartbeat - update events per minute
      const elapsed = (Date.now() - eventCountStartRef.current) / 1000 / 60;
      if (elapsed > 0) {
        setEventsPerMinute(Math.round(eventCountRef.current / elapsed));
      }
    });

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [storeId, jobId, job?.status]);

  // Đóng SSE và dừng polling khi job đã xong
  useEffect(() => {
    if (job && ['done', 'failed', 'cancelled'].includes(job.status)) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [job?.status]);

  const handlePause = async () => {
    if (!storeId || !jobId) return;
    try {
      await apiFetch(endpoints.pauseJob(storeId, jobId), { method: 'POST' });
      setIsPaused(true);
    } catch (err: any) {
      console.error('Failed to pause job:', err);
      alert(`${t("jobMonitor.failedToPause")}: ${err.message}`);
    }
  };

  const handleResume = async () => {
    if (!storeId || !jobId) return;
    try {
      await apiFetch(endpoints.resumeJob(storeId, jobId), { method: 'POST' });
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to resume job:', err);
      alert(`${t("jobMonitor.failedToResume")}: ${err.message}`);
    }
  };

  const handleStop = async () => {
    if (!storeId || !jobId) return;
    if (!window.confirm(t("jobMonitor.confirmStop"))) return;
    try {
      await apiFetch(endpoints.stopJob(storeId, jobId), { method: 'POST' });
    } catch (err: any) {
      console.error('Failed to stop job:', err);
      alert(`${t("jobMonitor.failedToStop")}: ${err.message}`);
    }
  };

  if (!jobId) return null;

  const isRunning = job?.status === 'running';
  const isDone = job?.status === 'done' || job?.status === 'failed' || job?.status === 'cancelled';

  return (
    <div className="border rounded p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold">{t("jobMonitor.jobMonitor")}: {jobId.substring(0, 8)}...</h3>
          <div className="text-sm text-gray-600">
            {t("jobMonitor.status")}:{' '}
            <span
              className={`font-bold ${job?.status === 'done'
                  ? 'text-green-600'
                  : job?.status === 'failed'
                    ? 'text-red-600'
                    : job?.status === 'cancelled'
                      ? 'text-yellow-600'
                      : 'text-blue-600'
                }`}
            >
              {job?.status || 'loading...'}
            </span>
            {sseConnected && <span className="ml-4 text-green-600">● {t("jobMonitor.sseConnected")}</span>}
            {sseError && <span className="ml-4 text-yellow-600">⚠ {sseError}</span>}
            {eventsPerMinute > 0 && (
              <span className="ml-4 text-gray-500">({eventsPerMinute} events/min)</span>
            )}
            {isPaused && <span className="ml-4 text-orange-600">⏸ Paused</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          ×
        </button>
      </div>

      {job?.progress && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>
              Progress: {job.progress.done} / {job.progress.total}
            </span>
            <span>{job.progress.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all"
              style={{ width: `${job.progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {job?.metrics && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center p-2 bg-green-100 rounded">
            <div className="font-bold text-green-700">{job.metrics.success}</div>
            <div className="text-xs text-gray-600">Success</div>
          </div>
          <div className="text-center p-2 bg-red-100 rounded">
            <div className="font-bold text-red-700">{job.metrics.failed}</div>
            <div className="text-xs text-gray-600">Failed</div>
          </div>
          <div className="text-center p-2 bg-yellow-100 rounded">
            <div className="font-bold text-yellow-700">{job.metrics.retried}</div>
            <div className="text-xs text-gray-600">Retried</div>
          </div>
          <div className="text-center p-2 bg-gray-100 rounded">
            <div className="font-bold text-gray-700">{job.metrics.skipped}</div>
            <div className="text-xs text-gray-600">Skipped</div>
          </div>
        </div>
      )}

      {job?.current && (job.current.product_id || job.current.action) && (
        <div className="mb-4 p-2 bg-blue-50 rounded text-sm">
          <strong>Current:</strong> {job.current.action || 'Processing'}{' '}
          {job.current.product_id && `Product ${job.current.product_id}`}
        </div>
      )}

      <LogsConsole
        logs={logs}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
      />

      {!isDone && (
        <div className="mt-4 flex gap-2">
          {isRunning && !isPaused && (
            <button
              onClick={handlePause}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              ⏸ Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={handleResume}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ▶ Resume
            </button>
          )}
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            🛑 Stop
          </button>
        </div>
      )}
    </div>
  );
}
