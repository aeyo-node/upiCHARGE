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
  Cpu,
  MessageSquare
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

  // Support chat states
  const [supportChats, setSupportChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [selectedChatMessages, setSelectedChatMessages] = useState([]);
  const [chatReplyText, setChatReplyText] = useState("");
  const [isReplySending, setIsReplySending] = useState(false);
  const adminChatEndRef = useRef(null);

  // Auto poll ref
  const pollIntervalRef = useRef(null);

  // Poll support chats list from backend when active tab is "chats"
  useEffect(() => {
    if (activeTab !== "chats" || !apiBase) return;

    const fetchSupportChats = async () => {
      try {
        const res = await fetch(`${apiBase}/api/admin/support/chats`);
        if (res.ok) {
          const data = await res.json();
          setSupportChats(data);
        }
      } catch (err) {
        console.error("Error fetching support chats:", err);
      }
    };

    fetchSupportChats();
    const interval = setInterval(fetchSupportChats, 4000);
    return () => clearInterval(interval);
  }, [activeTab, apiBase]);

  // Poll historical messages for selected chat
  useEffect(() => {
    if (activeTab !== "chats" || !selectedChatId || !apiBase) {
      setSelectedChatMessages([]);
      return;
    }

    const fetchSelectedChatMessages = async () => {
      try {
        const res = await fetch(`${apiBase}/api/support/history/${selectedChatId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedChatMessages(data);
        }
      } catch (err) {
        console.error("Error fetching selected chat history:", err);
      }
    };

    fetchSelectedChatMessages();
    const interval = setInterval(fetchSelectedChatMessages, 4000);
    return () => clearInterval(interval);
  }, [activeTab, selectedChatId, apiBase]);

  // Auto-scroll admin chat to bottom when selected chat or chat list updates
  useEffect(() => {
    if (activeTab === "chats" && adminChatEndRef.current) {
      adminChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedChatMessages, selectedChatId, activeTab]);

  const handleSendAdminReply = async (e) => {
    e.preventDefault();
    if (!chatReplyText.trim() || isReplySending || !selectedChatId) return;

    const text = chatReplyText.trim();
    setChatReplyText("");
    setIsReplySending(true);

    // Optimistic UI update
    const optimisticMsg = {
      sender: "admin",
      text: text,
      timestamp: new Date().toISOString()
    };
    setSelectedChatMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`${apiBase}/api/admin/support/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedChatId,
          text: text
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.chat && data.chat.messages) {
          setSelectedChatMessages(data.chat.messages);
        }
        // Force refresh supportChats metadata list
        const chatsRes = await fetch(`${apiBase}/api/admin/support/chats`);
        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          setSupportChats(chatsData);
        }
      }
    } catch (err) {
      console.error("Error sending admin reply:", err);
    } finally {
      setIsReplySending(false);
    }
  };

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
      await fetchAllData(true);
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
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] p-4 md:p-8 max-w-6xl mx-auto space-y-8 font-sans pb-24 animate-fadeIn">
      {/* Header and Back Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/10 pb-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <Link href="/" className="h-10 w-10 glass border border-black/5 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] transition active:scale-95 shadow-md shadow-black/5">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="text-xs uppercase tracking-widest font-extrabold text-[#e07a2c] bg-[#e07a2c]/10 border border-[#e07a2c]/20 py-1 px-3 rounded-full">ADMINISTRATIVE GATEWAY</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-b from-[#1d1d1f] to-[#424245] bg-clip-text text-transparent">upiCHARGE Control Console</h1>
          <p className="text-sm text-[#86868b] font-light">Monitor system telemetry, enforce remote starts, trigger manual refunds and toggle live networks.</p>
        </div>
        
        {/* Dynamic connection state */}
        <div className="flex items-center space-x-3 glass border border-black/5 rounded-2xl py-2 px-4 text-xs self-start md:self-auto shadow-md shadow-black/5">
          <span className={`h-2.5 w-2.5 rounded-full ${loading ? "bg-apple-amber animate-pulse" : "bg-apple-emerald"}`} />
          <span className="font-semibold text-[#86868b]">
            {loading ? "Syncing Network..." : "FastAPI Connected: 8000"}
          </span>
          <button onClick={() => fetchAllData()} className="p-1 text-[#86868b] hover:text-[#1d1d1f] transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading && "animate-spin"}`} />
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {successMsg && (
        <div className="glass border-apple-emerald/20 bg-apple-emerald/5 text-apple-emerald p-4 rounded-3xl flex items-start space-x-3 animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm font-semibold leading-relaxed flex-1">{successMsg}</div>
          <button onClick={() => setSuccessMsg("")} className="text-xs hover:underline uppercase font-bold text-[#86868b]">Dismiss</button>
        </div>
      )}
      {errorMsg && (
        <div className="glass border-apple-amber/25 bg-apple-amber/5 text-apple-amber p-4 rounded-3xl flex items-start space-x-3 animate-fadeIn">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm font-semibold leading-relaxed flex-1">{errorMsg}</div>
          <button onClick={() => setErrorMsg("")} className="text-xs hover:underline uppercase font-bold text-[#86868b]">Dismiss</button>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 h-12 w-12 bg-apple-emerald/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between text-[#86868b]">
            <span className="text-xs font-semibold tracking-wide">Live Revenue</span>
            <IndianRupee className="h-4 w-4 text-apple-emerald" />
          </div>
          <div className="text-2xl font-extrabold text-[#1d1d1f]">₹{metrics.totalRevenue.toFixed(2)}</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 h-12 w-12 bg-apple-accent/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between text-[#86868b]">
            <span className="text-xs font-semibold tracking-wide">Refunds Issued</span>
            <RotateCcw className="h-4 w-4 text-apple-amber" />
          </div>
          <div className="text-2xl font-extrabold text-apple-amber">₹{metrics.totalRefunded.toFixed(2)}</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-[#86868b]">
            <span className="text-xs font-semibold tracking-wide">Active Sessions</span>
            <Activity className="h-4 w-4 text-apple-accent animate-pulse" />
          </div>
          <div className="text-2xl font-extrabold text-apple-accent">{metrics.activeSessionsCount}</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-[#86868b]">
            <span className="text-xs font-semibold tracking-wide">Tx Success Rate</span>
            <TrendingUp className="h-4 w-4 text-[#219653]" />
          </div>
          <div className="text-2xl font-extrabold text-[#219653]">{metrics.successRate}%</div>
        </div>

        <div className="glass rounded-3xl p-5 space-y-2 col-span-2 md:col-span-1 shadow-sm">
          <div className="flex items-center justify-between text-[#86868b]">
            <span className="text-xs font-semibold tracking-wide">Payment Mode</span>
            <Settings className="h-4 w-4 text-black/40" />
          </div>
          <div className="text-base font-black uppercase flex items-center space-x-1.5 mt-0.5">
            <span className={`h-2 w-2 rounded-full ${config.payment_mode === "live" ? "bg-orange-500 glow-orange" : "bg-apple-emerald"}`} />
            <span className={config.payment_mode === "live" ? "text-orange-500 font-bold" : "text-apple-emerald font-bold"}>
              {config.payment_mode === "live" ? "LIVE UPI" : "SIMULATION"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Selection Layout (Apple Minimalist Pills) */}
      <div className="flex border-b border-black/10 pb-1 gap-2 overflow-x-auto">
        {[
          { id: "overview", label: "Overview Metrics", icon: Activity },
          { id: "sessions", label: "Active Sessions & Stops", icon: Zap },
          { id: "start", label: "Remote Start Terminal", icon: Cpu },
          { id: "transactions", label: "Transaction Ledger", icon: Database },
          { id: "chats", label: "Support Live Chat", icon: MessageSquare },
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
                  : "bg-black/5 text-[#86868b] border-black/5 hover:text-[#1d1d1f] hover:bg-black/10"
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
            <div className="glass rounded-3xl p-6 space-y-4 shadow-sm">
              <h3 className="font-extrabold text-lg tracking-tight text-[#1d1d1f]">Active Networks Status</h3>
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-[#86868b]">Core Payment Network:</span>
                  <span className={`font-bold uppercase ${config.payment_mode === "live" ? "text-orange-500" : "text-apple-emerald"}`}>
                    {config.payment_mode === "live" ? "Razorpay Gateway (Live)" : "Local Simulator (Dummy)"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-[#86868b]">chargeMOD Socket Protocol:</span>
                  <span className="font-bold text-apple-emerald uppercase flex items-center space-x-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>SSL Connected</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#86868b]">Remote Bypass Tag ID:</span>
                  <span className="font-mono text-[#1d1d1f]/80 bg-black/5 py-0.5 px-2 rounded-lg">9999999999</span>
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-6 space-y-4 shadow-sm">
              <h3 className="font-extrabold text-lg tracking-tight text-[#1d1d1f]">Telemetry Records Summary</h3>
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-[#86868b]">Logged Transactions:</span>
                  <span className="font-bold text-[#1d1d1f]">{transactions.length} records</span>
                </div>
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-[#86868b]">Active Simulations:</span>
                  <span className="font-bold text-apple-accent">
                    {activeSessions.active_simulation_session ? "1 running" : "Idle"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#86868b]">Active Live Payments:</span>
                  <span className="font-bold text-[#1d1d1f]">
                    {Object.keys(activeSessions.active_payments || {}).length} registered
                  </span>
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-6 space-y-4 shadow-sm">
              <h3 className="font-extrabold text-lg tracking-tight text-[#1d1d1f]">Refund Efficiency</h3>
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-[#86868b]">Total Refunds Cleared:</span>
                  <span className="font-bold text-apple-amber">₹{metrics.totalRefunded.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                  <span className="text-[#86868b]">Average Refund Processing:</span>
                  <span className="font-bold text-apple-emerald">&lt; 3.2 seconds</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#86868b]">Method:</span>
                  <span className="font-bold text-[#1d1d1f]">UPI Instant Optimum API</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick System Action */}
          <div className="glass rounded-[32px] p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 h-32 w-32 bg-[#e07a2c]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-[#1d1d1f]">Quick Terminal Start/Stop</h2>
              <p className="text-xs text-[#86868b] max-w-xl font-light">
                Directly start or stop any charging station without using a smart phone or credit card. Bypasses client-side wallets and checks and logs admin credentials.
              </p>
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={() => setActiveTab("start")}
                className="bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-semibold py-3 px-6 rounded-2xl text-xs transition active:scale-95 shadow-md shadow-black/10"
              >
                Launch Start Terminal
              </button>
              <button 
                onClick={() => setActiveTab("sessions")}
                className="bg-black/5 text-[#1d1d1f] font-semibold py-3 px-6 rounded-2xl text-xs hover:bg-black/10 transition active:scale-95"
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
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#86868b]">Live Connected Sessions</h3>
            <button 
              onClick={() => fetchAllData(true)} 
              className="text-xs text-apple-accent hover:underline flex items-center space-x-1 font-bold"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh Active States</span>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Live Active Payments Session Cards */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-[#86868b] px-1">Live Razorpay Sessions ({Object.keys(activeSessions.active_payments || {}).length})</h4>
              
              {Object.keys(activeSessions.active_payments || {}).length === 0 ? (
                <div className="glass rounded-3xl p-8 text-center text-xs text-[#86868b] shadow-sm">
                  No active live Razorpay sessions detected on the server.
                </div>
              ) : (
                Object.keys(activeSessions.active_payments || {}).map((chargerIdKey) => {
                  const s = activeSessions.active_payments[chargerIdKey];
                  return (
                    <div key={chargerIdKey} className="glass rounded-[32px] p-6 space-y-4 relative overflow-hidden border-orange-500/20 shadow-md">
                      <div className="absolute top-0 right-0 h-16 w-16 bg-orange-500/5 rounded-full blur-xl" />
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-orange-500 font-extrabold uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 py-0.5 px-2 rounded-full">LIVE RAZORPAY</span>
                          <h4 className="font-extrabold text-[#1d1d1f] text-base tracking-tight mt-1">Charger {chargerIdKey}</h4>
                          <p className="text-[11px] text-[#86868b] font-mono">Tx ID: {s.transaction_id || "Awaiting MOD Tx"}</p>
                        </div>
                        <span className="h-2.5 w-2.5 rounded-full bg-apple-emerald animate-pulse" />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-black/5">
                        <div>
                          <span className="text-[#86868b] block text-[10px] uppercase">Connector</span>
                          <span className="font-bold text-[#1d1d1f]">ID {s.connector_id || 1} ({s.connector_type || "Type 2"})</span>
                        </div>
                        <div>
                          <span className="text-[#86868b] block text-[10px] uppercase">Prepaid Authorized</span>
                          <span className="font-bold text-apple-emerald">₹{(s.prepaid_amount || 0).toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoteStop(chargerIdKey)}
                        disabled={actionLoading}
                        className="w-full bg-[#ff9500] hover:bg-[#e08500] text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95 flex items-center justify-center space-x-2 shadow-md shadow-orange-500/10"
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
              <h4 className="text-xs font-bold text-[#86868b] px-1">Simulated Sessions (1)</h4>
              
              {!activeSessions.active_simulation_session ? (
                <div className="glass rounded-3xl p-8 text-center text-xs text-[#86868b] shadow-sm">
                  No simulated active session running. Start one from the terminal.
                </div>
              ) : (
                <div className="glass rounded-[32px] p-6 space-y-4 relative overflow-hidden border-apple-emerald/20 shadow-md">
                  <div className="absolute top-0 right-0 h-16 w-16 bg-apple-emerald/5 rounded-full blur-xl" />
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] text-apple-emerald font-extrabold uppercase tracking-widest bg-apple-emerald/10 border border-apple-emerald/20 py-0.5 px-2 rounded-full">SIMULATION RUNNING</span>
                      <h4 className="font-extrabold text-[#1d1d1f] text-base tracking-tight mt-1">Charger {activeSessions.active_simulation_session.charger_id}</h4>
                      <p className="text-[11px] text-[#86868b] font-light">Continuous ticking telemetry running...</p>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-apple-emerald animate-pulse-slow glow-emerald" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-black/5">
                    <div>
                      <span className="text-[#86868b] block text-[10px] uppercase">Connector</span>
                      <span className="font-bold text-[#1d1d1f]">ID {activeSessions.active_simulation_session.connector_id}</span>
                    </div>
                    <div>
                      <span className="text-[#86868b] block text-[10px] uppercase">Prepaid Limit</span>
                      <span className="font-bold text-apple-emerald">₹{(activeSessions.active_simulation_session.prepaid_amount || 100).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[#86868b] block text-[10px] uppercase">Elapsed Telemetry</span>
                      <span className="font-bold text-[#1d1d1f]">
                        {activeSessions.active_simulation_session.start_time ? (
                          `${Math.floor((new Date() - new Date(activeSessions.active_simulation_session.start_time)) / 1000)} seconds`
                        ) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#86868b] block text-[10px] uppercase">Customer Bypass</span>
                      <span className="font-bold text-[#1d1d1f]">9999999999</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoteStop(activeSessions.active_simulation_session.charger_id)}
                    disabled={actionLoading}
                    className="w-full bg-apple-rose hover:bg-apple-rose/90 text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95 flex items-center justify-center space-x-2 shadow-md shadow-red-500/10"
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
          <div className="glass rounded-[32px] p-6 md:p-8 space-y-6 max-w-xl mx-auto shadow-md">
            <div className="space-y-1">
              <span className="text-[10px] text-[#e07a2c] font-black uppercase tracking-widest">Admin Control Terminal</span>
              <h2 className="font-extrabold text-2xl tracking-tight text-[#1d1d1f]">Direct OCPP Remote Start</h2>
              <p className="text-xs text-[#86868b] leading-relaxed font-light">
                Manually push RemoteStartTransaction signal down the chargeMOD socket directly. Instantly starts the charger using our administrative master bypass profile.
              </p>
            </div>

            <div className="space-y-4">
              {/* Charger ID */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#86868b] uppercase">Charger ID (Identity)</label>
                <input
                  type="text"
                  placeholder="e.g. CM-S01664-0IJGY975TE"
                  value={chargerId}
                  onChange={(e) => setChargerId(e.target.value)}
                  className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Connector ID */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#86868b] uppercase">Connector Gun ID</label>
                  <select
                    value={connectorId}
                    onChange={(e) => setConnectorId(parseInt(e.target.value))}
                    className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide text-[#1d1d1f] appearance-none"
                    style={{ backgroundPosition: "right 20px center", backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"%231d1d1f\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')", backgroundRepeat: "no-repeat" }}
                  >
                    <option value={1} className="bg-white text-black">Connector 1</option>
                    <option value={2} className="bg-white text-black">Connector 2</option>
                    <option value={3} className="bg-white text-black">Connector 3</option>
                  </select>
                </div>

                {/* Prepaid pre-auth amount */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#86868b] uppercase">Simulation Prepaid Limit</label>
                  <select
                    value={prepaidAmount}
                    onChange={(e) => {
                      setPrepaidAmount(parseInt(e.target.value));
                      setCustomAmount("");
                    }}
                    className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide text-[#1d1d1f] appearance-none"
                    style={{ backgroundPosition: "right 20px center", backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"%231d1d1f\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')", backgroundRepeat: "no-repeat" }}
                  >
                    <option value={100} className="bg-white text-black">₹100</option>
                    <option value={200} className="bg-white text-black">₹200</option>
                    <option value={500} className="bg-white text-black">₹500</option>
                  </select>
                </div>
              </div>

              {/* Custom amount field */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#86868b] uppercase">Or Custom Prepaid Amount (Rs.)</label>
                <input
                  type="number"
                  placeholder="Enter custom prepaid limit"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
                />
              </div>
            </div>

            <button
              onClick={handleRemoteStart}
              disabled={actionLoading || !chargerId.trim()}
              className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-extrabold py-4 rounded-2xl shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
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
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#86868b] px-1">Transactions Ledger</h3>
            
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search by ID, Charger, Mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/5 border border-black/5 rounded-2xl py-2.5 px-4 text-xs font-medium placeholder-black/30 text-[#1d1d1f] shadow-inner"
              />
            </div>
          </div>

          {/* Transactions List */}
          <div className="glass rounded-[32px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-black/10 bg-black/[0.02] font-bold text-[#86868b]">
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
                      <td colSpan={7} className="py-12 text-center text-[#86868b]">
                        No transactions found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const refundAvailable = (tx.status === "captured" || tx.status === "partially_refunded" || tx.status === "refunded") && 
                                              (!tx.refund_status || (!tx.refund_status.includes("success") && !tx.refund_status.includes("refunded_via_razorpay")));
                      
                      const remainingRefund = (tx.amount || 0) - (tx.actual_cost || 0);

                      return (
                        <tr key={tx.order_id || tx.payment_id} className="border-b border-black/5 hover:bg-black/[0.02] transition text-[#1d1d1f]">
                          <td className="py-4 px-6 font-mono leading-relaxed">
                            <span className="block font-bold text-[#1d1d1f] max-w-[150px] truncate">{tx.payment_id || tx.order_id}</span>
                            <span className="text-[10px] text-[#86868b] block mt-0.5">Mobile: {tx.customer_mobile || "9999999999"}</span>
                          </td>
                          <td className="py-4 px-6 font-semibold">
                            <span>{tx.charger_id || "Simulated"}</span>
                            <span className="block text-[10px] text-[#86868b] mt-0.5 font-light">Conn {tx.connector_id || 1}</span>
                          </td>
                          <td className="py-4 px-6 font-bold text-[#1d1d1f]">₹{(tx.amount || 0).toFixed(2)}</td>
                          <td className="py-4 px-6 font-bold text-[#1d1d1f]">
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
                                <span className="text-[10px] text-[#86868b] block max-w-[120px] truncate">{tx.refund_status || "Dispatched"}</span>
                              </>
                            ) : (
                              <span className="text-[#86868b] font-light">No refund needed</span>
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
                              <span className="text-black/30 text-[10px] uppercase font-bold">Settled</span>
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
          <div className="glass rounded-[32px] p-8 space-y-6 shadow-md">
            <div className="space-y-1">
              <span className="text-[10px] text-[#e07a2c] font-black uppercase tracking-widest">Global Configurations</span>
              <h2 className="font-extrabold text-2xl tracking-tight text-[#1d1d1f]">Backend Payment Mode</h2>
              <p className="text-xs text-[#86868b] leading-relaxed font-light">
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
                    : "border-black/5 hover:border-black/10 bg-black/5"
                }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-4 ${config.payment_mode === "dummy" ? "bg-apple-emerald text-white" : "bg-black/5 text-[#1d1d1f]"}`}>
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#1d1d1f]">Dummy Simulator</h4>
                  <p className="text-[10px] text-[#86868b] mt-1">Simulate UPI pre-auth payments instantly. Great for hardware-free checkout testing.</p>
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
                    : "border-black/5 hover:border-black/10 bg-black/5"
                }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-4 ${config.payment_mode === "live" ? "bg-orange-500 text-white" : "bg-black/5 text-[#1d1d1f]"}`}>
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#1d1d1f]">Live Razorpay Gateway</h4>
                  <p className="text-[10px] text-[#86868b] mt-1">Route actual money via UPI intent. Connects to production server environments.</p>
                </div>
                {config.payment_mode === "live" && (
                  <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-orange-500 glow-orange" />
                )}
              </button>
            </div>
            
            <div className="flex items-center space-x-2 border-t border-black/5 pt-4 text-xs text-[#86868b] leading-relaxed">
              <ShieldCheck className="h-4 w-4 text-apple-emerald" />
              <span>Saves securely to .env file on FastAPI. Auto-reloads in-memory variables.</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: SUPPORT LIVE CHAT ================= */}
      {activeTab === "chats" && (
        <div className="grid md:grid-cols-12 gap-6 h-[calc(100vh-220px)] min-h-[500px] animate-fadeIn">
          {/* Left Column: Chat Sessions List */}
          <div className="md:col-span-4 glass rounded-[28px] p-5 flex flex-col h-full border border-black/5 shadow-sm overflow-hidden">
            <div className="pb-3 border-b border-black/5 mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b]">Active Sessions</h3>
              <span className="text-[10px] bg-[#e07a2c]/10 text-[#e07a2c] px-2 py-0.5 rounded-full font-bold">
                {supportChats.length} Active
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {supportChats.length === 0 ? (
                <div className="text-center py-12 text-xs text-[#86868b] font-light">
                  No active support chats found.
                </div>
              ) : (
                supportChats.map((chat) => {
                  const isSelected = selectedChatId === chat.user_id;
                  return (
                    <button
                      key={chat.user_id}
                      onClick={() => setSelectedChatId(chat.user_id)}
                      className={`w-full text-left p-4 rounded-2xl border transition flex flex-col justify-between relative ${
                        isSelected
                          ? "bg-[#e07a2c]/10 border-[#e07a2c]/25 shadow-sm"
                          : "bg-black/5 border-transparent hover:bg-black/10 hover:border-black/5"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs text-[#1d1d1f] truncate max-w-[120px]">
                          {chat.user_name}
                        </span>
                        <span className="text-[9px] text-[#86868b] font-mono">
                          {chat.user_id.slice(-4).toUpperCase()}
                        </span>
                      </div>
                      
                      {chat.last_message && (
                        <p className="text-[11px] text-[#86868b] truncate mt-1.5 font-light leading-snug w-full">
                          {chat.last_message}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/5 w-full">
                        <span className="text-[9px] text-black/30 font-light">
                          {chat.last_time
                            ? new Date(chat.last_time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit"
                              })
                            : ""}
                        </span>
                        {chat.message_count > 0 && (
                          <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#e07a2c] text-white text-[8px] font-bold flex items-center justify-center">
                            {chat.message_count}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Chat History & Typing Area */}
          <div className="md:col-span-8 glass rounded-[28px] p-6 flex flex-col h-full border border-black/5 shadow-sm overflow-hidden">
            {selectedChatId ? (
              <>
                {/* Chat Header */}
                <div className="pb-3 border-b border-black/5 mb-4 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#e07a2c]/10 text-[#e07a2c] flex items-center justify-center text-xs font-black">
                      {supportChats.find(c => c.user_id === selectedChatId)?.user_name?.[0].toUpperCase() || "U"}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#1d1d1f]">
                        {supportChats.find(c => c.user_id === selectedChatId)?.user_name || "Support Chat"}
                      </h4>
                      <p className="text-[9px] text-[#86868b] font-light leading-none">
                        Active support session • {selectedChatId}
                      </p>
                    </div>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-apple-emerald animate-pulse" />
                </div>

                {/* Messages Box */}
                <div className="flex-1 overflow-y-auto space-y-4 px-1 mb-4 flex flex-col pr-1">
                  {selectedChatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 text-[#86868b]">
                      <Loader2 className="h-6 w-6 animate-spin text-[#e07a2c] mb-2" />
                      <span className="text-xs font-medium">Fetching history...</span>
                    </div>
                  ) : (
                    selectedChatMessages.map((msg, idx) => {
                      const isAdmin = msg.sender === "admin";
                      return (
                        <div
                          key={idx}
                          className={`flex flex-col max-w-[75%] ${
                            isAdmin ? "self-end items-end" : "self-start items-start"
                          }`}
                        >
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                              isAdmin
                                ? "bg-[#e07a2c] text-white rounded-br-none shadow-sm shadow-[#e07a2c]/10"
                                : "bg-black/5 text-[#1d1d1f] rounded-bl-none"
                            }`}
                          >
                            {msg.text}
                          </div>
                          <span className="text-[9px] text-[#86868b] mt-1.5 px-1 font-light">
                            {msg.timestamp
                              ? new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })
                              : ""}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={adminChatEndRef} />
                </div>

                {/* Reply Typing Box */}
                <form onSubmit={handleSendAdminReply} className="flex gap-2 border-t border-black/5 pt-4">
                  <input
                    type="text"
                    value={chatReplyText}
                    onChange={(e) => setChatReplyText(e.target.value)}
                    placeholder="Type a reply here..."
                    disabled={isReplySending}
                    className="flex-1 bg-black/5 border border-black/10 rounded-2xl py-3.5 px-4 text-xs font-medium placeholder-black/30 text-[#1d1d1f]"
                  />
                  <button
                    type="submit"
                    disabled={!chatReplyText.trim() || isReplySending}
                    className="bg-[#1d1d1f] hover:bg-[#2c2c2e] disabled:bg-[#86868b]/30 text-white font-bold px-6 rounded-2xl text-xs transition active:scale-95 flex items-center justify-center select-none"
                  >
                    {isReplySending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span>Reply</span>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-2">
                <div className="h-12 w-12 rounded-full bg-[#e07a2c]/10 text-[#e07a2c] flex items-center justify-center mb-1">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-sm text-[#1d1d1f]">No Conversation Selected</h4>
                <p className="text-xs text-[#86868b] max-w-xs leading-relaxed font-light">
                  Select an active customer session from the left column to view message logs and send operator replies in real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Refund modal popup */}
      {showRefundModal && selectedTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-premium rounded-[36px] border border-black/5 p-6 md:p-8 max-w-sm w-full space-y-6 animate-scaleIn shadow-2xl text-[#1d1d1f]">
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#e07a2c]">ADMINISTRATIVE ACTION</span>
              <h3 className="text-xl font-extrabold tracking-tight text-[#1d1d1f]">Manual UPI Refund</h3>
              <p className="text-xs text-[#86868b] leading-relaxed font-light">
                Initiate an instant manual UPI refund back to the customer. This action calls Razorpay instantly or marks simulated settle records.
              </p>
            </div>

            <div className="space-y-4 text-xs pt-2">
              <div className="flex items-center justify-between border-b border-black/5 pb-2">
                <span className="text-[#86868b]">Transaction ID:</span>
                <span className="font-mono font-bold text-[#1d1d1f] max-w-[150px] truncate">{selectedTx.payment_id || selectedTx.order_id}</span>
              </div>
              <div className="flex items-center justify-between border-b border-black/5 pb-2">
                <span className="text-[#86868b]">Prepaid Pre-authorized:</span>
                <span className="font-bold text-[#1d1d1f]">₹{(selectedTx.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-black/5 pb-2">
                <span className="text-[#86868b]">Actual Session Cost:</span>
                <span className="font-bold text-[#1d1d1f]">₹{(selectedTx.actual_cost || 0).toFixed(2)}</span>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold text-[#86868b] uppercase">Refund Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50.00"
                  value={refundAmountInput}
                  onChange={(e) => setRefundAmountInput(e.target.value)}
                  className="w-full bg-black/5 border border-black/10 rounded-2xl py-3.5 px-4 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowRefundModal(false)}
                className="bg-black/5 hover:bg-black/10 text-[#1d1d1f] font-bold py-3.5 rounded-2xl text-xs transition active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                className="bg-[#e07a2c] hover:bg-[#c66c25] text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95 shadow-md shadow-orange-500/10"
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
