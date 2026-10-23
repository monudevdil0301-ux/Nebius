import React, { useState, useEffect } from 'react';
import { 
  Zap, Search, CheckCircle2, AlertCircle, RefreshCw, Cpu, 
  ExternalLink, Code2, Play, Copy, Check, Key, X, ChevronDown, ChevronUp, GitPullRequest, ShieldCheck
} from 'lucide-react';

const API_BASE = "";

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState("pydantic-v2-billing-outage");
  const [scenarioData, setScenarioData] = useState(null);
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [activeTab, setActiveTab] = useState("diff"); // 'diff' | 'diagnosis' | 'verification'
  
  // API Keys Modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tavilyKeyInput, setTavilyKeyInput] = useState("");
  const [nebiusKeyInput, setNebiusKeyInput] = useState("");
  const [keySaveMsg, setKeySaveMsg] = useState("");
  const [apiStatus, setApiStatus] = useState({ nebius_configured: false, tavily_configured: false });

  // Custom Incident Mode
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState("Production Memory Leak & Unclosed Socket");
  const [customStack, setCustomStack] = useState("RuntimeError: Unclosed client session in async worker loop\n  File 'worker.py', line 38, in dispatch\n    client = ClientSession()");
  const [customCode, setCustomCode] = useState("class Worker:\n    def dispatch(self):\n        client = ClientSession()\n        return client.get('https://api.internal/health')");

  // Workflow Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0); // 0 = idle, 1..6 = step in progress
  const [activeDiagnosis, setActiveDiagnosis] = useState(null);
  const [activeIntel, setActiveIntel] = useState([]);
  const [activePatch, setActivePatch] = useState(null);
  const [activeValidation, setActiveValidation] = useState(null);
  const [activeTestResults, setActiveTestResults] = useState(null);
  const [copied, setCopied] = useState(false);

  // Stepper labels
  const steps = [
    { num: 1, name: "Ingestion", model: "Telemetry" },
    { num: 2, name: "Diagnosis", model: "Nemotron Ultra" },
    { num: 3, name: "Grounding", model: "Tavily API" },
    { num: 4, name: "Patch", model: "Nemotron Ultra" },
    { num: 5, name: "Validation", model: "Nemotron Nano" },
    { num: 6, name: "Sandbox", model: "Nebius Serverless" },
  ];

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setApiStatus({
            nebius_configured: data.models.nebius_configured,
            tavily_configured: data.models.tavily_configured
          });
        }
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/scenarios`)
      .then(res => res.json())
      .then(data => {
        setScenarios(data);
        if (data.length > 0) {
          loadScenario(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const loadScenario = (id) => {
    setSelectedScenario(id);
    setIsCustomMode(false);
    resetState();
    fetch(`${API_BASE}/api/scenarios/${id}`)
      .then(res => res.json())
      .then(data => setScenarioData(data))
      .catch(err => console.error(err));
  };

  const resetState = () => {
    setActiveStep(0);
    setActiveDiagnosis(null);
    setActiveIntel([]);
    setActivePatch(null);
    setActiveValidation(null);
    setActiveTestResults(null);
  };

  const saveKeys = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nebius_api_key: nebiusKeyInput,
          tavily_api_key: tavilyKeyInput
        })
      });
      const data = await res.json();
      setApiStatus(data);
      setKeySaveMsg("Saved successfully!");
      setTimeout(() => {
        setKeySaveMsg("");
        setShowKeyModal(false);
      }, 1000);
    } catch {
      setKeySaveMsg("Error saving keys");
    }
  };

  const runRemediation = () => {
    setIsRunning(true);
    resetState();
    setActiveStep(1);

    if (isCustomMode) {
      fetch(`${API_BASE}/api/remediate/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: customTitle,
          stack_trace: customStack,
          original_code: customCode
        })
      }).then(res => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              setIsRunning(false);
              return;
            }
            handleChunk(decoder.decode(value));
            read();
          });
        }
        read();
      });
      return;
    }

    const eventSource = new EventSource(`${API_BASE}/api/remediate/${selectedScenario}`);

    eventSource.addEventListener("STEP_UPDATE", (e) => {
      const payload = JSON.parse(e.data);
      setActiveStep(payload.step);

      if (payload.step === 2 && payload.status === "completed") setActiveDiagnosis(payload.data);
      if (payload.step === 3 && payload.status === "completed") setActiveIntel(payload.data);
      if (payload.step === 4 && payload.status === "completed") setActivePatch(payload.data);
      if (payload.step === 5 && payload.status === "completed") setActiveValidation(payload.data);
      if (payload.step === 6 && payload.status === "completed") setActiveTestResults(payload.data);
    });

    eventSource.addEventListener("WORKFLOW_COMPLETED", () => {
      setIsRunning(false);
      setActiveStep(6);
      eventSource.close();
    });

    eventSource.onerror = () => {
      setIsRunning(false);
      eventSource.close();
    };
  };

  const handleChunk = (chunk) => {
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const payload = JSON.parse(line.replace("data: ", ""));
          if (payload.step) setActiveStep(payload.step);
          if (payload.step === 2 && payload.status === "completed") setActiveDiagnosis(payload.data);
          if (payload.step === 3 && payload.status === "completed") setActiveIntel(payload.data);
          if (payload.step === 4 && payload.status === "completed") setActivePatch(payload.data);
          if (payload.step === 5 && payload.status === "completed") setActiveValidation(payload.data);
          if (payload.step === 6 && payload.status === "completed") setActiveTestResults(payload.data);
        } catch {}
      }
    }
  };

  const copyDiff = () => {
    if (activePatch?.unified_diff) {
      navigator.clipboard.writeText(activePatch.unified_diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 20px' }}>
      
      {/* 1. Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#76b900' }}></div>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
              Nebula<span style={{ color: '#76b900' }}>Ops</span>
            </h1>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
              Autonomous Code Remediation
            </span>
          </div>
        </div>

        {/* Status Indicators & Key Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ 
            fontSize: 12, 
            padding: '4px 10px', 
            borderRadius: 6, 
            background: apiStatus.tavily_configured ? 'var(--blue-dim)' : 'rgba(255,255,255,0.04)',
            color: apiStatus.tavily_configured ? 'var(--blue)' : 'var(--text-dim)',
            border: '1px solid var(--border)'
          }}>
            {apiStatus.tavily_configured ? "Tavily: Live" : "Tavily: Simulated"}
          </div>

          <div style={{ 
            fontSize: 12, 
            padding: '4px 10px', 
            borderRadius: 6, 
            background: apiStatus.nebius_configured ? 'var(--brand-dim)' : 'rgba(255,255,255,0.04)',
            color: apiStatus.nebius_configured ? 'var(--brand)' : 'var(--text-dim)',
            border: '1px solid var(--border)'
          }}>
            {apiStatus.nebius_configured ? "Nebius: Connected" : "Nebius: Active"}
          </div>

          <button onClick={() => setShowKeyModal(true)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}>
            <Key size={13} />
            <span>API Keys</span>
          </button>
        </div>
      </header>

      {/* 2. Incident Selection Pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {scenarios.map(s => {
          const isSelected = !isCustomMode && selectedScenario === s.id;
          return (
            <button
              key={s.id}
              onClick={() => loadScenario(s.id)}
              style={{
                background: isSelected ? 'var(--surface-active)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--text-muted)',
                border: isSelected ? '1px solid var(--border-light)' : '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {s.title.replace(/🚨|⚡|🧠/g, '').trim()}
            </button>
          );
        })}
        <button
          onClick={() => { setIsCustomMode(true); resetState(); }}
          style={{
            background: isCustomMode ? 'var(--surface-active)' : 'transparent',
            color: isCustomMode ? '#fff' : 'var(--text-muted)',
            border: isCustomMode ? '1px solid var(--border-light)' : '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          + Custom Crash
        </button>
      </div>

      {/* 3. Incident Summary Box */}
      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ 
                fontSize: 11, 
                fontWeight: 600, 
                padding: '2px 8px', 
                borderRadius: 4, 
                background: 'var(--red-dim)', 
                color: 'var(--red)' 
              }}>
                {scenarioData?.severity || "CRITICAL"}
              </span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {scenarioData?.service}
              </span>
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              {isCustomMode ? customTitle : scenarioData?.title.replace(/🚨|⚡|🧠/g, '').trim()}
            </h2>

            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {isCustomMode ? "Provide a stack trace and source code to run autonomous diagnosis and patching." : scenarioData?.description}
            </p>
          </div>

          <button 
            className="btn-primary" 
            onClick={runRemediation}
            disabled={isRunning}
            style={{ minWidth: 160, justifyContent: 'center' }}
          >
            {isRunning ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Fixing...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Fix Incident</span>
              </>
            )}
          </button>
        </div>

        {/* Collapsible Stack Trace */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button 
            onClick={() => setShowStackTrace(!showStackTrace)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-dim)', 
              fontSize: 12, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4,
              padding: 0
            }}
          >
            <span>{showStackTrace ? "Hide Error Trace" : "View Error Trace"}</span>
            {showStackTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showStackTrace && (
            <pre className="mono" style={{ 
              marginTop: 10,
              background: '#040711', 
              color: 'var(--red)', 
              padding: 12, 
              borderRadius: 6, 
              fontSize: 12, 
              overflowX: 'auto',
              maxHeight: 180,
              border: '1px solid rgba(248, 113, 113, 0.2)'
            }}>
              {isCustomMode ? customStack : scenarioData?.stack_trace}
            </pre>
          )}
        </div>
      </section>

      {/* 4. Execution Pipeline Progress */}
      <section className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {steps.map((s, idx) => {
            const isDone = activeStep > s.num || (!isRunning && activeStep === 6);
            const isCurrent = isRunning && activeStep === s.num;
            return (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: (isDone || isCurrent) ? 1 : 0.4 }}>
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: isDone ? 'var(--green)' : isCurrent ? 'var(--brand)' : 'var(--border)',
                  color: isDone || isCurrent ? '#000' : 'var(--text-dim)',
                  fontSize: 10,
                  fontWeight: 700
                }}>
                  {isDone ? <Check size={12} strokeWidth={3} /> : isCurrent ? <RefreshCw size={10} className="animate-spin" /> : s.num}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.model}</div>
                </div>
                {idx < steps.length - 1 && (
                  <div style={{ width: 16, height: 1, background: 'var(--border)', marginLeft: 8 }}></div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Results Area */}
      {(activePatch || activeDiagnosis || isRunning) && (
        <section className="card" style={{ overflow: 'hidden' }}>
          {/* Result Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
            <button
              onClick={() => setActiveTab("diff")}
              style={{
                background: activeTab === "diff" ? 'var(--surface)' : 'transparent',
                color: activeTab === "diff" ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === "diff" ? '2px solid var(--brand)' : '2px solid transparent',
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Code2 size={15} />
              <span>Surgical Diff</span>
            </button>

            <button
              onClick={() => setActiveTab("diagnosis")}
              style={{
                background: activeTab === "diagnosis" ? 'var(--surface)' : 'transparent',
                color: activeTab === "diagnosis" ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === "diagnosis" ? '2px solid var(--brand)' : '2px solid transparent',
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Search size={15} />
              <span>Root Cause & Grounding</span>
            </button>

            <button
              onClick={() => setActiveTab("verification")}
              style={{
                background: activeTab === "verification" ? 'var(--surface)' : 'transparent',
                color: activeTab === "verification" ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === "verification" ? '2px solid var(--brand)' : '2px solid transparent',
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <CheckCircle2 size={15} />
              <span>Verification & PR</span>
            </button>
          </div>

          <div style={{ padding: 20 }}>
            {/* Tab 1: Diff View */}
            {activeTab === "diff" && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {scenarioData?.failing_file}
                  </span>
                  {activePatch?.unified_diff && (
                    <button onClick={copyDiff} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
                      {copied ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
                      <span>{copied ? "Copied" : "Copy Diff"}</span>
                    </button>
                  )}
                </div>

                {activePatch?.unified_diff ? (
                  <pre className="mono" style={{
                    background: '#040711',
                    padding: 16,
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.6,
                    overflowX: 'auto',
                    border: '1px solid var(--border)'
                  }}>
                    {activePatch.unified_diff.split('\n').map((line, i) => {
                      let color = '#94a3b8';
                      let bg = 'transparent';
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        color = 'var(--green)';
                        bg = 'var(--green-dim)';
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        color = 'var(--red)';
                        bg = 'var(--red-dim)';
                      } else if (line.startsWith('@@')) {
                        color = 'var(--blue)';
                      }
                      return (
                        <div key={i} style={{ color, background: bg, padding: '0 4px' }}>
                          {line || ' '}
                        </div>
                      );
                    })}
                  </pre>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                    {isRunning ? "Synthesizing patch with NVIDIA Nemotron 3 Ultra..." : "No patch generated yet."}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Diagnosis & Web Grounding */}
            {activeTab === "diagnosis" && (
              <div>
                {activeDiagnosis ? (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                        Root Cause
                      </div>
                      <p style={{ fontSize: 14, color: '#fff', lineHeight: 1.5 }}>
                        {activeDiagnosis.root_cause}
                      </p>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                        Strategy
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {activeDiagnosis.recommended_strategy}
                      </p>
                    </div>

                    {/* Web Citations */}
                    {activeIntel.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Search size={14} />
                          <span>Tavily Upstream Grounding</span>
                        </div>
                        {activeIntel.map((intel, idx) => (
                          <div key={idx} style={{ marginBottom: 12 }}>
                            {intel.direct_answer && (
                              <div style={{ background: 'var(--blue-dim)', padding: 10, borderRadius: 6, fontSize: 12, color: '#e0f2fe', marginBottom: 8 }}>
                                {intel.direct_answer}
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {intel.sources?.map((s, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    color: 'var(--blue)',
                                    textDecoration: 'none',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid var(--border)'
                                  }}
                                >
                                  <span>{s.title}</span>
                                  <ExternalLink size={12} />
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                    {isRunning ? "Diagnosing with Nemotron Ultra..." : "No diagnosis available."}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Test Verification & PR */}
            {activeTab === "verification" && (
              <div>
                {activeTestResults ? (
                  <div>
                    {/* Test Output */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
                          <CheckCircle2 size={16} />
                          <span>{activeTestResults.tests_passed}/{activeTestResults.tests_run} Tests Passed</span>
                        </div>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          {activeTestResults.execution_time_seconds}s
                        </span>
                      </div>
                      <pre className="mono" style={{
                        background: '#040711',
                        color: 'var(--green)',
                        padding: 12,
                        borderRadius: 6,
                        fontSize: 11,
                        overflowX: 'auto',
                        border: '1px solid var(--border)'
                      }}>
                        {activeTestResults.output_log}
                      </pre>
                    </div>

                    {/* Pull Request Card */}
                    {activePatch && (
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                          <GitPullRequest size={15} color="var(--brand)" />
                          <span>{activePatch.commit_message}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                          {activePatch.pr_summary}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                    {isRunning ? "Executing tests in Nebius sandbox..." : "Awaiting test execution."}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 6. API Key Modal */}
      {showKeyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24, background: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Configure API Keys</div>
              <button onClick={() => setShowKeyModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>
                Tavily API Key
              </label>
              <input
                type="password"
                placeholder="tvly-xxxxxxxxxxxxxxx"
                value={tavilyKeyInput}
                onChange={(e) => setTavilyKeyInput(e.target.value)}
                className="mono"
                style={{
                  width: '100%',
                  background: '#040711',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: 12
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginTop: 4 }}>
                Enables live web search for upstream package breaking changes.
              </span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>
                Nebius Token Factory API Key
              </label>
              <input
                type="password"
                placeholder="Optional (runs simulation if empty)"
                value={nebiusKeyInput}
                onChange={(e) => setNebiusKeyInput(e.target.value)}
                className="mono"
                style={{
                  width: '100%',
                  background: '#040711',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: 12
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginTop: 4 }}>
                Leave empty for built-in high-fidelity simulation mode.
              </span>
            </div>

            {keySaveMsg && (
              <div style={{ padding: '6px 10px', borderRadius: 4, background: 'var(--green-dim)', color: 'var(--green)', fontSize: 12, marginBottom: 12 }}>
                {keySaveMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowKeyModal(false)} className="btn-secondary" style={{ padding: '6px 12px' }}>
                Cancel
              </button>
              <button onClick={saveKeys} className="btn-primary" style={{ padding: '6px 14px' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Minimal Footer */}
      <footer style={{ marginTop: 40, textAlign: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
        Nebius x NVIDIA Global AI Hackathon • Built with NVIDIA Nemotron 3 & Tavily
      </footer>

    </div>
  );
}
