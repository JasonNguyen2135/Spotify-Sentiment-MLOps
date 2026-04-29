export default function MonitoringPage() {
  return (
    <div className="h-[80vh] flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Evidently AI Monitoring</h1>
        <p className="text-gray-500">Real-time data drift and model performance dashboard.</p>
      </div>
      
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
        <iframe 
          src="/evidently/" 
          className="absolute inset-0 w-full h-full border-0"
          title="Evidently Dashboard"
        />
      </div>
    </div>
  );
}
