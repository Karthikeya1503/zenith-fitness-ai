import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import './MedicalReports.css';

// ─── IndexedDB Helper for storing report files ───
const DB_NAME = 'fitcoach_medical_db';
const DB_VERSION = 1;
const STORE_NAME = 'report_files';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFileToDB(id, dataUrl, fileName, fileType) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, dataUrl, fileName, fileType });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFileFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFileFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getStorageInfo() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const files = request.result || [];
      let totalBytes = 0;
      files.forEach(f => { totalBytes += (f.dataUrl?.length || 0) * 0.75; }); // base64 to bytes approx
      resolve({ count: files.length, sizeBytes: totalBytes });
    };
    request.onerror = () => reject(request.error);
  });
}

const MEDICAL_SYSTEM_PROMPT = `You are an expert medical report analyst embedded in a fitness coaching platform. Your job is to analyze uploaded medical reports (blood work, lab results, prescriptions, health checkups) and provide actionable health & fitness insights.

IMPORTANT RULES:
1. Start with a clear "⚕️ Medical Report Analysis" heading.
2. Extract ALL visible metrics/values from the report and organize them clearly.
3. Use this EXACT structure in your response:

## 📊 Key Metrics Extracted
List every measurable value found in the report in a clean table format:
| Metric | Value | Normal Range | Status |
Use these status indicators: ✅ Normal, ⚠️ Borderline, 🔴 Concerning

## 🔍 Health Summary
A concise 2-3 sentence overall assessment of the report findings.

## ⚠️ Flagged Concerns
List any values outside normal ranges with brief medical context on why they matter.

## 💪 Fitness Recommendations
Based on the medical findings:
- **Recommended exercises** (safe and beneficial given the results)
- **Exercises to avoid or modify** (if any conditions warrant caution)
- **Target heart rate zones** (if cardiovascular data is available)

## 🥗 Nutrition Plan
Based on the medical findings:
- **Foods to prioritize** (specific to the deficiencies or conditions found)
- **Foods to limit or avoid**
- **Suggested daily targets** (protein, fiber, specific vitamins/minerals)
- **Hydration recommendations**

## 🌙 Lifestyle Tips
- Sleep, stress management, and recovery suggestions based on the findings.

CRITICAL: 
- Always include a disclaimer: "⚠️ This analysis is AI-generated and for informational purposes only. Always consult your healthcare provider for medical decisions."
- If the image is NOT a medical report, politely inform the user and ask them to upload a valid medical document.
- Be thorough but clear. Use simple language that a non-medical person can understand.`;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

export default function MedicalReports({ apiKey }) {
  const [reports, setReports] = useState(() => {
    const saved = localStorage.getItem('fitcoach_medical_reports');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedReport, setSelectedReport] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('summary'); // 'summary', 'full', or 'original'
  const [detailedQuery, setDetailedQuery] = useState('');
  const [detailedResult, setDetailedResult] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [storedFile, setStoredFile] = useState(null); // loaded from IndexedDB
  const [storageInfo, setStorageInfo] = useState({ count: 0, sizeBytes: 0 });
  const [reportThumbnails, setReportThumbnails] = useState({}); // id -> dataUrl for image thumbnails

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Persist reports metadata
  useEffect(() => {
    localStorage.setItem('fitcoach_medical_reports', JSON.stringify(reports));
  }, [reports]);

  // Load storage info
  const refreshStorageInfo = useCallback(async () => {
    try {
      const info = await getStorageInfo();
      setStorageInfo(info);
    } catch (e) {
      console.error('Failed to get storage info:', e);
    }
  }, []);

  useEffect(() => {
    refreshStorageInfo();
  }, [reports, refreshStorageInfo]);

  // Load thumbnails for stored reports
  useEffect(() => {
    const loadThumbnails = async () => {
      const thumbs = {};
      for (const report of reports) {
        try {
          const file = await getFileFromDB(report.id);
          if (file && file.fileType?.startsWith('image/')) {
            thumbs[report.id] = file.dataUrl;
          } else if (file) {
            thumbs[report.id] = '__pdf__';
          }
        } catch { /* skip */ }
      }
      setReportThumbnails(thumbs);
    };
    if (reports.length > 0) loadThumbnails();
  }, [reports]);

  // View a saved report
  const viewReport = async (report, openOriginal = false) => {
    setSelectedReport(report);
    setAnalysisResult(report.analysis);
    setUploadPreview(null);
    setError(null);
    setViewMode(openOriginal ? 'original' : 'summary');
    setDetailedResult(null);
    setDetailedQuery('');
    setStoredFile(null);
    // Load stored file from IndexedDB
    try {
      const file = await getFileFromDB(report.id);
      if (file) setStoredFile(file);
    } catch (e) {
      console.error('Failed to load stored file:', e);
    }
  };

  const clearView = () => {
    setSelectedReport(null);
    setAnalysisResult(null);
    setUploadPreview(null);
    setError(null);
    setViewMode('summary');
    setDetailedResult(null);
    setDetailedQuery('');
    setStoredFile(null);
  };

  const deleteReport = async (id, e) => {
    e?.stopPropagation();
    setReports(prev => prev.filter(r => r.id !== id));
    if (selectedReport?.id === id) {
      clearView();
    }
    // Remove file from IndexedDB
    try {
      await deleteFileFromDB(id);
    } catch (err) {
      console.error('Failed to delete stored file:', err);
    }
  };

  // File processing
  const processFile = (file) => {
    setError(null);

    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      setError('Unsupported file type. Please upload JPG, PNG, WebP, or PDF files.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPreview({
        name: file.name,
        type: file.type,
        size: (file.size / 1024 / 1024).toFixed(2),
        dataUrl: e.target.result
      });
      setAnalysisResult(null);
      setSelectedReport(null);
    };
    reader.readAsDataURL(file);
  };

  // Drag & drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ''; // Reset so same file can be re-selected
  };

  // Analyze with Gemini multimodal
  const analyzeReport = async () => {
    if (!uploadPreview || !apiKey) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      // Extract base64 data (remove the data:mime;base64, prefix)
      const base64Data = uploadPreview.dataUrl.split(',')[1];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: MEDICAL_SYSTEM_PROMPT }]
            },
            contents: [{
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: uploadPreview.type,
                    data: base64Data
                  }
                },
                {
                  text: 'Please analyze this medical report thoroughly and provide comprehensive health, fitness, and nutrition recommendations based on the findings.'
                }
              ]
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4000
            }
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!analysisText) throw new Error('No analysis received from AI.');

      setAnalysisResult(analysisText);

      // Save to reports history
      const newReport = {
        id: Date.now(),
        fileName: uploadPreview.name,
        fileType: uploadPreview.type,
        fileSize: uploadPreview.size,
        analysis: analysisText,
        date: new Date().toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric'
        }),
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit'
        })
      };

      setReports(prev => [newReport, ...prev]);
      setSelectedReport(newReport);

      // Save file to IndexedDB
      try {
        await saveFileToDB(newReport.id, uploadPreview.dataUrl, uploadPreview.name, uploadPreview.type);
        setStoredFile({ id: newReport.id, dataUrl: uploadPreview.dataUrl, fileName: uploadPreview.name, fileType: uploadPreview.type });
      } catch (err) {
        console.error('Failed to store file:', err);
      }

      setUploadPreview(null);
    } catch (e) {
      console.error('Medical report analysis failed:', e);
      setError(e.message || 'Failed to analyze the report. Please try again.');
    }

    setIsAnalyzing(false);
  };

  // Extract quick summary from analysis text
  const extractSummary = (text) => {
    if (!text) return null;
    const sections = {};
    
    // Extract Health Summary
    const summaryMatch = text.match(/##\s*🔍\s*Health Summary[\s\S]*?\n([\s\S]*?)(?=\n##|$)/);
    sections.healthSummary = summaryMatch ? summaryMatch[1].trim() : '';
    
    // Extract Flagged Concerns
    const concernsMatch = text.match(/##\s*⚠️\s*Flagged Concerns[\s\S]*?\n([\s\S]*?)(?=\n##|$)/);
    sections.concerns = concernsMatch ? concernsMatch[1].trim() : '';
    
    // Extract Key Metrics table
    const metricsMatch = text.match(/##\s*📊\s*Key Metrics[\s\S]*?\n([\s\S]*?)(?=\n##|$)/);
    sections.metrics = metricsMatch ? metricsMatch[1].trim() : '';
    
    // Count status indicators
    const normalCount = (text.match(/✅/g) || []).length;
    const borderlineCount = (text.match(/⚠️/g) || []).length;
    const concerningCount = (text.match(/🔴/g) || []).length;
    sections.statusCounts = { normal: normalCount, borderline: borderlineCount, concerning: concerningCount };
    
    return sections;
  };

  // Get detailed info on a specific topic
  const getDetailedInfo = async (topic) => {
    if (!apiKey || !analysisResult) return;
    setIsLoadingDetail(true);
    setDetailedResult(null);
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: `You are a medical health advisor embedded in a fitness platform. The user has a medical report that was previously analyzed. Based on the analysis provided, give an extremely detailed, thorough, and actionable deep-dive on the specific topic they ask about. Include:
- Detailed medical explanation in simple terms
- Why this metric/condition matters for their health
- Specific numerical targets to aim for
- Detailed dietary recommendations (specific foods, portions, meal timing)
- Specific exercises and intensity levels
- Supplements that may help (with dosages)
- Timeline for expected improvement
- When to see a doctor
- How this relates to other metrics in their report

Format everything cleanly in Markdown. Be thorough and practical.` }]
            },
            contents: [{
              role: 'user',
              parts: [{ text: `Here is my medical report analysis:\n\n${analysisResult}\n\nPlease give me a very detailed, in-depth breakdown about: ${topic}` }]
            }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 4000 }
          })
        }
      );
      
      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No response');
      setDetailedResult(text);
    } catch (e) {
      console.error('Detailed info failed:', e);
      setDetailedResult('Failed to get detailed information. Please try again.');
    }
    
    setIsLoadingDetail(false);
  };

  // Build health profile from all reports
  const buildHealthProfile = () => {
    if (!reports.length) return null;
    const latest = reports[0];
    const summary = extractSummary(latest.analysis);
    return { latest, summary, totalReports: reports.length };
  };

  const healthProfile = buildHealthProfile();

  return (
    <div className="medical-container">
      {/* Disclaimer Banner */}
      <div className="medical-disclaimer">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>AI-powered analysis for informational purposes only. Always consult your healthcare provider for medical decisions.</span>
      </div>

      <div className="medical-header">
        <h1>Medical Report Analyzer</h1>
        {(analysisResult || uploadPreview) && (
          <button className="btn-primary" onClick={clearView} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>
            ← New Upload
          </button>
        )}
      </div>

      {/* Upload Zone - show when no analysis is active */}
      {!analysisResult && !uploadPreview && (
        <div
          ref={dropZoneRef}
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className="upload-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="12" y2="12"></line>
              <line x1="15" y1="15" x2="12" y2="12"></line>
            </svg>
          </div>
          <h3>Upload Medical Report</h3>
          <p>Drag & drop your report here, or click to browse</p>
          <div className="upload-formats">
            <span>JPG</span><span>PNG</span><span>WebP</span><span>PDF</span>
          </div>
          <p className="upload-limit">Maximum file size: 10MB</p>
        </div>
      )}

      {/* File Preview */}
      {uploadPreview && !analysisResult && (
        <div className="preview-panel">
          <div className="preview-file-info">
            {uploadPreview.type.startsWith('image/') ? (
              <img src={uploadPreview.dataUrl} alt="Report preview" className="preview-thumbnail" />
            ) : (
              <div className="preview-pdf-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
            )}
            <div className="preview-details">
              <strong>{uploadPreview.name}</strong>
              <span>{uploadPreview.size} MB • {uploadPreview.type.split('/')[1].toUpperCase()}</span>
            </div>
            <button className="preview-remove" onClick={() => setUploadPreview(null)} aria-label="Remove file">✕</button>
          </div>
          <button
            className="btn-primary analyze-btn"
            onClick={analyzeReport}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <span className="analyze-spinner"></span>
                Analyzing Report...
              </>
            ) : (
              '🔬 Analyze Report with AI'
            )}
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="medical-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          {error}
        </div>
      )}

      {/* Analysis Result */}
      {analysisResult && (
        <div className="analysis-result">
          {selectedReport && (
            <div className="analysis-meta">
              <span>📄 {selectedReport.fileName}</span>
              <span>📅 {selectedReport.date} at {selectedReport.time}</span>
            </div>
          )}
          
          {/* Summary / Full / Original Toggle */}
          <div className="view-toggle">
            <button 
              className={`view-toggle-btn ${viewMode === 'summary' ? 'active' : ''}`}
              onClick={() => setViewMode('summary')}
            >
              📋 Summary
            </button>
            <button 
              className={`view-toggle-btn ${viewMode === 'full' ? 'active' : ''}`}
              onClick={() => setViewMode('full')}
            >
              📑 Full Analysis
            </button>
            <button 
              className={`view-toggle-btn ${viewMode === 'original' ? 'active' : ''}`}
              onClick={() => setViewMode('original')}
              disabled={!storedFile}
              title={storedFile ? 'View original report' : 'Original file not available'}
            >
              📎 Original
            </button>
          </div>

          {viewMode === 'summary' ? (
            <div className="summary-view">
              {/* Quick Stats */}
              {(() => {
                const s = extractSummary(analysisResult);
                if (!s) return null;
                return (
                  <>
                    <div className="summary-stats">
                      <div className="summary-stat normal">
                        <span className="summary-stat-num">{s.statusCounts.normal}</span>
                        <span className="summary-stat-label">✅ Normal</span>
                      </div>
                      <div className="summary-stat borderline">
                        <span className="summary-stat-num">{s.statusCounts.borderline}</span>
                        <span className="summary-stat-label">⚠️ Borderline</span>
                      </div>
                      <div className="summary-stat concerning">
                        <span className="summary-stat-num">{s.statusCounts.concerning}</span>
                        <span className="summary-stat-label">🔴 Concerning</span>
                      </div>
                    </div>

                    {s.healthSummary && (
                      <div className="summary-section">
                        <h3>🔍 Health Summary</h3>
                        <div className="summary-text">
                          <ReactMarkdown>{s.healthSummary}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {s.concerns && (
                      <div className="summary-section concerns">
                        <h3>⚠️ Key Concerns</h3>
                        <div className="summary-text">
                          <ReactMarkdown>{s.concerns}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {s.metrics && (
                      <div className="summary-section">
                        <h3>📊 Metrics Overview</h3>
                        <div className="summary-text analysis-content">
                          <ReactMarkdown>{s.metrics}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Ask for detailed info */}
              <div className="detail-query-section">
                <h3>🔬 Get Detailed Info</h3>
                <p className="detail-query-hint">Ask about any metric, condition, or concern from your report for an in-depth breakdown.</p>
                <div className="detail-query-input">
                  <input
                    type="text"
                    className="tracker-input"
                    placeholder="e.g. Low vitamin D, High cholesterol, Iron deficiency..."
                    value={detailedQuery}
                    onChange={(e) => setDetailedQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && detailedQuery.trim() && getDetailedInfo(detailedQuery.trim())}
                    disabled={isLoadingDetail}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => detailedQuery.trim() && getDetailedInfo(detailedQuery.trim())}
                    disabled={isLoadingDetail || !detailedQuery.trim()}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isLoadingDetail ? 'Analyzing...' : 'Deep Dive →'}
                  </button>
                </div>
                
                {/* Quick suggestion chips */}
                <div className="detail-chips">
                  {['Cholesterol levels', 'Blood sugar', 'Vitamin deficiency', 'Fitness plan', 'Diet recommendations'].map(chip => (
                    <button
                      key={chip}
                      className="detail-chip"
                      onClick={() => { setDetailedQuery(chip); getDetailedInfo(chip); }}
                      disabled={isLoadingDetail}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Result */}
              {isLoadingDetail && (
                <div className="detail-loading">
                  <span className="analyze-spinner"></span>
                  <span>Getting detailed analysis...</span>
                </div>
              )}
              {detailedResult && (
                <div className="detail-result">
                  <div className="detail-result-header">
                    <h3>🔬 Detailed Analysis</h3>
                    <button onClick={() => setDetailedResult(null)} className="preview-remove">✕</button>
                  </div>
                  <div className="analysis-content">
                    <ReactMarkdown>{detailedResult}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'full' ? (
            <div className="analysis-content">
              <ReactMarkdown>{analysisResult}</ReactMarkdown>
            </div>
          ) : (
            /* Original File View */
            <div className="original-file-view">
              {storedFile ? (
                <>
                  <div className="original-file-header">
                    <span>📎 {storedFile.fileName}</span>
                    <a 
                      href={storedFile.dataUrl} 
                      download={storedFile.fileName}
                      className="btn-primary"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', textDecoration: 'none' }}
                    >
                      ⬇ Download
                    </a>
                  </div>
                  <div className="original-file-content">
                    {storedFile.fileType?.startsWith('image/') ? (
                      <img src={storedFile.dataUrl} alt="Original report" className="original-image" />
                    ) : (
                      <div className="original-pdf-container">
                        <iframe 
                          src={storedFile.dataUrl} 
                          title="Original PDF report"
                          className="original-pdf-iframe"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="original-not-found">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.3}}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <p>Original file not available</p>
                  <span>This report was analyzed before file storage was enabled.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Health Profile Summary - Show on main page when reports exist */}
      {!analysisResult && !uploadPreview && reports.length > 0 && healthProfile && (
        <div className="health-profile">
          <div className="health-profile-header">
            <h2>🏥 Your Health Profile</h2>
            <span className="health-profile-badge">{healthProfile.totalReports} report{healthProfile.totalReports > 1 ? 's' : ''} analyzed</span>
          </div>
          
          {healthProfile.summary && (
            <>
              <div className="summary-stats">
                <div className="summary-stat normal">
                  <span className="summary-stat-num">{healthProfile.summary.statusCounts.normal}</span>
                  <span className="summary-stat-label">✅ Normal</span>
                </div>
                <div className="summary-stat borderline">
                  <span className="summary-stat-num">{healthProfile.summary.statusCounts.borderline}</span>
                  <span className="summary-stat-label">⚠️ Borderline</span>
                </div>
                <div className="summary-stat concerning">
                  <span className="summary-stat-num">{healthProfile.summary.statusCounts.concerning}</span>
                  <span className="summary-stat-label">🔴 Concerning</span>
                </div>
              </div>
              {healthProfile.summary.healthSummary && (
                <div className="health-profile-summary">
                  <ReactMarkdown>{healthProfile.summary.healthSummary}</ReactMarkdown>
                </div>
              )}
              {healthProfile.summary.concerns && (
                <div className="health-profile-concerns">
                  <h3>⚠️ Key Concerns to Address</h3>
                  <div className="summary-text">
                    <ReactMarkdown>{healthProfile.summary.concerns}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
          <p className="health-profile-footnote">Based on latest report: {healthProfile.latest.fileName} ({healthProfile.latest.date})</p>
        </div>
      )}

      {/* Report History */}
      {!analysisResult && !uploadPreview && reports.length > 0 && (
        <div className="reports-history">
          <div className="reports-history-header">
            <h2>Stored Reports</h2>
            <span className="storage-info">
              📦 {storageInfo.count} file{storageInfo.count !== 1 ? 's' : ''} stored • {(storageInfo.sizeBytes / 1024 / 1024).toFixed(1)} MB used
            </span>
          </div>
          <div className="reports-grid">
            {reports.map(report => (
              <div key={report.id} className="report-card-v2" onClick={() => viewReport(report)}>
                {/* Thumbnail */}
                <div className="report-card-thumb">
                  {reportThumbnails[report.id] && reportThumbnails[report.id] !== '__pdf__' ? (
                    <img src={reportThumbnails[report.id]} alt={report.fileName} className="report-thumb-img" />
                  ) : reportThumbnails[report.id] === '__pdf__' ? (
                    <div className="report-thumb-pdf">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <span>PDF</span>
                    </div>
                  ) : (
                    <div className="report-thumb-pdf">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                    </div>
                  )}
                  {reportThumbnails[report.id] && (
                    <span className="report-stored-badge">💾 Stored</span>
                  )}
                </div>
                {/* Info */}
                <div className="report-card-body">
                  <strong>{report.fileName}</strong>
                  <span className="report-card-date">{report.date} • {report.time}</span>
                  <span className="report-card-size">{report.fileSize} MB</span>
                </div>
                {/* Actions */}
                <div className="report-card-actions">
                  <button
                    className="report-action-btn view-btn"
                    onClick={(e) => { e.stopPropagation(); viewReport(report); }}
                    title="View Analysis"
                  >
                    📋 Analysis
                  </button>
                  {reportThumbnails[report.id] && (
                    <button
                      className="report-action-btn file-btn"
                      onClick={(e) => { e.stopPropagation(); viewReport(report, true); }}
                      title="View Original File"
                    >
                      📎 View File
                    </button>
                  )}
                  <button
                    className="report-action-btn delete-btn"
                    onClick={(e) => deleteReport(report.id, e)}
                    title="Delete Report"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analysisResult && !uploadPreview && reports.length === 0 && (
        <div className="medical-features">
          <h2>What can be analyzed?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🩸</div>
              <h3>Blood Work</h3>
              <p>CBC, lipid panel, metabolic panel, thyroid function tests</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🏥</div>
              <h3>Lab Reports</h3>
              <p>Liver function, kidney function, vitamin levels, hormone panels</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">❤️</div>
              <h3>Health Checkups</h3>
              <p>Annual physicals, cardiac reports, diabetes screening</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💊</div>
              <h3>Prescriptions</h3>
              <p>Understand prescribed medications and their fitness implications</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
