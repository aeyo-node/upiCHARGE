"use client";

import { useEffect, useState, useRef } from "react";
import Script from "next/script";
import { 
  Camera, 
  MapPin, 
  ShieldCheck, 
  CheckCircle2, 
  RotateCcw, 
  AlertCircle, 
  Play, 
  Square, 
  Loader2, 
  ArrowRight, 
  Wallet, 
  Zap, 
  Clock, 
  IndianRupee, 
  Smartphone, 
  User, 
  MessageSquare,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  Copy,
  Check,
  ArrowDownCircle
} from "lucide-react";

// API base is dynamically set inside the Home component state

export default function Home() {
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  const [isDummyMode, setIsDummyMode] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        setApiBase("http://localhost:8000");
      } else {
        setApiBase(window.location.origin);
      }
    }
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${apiBase}/api/payments/config`);
        if (res.ok) {
          const config = await res.json();
          setIsDummyMode(config.payment_mode !== "live");
        }
      } catch (err) {
        console.error("Failed to fetch payment config:", err);
      }
    };
    if (apiBase) {
      fetchConfig();
    }
  }, [apiBase]);

  // State management for screen transition:
  // 'home' | 'connector' | 'payment' | 'charging' | 'receipt' | 'support' | 'map'
  const [screen, setScreen] = useState("home");
  
  // App context states
  const [qrInput, setQrInput] = useState("");
  const [chargerId, setChargerId] = useState("");
  const [stationDetails, setStationDetails] = useState(null);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [prepaidAmount, setPrepaidAmount] = useState(200);
  const [customAmount, setCustomAmount] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  
  // Charging state feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorErrorMsg] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const handleCopyTx = (txId) => {
    if (!txId) return;
    navigator.clipboard.writeText(txId);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const handleDownloadInvoice = (receiptData) => {
    const invoiceHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tax Invoice - upiCHARGE</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            line-height: 1.5;
            background-color: #f6f8fa;
            margin: 0;
            padding: 20px;
        }
        .invoice-card {
            max-width: 600px;
            background: #ffffff;
            border-radius: 16px;
            padding: 40px;
            margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            border: 1px solid #e1e4e8;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #f1f2f4;
            padding-bottom: 20px;
            margin-bottom: 25px;
        }
        .logo {
            font-weight: 800;
            font-size: 24px;
            color: #111;
        }
        .logo span {
            color: #e07a2c;
        }
        .badge {
            background-color: #e2f9eb;
            color: #219653;
            font-size: 11px;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 50px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #828282;
            margin-bottom: 12px;
        }
        .grid {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
        }
        .info-block label {
            display: block;
            font-size: 11px;
            color: #828282;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .info-block div {
            font-size: 14px;
            font-weight: 700;
            color: #333;
        }
        .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            margin-bottom: 25px;
        }
        .table th {
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #828282;
            padding: 8px 12px;
            border-bottom: 1px solid #e1e4e8;
        }
        .table td {
            padding: 12px;
            font-size: 14px;
            border-bottom: 1px solid #f1f2f4;
        }
        .table td.amount {
            text-align: right;
            font-weight: 600;
        }
        .table th.amount {
            text-align: right;
        }
        .summary {
            margin-left: auto;
            width: 50%;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
        }
        .summary-row.total {
            font-weight: 800;
            font-size: 18px;
            border-top: 2px solid #333;
            padding-top: 12px;
            margin-top: 8px;
            color: #111;
        }
        .refund-section {
            background-color: #f2f9ff;
            border-left: 4px solid #e07a2c;
            border-radius: 8px;
            padding: 15px;
            margin-top: 30px;
            margin-bottom: 20px;
            font-size: 13px;
        }
        .refund-section h4 {
            margin: 0 0 5px 0;
            color: #e07a2c;
            font-weight: 700;
        }
        .refund-section p {
            margin: 0;
            color: #555;
        }
        .footer {
            text-align: center;
            font-size: 11px;
            color: #828282;
            margin-top: 40px;
            border-top: 1px solid #e1e4e8;
            padding-top: 20px;
        }
        @media print {
            body {
                background-color: #ffffff;
                padding: 0;
            }
            .invoice-card {
                border: none;
                box-shadow: none;
                padding: 0;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-card">
        <div class="header">
            <div class="logo">upi<span>CHARGE</span></div>
            <div class="badge">Paid</div>
        </div>
        
        <div class="grid">
            <div class="info-block">
                <label>Tax Invoice No.</label>
                <div>INV-${receiptData.transaction_id || "TXN_93818"}</div>
            </div>
            <div class="info-block" style="text-align: right;">
                <label>Invoice Date</label>
                <div>${receiptData.session_date_formatted || "03 Jun 2026"}</div>
            </div>
        </div>

        <div style="border-top: 1px solid #f1f2f4; padding-top: 20px; margin-bottom: 20px;">
            <div class="section-title">Charging Session Details</div>
            <div class="grid">
                <div class="info-block">
                    <label>Station Name</label>
                    <div>${receiptData.location_name || "OCPI Test Location - PROD"}</div>
                </div>
                <div class="info-block" style="text-align: right;">
                    <label>Charger Device</label>
                    <div>${receiptData.charger_name || "test device"}</div>
                </div>
                <div class="info-block">
                    <label>Session Duration</label>
                    <div>Start Time: ${receiptData.start_time_formatted || "09:02 PM"}<br>End Time: ${receiptData.end_time_formatted || "09:07 PM"}</div>
                </div>
                <div class="info-block" style="text-align: right;">
                    <label>Telemetry Details</label>
                    <div>Vehicle: ${receiptData.vehicle_model || "--"}<br>Reason: ${receiptData.stop_reason || "Stopped Remotely"}</div>
                </div>
            </div>
        </div>

        <div class="section-title">Billing Breakdown</div>
        <table class="table">
            <thead>
                <tr>
                    <th>Description</th>
                    <th style="text-align: center;">Energy Usage</th>
                    <th class="amount">Taxable Value</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>Energy Consumption Fee</strong><br>
                        <span style="font-size: 11px; color: #828282;">Charge consumption rate tariff fee</span>
                    </td>
                    <td style="text-align: center;">${receiptData.energy_kwh?.toFixed(2)} kWh</td>
                    <td class="amount">₹${receiptData.energy_usage_fee?.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>
                        <strong>Base Service Fee</strong><br>
                        <span style="font-size: 11px; color: #828282;">Session connectivity processing charge</span>
                    </td>
                    <td style="text-align: center;">—</td>
                    <td class="amount">₹${receiptData.service_fee?.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div class="summary">
            <div class="summary-row">
                <span>Taxable Amount</span>
                <span>₹${(receiptData.service_fee + receiptData.energy_usage_fee).toFixed(2)}</span>
            </div>
            <div class="summary-row">
                <span>Tax (GST ${receiptData.tax_percentage}%)</span>
                <span>₹${receiptData.tax_amount?.toFixed(2)}</span>
            </div>
            <div class="summary-row total">
                <span>Total Amount</span>
                <span>₹${receiptData.actual_cost?.toFixed(2)}</span>
            </div>
        </div>

        <div class="refund-section">
            <h4>Prepayment & Refund Breakdown</h4>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Prepaid Authorized:</span>
                <strong>₹${receiptData.prepaid_amount?.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Actual Session Cost:</span>
                <strong>₹${receiptData.actual_cost?.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(224, 122, 44, 0.15); padding-top: 5px; font-weight: 700;">
                <span style="color: #219653;">Refund Dispatched:</span>
                <span style="color: #219653;">₹${receiptData.refund_amount?.toFixed(2)}</span>
            </div>
            <p style="margin-top: 10px; font-size: 11px; color: #666;">
                The excess refund was initiated instantly back to your UPI source ID. Please verify with your UPI handle/banking app statement.
            </p>
        </div>

        <div class="footer">
            <p>Thank you for charging with upiCHARGE.com</p>
            <p style="font-size: 10px; color: #bdbdbd; margin-top: 5px;">This is a system generated tax invoice. No signature required.</p>
        </div>
    </div>
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
        }
    </script>
</body>
</html>
    `;
    
    const blob = new Blob([invoiceHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice_\${receiptData.transaction_id || 'TXN_93818'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const w = window.open();
    if (w) {
        w.document.open();
        w.document.write(invoiceHtml);
        w.document.close();
    }
  };

  // QR scanner references
  const scannerRef = useRef(null);
  const scannerInstance = useRef(null);
  const inactivePollsRef = useRef(0);
  const verifyingRef = useRef(false);

  // Browser notification trigger
  const triggerBrowserNotification = (title, body) => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification(title, { body });
        } catch (e) {
          console.error("Failed to trigger Notification:", e);
        }
      }
    }
  };

  // Detect mobile viewport and request notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsMobileDevice(mobile);

      // Request notification permission
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Restore charging state on load (Session Persistence!)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedMobile = localStorage.getItem("customer_mobile_number");
      if (storedMobile) {
        setCustomerMobile(storedMobile);
      }
    }
    const savedSession = localStorage.getItem("active_charge_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setActiveSession(parsed);
        setChargerId(parsed.charger_id);
        setCustomerMobile(parsed.customer_mobile);
        setPrepaidAmount(parsed.prepaid_amount);
        setScreen("charging");
      } catch (e) {
        localStorage.removeItem("active_charge_session");
      }
    }
  }, []);

  // Set up background status polling when in 'charging' screen
  useEffect(() => {
    let interval = null;
    
    if (screen === "charging" && activeSession) {
      const pollStatus = async () => {
        try {
          const res = await fetch(`${apiBase}/api/charging/status/${activeSession.charger_id}`);
          if (!res.ok) return;
          const data = await res.json();
          
          if (data.active === false) {
            // Charging stopped at backend (battery full / limit reached / stopped externally)
            // We implement a grace period of 5 polls (15 seconds) to let hardware register in the console active transaction scraper.
            inactivePollsRef.current++;
            console.log(`Polling reported inactive status. Grace period active (poll ${inactivePollsRef.current}/5)...`);
            if (inactivePollsRef.current > 5) {
              handleAutoStop();
            }
          } else {
            inactivePollsRef.current = 0; // Reset on any successful active poll!
            setActiveSession(prev => ({
              ...prev,
              energy_kwh: data.energy_kwh,
              cost_rs: data.cost_rs,
              elapsed_seconds: data.elapsed_seconds
            }));
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      pollStatus();
      interval = setInterval(pollStatus, 3000); // Poll every 3 seconds
    } else {
      inactivePollsRef.current = 0; // Reset when not in charging screen
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [screen, activeSession]);

  // Clean shutdown of camera when leaving home screen
  // Automatically manage the scanner life cycle: start on home, and stop when leaving
  useEffect(() => {
    if (screen === "home") {
      verifyingRef.current = false; // Reset lock whenever entering home screen!
      startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [screen]);

  // Instantiates the camera scanner safely on mount or return to home
  const startScanner = async () => {
    if (typeof window === "undefined" || scannerInstance.current) return;
    
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      scannerInstance.current = new Html5Qrcode("qr-reader-target");
      
      // Omit qrbox to scan the full camera frame, making scan detection instant and matching GPay/native feel
      const config = { fps: 15 };
      
      await scannerInstance.current.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          // Success! Verify station
          await handleVerify(decodedText);
        },
        () => {
          // Suppress noise logs
        }
      );
      setCameraActive(true);
    } catch (err) {
      console.error("Camera scanner error:", err);
      setCameraActive(false);
    }
  };

  const stopScanner = async () => {
    setCameraActive(false);
    if (scannerInstance.current) {
      try {
        if (scannerInstance.current.isScanning) {
          await scannerInstance.current.stop();
        }
      } catch (err) {
        console.error("Failed to stop scanner:", err);
      }
      scannerInstance.current = null;
    }
  };

  // 1. Verify Charger
  const handleVerify = async (inputCode) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    
    setErrorErrorMsg("");
    setLoading(true);
    
    // Crucial: await stopping the scanner completely before sending any network request
    // This stops the camera frame cycle and prevents parallel/re-entrant verify requests
    await stopScanner();

    let cleanCode = inputCode || qrInput;
    if (cleanCode) {
      cleanCode = cleanCode.trim();
      if (cleanCode.includes("/")) {
        const parts = cleanCode.split("/").filter(Boolean);
        if (parts.length > 0) {
          cleanCode = parts[parts.length - 1];
        }
      }
    }

    try {
      const res = await fetch(`${apiBase}/api/charging/verify-station/${encodeURIComponent(cleanCode)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Charger verification failed.");
      }

      const data = await res.json();
      setStationDetails(data);
      setChargerId(data.charger_id);
      
      // Auto-select first connector if available
      if (data.connectors && data.connectors.length > 0) {
        setSelectedConnector(data.connectors[0]);
      }
      
      setScreen("connector");
    } catch (err) {
      setErrorErrorMsg(err.message || "Could not connect to charger.");
      // Unlock verification since we failed, so user can try scanning again
      verifyingRef.current = false;
      // Restart scanner if verify fails
      await startScanner();
    } finally {
      setLoading(false);
    }
  };

  // 2. Start Payment pre-authorization loop
  const handleProceedToPayment = () => {
    if (customerMobile && (customerMobile.trim().length !== 10 || isNaN(customerMobile))) {
      setErrorErrorMsg("Please enter a valid 10-digit mobile number, or leave it blank.");
      return;
    }
    setErrorErrorMsg("");
    setScreen("payment");
  };

  // 3. Initiate Charging (Simulated Payment -> Start API)
  const handleStartCharging = async () => {
    if (customerMobile && (customerMobile.trim().length !== 10 || isNaN(customerMobile))) {
      setErrorErrorMsg("Please enter a valid 10-digit mobile number or leave it blank.");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    setErrorErrorMsg("");

    const finalPrepaid = customAmount ? parseFloat(customAmount) : prepaidAmount;
    const finalMobile = customerMobile ? customerMobile : "9999999999";

    try {
      // 1. Create a secure prepaid order from payments endpoint
      const res = await fetch(`${apiBase}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charger_id: chargerId,
          connector_id: selectedConnector.connector_id,
          customer_mobile: finalMobile,
          amount: finalPrepaid
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create payment order.");
      }

      const orderData = await res.json();

      // 2. Decide flow based on payment_mode / dummy_mode
      if (orderData.dummy_mode === true) {
        // Bypass Razorpay widget, trigger /api/charging/start directly
        const startRes = await fetch(`${apiBase}/api/charging/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            charger_id: chargerId,
            connector_id: selectedConnector.connector_id,
            customer_mobile: finalMobile,
            prepaid_amount: finalPrepaid
          })
        });

        if (!startRes.ok) {
          const errData = await startRes.json();
          throw new Error(errData.detail || "Failed to start charger in simulation.");
        }

        const initialSession = {
          charger_id: chargerId,
          connector_id: selectedConnector.connector_id,
          customer_mobile: finalMobile,
          prepaid_amount: finalPrepaid,
          energy_kwh: 0,
          cost_rs: 0,
          elapsed_seconds: 0
        };

        // Save to localStorage for recovery
        localStorage.setItem("active_charge_session", JSON.stringify(initialSession));
        setActiveSession(initialSession);
        setScreen("charging");
        
        // Trigger browser notification
        triggerBrowserNotification(
          "⚡ Charging Started!",
          `Station Name: ${stationDetails?.charger_name || stationDetails?.location_name || "Unknown Station"}\n` +
          `Charger: ${chargerId}\n` +
          `Connector: ${selectedConnector?.connector_id || 1}\n` +
          `Prepaid Limit: ₹${finalPrepaid}`
        );
      } else {
        // Live Razorpay Mode
        if (typeof window === "undefined" || !window.Razorpay) {
          throw new Error("Razorpay SDK not loaded. Please try again.");
        }

        const options = {
          key: orderData.key,
          amount: orderData.amount,
          currency: orderData.currency,
          name: orderData.name,
          description: orderData.description,
          order_id: orderData.order_id,
          handler: function (response) {
            // Payment success callback from widget
            const initialSession = {
              charger_id: chargerId,
              connector_id: selectedConnector.connector_id,
              customer_mobile: finalMobile,
              prepaid_amount: finalPrepaid,
              energy_kwh: 0,
              cost_rs: 0,
              elapsed_seconds: 0
            };
            localStorage.setItem("active_charge_session", JSON.stringify(initialSession));
            setActiveSession(initialSession);
            setScreen("charging");
            
            // Trigger browser notification
            triggerBrowserNotification(
              "⚡ Charging Started!",
              `Station Name: ${stationDetails?.charger_name || stationDetails?.location_name || "Unknown Station"}\n` +
              `Charger: ${chargerId}\n` +
              `Connector: ${selectedConnector?.connector_id || 1}\n` +
              `Prepaid Limit: ₹${finalPrepaid}`
            );
          },
          prefill: {
            contact: finalMobile,
            email: "customer@upicharge.com",
            method: 'upi'
          },
          config: {
            display: {
              blocks: {
                upi: {
                  name: 'UPI Payments Only',
                  instruments: [
                    {
                      method: 'upi'
                    }
                  ]
                }
              },
              sequence: ['block.upi'],
              preferences: {
                show_default_blocks: false
              }
            }
          },
          theme: { color: "#e07a2c" }
        };

        const rzp = new window.Razorpay(options);
        
        rzp.on("payment.failed", function (response) {
          console.error("Payment failed:", response.error);
          setErrorErrorMsg(response.error.description || "Payment failed.");
        });

        rzp.open();
      }
    } catch (err) {
      setErrorErrorMsg(err.message || "Checkout failed.");
      setScreen("connector");
    } finally {
      setLoading(false);
    }
  };

  // 4. Remote Stop Charging & Refund Trigger
  const handleStopCharging = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/charging/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charger_id: chargerId,
          customer_mobile: activeSession?.customer_mobile || customerMobile || "9999999999",
          prepaid_amount: activeSession?.prepaid_amount || 0
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Stop API returned error.");
      }

      const data = await res.json();
      setReceipt(data.metrics);
      
      // Trigger browser stop charging notification
      triggerBrowserNotification(
        "🔌 Charging Stopped!",
        `Station Name: ${data.metrics.charger_name || data.metrics.location_name || stationDetails?.charger_name || "Unknown Station"}\n` +
        `Charger: ${chargerId}\n` +
        `Connector: ${selectedConnector?.connector_id || data.metrics.connector_id || 1}\n` +
        `Usage: ${(data.metrics.energy_kwh || 0).toFixed(2)} kWh\n` +
        `Amount Charged: ₹${(data.metrics.actual_cost || 0).toFixed(2)}\n` +
        `Refund Dispatched: ₹${(data.metrics.refund_amount || 0).toFixed(2)}\n` +
        `Refund ID: ${data.metrics.refund_id || data.metrics.transaction_id || "Instant UPI"}`
      );

      localStorage.removeItem("active_charge_session");
      setActiveSession(null);
      setScreen("receipt");
    } catch (err) {
      setErrorErrorMsg(err.message || "Remote stop failed. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  // Automatically transition when polling reports inactive state
  const handleAutoStop = () => {
    localStorage.removeItem("active_charge_session");
    // Just fetch stop endpoint to safely verify final metrics and trigger refund calculation
    handleStopCharging();
  };

  const handleReset = () => {
    setScreen("home");
    setQrInput("");
    setChargerId("");
    setStationDetails(null);
    setSelectedConnector(null);
    setReceipt(null);
    setCustomAmount("");
    setErrorErrorMsg("");
    verifyingRef.current = false;
  };

  // Helper formatting for durations
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-start p-4 max-w-md mx-auto relative pb-24">
      {/* Header Bar */}
      <header className="w-full flex items-center justify-between py-6 border-b border-black/5 mb-6">
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 bg-apple-accent rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-apple-accent/30">
            uC
          </div>
          <span className="font-semibold text-lg tracking-tight text-[#1d1d1f]">upiCHARGE<span className="text-apple-accent">.com</span></span>
        </div>
        <div className="flex items-center space-x-1 glass py-1 px-3 rounded-full text-[11px] text-apple-emerald font-medium tracking-wide border-black/5">
          <span className="h-1.5 w-1.5 rounded-full bg-apple-emerald animate-pulse-slow mr-1" />
          Live Connected
        </div>
      </header>

      {/* ERROR BAN ROOM */}
      {errorMsg && (
        <div className="w-full glass border-l-4 border-l-apple-rose p-4 rounded-2xl mb-6 flex items-start space-x-3 text-sm animate-pulse-slow border-black/5">
          <AlertCircle className="h-5 w-5 text-apple-rose flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-apple-rose">Error occurred:</span>
            <p className="text-black/80 mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 1: HOME (SCAN OR MANUAL) ==================== */}
      {screen === "home" && (
        <div className="w-full flex flex-col items-center space-y-6 animate-fadeIn">
          <div className="text-center space-y-2 mt-4">
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-b from-[#1d1d1f] to-[#424245] bg-clip-text text-transparent">
              Tap & Charge
            </h1>
            <p className="text-sm text-[#86868b] font-light px-6">
              Skip the mobile apps, wallets, and RFIDs. Scan and start instantly via UPI.
            </p>
          </div>

          {/* Universal Camera Scanner View */}
          <div className="w-full flex flex-col items-center">
            <div className="w-full aspect-square relative rounded-[40px] overflow-hidden border border-black/10 shadow-xl glass-premium mb-4 flex items-center justify-center">
              {/* Camera feed target */}
              <div id="qr-reader-target" className="absolute inset-0 w-full h-full opacity-90" />
              
              {/* Simulated scanner overlay (corners & scanner line) */}
              <div className="absolute inset-0 border-[3px] border-apple-accent/40 rounded-[40px] pointer-events-none flex flex-col justify-between p-12 z-20">
                <div className="flex justify-between">
                  <span className="h-8 w-8 border-t-[4px] border-l-[4px] border-apple-accent rounded-tl-xl" />
                  <span className="h-8 w-8 border-t-[4px] border-r-[4px] border-apple-accent rounded-tr-xl" />
                </div>
                {/* Laser line effect */}
                <div className="h-[2px] w-full bg-apple-accent shadow-[0_0_15px_#2f80ed] animate-pulse" />
                <div className="flex justify-between">
                  <span className="h-8 w-8 border-b-[4px] border-l-[4px] border-apple-accent rounded-bl-xl" />
                  <span className="h-8 w-8 border-b-[4px] border-r-[4px] border-apple-accent rounded-br-xl" />
                </div>
              </div>

              {/* Bouncing Placeholder Camera Icon & Instructions (Shown ONLY when camera stream is loading/inactive) */}
              {!cameraActive && (
                <div className="text-center z-10 p-6 flex flex-col items-center text-black/40 animate-fadeIn">
                  <Camera className="h-10 w-10 mb-2 animate-bounce text-apple-accent" />
                  <span className="text-xs tracking-wider uppercase font-medium">Initializing camera stream...</span>
                  <p className="text-[11px] text-[#86868b]/60 mt-1 max-w-[200px] leading-relaxed">
                    Please grant camera permissions when prompted to start scanning instantly.
                  </p>
                </div>
              )}

              {/* Sleek overlay badge shown when the camera is actively scanning */}
              {cameraActive && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-black/5 z-30 flex items-center space-x-2 text-[#1d1d1f] text-xs font-semibold tracking-wide shadow-lg animate-fadeIn">
                  <span className="h-2 w-2 rounded-full bg-apple-accent animate-ping" />
                  <span>Align QR code to scan</span>
                </div>
              )}
            </div>
            
            {/* Quick manual re-initialize action just in case camera fails or permission is denied */}
            <button 
              onClick={startScanner}
              className="text-xs font-semibold text-apple-accent flex items-center glass py-2.5 px-5 rounded-full mt-2 hover:bg-black/5 border-black/5 transition active:scale-95 shadow-md"
            >
              <RefreshCw className="h-3 w-3 mr-1.5" /> Re-initialize Scanner
            </button>
          </div>

          {/* Manual Charger ID Input fallback */}
          <div className="w-full glass rounded-3xl p-6 space-y-4 border-black/5">
            <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-[#86868b] uppercase">
              <span>OR enter Charger ID</span>
              <span className="text-[10px] text-black/30 lowercase">(e.g. CM-CMOD0135-VLEM)</span>
            </div>
            
            <div className="relative">
              <input 
                type="text" 
                placeholder="Enter ID manually (e.g. CMOD0135)" 
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
              />
            </div>

            <button 
              onClick={() => handleVerify()}
              disabled={loading || !qrInput}
              className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-semibold py-4 rounded-2xl shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <span>Verify Charger Connection</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 2: CONNECTOR / GUN SELECTION & PREPAID AMOUNT ==================== */}
      {screen === "connector" && stationDetails && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* Station card details */}
          <div className="glass rounded-[32px] p-6 space-y-4 relative overflow-hidden border-black/5">
            <div className="absolute top-0 right-0 h-24 w-24 bg-apple-accent/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-start space-x-4">
              <div className="h-12 w-12 bg-apple-accent/10 border border-apple-accent/20 rounded-2xl flex items-center justify-center text-apple-accent shadow-inner">
                <MapPin className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-apple-accent uppercase tracking-widest font-bold">EV Charging Point</span>
                <h2 className="font-bold text-xl text-[#1d1d1f] tracking-tight">{stationDetails.charger_name}</h2>
                <p className="text-xs text-[#86868b] font-light leading-relaxed">{stationDetails.location_name}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 border-t border-black/5 pt-4 text-xs text-[#86868b]">
              <ShieldCheck className="h-4 w-4 text-apple-emerald" />
              <span>Verified charger model. Real-time controls linked.</span>
            </div>
          </div>

          {/* Connectors / Gun list selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b] px-1">Select Connector (Gun)</h3>
            <div className="space-y-2">
              {stationDetails.connectors?.map((con) => {
                const isAvailable = con.status === "Available" || con.status === "Preparing";
                const isSelected = selectedConnector?.connector_id === con.connector_id;
                
                return (
                  <div 
                    key={con.connector_id}
                    onClick={() => isAvailable && setSelectedConnector(con)}
                    className={`w-full p-5 rounded-3xl cursor-pointer transition flex items-center justify-between border ${
                      isSelected 
                        ? "border-apple-accent bg-apple-accent/10 shadow-lg shadow-apple-accent/5" 
                        : "border-black/5 glass hover:bg-black/5"
                    } ${!isAvailable && "opacity-40 cursor-not-allowed"}`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSelected ? "bg-apple-accent text-white" : "bg-black/5 text-[#1d1d1f]/70"
                      }`}>
                        {con.connector_id}
                      </div>
                      <div>
                        <div className="font-semibold text-sm tracking-wide text-[#1d1d1f]">{con.gun_label}</div>
                        <div className="text-[11px] text-[#86868b] mt-0.5">{con.type} • {con.max_power_kw} kW</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`h-2 w-2 rounded-full ${
                        con.status === "Available" ? "bg-apple-emerald animate-pulse-slow" : "bg-apple-amber"
                      }`} />
                      <span className="text-[11px] font-semibold text-[#1d1d1f]/95">{con.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Combined Prepaid Section - displays instantly when a connector is selected */}
          {selectedConnector && (
            <div className="space-y-6 animate-fadeIn">
              {/* Mobile Number Entry Card */}
              <div className="glass rounded-[32px] p-6 space-y-3 relative overflow-hidden border-black/5">
                <div className="flex items-center space-x-3 mb-1">
                  <div className="h-8 w-8 bg-apple-accent/10 border border-apple-accent/20 rounded-xl flex items-center justify-center text-apple-accent">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-apple-accent uppercase tracking-widest font-bold">Checkout Information</span>
                    <h4 className="font-bold text-sm text-[#1d1d1f] tracking-tight">Customer Mobile Number (Optional)</h4>
                  </div>
                </div>
                
                <p className="text-xs text-[#86868b] leading-normal font-light">
                  Provide your 10-digit mobile number for custom receipt delivery, or leave it blank to start an anonymous charging session instantly.
                </p>

                <div className="relative mt-2">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#86868b]">+91</span>
                  <input 
                    type="tel" 
                    maxLength="10"
                    placeholder="Enter 10-digit mobile number" 
                    value={customerMobile}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setCustomerMobile(val);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("customer_mobile_number", val);
                      }
                    }}
                    className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 pl-14 pr-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
                  />
                </div>
              </div>

              {/* Prepaid selection section */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b] px-1">Select Prepaid Amount</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[100, 200, 500].map((amt) => {
                    const isSelected = prepaidAmount === amt && !customAmount;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setPrepaidAmount(amt);
                          setCustomAmount("");
                        }}
                        className={`py-4 rounded-2xl font-bold border transition text-sm ${
                          isSelected 
                            ? "border-apple-accent bg-apple-accent/10 text-apple-accent" 
                            : "border-black/5 glass text-[#1d1d1f] hover:bg-black/5"
                        }`}
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Field */}
                <div className="glass rounded-3xl p-5 space-y-3 border-black/5">
                  <span className="text-xs font-bold text-[#86868b] uppercase">Or Custom Prepaid Amount (Rs.)</span>
                  <input 
                    type="number" 
                    placeholder="Enter custom amount (e.g. 350)" 
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full bg-black/5 border border-black/5 rounded-2xl py-4 px-5 text-sm font-semibold tracking-wide placeholder-black/30 text-[#1d1d1f]"
                  />
                </div>
              </div>

              {/* Secure Payment Trigger */}
              <div className="glass rounded-3xl p-6 space-y-4 border-black/5">
                <div className="flex items-center justify-between pb-3 border-b border-black/5 text-xs text-[#86868b]">
                  <span>Prepaid Selected:</span>
                  <span className="font-bold text-[#1d1d1f] text-lg">₹{customAmount ? customAmount : prepaidAmount}</span>
                </div>

                <div className="text-center py-2 space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#86868b]">Supported Gateways (UPI Intent)</span>
                  <div className="flex justify-center space-x-6 text-black/30 text-xs font-bold">
                    <span>GPay</span>
                    <span>PhonePe</span>
                    <span>Paytm</span>
                    <span>BHIM</span>
                  </div>
                </div>

                {/* Checkout / Payment CTA Button */}
                <button 
                  onClick={handleStartCharging}
                  disabled={loading}
                  className={`w-full font-bold py-4 rounded-2xl shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm ${
                    isDummyMode 
                      ? "bg-apple-emerald text-black shadow-apple-emerald/20 glow-emerald" 
                      : "bg-[#e07a2c] text-white shadow-orange-500/20"
                  }`}
                >
                  {loading ? (
                    <Loader2 className={`h-5 w-5 animate-spin ${isDummyMode ? "text-black" : "text-white"}`} />
                  ) : (
                    <>
                      <Sparkles className={`h-4 w-4 ${isDummyMode ? "text-black" : "text-white"}`} />
                      <span>{isDummyMode ? "Simulate Payment & Start Charging" : "Pay & Start Charging"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SCREEN 4: ACTIVE CHARGING DASHBOARD ==================== */}
      {screen === "charging" && activeSession && (
        <div className="w-full space-y-8 animate-fadeIn">
          {/* Animated Big Circular Progress Metric */}
          <div className="w-full flex flex-col items-center justify-center mt-6">
            <div className="relative h-64 w-64 rounded-full flex items-center justify-center border border-black/5 bg-gradient-to-b from-black/[0.02] to-transparent shadow-xl p-6">
              
              {/* Outer Pulse glow effect */}
              <div className="absolute inset-2 border-2 border-dashed border-apple-emerald/25 rounded-full animate-spin-slow" />
              <div className="absolute inset-0 rounded-full bg-apple-emerald/5 blur-2xl pointer-events-none" />

              {/* Central Text Panel */}
              <div className="text-center space-y-1 z-10">
                <span className="text-[10px] tracking-widest uppercase font-bold text-apple-emerald animate-pulse-slow">Charging active</span>
                
                {/* Big Units metric */}
                <div className="flex items-baseline justify-center">
                  <span className="text-5xl font-extrabold tracking-tight text-[#1d1d1f]">
                    {activeSession.energy_kwh || "0.00"}
                  </span>
                  <span className="text-sm font-semibold text-[#86868b] ml-1">kWh</span>
                </div>

                <div className="h-[1px] w-12 bg-black/10 mx-auto my-2" />

                {/* Running Cost */}
                <div className="flex items-center justify-center space-x-1 text-sm font-semibold text-[#1d1d1f]/90">
                  <IndianRupee className="h-3.5 w-3.5" />
                  <span>{activeSession.cost_rs || "0.00"} spent so far</span>
                </div>
              </div>
            </div>
          </div>

          {/* Running Dashboard details lists */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass rounded-3xl p-5 space-y-1 flex flex-col justify-center border-black/5">
              <div className="flex items-center space-x-1.5 text-xs text-[#86868b] font-medium">
                <Clock className="h-4 w-4 text-apple-accent" />
                <span>Elapsed Duration</span>
              </div>
              <span className="text-2xl font-bold tracking-tight text-[#1d1d1f] mt-1">
                {formatTime(activeSession.elapsed_seconds || 0)}
              </span>
            </div>

            <div className="glass rounded-3xl p-5 space-y-1 flex flex-col justify-center border-black/5">
              <div className="flex items-center space-x-1.5 text-xs text-[#86868b] font-medium">
                <Wallet className="h-4 w-4 text-apple-emerald" />
                <span>Prepaid Limit</span>
              </div>
              <span className="text-2xl font-bold tracking-tight text-[#1d1d1f] mt-1">
                ₹{activeSession.prepaid_amount}
              </span>
            </div>
          </div>

          {/* Stop Mechanism Sliding Slider Trigger */}
          <div className="glass rounded-3xl p-6 space-y-5 border-black/5">
            <div className="flex items-center space-x-2 text-xs text-[#86868b] leading-relaxed font-light">
              <Zap className="h-4 w-4 text-apple-emerald" />
              <span>Power Delivery active on Connector {activeSession.connector_id}.</span>
            </div>

            {/* Tap to Stop Charging Control */}
            <button 
              onClick={handleStopCharging}
              disabled={loading}
              className="w-full bg-apple-rose text-white font-bold py-4 rounded-2xl shadow-lg shadow-apple-rose/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Square className="h-4 w-4 fill-white" />
                  <span>Stop Charging & Initiate Refund</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 5: DIGITAL RECEIPT CARD ==================== */}
      {screen === "receipt" && receipt && (
        <div className="w-full space-y-6 animate-fadeIn flex flex-col">
          {/* Top Bar with circular back button */}
          <div className="flex items-center w-full justify-between mb-2">
            <button 
              onClick={handleReset}
              className="h-10 w-10 bg-black/5 border border-black/10 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] transition active:scale-95 shadow-md"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-[11px] uppercase font-bold tracking-widest text-apple-emerald bg-apple-emerald/10 border border-apple-emerald/20 px-3 py-1 rounded-full flex items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-apple-emerald animate-pulse-slow mr-1.5" />
              Completed
            </span>
          </div>

          {/* Date stamp header */}
          <div className="text-left w-full mb-1">
            <span className="text-sm font-semibold text-[#86868b] tracking-wide">
              {receipt.session_date_formatted || "03 Jun 2026, 09:02 PM"}
            </span>
          </div>

          {/* Location Name Card */}
          <div className="w-full glass rounded-[24px] p-5 border border-black/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-16 w-16 bg-apple-accent/5 rounded-full blur-xl pointer-events-none" />
            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest block">Location Name</span>
                <span className="font-extrabold text-base text-[#1d1d1f] tracking-tight mt-0.5 block leading-tight">
                  {receipt.location_name || "OCPI Test Location - PROD"}
                </span>
              </div>
              <div className="pt-2 border-t border-black/5">
                <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest block">Charger Name</span>
                <span className="font-bold text-sm text-[#1d1d1f] tracking-tight mt-0.5 block">
                  {receipt.charger_name || "test device"}
                </span>
              </div>
            </div>
          </div>

          {/* Three-column Fee Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {/* Energy Usage Fee */}
            <div className="glass rounded-[20px] p-3 border border-black/5 text-center flex flex-col justify-between h-24 relative overflow-hidden">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider leading-tight">
                Energy Usage Fee
              </span>
              <span className="text-base font-extrabold text-[#1d1d1f] tracking-tight">
                ₹{(receipt.energy_usage_fee || 0.00).toFixed(2)}
              </span>
            </div>

            {/* Service Fee */}
            <div className="glass rounded-[20px] p-3 border border-black/5 text-center flex flex-col justify-between h-24 relative overflow-hidden">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider leading-tight">
                Service Fee
              </span>
              <span className="text-base font-extrabold text-[#1d1d1f] tracking-tight">
                ₹{(receipt.service_fee || 0.00).toFixed(2)}
              </span>
            </div>

            {/* Tax */}
            <div className="glass rounded-[20px] p-3 border border-black/5 text-center flex flex-col justify-between h-24 relative overflow-hidden">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider leading-tight">
                Tax ({receipt.tax_percentage || 18.0}%)
              </span>
              <span className="text-base font-extrabold text-[#1d1d1f] tracking-tight">
                ₹{(receipt.tax_amount || 0.00).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Total Amount Card */}
          <div className="w-full glass rounded-[20px] p-5 border border-black/5 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-apple-accent/5 rounded-full blur-2xl pointer-events-none" />
            <span className="text-[10px] font-extrabold text-[#86868b] uppercase tracking-widest block">
              Total Amount
            </span>
            <span className="text-3xl font-extrabold text-[#1d1d1f] tracking-tight mt-1 block">
              ₹{(receipt.actual_cost || 0.00).toFixed(2)}
            </span>
          </div>

          {/* Total Energy Usage Card */}
          <div className="w-full glass rounded-[20px] p-4 border border-black/5 text-center relative overflow-hidden">
            <span className="text-[10px] font-extrabold text-[#86868b] uppercase tracking-widest block">
              Total Energy Usage
            </span>
            <span className="text-2xl font-extrabold text-[#1d1d1f] tracking-tight mt-1 block">
              {(receipt.energy_kwh || 0.00).toFixed(2)} kWh
            </span>
          </div>

          {/* Session Telemetry Details Table */}
          <div className="w-full glass rounded-[24px] p-5 border border-black/5 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">Vehicle Model</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.vehicle_model || "--"}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/5">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">Stop Reason</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.stop_reason || "Stopped Remotely"}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/5">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">Start Time</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.start_time_formatted || "09:02 PM"}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-black/5">
              <span className="font-semibold text-[#86868b] uppercase tracking-wider">End Time</span>
              <span className="font-bold text-[#1d1d1f] tracking-wide">{receipt.end_time_formatted || "09:07 PM"}</span>
            </div>
          </div>

          {/* Transaction ID block with copy action */}
          <div className="w-full text-center space-y-1.5 mt-2 mb-1">
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest block">
              Transaction ID
            </span>
            <div className="flex items-center justify-center space-x-2">
              <span className="font-mono text-xs text-[#86868b] tracking-wider">
                {receipt.transaction_id || "1780500727198__15737782"}
              </span>
              <button 
                onClick={() => handleCopyTx(receipt.transaction_id || "1780500727198__15737782")}
                className="h-7 w-7 rounded-lg bg-black/5 hover:bg-black/10 border border-black/10 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] transition active:scale-90"
                title="Copy Transaction ID"
              >
                {copiedTx ? (
                  <Check className="h-3.5 w-3.5 text-apple-emerald" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Prepaid Authorization and Refund Summary Banner */}
          <div className="w-full glass bg-apple-emerald/5 border border-apple-emerald/20 p-4 rounded-[20px] flex items-start space-x-3 text-xs leading-relaxed">
            <Wallet className="h-5 w-5 text-apple-emerald flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-black/70">
              <span className="font-bold text-[#1d1d1f] block">Refund Initiated instantly!</span>
              <p className="font-light">
                Authorized: <span className="font-bold text-[#1d1d1f]">₹{(receipt.prepaid_amount || 0.00).toFixed(2)}</span> • Charged: <span className="font-bold text-[#1d1d1f]">₹{(receipt.actual_cost || 0.00).toFixed(2)}</span>
              </p>
              <p className="mt-1 font-semibold text-apple-emerald flex items-center">
                Excess of ₹{(receipt.refund_amount || 0.00).toFixed(2)} is dispatched directly to the paying UPI ID.
              </p>
            </div>
          </div>

          {/* Action buttons: Download Invoice (Orange CTA) & Reset */}
          <div className="w-full space-y-3 pt-2">
            {/* Download Invoice (Orange Button matching chargeMOD) */}
            <button 
              onClick={() => handleDownloadInvoice(receipt)}
              className="w-full bg-[#e07a2c] hover:bg-[#c66c25] text-white font-bold py-4 rounded-2xl transition active:scale-95 flex items-center justify-center space-x-2 text-sm shadow-lg shadow-orange-500/15"
            >
              <ArrowDownCircle className="h-4.5 w-4.5" />
              <span>Download Invoice</span>
            </button>

            {/* Start a New Charging Session */}
            <button 
              onClick={handleReset}
              className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-bold py-4 rounded-2xl transition active:scale-95 flex items-center justify-center space-x-2 text-sm shadow-md"
            >
              <RotateCcw className="h-4 w-4 text-white" />
              <span>Start a New Charging Session</span>
            </button>
          </div>

          {/* Need help support quick link */}
          <div className="text-center mt-2 pb-4">
            <span className="text-xs text-black/40 block font-light">
              Need help with your summary?
            </span>
            <span 
              onClick={() => setScreen("support")}
              className="text-[#e07a2c] text-xs font-semibold cursor-pointer hover:underline mt-1 inline-block"
            >
              Feel Free to Contact Us
            </span>
          </div>
        </div>
      )}

      {/* ==================== SCREEN 6: HELP & SUPPORT PAGE ==================== */}
      {screen === "support" && (
        <div className="w-full space-y-6 animate-fadeIn">
          <div className="glass rounded-[32px] p-6 space-y-4 border-black/5">
            <h2 className="font-extrabold text-2xl tracking-tight text-[#1d1d1f]">UPICharge Support</h2>
            <p className="text-xs text-[#86868b] font-light">
              Facing issues with a charger? Our operations desk can help verify, trigger, or force-stop sessions manually.
            </p>
          </div>

          <div className="glass rounded-3xl p-6 space-y-4 border-black/5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868b]">Direct Live Helplines</h3>
            <div className="space-y-2 text-sm">
              <a 
                href="https://wa.me/919999999999" 
                target="_blank" 
                rel="noreferrer"
                className="w-full p-4 rounded-2xl border border-black/5 glass hover:bg-black/5 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-apple-emerald/10 border border-apple-emerald/20 flex items-center justify-center text-apple-emerald">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <span className="font-semibold text-[#1d1d1f]">WhatsApp Business Support</span>
                </div>
                <ArrowRight className="h-4 w-4 text-[#86868b]" />
              </a>

              <div className="w-full p-4 rounded-2xl border border-black/5 glass flex flex-col justify-start">
                <span className="text-[10px] text-[#86868b] uppercase tracking-wider font-bold">Helpline Desk</span>
                <span className="text-[#1d1d1f] font-bold text-lg mt-1">+91 9999 999 999</span>
                <p className="text-xs text-[#86868b] mt-1 font-light">Available 24x7 for physical charging site assistance.</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setScreen("home")}
            className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-sm"
          >
            Back to Scanner
          </button>
        </div>
      )}

      {/* ==================== SCREEN 7: MAPS (SIMULATED LOCATOR) ==================== */}
      {screen === "map" && (
        <div className="w-full space-y-6 animate-fadeIn">
          <div className="glass rounded-[32px] p-6 space-y-4 border-black/5">
            <h2 className="font-extrabold text-2xl tracking-tight text-[#1d1d1f]">Charger Locator Map</h2>
            <p className="text-xs text-[#86868b] font-light">
              Find physical chargeMOD chargers verified by upiCHARGE nearby.
            </p>
          </div>

          <div className="glass rounded-3xl p-5 space-y-4 border-black/5">
            <div className="h-64 bg-black/5 border border-black/10 rounded-2xl relative overflow-hidden flex items-center justify-center text-center p-6">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 pointer-events-none" />
              <div className="space-y-2 z-10 flex flex-col items-center">
                <MapPin className="h-8 w-8 text-apple-rose animate-bounce" />
                <h4 className="font-bold text-[#1d1d1f]">Interactive Map Widget</h4>
                <p className="text-xs text-[#86868b] px-4 font-light">
                  Leaflet rendering in Light Mode. Near CMOD0135 (Kerala, India).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="glass-light p-4 rounded-2xl flex items-start justify-between border-black/5">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#1d1d1f]">Station CMOD0135</span>
                  <p className="text-[11px] text-[#86868b]">1.2 km away • CCS2, Type 2, 15A Available</p>
                </div>
                <button 
                  onClick={() => {
                    setQrInput("CMOD0135");
                    handleVerify("CMOD0135");
                  }}
                  className="bg-apple-accent text-white font-semibold py-1.5 px-3 rounded-full text-xs shadow-md"
                >
                  Select
                </button>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setScreen("home")}
            className="w-full bg-[#1d1d1f] hover:bg-[#2c2c2e] text-white font-bold py-4 rounded-2xl transition active:scale-95 text-sm"
          >
            Back to Scanner
          </button>
        </div>
      )}

      {/* Apple style Bottom Floating Navigation dock bar */}
      {screen !== "charging" && (
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[85%] max-w-[340px] h-16 glass rounded-full flex items-center justify-around px-4 z-40 shadow-lg shadow-black/5 border-black/5">
          <button 
            onClick={() => { stopScanner(); setScreen("home"); }}
            className={`flex flex-col items-center justify-center space-y-1 ${screen === "home" ? "text-apple-accent" : "text-[#86868b] hover:text-[#1d1d1f]"}`}
          >
            <Camera className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-wider uppercase">Scan</span>
          </button>
          
          <button 
            onClick={() => { stopScanner(); setScreen("map"); }}
            className={`flex flex-col items-center justify-center space-y-1 ${screen === "map" ? "text-apple-accent" : "text-[#86868b] hover:text-[#1d1d1f]"}`}
          >
            <MapPin className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-wider uppercase">Map</span>
          </button>
          
          <button 
            onClick={() => { stopScanner(); setScreen("support"); }}
            className={`flex flex-col items-center justify-center space-y-1 ${screen === "support" ? "text-apple-accent" : "text-[#86868b] hover:text-[#1d1d1f]"}`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-wider uppercase">Support</span>
          </button>
        </nav>
      )}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
    </main>
  );
}
