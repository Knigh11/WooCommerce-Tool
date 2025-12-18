interface ErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 relative">
      <div className="flex justify-between items-start">
        <div>
          <strong className="font-bold">Error:</strong> {error}
        </div>
        <button
          onClick={onDismiss}
          className="text-red-700 hover:text-red-900 ml-4"
        >
          ×
        </button>
      </div>
    </div>
  );
}

