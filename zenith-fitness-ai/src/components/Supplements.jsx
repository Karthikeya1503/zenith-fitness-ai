import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './Supplements.css';

const SUPPLEMENT_PROMPT = `You are an expert sports nutritionist and supplement advisor embedded in a fitness platform called ZENITH. Based on the user's medical report data and fitness activity data provided below, recommend personalized supplements.

Use this EXACT structure:

## 💊 Personalized Supplement Plan

A 1-2 sentence overview of why these supplements are recommended based on their specific data.

## 🔴 Essential (High Priority)
For each essential supplement:
### [Supplement Name]
- **Why you need it**: Based on specific findings from their medical/fitness data
- **Recommended dosage**: Specific daily amount
- **Best time to take**: Morning/evening/with meals etc.
- **Duration**: How long to take it
- **Food alternatives**: Natural food sources

## 🟡 Recommended (Medium Priority)
Same format as above for recommended supplements.

## 🟢 Optional (Performance Boost)
Same format for optional performance supplements.

## ⚠️ Supplements to AVOID
List any supplements that conflict with their medical conditions or medications found in reports.

## 🍽️ Whole Food First
A brief section on getting nutrients from food before supplements, with specific meal suggestions.

## 📅 Daily Supplement Schedule
A simple morning/afternoon/evening schedule table:
| Time | Supplement | Dosage | With Food? |

CRITICAL RULES:
- Base ALL recommendations on the actual medical data and fitness activity provided
- Flag any potential interactions between supplements
- Include disclaimer: "Consult your healthcare provider before starting any supplement regimen"
- If medical data shows specific deficiencies, prioritize those
- Consider workout intensity and fitness goals when recommending performance supplements
- Be specific with dosages, not vague ranges`;

export default function Supplements({ apiKey }) {
  const [recommendations, setRecommendations] = useState(() => {
    const saved = localStorage.getItem('zenith_supplements');
    return saved ? JSON.parse(saved) : null;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(() => {
    return localStorage.getItem('zenith_supplements_date') || null;
  });

  // Gather all context data
  const gatherContextData = () => {
    let context = '';

    // Medical reports
    try {
      const reports = JSON.parse(localStorage.getItem('fitcoach_medical_reports') || '[]');
      if (reports.length > 0) {
        const latest = reports[0];
        context += `\n\n=== MEDICAL REPORT DATA (analyzed ${latest.date}) ===\n${latest.analysis}\n`;
        if (reports.length > 1) {
          context += `\n(${reports.length - 1} older report(s) also on file)\n`;
        }
      } else {
        context += '\n\n=== MEDICAL DATA ===\nNo medical reports uploaded yet.\n';
      }
    } catch { context += '\n\nNo medical data available.\n'; }

    // Fitness tracker data
    try {
      const steps = localStorage.getItem('fitcoach_steps') || '0';
      const logs = JSON.parse(localStorage.getItem('fitcoach_logs') || '[]');
      const calGoal = localStorage.getItem('fitcoach_cal_goal') || '2000';
      const stepGoal = localStorage.getItem('fitcoach_step_goal') || '10000';

      context += `\n=== FITNESS TRACKER DATA ===\n`;
      context += `Daily calorie goal: ${calGoal} kcal\n`;
      context += `Daily step goal: ${stepGoal} steps\n`;
      context += `Today's steps: ${steps}\n`;

      if (logs.length > 0) {
        const totalCalIn = logs.filter(l => l.type === 'food').reduce((sum, l) => sum + (l.cal || 0), 0);
        const totalCalOut = logs.filter(l => l.type === 'exercise').reduce((sum, l) => sum + (l.cal || 0), 0);
        const totalProtein = logs.reduce((sum, l) => sum + (l.protein || 0), 0);

        context += `Calories consumed today: ${totalCalIn} kcal\n`;
        context += `Calories burned today: ${totalCalOut} kcal\n`;
        context += `Protein intake today: ${totalProtein}g\n`;
        context += `\nRecent activity log:\n`;
        logs.slice(0, 10).forEach(l => {
          context += `- ${l.type === 'food' ? '🍽️' : '🏋️'} ${l.text} (${l.cal} kcal, ${l.protein}g protein)\n`;
        });
      } else {
        context += `No activities logged today.\n`;
      }
    } catch { context += '\nNo fitness data available.\n'; }

    return context;
  };

  const generateRecommendations = async () => {
    if (!apiKey) return;
    setIsGenerating(true);
    setError(null);

    const contextData = gatherContextData();
    const hasMedicalData = contextData.includes('MEDICAL REPORT DATA');

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SUPPLEMENT_PROMPT }] },
            contents: [{
              role: 'user',
              parts: [{
                text: `Here is my health and fitness profile:\n${contextData}\n\nPlease analyze all of this data and provide personalized supplement recommendations. ${hasMedicalData ? 'Pay special attention to any deficiencies or concerning values in my medical reports.' : 'Note: I haven\'t uploaded medical reports yet, so base recommendations on my fitness activity.'}`
              }]
            }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 4000 }
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No recommendations received.');

      setRecommendations(text);
      const now = new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      setLastGenerated(now);

      localStorage.setItem('zenith_supplements', JSON.stringify(text));
      localStorage.setItem('zenith_supplements_date', now);
    } catch (e) {
      console.error('Supplement generation failed:', e);
      setError(e.message || 'Failed to generate recommendations.');
    }

    setIsGenerating(false);
  };

  // Check what data is available
  const getDataStatus = () => {
    let medicalReports = 0;
    let hasTracker = false;
    try {
      medicalReports = JSON.parse(localStorage.getItem('fitcoach_medical_reports') || '[]').length;
    } catch { /* ignore error */ }
    try {
      const logs = JSON.parse(localStorage.getItem('fitcoach_logs') || '[]');
      const steps = parseInt(localStorage.getItem('fitcoach_steps') || '0');
      hasTracker = logs.length > 0 || steps > 0;
    } catch { /* ignore error */ }
    return { medicalReports, hasTracker };
  };

  const dataStatus = getDataStatus();

  return (
    <div className="supplements-container">
      {/* Header */}
      <div className="supplements-header">
        <div>
          <h1>Supplement Advisor</h1>
          <p className="supplements-subtitle">AI-powered recommendations based on your health profile</p>
        </div>
        <button
          className="btn-primary generate-supp-btn"
          onClick={generateRecommendations}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="analyze-spinner"></span>
              Analyzing...
            </>
          ) : recommendations ? (
            '🔄 Refresh Recommendations'
          ) : (
            '✨ Generate Recommendations'
          )}
        </button>
      </div>

      {/* Data Sources Status */}
      <div className="data-sources">
        <div className={`data-source ${dataStatus.medicalReports > 0 ? 'active' : 'inactive'}`}>
          <span className="data-source-icon">{dataStatus.medicalReports > 0 ? '✅' : '⭕'}</span>
          <div>
            <strong>Medical Reports</strong>
            <span>{dataStatus.medicalReports > 0 ? `${dataStatus.medicalReports} report(s) available` : 'No reports uploaded'}</span>
          </div>
        </div>
        <div className={`data-source ${dataStatus.hasTracker ? 'active' : 'inactive'}`}>
          <span className="data-source-icon">{dataStatus.hasTracker ? '✅' : '⭕'}</span>
          <div>
            <strong>Fitness Tracker</strong>
            <span>{dataStatus.hasTracker ? 'Activity data available' : 'No activity logged'}</span>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="supp-disclaimer">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>Consult your healthcare provider before starting any supplement. These are AI-generated suggestions, not medical prescriptions.</span>
      </div>

      {/* Error */}
      {error && (
        <div className="supp-error">
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {recommendations ? (
        <div className="supp-results">
          {lastGenerated && (
            <div className="supp-results-meta">
              <span>📅 Generated: {lastGenerated}</span>
              <span>📊 Based on: {dataStatus.medicalReports} medical report(s) + fitness data</span>
            </div>
          )}
          <div className="supp-results-content">
            <ReactMarkdown>{recommendations}</ReactMarkdown>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="supp-empty">
          <div className="supp-empty-icon">💊</div>
          <h2>Get Personalized Supplement Recommendations</h2>
          <p>ZENITH analyzes your medical reports and fitness activity to suggest the right supplements for your body.</p>
          <div className="supp-how-it-works">
            <div className="supp-step">
              <div className="supp-step-num">1</div>
              <div>
                <strong>Upload Medical Reports</strong>
                <span>Blood work, lab results, health checkups</span>
              </div>
            </div>
            <div className="supp-step-arrow">→</div>
            <div className="supp-step">
              <div className="supp-step-num">2</div>
              <div>
                <strong>Track Your Fitness</strong>
                <span>Log meals, workouts, and daily steps</span>
              </div>
            </div>
            <div className="supp-step-arrow">→</div>
            <div className="supp-step">
              <div className="supp-step-num">3</div>
              <div>
                <strong>Get AI Suggestions</strong>
                <span>Personalized supplement plan with dosages</span>
              </div>
            </div>
          </div>
          <button
            className="btn-primary generate-supp-btn"
            onClick={generateRecommendations}
            disabled={isGenerating}
            style={{ marginTop: '1.5rem' }}
          >
            {isGenerating ? 'Analyzing...' : '✨ Generate My Plan'}
          </button>
        </div>
      )}
    </div>
  );
}
