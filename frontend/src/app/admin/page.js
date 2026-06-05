"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  Activity,
  Database,
  RefreshCw,
  Power,
  PowerOff,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  IndianRupee,
  Clock,
  Sparkles,
  Zap,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  Loader2,
  Trash2,
  HelpCircle,
  Cpu
} from "lucide-react";

export default function AdminDashboard() {
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  const [activeTab, setActiveTab] = useState("overview"); // overview, sessions, transactions, config
  
  // Data states
  const [transactions, setTransactions] = useState([]);
  const [activeSessions, setActiveSessions] = useState({
    payment_mode: "dummy",
    active_simulation_session: null,
    active_payments: {}
  });
  const [config, setConfig] = useState({ payment_mode: "dummy" });
  
  // Form states (Remote Start)
  const [chargerId, setChargerId] = useState("");
  const [connectorId, setConnectorId] = useState(1);
  const [prepaidAmount, setPrepaidAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("");
  
  // Refund modal states
  const [selectedTx, setSelectedTx] = useState(null);
  const [refundAmountInput, setRefundAmountInput] = useState("");
  const [showRefundModal, setShowRefundModal] = useState(false);
  
  // Feedback states
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Auto poll ref
  const pollIntervalRef = useRef(null);

  // Initialize API Base
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        setApiBase("http://localhost:8000");
      } else {
        setApiBase(window.location.origin);
      }
    }
  }, []);

  // Fetch all admin data
  const fetchAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Fetch config
      const configRes = await fetch(`${apiBase}/api/admin/config`);
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }
      
      // 2. Fetch active sessions
      const sessionsRes = await fetch(`${apiBase}/api/admin/active-sessions`);
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setActiveSessions(sessionsData);
      }
      
      // 3. Fetch transactions
      const txRes = await fetch(`${apiBase}/api/admin/transactions`);
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }
    } catch (err) {
      console.error("Failed to fetch admin dashboard data:", err);
      setErrorMsg("Failed to connect to backend server. Make sure it is running.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Run initial fetch and set up auto polling
  useEffect(() => {
    if (apiBase) {
      fetchAllData();
      
      // Auto-poll active sessions and transactions silently every 4 seconds
      pollIntervalRef.current = setInterval(() => {
        fetchAllData(true);
      }, 4000);
    }
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [apiBase]);

  // Handle configuration switch
  const handleToggleMode = async (targetMode) => {
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/admin/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_mode: targetMode })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update configuration.");
      }
      
      const resData = await res.json();
      setConfig({ payment_mode: resData.payment_mode });
      setSuccessMsg(resData.message);
      
      // Re-trigger silent fetch to align states
      await fetchAllData(true);
    } catch (err) {
      setErrorMsg(err.message || "Failed to switch mode.");
    } finally {
      setActionLoading(false);
    }
  };

  // Direct Remote Start Transaction (skip OTP mode)
  const handleRemoteStart = async () => {
    if (!chargerId.trim()) {
      setErrorMsg("Please enter a valid Charger ID.");
      return;
    }
    
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    const finalAmount = customAmount ? parseFloat(customAmount) : prepaidAmount;
    
    try {
      const res = await fetch(`${apiBase}/api/admin/remote-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charger_id: chargerId.trim(),
          connector_id: parseInt(connectorId),
          prepaid_amount: finalAmount
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to start charger.");
      }
      
      const data = await res.json();
      setSuccessMsg(`Remote start initiated on charger ${chargerId} (Connector ${connectorId}) successfully!`);
      setChargerId(""); // reset
      setCustomAmount("");
      
      // Update UI data
      await fetchAllData(silent=true);
    } catch (err) {
      setErrorMsg(err.message || "Failed to trigger remote start.");
    } finally {
      setActionLoading(false);
    }
  };

  // Direct Remote Stop
  const handleRemoteStop = async (targetChargerId) => {
    if (!confirm(`Are you sure you want to stop charging on charger ${targetChargerId}?`)) return;
    
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    try {
      const res = await fetch(`${apiBase}/api/admin/remote-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charger_id: targetChargerId })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to stop charger.");
      }
      
      setSuccessMsg(`Remote stop signal sent to charger ${targetChargerId} successfully.`);
      await fetchAllData(true);
    } catch (err) {
      setErrorMsg(err.message || "Failed to stop charging session.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open refund modal
  const openRefundModal = (tx) => {
    setSelectedTx(tx);
    // Suggest the remaining balance or amount to refund
    const suggestedRefund = (tx.amount || 0) - (tx.actual_cost || 0);
    setRefundAmountInput(suggestedRefund > 0 ? suggestedRefund.toFixed(2) : (tx.amount || 0).toFixed(2));
    setShowRefundModal(true);
  };

  // Handle Manual Refund processing
  const handleProcessRefund = async () => {
    const refundAmt = parseFloat(refundAmountInput);
    if (isNaN(refundAmt) || refundAmt <= 0) {
      alert("Please enter a valid refund amount.");
      return;
    }
    
    setShowRefundModal(false);
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    try {
      const res = await fetch(`${apiBase}/api/admin/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: selectedTx.payment_id || selectedTx.order_id, // fallback to order_id if payment_id missing
          amount: refundAmt
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to process refund.");
      }
      
      const resData = await res.json();
      setSuccessMsg(resData.message || "Refund processed successfully.");
      await fetchAllData(true);
    } catch (err) {
      setErrorMsg(err.message || "Refund failed.");
    } finally {
      setActionLoading(false);
      setSelectedTx(null);
    }
  };

  // Compute metrics for Dashboard overview tab
  const getMetrics = () => {
    let totalRevenue = 0;
    let totalRefunded = 0;
    let successfulCount = 0;
    let totalCount = transactions.length;
    
    transactions.forEach(tx => {
      // captured or captured live count as successful payments
      if (tx.status === "captured" || tx.status === "refunded" || tx.status === "partially_refunded") {
        successfulCount++;
        totalRevenue += (tx.actual_cost || tx.amount || 0);
      }
      if (tx.refund_amount) {
        totalRefunded += tx.refund_amount;
      }
    });

    const activeLiveSessionsCount = Object.keys(activeSessions.active_payments || {}).length;
    const activeSimSessionsCount = activeSessions.active_simulation_session ? 1 : 0;
    const activeTotalSessions = activeLiveSessionsCount + activeSimSessionsCount;

    return {
      totalRevenue: totalRevenue,
      totalRefunded: totalRefunded,
      successRate: totalCount > 0 ? Math.round((successfulCount / totalCount) * 100) : 100,
      activeSessionsCount: activeTotalSessions,
      totalTxCount: totalCount
    };
  };

  const metrics = getMetrics();

  // Filtered transactions for ledger tab
  const filteredTransactions = transactions.filter(tx => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (tx.payment_id && tx.payment_id.toLowerCase().includes(q)) ||
      (tx.order_id && tx.order_id.toLowerCase().includes(q)) ||
      (tx.charger_id && tx.charger_id.toLowerCase().includes(q)) ||
      (tx.customer_mobile && tx.customer_mobile.includes(q)) ||
      (tx.status && tx.status.toLowerCase().includes(q))
    );
  });

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 max-w-6xl mx-auto space-y-8 font-sans pb-24">
      {/* Header and Back Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <Link href="/" className="h-10 w-10 glass border border-white/10 rounded-full flex items-center justify-center text-apple-silver hover:text-white transition active:scale-95">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="text-xs uppercase tracking-widest font-extrabold text-[#e07a2c] bg-[#e07a2c]/10 border border-[#e07a2c]/20 py-1 px-3 rounded-full">ADMINISTRATIVE GATEWAY</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">upiCHARGE Control Console</h1>
          <p className="text-sm text-apple-silver font-light">Monitor system telemetry, enforce remote starts, trigger manual refunds and toggle live networks.</p>
        </div>
        
        {/* Dynamic connection state */}
        <div className="flex items-center space-x-3 bg-white/5 border border-white/10 rounded-2xl py-2 px-4 text-xs self-start md:self-auto">
          <span className={`h-2.5 w-2.5 rounded-full ${loading ? "bg-apple-amber animate-pulse" : "bg-apple-emerald"}`} />
          <span className="font-semibold text-apple-silver">
            {loading ? "Syncing Network..." : "FastAPI Connected: 8000"}
          </span>
          <button onClick={() => fetchAllData()} className="p-1 text-apple-silver hover:text-white transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading && "animate-spin"}`} />
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {successMsg && (
        <div className="glass border-apple-emerald/20 bg-apple-emerald/5 text-apple-emerald p-4 rounded-3xl flex items-start space-x-3 animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm font-semibold leading-relaxed flex-1">{successMsg}</div>
          <button onClick={() => setSuccessMsg("")} className="text-xs hover:underline uppercase font-bold text-apple-silver">Dismiss</button>
        </div>
      )}
      {errorMsg && (
        <div className="glass border-apple-amber/25 bg-apple-amber/5 text-apple-amber p-4 rounded-3xl flex items-start space-x-3 animate-fadeIn">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm font-semibold leading-relaxed flex-1">{errorMsg}</div>
          <button onClick={() => setErrorMsg("")} className="text-xs hover:underline uppercase font-bold text-apple-silver">Dismiss</button>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass rounded-3xl p-5 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-12 w-12 bg-apple-emerald/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between text-apple-silver">
            <span className="text-xs font-semibold tracking-wide">Live Revenue</span>
            <IndianRupee className="h-4 w-4 text-apple-emerald" />
          </div>
          <div className="text-2xl font-extrabold">₹{metrics.totalRevenue.toFixed(2)}</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-12 w-12 bg-apple-accent/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between text-apple-silver">
            <span className="text-xs font-semibold tracking-wide">Refunds Issued</span>
            <RotateCcw className="h-4 w-4 text-apple-amber" />
          </div>
          <div className="text-2xl font-extrabold text-apple-amber">₹{metrics.totalRefunded.toFixed(2)}</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-apple-silver">
            <span className="text-xs font-semibold tracking-wide">Active Sessions</span>
            <Activity className="h-4 w-4 text-apple-accent animate-pulse" />
          </div>
          <div className="text-2xl font-extrabold text-apple-accent">{metrics.activeSessionsCount}</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2">
          <div className="flex items-center justify-between text-apple-silver">
            <span className="text-xs font-semibold tracking-wide">Tx Success Rate</span>
            <TrendingUp className="h-4 w-4 text-[#219653]" />
          </div>
          <div className="text-2xl font-extrabold text-[#219653]">{metrics.successRate}%</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-apple-silver">
            <span className="text-xs font-semibold tracking-wide">Payment Mode</span>
            <Settings className="h-4 w-4 text-white/50" />
          </div>
          <div className="text-xl font-black uppercase flex items-center space-x-2">
            <span className={`h-2 w-2 rounded-full ${config.payment_mode === "live" ? "bg-orange-500 glow-orange" : "bg-apple-emerald"}`} />
            <span className={config.payment_mode === "live" ? "text-orange-400" : "text-apple-emerald"}>
              {config.payment_mode === "live" ? "LIVE GATEWAY" : "SIMULATION"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Selection Layout (Apple Minimalist Pills) */}
      <div className="flex border-b border-white/5 pb-1 gap-2 overflow-x-auto">
        {[
          { id: "overview", label: "Overview Metrics", icon: Activity },
          { id: "sessions", label: "Active Sessions & Stops", icon: Zap },
          { id: "start", label: "Remote Start Terminal", icon: Cpu },
          { id: "transactions", label: "Transaction ledger", icon: Database },
          { id: "config", label: "Payment Mode Setup", icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-3 px-5 rounded-2xl text-xs font-bold tracking-wide border transition shrink-0 ${
                isSelected 
                  ? "bg-[#e07a2c]/15 text-[#e07a2c] border-[#e07a2c]/30 shadow-lg shadow-[#e07a2c]/5" 
                  : "bg-white/5 text-apple-silver border-white/5 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= TAB 1: OVERVIEW METRICS ================= */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Quick Stats Graphs */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="glass rounded-3xl p-6 space-y-4">
              <h3 className="font-extrabold text-lg tracking-tight">Active Networks Status</h3>
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-apple-silver">Core Payment Network:</span>
                  <span className={`font-bold uppercase ${config.payment_mode === "live" ? "text-orange-400" : "text-apple-emerald"}`}>
                    {config.payment_mode === "live" ? "Razorpay Gateway (Live)" : "Local Simulator (Dummy)"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-apple-silver">chargeMOD Socket Protocol:</span>
                  <span className="font-bold text-apple-emerald uppercase flex items-center space-x-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>SSL Connected</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-apple-silver">Remote Bypass Tag ID:</span>
                  <span className="font-mono text-apple-silver bg-white/5 py-0.5 px-2 rounded-lg">9999999999</span>
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-6 space-y-4">
              <h3 className="font-extrabold text-lg tracking-tight">Telemetry Records Summary</h3>
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-apple-silver">Logged Transactions:</span>
                  <span className="font-bold text-white">{transactions.length} records</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-apple-silver">Active Simulations:</span>
                  <span className="font-bold text-apple-accent">
                    {activeSessions.active_simulation_session ? "1 running" : "Idle"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-apple-silver">Active Live Payments:</span>
                  <span className="font-bold text-white">
                    {Object.keys(activeSessions.active_payments || {}).length} registered
                  </span>
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-6 space-y-4">
              <h3 className="font-extrabold text-lg tracking-tight">Refund Efficiency</h3>
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-apple-silver">Total Refunds Cleared:</span>
                  <span className="font-bold text-apple-amber">₹{metrics.totalRefunded.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-apple-silver">Average Refund Processing:</span>
                  <span className="font-bold text-apple-emerald">&lt; 3.2 seconds</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-apple-silver">Method:</span>
                  <span className="font-bold text-white">UPI Instant Optimum API</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick System Action */}
          <div className="glass rounded-[32px] p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 bg-[#e07a2c]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">Quick Terminal Start/Stop</h2>
              <p className="text-xs text-apple-silver max-w-xl font-light">
                Directly start or stop any charging station without using a smart phone or credit card. Bypasses client-side wallets and checks and logs admin credentials.
              </p>
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={() => setActiveTab("start")}
                className="bg-white text-black font-semibold py-3 px-6 rounded-2xl text-xs hover:bg-white/95 transition active:scale-95 shadow-lg"
              >
                Launch Start Terminal
              </button>
              <button 
                onClick={() => setActiveTab("sessions")}
                className="bg-white/10 text-white font-semibold py-3 px-6 rounded-2xl text-xs hover:bg-white/15 transition active:scale-95"
              >
                Active Controls
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: ACTIVE SESSIONS & STOPS ================= */}
      {activeTab === "sessions" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-apple-silver">Live Connected Sessions</h3>
            <button 
              onClick={() => fetchAllData(true)} 
              className="text-xs text-apple-accent hover:underline flex items-center space-x-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh active states</span>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Live Active Payments Session Cards */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-apple-silver px-1">Live Razorpay Sessions ({Object.keys(activeSessions.active_payments || {}).length})</h4>
              
              {Object.keys(activeSessions.active_payments || {}).length === 0 ? (
                <div className="glass rounded-3xl p-8 text-center text-xs text-apple-silver">
                  No active live Razorpay sessions detected on the server.
                </div>
              ) : (
                Object.keys(activeSessions.active_payments || {}).map((chargerIdKey) => {
                  const s = activeSessions.active_payments[chargerIdKey];
                  return (
                    <div key={chargerIdKey} className="glass rounded-[32px] p-6 space-y-4 relative overflow-hidden border-orange-500/10">
                      <div className="absolute top-0 right-0 h-16 w-16 bg-orange-500/5 rounded-full blur-xl" />
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-orange-400 font-extrabold uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 py-0.5 px-2 rounded-full">LIVE RAZORPAY</span>
                          <h4 className="font-extrabold text-white text-base tracking-tight mt-1">Charger {chargerIdKey}</h4>
                          <p className="text-[11px] text-apple-silver font-mono">Tx ID: {s.transaction_id || "Awaiting MOD Tx"}</p>
                        </div>
                        <span className="h-2.5 w-2.5 rounded-full bg-apple-emerald animate-pulse" />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-white/5">
                        <div>
                          <span className="text-apple-silver block text-[10px] uppercase">Connector</span>
                          <span className="font-bold text-white">ID {s.connector_id || 1} ({s.connector_type || "Type 2"})</span>
                        </div>
                        <div>
                          <span className="text-apple-silver block text-[10px] uppercase">Prepaid Authorized</span>
                          <span className="font-bold text-apple-emerald">₹{(s.prepaid_amount || 0).toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoteStop(chargerIdKey)}
                        disabled={actionLoading}
                        className="w-full bg-apple-amber hover:bg-apple-amber/90 text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95 flex items-center justify-center space-x-2"
                      >
                        <PowerOff className="h-4 w-4" />
                        <span>Force Remote Stop & Calculate Refund</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Simulated Live Session Card */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-apple-silver px-1">Simulated Sessions (1)</h4>
              
              {!activeSessions.active_simulation_session ? (
                <div className="glass rounded-3xl p-8 text-center text-xs text-apple-silver">
                  No simulated active session running. Start one from the terminal.
                </div>
              ) : (
                <div className="glass rounded-[32px] p-6 space-y-4 relative overflow-hidden border-apple-emerald/10">
                  <div className="absolute top-0 right-0 h-16 w-16 bg-apple-emerald/5 rounded-full blur-xl" />
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] text-apple-emerald font-extrabold uppercase tracking-widest bg-apple-emerald/10 border border-apple-emerald/20 py-0.5 px-2 rounded-full">SIMULATION RUNNING</span>
                      <h4 className="font-extrabold text-white text-base tracking-tight mt-1">Charger {activeSessions.active_simulation_session.charger_id}</h4>
                      <p className="text-[11px] text-apple-silver font-light">Continuous ticking telemetry running...</p>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-apple-emerald animate-pulse-slow glow-emerald" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-white/5">
                    <div>
                      <span className="text-apple-silver block text-[10px] uppercase">Connector</span>
                      <span className="font-bold text-white">ID {activeSessions.active_simulation_session.connector_id}</span>
                    </div>
                    <div>
                      <span className="text-apple-silver block text-[10px] uppercase">Prepaid Prepaid</span>
                      <span className="font-bold text-apple-emerald">₹{(activeSessions.active_simulation_session.prepaid_amount || 100).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-apple-silver block text-[10px] uppercase">Elapsed Telemetry</span>
                      <span className="font-bold text-white">
                        {activeSessions.active_simulation_session.start_time ? (
                          `${Math.floor((new Date() - new Date(activeSessions.active_simulation_session.start_time)) / 1000)} seconds`
                        ) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-apple-silver block text-[10px] uppercase">Customer Bypass</span>
                      <span className="font-bold text-white">9999999999</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoteStop(activeSessions.active_simulation_session.charger_id)}
                    disabled={actionLoading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <PowerOff className="h-4 w-4" />
                    <span>Enforce Simulated Stop</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: REMOTE START TERMINAL ================= */}
      {activeTab === "start" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="glass rounded-[32px] p-6 md:p-8 space-y-6 max-w-xl mx-auto">
            <div className="space-y-1">
              <span className="text-[10px] text-[#e07a2c] font-black uppercase tracking-widest">Admin Control Terminal</span>
              <h2 className="font-extrabold text-2xl tracking-tight">Direct OCPP Remote Start</h2>
              <p className="text-xs text-apple-silver leading-relaxed font-light">
                Manually push RemoteStartTransaction signal down the chargeMOD socket directly. Instantly starts the charger using our administrative master bypass profile.
              </p>
            </div>

            <div className="space-y-4">
              {/* Charger ID */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-apple-silver uppercase">Charger ID (Identity)</label>
                <input
                  type="text"
                  placeholder="e.g. 185599798823820"
                  value={chargerId}
                  onChange={(e) => setChargerId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-white/20 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Connector ID */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-apple-silver uppercase">Connector Gun ID</label>
                  <select
                    value={connectorId}
                    onChange={(e) => setConnectorId(parseInt(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide text-white appearance-none"
                    style={{ backgroundPosition: "right 20px center", backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"white\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')", backgroundRepeat: "no-repeat" }}
                  >
                    <option value={1} className="bg-black text-white">Connector 1</option>
                    <option value={2} className="bg-black text-white">Connector 2</option>
                    <option value={3} className="bg-black text-white">Connector 3</option>
                  </select>
                </div>

                {/* Prepaid pre-auth amount */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-apple-silver uppercase">Simulation Prepaid Limit</label>
                  <select
                    value={prepaidAmount}
                    onChange={(e) => {
                      setPrepaidAmount(parseInt(e.target.value));
                      setCustomAmount("");
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide text-white appearance-none"
                    style={{ backgroundPosition: "right 20px center", backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"white\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')", backgroundRepeat: "no-repeat" }}
                  >
                    <option value={100} className="bg-black text-white">₹100</option>
                    <option value={200} className="bg-black text-white">₹200</option>
                    <option value={500} className="bg-black text-white">₹500</option>
                  </select>
                </div>
              </div>

              {/* Custom amount field */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-apple-silver uppercase">Or Custom Prepaid Amount (Rs.)</label>
                <input
                  type="number"
                  placeholder="Enter custom prepaid limit"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-white/20 text-white"
                />
              </div>
            </div>

            <button
              onClick={handleRemoteStart}
              disabled={actionLoading || !chargerId.trim()}
              className="w-full bg-apple-accent text-white font-extrabold py-4 rounded-2xl shadow-lg shadow-apple-accent/15 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
            >
              {actionLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Power className="h-5 w-5" />
                  <span>Enforce Administrative Start</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================= TAB 4: TRANSACTION LEDGER ================= */}
      {activeTab === "transactions" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header search controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-apple-silver px-1">Transactions ledger</h3>
            
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search by ID, Charger, Mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 px-4 text-xs font-medium placeholder-white/20 text-white"
              />
            </div>
          </div>

          {/* Transactions List */}
          <div className="glass rounded-[32px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/3 font-bold text-apple-silver">
                    <th className="py-4 px-6">Order ID / Tx Ref</th>
                    <th className="py-4 px-6">Charger ID</th>
                    <th className="py-4 px-6">Prepaid</th>
                    <th className="py-4 px-6">Session Cost</th>
                    <th className="py-4 px-6">Payment Status</th>
                    <th className="py-4 px-6">Refund Telemetry</th>
                    <th className="py-4 px-6 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-apple-silver">
                        No transactions found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const refundAvailable = (tx.status === "captured" || tx.status === "partially_refunded" || tx.status === "refunded") && 
                                              (!tx.refund_status || !tx.refund_status.includes("success") && !tx.refund_status.includes("refunded_via_razorpay"));
                      
                      const remainingRefund = (tx.amount || 0) - (tx.actual_cost || 0);

                      return (
                        <tr key={tx.order_id || tx.payment_id} className="border-b border-white/5 hover:bg-white/3 transition">
                          <td className="py-4 px-6 font-mono leading-relaxed">
                            <span className="block font-bold text-white max-w-[150px] truncate">{tx.payment_id || tx.order_id}</span>
                            <span className="text-[10px] text-apple-silver block mt-0.5">Mobile: {tx.customer_mobile || "9999999999"}</span>
                          </td>
                          <td className="py-4 px-6 font-semibold">
                            <span>{tx.charger_id || "Simulated"}</span>
                            <span className="block text-[10px] text-apple-silver mt-0.5 font-light">Conn {tx.connector_id || 1}</span>
                          </td>
                          <td className="py-4 px-6 font-bold text-white">₹{(tx.amount || 0).toFixed(2)}</td>
                          <td className="py-4 px-6 font-bold text-white">
                            {tx.actual_cost !== undefined ? `₹${tx.actual_cost.toFixed(2)}` : "Awaiting stop"}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                              tx.status === "captured" || tx.status === "refunded" ? "bg-apple-emerald/10 text-apple-emerald border border-apple-emerald/20" :
                              tx.status === "created" ? "bg-apple-amber/10 text-apple-amber border border-apple-amber/20" :
                              "bg-red-500/10 text-red-500 border border-red-500/20"
                            }`}>
                              {tx.status || "created"}
                            </span>
                          </td>
                          <td className="py-4 px-6 leading-relaxed">
                            {tx.refund_amount ? (
                              <>
                                <span className="block font-bold text-apple-emerald">₹{tx.refund_amount.toFixed(2)}</span>
                                <span className="text-[10px] text-apple-silver block max-w-[120px] truncate">{tx.refund_status || "Dispatched"}</span>
                              </>
                            ) : (
                              <span className="text-apple-silver font-light">No refund needed</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {refundAvailable && remainingRefund > 0 ? (
                              <button
                                onClick={() => openRefundModal(tx)}
                                className="bg-[#e07a2c]/10 text-[#e07a2c] hover:bg-[#e07a2c] hover:text-white border border-[#e07a2c]/30 py-2 px-4 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition active:scale-95"
                              >
                                Trigger Refund (₹{remainingRefund.toFixed(2)})
                              </button>
                            ) : (
                              <span className="text-white/40 text-[10px] uppercase font-bold">Settled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: PAYMENT MODE SETUP ================= */}
      {activeTab === "config" && (
        <div className="space-y-6 animate-fadeIn max-w-xl mx-auto">
          <div className="glass rounded-[32px] p-8 space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] text-[#e07a2c] font-black uppercase tracking-widest">Global Configurations</span>
              <h2 className="font-extrabold text-2xl tracking-tight">Backend Payment Mode</h2>
              <p className="text-xs text-apple-silver leading-relaxed font-light">
                Toggle the platform gateway between Dummy Simulation mode (instant simulated checkouts for debugging) and Live Gateway mode (Razorpay UPI routing).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => handleToggleMode("dummy")}
                disabled={actionLoading}
                className={`p-6 rounded-[28px] border transition flex flex-col justify-between items-start text-left relative ${
                  config.payment_mode === "dummy"
                    ? "border-apple-emerald bg-apple-emerald/5 shadow-lg shadow-apple-emerald/5"
                    : "border-white/5 hover:border-white/10 bg-white/2"
                }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-4 ${config.payment_mode === "dummy" ? "bg-apple-emerald text-black" : "bg-white/5"}`}>
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Dummy Simulator</h4>
                  <p className="text-[10px] text-apple-silver mt-1">Simulate UPI pre-auth payments instantly. Great for hardware-free checkout testing.</p>
                </div>
                {config.payment_mode === "dummy" && (
                  <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-apple-emerald" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleToggleMode("live")}
                disabled={actionLoading}
                className={`p-6 rounded-[28px] border transition flex flex-col justify-between items-start text-left relative ${
                  config.payment_mode === "live"
                    ? "border-orange-500 bg-orange-500/5 shadow-lg shadow-orange-500/5"
                    : "border-white/5 hover:border-white/10 bg-white/2"
                }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-4 ${config.payment_mode === "live" ? "bg-orange-500 text-white" : "bg-white/5"}`}>
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Live Razorpay Gateway</h4>
                  <p className="text-[10px] text-apple-silver mt-1">Route actual money via UPI intent. Connects to production server environments.</p>
                </div>
                {config.payment_mode === "live" && (
                  <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-orange-500 glow-orange" />
                )}
              </button>
            </div>
            
            <div className="flex items-center space-x-2 border-t border-white/5 pt-4 text-xs text-apple-silver leading-relaxed">
              <ShieldCheck className="h-4 w-4 text-apple-emerald" />
              <span>Saves securely to .env file on FastAPI. Auto-reloads in-memory variables.</span>
            </div>
          </div>
        </div>
      )}

      {/* Manual Refund modal popup */}
      {showRefundModal && selectedTx && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass rounded-[36px] border border-white/10 p-6 md:p-8 max-w-sm w-full space-y-6 animate-scaleIn shadow-2xl">
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#e07a2c]">ADMINISTRATIVE ACTION</span>
              <h3 className="text-xl font-extrabold tracking-tight">Manual UPI Refund</h3>
              <p className="text-xs text-apple-silver leading-relaxed font-light">
                Initiate an instant manual UPI refund back to the customer. This action calls Razorpay instantly or marks simulated settle records.
              </p>
            </div>

            <div className="space-y-4 text-xs pt-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-apple-silver">Transaction ID:</span>
                <span className="font-mono font-bold text-white max-w-[150px] truncate">{selectedTx.payment_id || selectedTx.order_id}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-apple-silver">Prepaid Pre-authorized:</span>
                <span className="font-bold text-white">₹{(selectedTx.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-apple-silver">Actual Session Cost:</span>
                <span className="font-bold text-white">₹{(selectedTx.actual_cost || 0).toFixed(2)}</span>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold text-apple-silver uppercase">Refund Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50.00"
                  value={refundAmountInput}
                  onChange={(e) => setRefundAmountInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-sm font-semibold tracking-wide placeholder-white/20 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowRefundModal(false)}
                className="bg-white/5 hover:bg-white/10 text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                className="bg-[#e07a2c] hover:bg-[#e07a2c]/90 text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95"
              >
                Enforce Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
