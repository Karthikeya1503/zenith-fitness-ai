import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './Tracker.css';

export default function Tracker({ apiKey, medicalContext }) {
  const [steps, setSteps] = useState(() => {
    const saved = localStorage.getItem('fitcoach_steps');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('fitcoach_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const [foodInput, setFoodInput] = useState({ name: '', amount: '' });
  const [workoutInput, setWorkoutInput] = useState({ name: '', duration: '' });
  const [stepInput, setStepInput] = useState('');
  
  const [isAnalyzingFood, setIsAnalyzingFood] = useState(false);
  const [isAnalyzingWorkout, setIsAnalyzingWorkout] = useState(false);

  const [calorieGoal, setCalorieGoal] = useState(() => {
    const saved = localStorage.getItem('fitcoach_cal_goal');
    return saved ? parseInt(saved, 10) : 2000;
  });
  const [stepGoal, setStepGoal] = useState(() => {
    const saved = localStorage.getItem('fitcoach_step_goal');
    return saved ? parseInt(saved, 10) : 10000;
  });
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);


  // Persist state
  useEffect(() => {
    localStorage.setItem('fitcoach_steps', steps);
    localStorage.setItem('fitcoach_logs', JSON.stringify(logs));
    localStorage.setItem('fitcoach_cal_goal', calorieGoal);
    localStorage.setItem('fitcoach_step_goal', stepGoal);
  }, [steps, logs, calorieGoal, stepGoal]);

  const totalCalsIn = logs.filter(l => l.type === 'food').reduce((sum, l) => sum + parseInt(l.cals || 0), 0);
  const totalCalsOut = logs.filter(l => l.type === 'workout').reduce((sum, l) => sum + parseInt(l.cals || 0), 0);
  


  const estimateWithAI = async (promptText) => {
    if (!apiKey) {
      alert("Missing API Key!");
      return null;
    }
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: "You are an automated nutrition and fitness estimator. You ALWAYS reply with ONLY valid raw JSON without block ticks or markdown. Return exactly the requested schema." }] },
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.1 }
        })
      });
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No response");
      return JSON.parse(rawText.replace(/\s*```json\s*/g, '').replace(/\s*```\s*/g, '').trim());
    } catch (e) {
      console.error("AI Estimation Failed", e);
      return null;
    }
  };

  const generatePlan = async () => {
    if (!apiKey) return alert("Missing API Key!");
    setIsGeneratingPlan(true);
    setGeneratedPlan(null);
    try {
      const medicalNote = medicalContext 
        ? `\n\nIMPORTANT: The user has uploaded medical reports. Here is the relevant medical context that MUST inform your plan — adjust exercises, diet, and intensity according to their health conditions and lab results:\n${medicalContext}\n`
        : '';
      const prompt = `My daily calorie goal is ${calorieGoal} kcal and my daily step goal is ${stepGoal} steps.${medicalNote}\nPlease provide a brief, structured 1-day diet plan (with estimated calories per meal) and a workout/activity plan that aligns perfectly with reaching these targets.${medicalContext ? ' Make sure to highlight any adjustments you made specifically because of the medical findings.' : ''} Format your response cleanly using Markdown.`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 }
        })
      });
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No response");
      setGeneratedPlan(rawText);
    } catch (e) {
      console.error(e);
      setGeneratedPlan("Failed to generate plan. Please try again.");
    }
    setIsGeneratingPlan(false);
  };



  const handleAddFood = async (e) => {
    e.preventDefault();
    if (!foodInput.name) return;
    setIsAnalyzingFood(true);

    const prompt = `
      Estimate the calories and macronutrients for the following food item: "${foodInput.name}" ${foodInput.amount ? `(Amount: ${foodInput.amount})` : '(Average serving size)'}.
      Respond ONLY with a JSON object in this exact schema: { "calories": number, "macros": "string like '20g P, 40g C, 10g F'", "amount_assumed": "string describing the portion size" }
    `;

    const estimation = await estimateWithAI(prompt);
    
    if (estimation) {
      const newLog = {
        id: Date.now(),
        type: 'food',
        name: foodInput.name,
        cals: Math.round(estimation.calories),
        details: `${estimation.macros} (${estimation.amount_assumed})`,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      };
      setLogs(prev => [newLog, ...prev]);
      setFoodInput({ name: '', amount: '' });
    } else {
      alert("Failed to estimate nutrition for this food. Try being more specific.");
    }
    
    setIsAnalyzingFood(false);
  };

  const handleAddWorkout = async (e) => {
    e.preventDefault();
    if (!workoutInput.name || !workoutInput.duration) return;
    setIsAnalyzingWorkout(true);

    const prompt = `
      Estimate the calories specifically burned for completing this exercise: "${workoutInput.name}" for a duration of "${workoutInput.duration} minutes". Assume an average adult weighing 75kg / 165lbs.
      Respond ONLY with a JSON object in this exact schema: { "calories": number, "intensity": "Low, Medium, or High" }
    `;

    const estimation = await estimateWithAI(prompt);

    if (estimation) {
      const newLog = {
        id: Date.now(),
        type: 'workout',
        name: workoutInput.name,
        cals: Math.round(estimation.calories),
        details: `${workoutInput.duration} mins (${estimation.intensity} Intensity)`,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      };
      setLogs(prev => [newLog, ...prev]);

      setWorkoutInput({ name: '', duration: '' });
    } else {
      alert("Failed to estimate calories burned for this workout.");
    }
    
    setIsAnalyzingWorkout(false);
  };

  const handleAddSteps = (e) => {
    e.preventDefault();
    if (!stepInput) return;
    setSteps(prev => prev + parseInt(stepInput, 10));
    setStepInput('');
  };

  const clearData = () => {
    if(window.confirm("Are you sure you want to clear today's tracker data?")) {
      setSteps(0);
      setLogs([]);
      setGeneratedPlan(null);
      localStorage.setItem('fitcoach_steps', '0');
      localStorage.setItem('fitcoach_logs', '[]');
    }
  };

  return (
    <div className="tracker-container">
      <div className="tracker-header">
        <h1>Daily Dashboard</h1>
        <div style={{display: 'flex', gap: '1rem'}}>
          <button className="btn-primary" onClick={generatePlan} disabled={isGeneratingPlan} style={{ background: 'transparent', border: '1px solid rgba(79, 172, 254, 0.4)'}}>
            {isGeneratingPlan ? "Thinking..." : medicalContext ? "✨ Suggest Plan (Medical-Aware)" : "✨ Suggest Plan"}
          </button>
          <button className="btn-primary" onClick={() => setIsEditingGoals(!isEditingGoals)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)'}}>
            {isEditingGoals ? "Save Goals" : "Edit Goals"}
          </button>
          <button className="btn-primary" onClick={clearData} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)'}}>
            Clear Day
          </button>
        </div>
      </div>

      {isEditingGoals && (
        <div className="tracker-panel" style={{flexDirection: 'row', gap: '2rem'}}>
          <div className="form-group" style={{flex: 1}}>
            <label style={{color: 'var(--text-secondary)'}}>Daily Calorie Goal (Net Kcal)</label>
            <input type="number" className="tracker-input" value={calorieGoal} onChange={e => setCalorieGoal(e.target.value)} />
          </div>
          <div className="form-group" style={{flex: 1}}>
            <label style={{color: 'var(--text-secondary)'}}>Daily Step Goal</label>
            <input type="number" className="tracker-input" value={stepGoal} onChange={e => setStepGoal(e.target.value)} />
          </div>
        </div>
      )}

      {generatedPlan && (
        <div className="tracker-panel ai-plan-panel" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setGeneratedPlan(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}>✕</button>
          </div>
          <h2 style={{ color: 'var(--accent-cyan)', borderBottom: 'none', paddingBottom: 0 }}>✨ Your Custom AI Plan</h2>
          <div className="message ai tracker-markdown-content" style={{ background: 'transparent', padding: '0.5rem 0 0 0', border: 'none', maxWidth: '100%' }}>
            <ReactMarkdown>{generatedPlan}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-title">Goal Progress (Cal)</div>
          <div className="stat-value">{totalCalsIn - totalCalsOut}<span>/ {calorieGoal} kcal</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Calories Eaten</div>
          <div className="stat-value" style={{color: '#f43f5e'}}>{totalCalsIn}<span>kcal</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Calories Burned</div>
          <div className="stat-value" style={{color: '#10b981'}}>{totalCalsOut}<span>kcal</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Step Count</div>
          <div className="stat-value">{steps.toLocaleString()}<span>/ {parseInt(stepGoal).toLocaleString()} steps</span></div>
        </div>
      </div>

      {/* Forms and Feed */}
      <div className="tracker-content">
        
        {/* Left Column: Logging Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div className="tracker-panel">
            <h2>Log Diet (AI Estimated)</h2>
            <form className="tracker-form" onSubmit={handleAddFood}>
              <div className="form-group">
                <input required type="text" className="tracker-input" placeholder="Food Name (e.g. Oatmeal with fruit)" value={foodInput.name} onChange={e => setFoodInput({...foodInput, name: e.target.value})} disabled={isAnalyzingFood}/>
              </div>
              <div className="form-group">
                <input type="text" className="tracker-input" placeholder="Amount (e.g. 1 bowl, 200g, optional)" value={foodInput.amount} onChange={e => setFoodInput({...foodInput, amount: e.target.value})} disabled={isAnalyzingFood}/>
              </div>
              <button type="submit" className="btn-primary" disabled={isAnalyzingFood} style={{ width: '100%', textAlign: 'center' }}>
                {isAnalyzingFood ? "Estimating Nutrition..." : "+ Add & Estimate"}
              </button>
            </form>
          </div>

          <div className="tracker-panel">
            <h2>Log Workout (AI Estimated)</h2>
            <form className="tracker-form" onSubmit={handleAddWorkout}>
              <div className="form-group">
                <input required type="text" className="tracker-input" placeholder="Activity (e.g. Running, Weightlifting)" value={workoutInput.name} onChange={e => setWorkoutInput({...workoutInput, name: e.target.value})} disabled={isAnalyzingWorkout}/>
              </div>
              <div className="form-group">
                <input required type="number" className="tracker-input" placeholder="Duration in minutes (e.g. 45)" value={workoutInput.duration} onChange={e => setWorkoutInput({...workoutInput, duration: e.target.value})} disabled={isAnalyzingWorkout}/>
              </div>
              <button type="submit" className="btn-primary" disabled={isAnalyzingWorkout} style={{ width: '100%', textAlign: 'center' }}>
                {isAnalyzingWorkout ? "Estimating Calories..." : "+ Add & Estimate"}
              </button>
            </form>
          </div>

          <div className="tracker-panel" style={{ padding: '1rem 1.5rem'}}>
            <form className="tracker-form" style={{ flexDirection: 'row', alignItems: 'center' }} onSubmit={handleAddSteps}>
              <input required type="number" className="tracker-input" style={{ flex: 1 }} placeholder="Quick add steps (e.g. 2500)" value={stepInput} onChange={e => setStepInput(e.target.value)} />
              <button type="submit" className="btn-primary" style={{ margin: 0 }}>Add</button>
            </form>
          </div>

        </div>

        {/* Right Column: Activity Feed */}
        <div className="tracker-panel" style={{ gridRow: 'span 3' }}>
          <h2>Today's Activity</h2>
          <div className="feed-list">
            {logs.length === 0 ? (
              <div className="empty-state" style={{marginTop: '2rem'}}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.3, marginBottom: '1rem'}}><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <div>No activities logged yet.</div>
                <div style={{fontSize: '0.8rem', marginTop: '0.5rem'}}>Enter food or exertion and let ZENITH estimate the numbers!</div>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className={`feed-item ${log.type}`}>
                  <div className="feed-item-info">
                    <strong>{log.name}</strong>
                    <span>{log.time} • {log.details}</span>
                  </div>
                  <div className={`feed-item-value ${log.type === 'food' ? 'positive' : 'negative'}`}>
                    {log.type === 'food' ? '+' : '-'}{log.cals}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
