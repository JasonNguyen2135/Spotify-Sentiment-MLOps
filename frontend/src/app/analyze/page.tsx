'use client';
import { useState } from 'react';
import axios from 'axios';
import { Upload, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface AnalysisResult {
  "Câu bình luận": string;
  "Cảm xúc": string;
}

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/analyze-csv', formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setResults(response.data.results);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error connecting to backend");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sentiment Analysis</h1>
        <p className="text-gray-500">Upload your Spotify review CSV file and let AI do the work.</p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-12 px-4 transition-colors hover:border-spotify/50">
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2 font-medium">Click to upload or drag and drop</p>
          <p className="text-gray-400 text-sm mb-6">CSV files only (max. 10MB)</p>
          
          <input 
            type="file" 
            accept=".csv"
            onChange={handleFileChange}
            className="hidden" 
            id="csv-upload"
          />
          <label 
            htmlFor="csv-upload"
            className="cursor-pointer bg-white border border-gray-300 px-6 py-2 rounded-lg font-semibold hover:bg-gray-50 transition-all mb-4"
          >
            Select File
          </label>

          {file && (
            <div className="flex items-center gap-2 text-spotify font-medium">
              <FileText className="w-4 h-4" />
              {file.name}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-600">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <button 
          onClick={handleUpload}
          disabled={loading || !file}
          className="w-full mt-6 bg-spotify text-white py-3 rounded-xl font-bold text-lg hover:bg-opacity-90 transition-all disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</>
          ) : (
            "Start AI Analysis"
          )}
        </button>
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-900">Analysis Results</h3>
            <span className="flex items-center gap-1 text-sm text-spotify font-medium">
              <CheckCircle2 className="w-4 h-4" /> {results.length} rows processed
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase">
                  <th className="px-6 py-4 font-semibold">Comment</th>
                  <th className="px-6 py-4 font-semibold text-center">Sentiment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((res, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{res["Câu bình luận"]}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        res["Cảm xúc"] === "positive" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {res["Cảm xúc"]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
